"""Ghost Commuter API (FastAPI)."""
from __future__ import annotations

import asyncio
import logging
import random
import time as time_mod
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException

import commute_agent_engine as engine
import db
import languages
import privacy
import rag_engine
import trust
from config import settings, setup_logging
from models import (
    CommuteSchedule,
    Match,
    MatchMessage,
    MatchParticipant,
    MatchRequest,
    User,
    UserContact,
    UserLanguage,
)
from schemas import (
    AddScheduleRequest,
    AssemblyInstructions,
    ChatMessageOut,
    FindMatchesRequest,
    FindMatchesResponse,
    JourneyConfirmRequest,
    JourneyConfirmResponse,
    LanguageIn,
    LanguageOut,
    LanguageProficiency,
    LanguageSettingsOut,
    MemberStatus,
    MessagesResponse,
    MyMatchesResponse,
    MyMatchOut,
    ParsedCommute,
    ParsedScheduleOut,
    ParticipantResponse,
    RegisterProfileRequest,
    RegisterProfileResponse,
    RespondRequest,
    RespondResponse,
    SendMessageRequest,
    SupportedLanguagesResponse,
    TrustSummary,
    UpdateLanguagesRequest,
    UserLanguageOut,
)

setup_logging()
log = logging.getLogger("ghost.api")

ADJECTIVES = [
    "Velvet", "Cobalt", "Lunar", "Copper", "Misty", "Tidal", "Granite", "Hushed", "Polar", "Dusky",
    "Woolly", "Nimble", "Mossy", "Drifting", "Quiet", "Pebble", "Starlit", "Foggy", "Silent", "Gentle",
]
ANIMALS = [
    "Owl", "Heron", "Badger", "Lynx", "Hare", "Otter", "Kestrel", "Fox", "Stoat", "Puffin",
    "Marten", "Newt", "Plover", "Vole", "Hedgehog", "Moth", "Curlew", "Bat", "Seal", "Shrew",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup", extra={"mode": settings.llm_mode})
    if not settings.llm_enabled:
        log.warning("llm_disabled_rule_based_mode", extra={"mode": "rule_based"})
    for attempt in range(1, 11):  # Postgres may still be starting under docker compose
        try:
            await db.init_db()
            break
        except Exception as exc:
            log.warning("db_not_ready", extra={"attempt": attempt, "reason_code": type(exc).__name__})
            await asyncio.sleep(2)
    try:
        await asyncio.to_thread(rag_engine.init_vector_store)
    except Exception as exc:
        log.warning("vector_store_unavailable_using_keyword_fallback", extra={"reason_code": type(exc).__name__})
    engine.graph()
    yield
    await db.dispose()


app = FastAPI(title="Ghost Commuter", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)

# ------------------------------------------------------------------ rate limiting
_hits: dict[str, deque[float]] = defaultdict(deque)
_hits_lock = asyncio.Lock()


@app.middleware("http")
async def rate_limit_and_log(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    started = time_mod.monotonic()
    if request.url.path != "/health" and request.method != "OPTIONS":
        client = request.client.host if request.client else "unknown"
        now = time_mod.monotonic()
        async with _hits_lock:
            window = _hits[client]
            while window and now - window[0] > 60:
                window.popleft()
            if len(window) >= settings.rate_limit_per_minute:
                return JSONResponse(
                    status_code=429,
                    content={"error": "rate_limited", "detail": "Too many requests. Try again in a minute."},
                    headers={"Retry-After": "60", "X-Request-ID": request_id},
                )
            window.append(now)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    log.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round((time_mod.monotonic() - started) * 1000),
        },
    )
    return response


# ------------------------------------------------------------- error handling
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    # Never echo the submitted input back: it may contain personal details.
    details = [{"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg", "invalid")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"error": "validation_error", "details": details})


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.error("unhandled_error", extra={"path": request.url.path, "reason_code": type(exc).__name__})
    return JSONResponse(status_code=500, content={"error": "internal_error"})


# ------------------------------------------------------------------- helpers
def _canonical_station(value: str, field: str) -> str:
    station = rag_engine.normalize_station(value)
    if station is None:
        raise HTTPException(status_code=422, detail=f"{field} must be a known station name")
    return station


async def _unique_display_name(session: AsyncSession, requested: str | None) -> str:
    if requested:
        name = " ".join(requested.split())
        if privacy.looks_like_real_name(name):
            raise HTTPException(
                status_code=422,
                detail="Display name must be anonymous: avoid real names, emails, numbers or handles.",
            )
        exists = await session.scalar(select(User.id).where(User.anonymous_display_name == name))
        if exists:
            raise HTTPException(status_code=409, detail="That display name is taken.")
        return name
    rng = random.SystemRandom()
    for i in range(40):
        name = f"{rng.choice(ADJECTIVES)} {rng.choice(ANIMALS)}"
        if i >= 20:
            name = f"{name} {rng.randint(2, 99)}"
        exists = await session.scalar(select(User.id).where(User.anonymous_display_name == name))
        if not exists:
            return name
    raise HTTPException(status_code=503, detail="Could not allocate a display name; try again.")


def _schedule_out(parsed: ParsedCommute) -> ParsedScheduleOut:
    return ParsedScheduleOut(
        origin_station=parsed.origin_station,
        destination_station=parsed.destination_station,
        line=parsed.line,
        days=parsed.days,
        window_start=parsed.window_start,
        window_end=parsed.window_end,
        study_interests=parsed.study_interests,
        safety_preferences=parsed.safety_preferences,
        confidence=parsed.confidence,
    )


def _add_schedules(session: AsyncSession, user_id: uuid.UUID, parsed: ParsedCommute, redacted_text: str) -> None:
    for day in parsed.days:
        session.add(
            CommuteSchedule(
                user_id=user_id,
                day_of_week=day.value,
                departure_window_start=engine.hhmm_time(parsed.window_start),
                departure_window_end=engine.hhmm_time(parsed.window_end),
                primary_line=parsed.line,
                origin_station=parsed.origin_station,
                destination_station=parsed.destination_station,
                raw_input_text=redacted_text,
            )
        )


def _user_languages_out(rows: list[UserLanguage] | list[LanguageIn]) -> list[UserLanguageOut]:
    out = []
    for r in rows:
        code = r.language_code if isinstance(r, UserLanguage) else r.code
        out.append(UserLanguageOut(code=code, name=languages.language_name(code), proficiency=r.proficiency))
    return out


def _detected(parsed: ParsedCommute, already: set[str]) -> list[UserLanguageOut]:
    """Languages stated in the commute text that aren't saved yet. Returned for confirmation, never stored."""
    return [
        UserLanguageOut(code=lang.code, name=languages.language_name(lang.code), proficiency=lang.proficiency)
        for lang in parsed.languages
        if lang.code not in already and languages.is_supported(lang.code)
    ]


async def _replace_languages(session: AsyncSession, user_id: uuid.UUID, items: list[LanguageIn]) -> None:
    await session.execute(delete(UserLanguage).where(UserLanguage.user_id == user_id))
    for item in items:
        session.add(UserLanguage(user_id=user_id, language_code=item.code, proficiency=item.proficiency))


def _clean_interests(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values:
        v = privacy.redact_text(v.strip().lower()[:40]).text
        if v and privacy.REDACTED not in v and v not in out:
            out.append(v)
    return out[:8]


# ------------------------------------------------------------------ endpoints
@app.get("/health")
async def health(session: AsyncSession = Depends(db.get_session)):
    db_ok = True
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "llm_mode": settings.llm_mode,
        "vector_backend": rag_engine.vector_backend() or "keyword_fallback",
    }


@app.post("/api/commuter/register-profile", response_model=RegisterProfileResponse)
async def register_profile(body: RegisterProfileRequest, session: AsyncSession = Depends(db.get_session)):
    hub = _canonical_station(body.university_hub, "university_hub")
    home = _canonical_station(body.home_station, "home_station")
    display_name = await _unique_display_name(session, body.anonymous_display_name)

    # Redact BEFORE storage and BEFORE any model call.
    commute_text = privacy.redact_text(body.commute_description).text
    bio = privacy.redact_text(body.bio_freetext).text if body.bio_freetext else None

    result = await engine.run_parse(commute_text, {"university_hub": hub, "home_station": home}, session)
    parsed = ParsedCommute.model_validate(result["parsed"])

    user = User(
        anonymous_display_name=display_name,
        uni_affiliation=privacy.redact_text(body.uni_affiliation).text,
        university_hub=hub,
        home_station=home,
        home_zone=rag_engine.station_zone(home),
        gender_identity=body.gender_identity,
        gender_preference=body.gender_preference,
        safety_preferences=sorted({t.value for t in body.safety_preferences} | {t.value for t in parsed.safety_preferences}),
        study_interests=_clean_interests(body.study_interests + parsed.study_interests),
        bio_freetext=bio,
        is_active=True,
        language_matching=body.language_matching,
        share_languages=body.share_languages,
    )
    session.add(user)
    await session.flush()
    if body.contact_handle:
        session.add(UserContact(user_id=user.id, contact_handle=body.contact_handle.strip()))
    # Form-entered languages are explicit, so they're saved; text-detected ones wait for confirmation.
    await _replace_languages(session, user.id, body.languages)

    status = "needs_clarification"
    if parsed.confidence >= 0.5:
        _add_schedules(session, user.id, parsed, commute_text)
        status = "registered"
    await session.commit()
    log.info("profile_registered", extra={"user_id": str(user.id), "event": status, "mode": result["mode_label"]})
    return RegisterProfileResponse(
        user_id=user.id,
        anonymous_display_name=display_name,
        status=status,
        parsed_schedule=_schedule_out(parsed) if status == "registered" else None,
        clarification_question=result.get("clarification") if status != "registered" else None,
        mode=result["mode_label"],
        detected_languages=_detected(parsed, {lang.code for lang in body.languages}),
    )


@app.post("/api/commuter/users/{user_id}/schedule", response_model=RegisterProfileResponse)
async def add_schedule(user_id: uuid.UUID, body: AddScheduleRequest, session: AsyncSession = Depends(db.get_session)):
    """Answer a clarification question or add another commute for an existing profile."""
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="user not found")
    commute_text = privacy.redact_text(body.commute_description).text
    result = await engine.run_parse(
        commute_text, {"university_hub": user.university_hub, "home_station": user.home_station}, session
    )
    parsed = ParsedCommute.model_validate(result["parsed"])
    status = "needs_clarification"
    if parsed.confidence >= 0.5:
        _add_schedules(session, user.id, parsed, commute_text)
        user.study_interests = _clean_interests(list(user.study_interests or []) + parsed.study_interests)
        user.safety_preferences = sorted(set(user.safety_preferences or []) | {t.value for t in parsed.safety_preferences})
        status = "registered"
    saved = set((await session.execute(select(UserLanguage.language_code).where(UserLanguage.user_id == user.id))).scalars())
    await session.commit()
    return RegisterProfileResponse(
        user_id=user.id,
        anonymous_display_name=user.anonymous_display_name,
        status=status,
        parsed_schedule=_schedule_out(parsed) if status == "registered" else None,
        clarification_question=result.get("clarification") if status != "registered" else None,
        mode=result["mode_label"],
        detected_languages=_detected(parsed, saved),
    )


@app.post("/api/commuter/find-matches", response_model=FindMatchesResponse)
async def find_matches(body: FindMatchesRequest, session: AsyncSession = Depends(db.get_session)):
    user = await session.get(User, body.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="user not found")
    return await engine.run_find_matches(session, body.user_id, body.day_of_week.value if body.day_of_week else None)


@app.post("/api/commuter/matches/{match_id}/respond", response_model=RespondResponse)
async def respond(match_id: uuid.UUID, body: RespondRequest, session: AsyncSession = Depends(db.get_session)):
    try:
        return await engine.respond_to_match(session, match_id, body.user_id, body.response)
    except engine.MatchAccessError:
        # Same response for "no such match" and "not your match": don't leak existence.
        raise HTTPException(status_code=404, detail="match not found")


# ------------------------------------------------------------- my matches + chat
@app.get("/api/commuter/users/{user_id}/matches", response_model=MyMatchesResponse)
async def my_matches(user_id: uuid.UUID, session: AsyncSession = Depends(db.get_session)):
    """Every match this user belongs to (newest first), so invitations and chats survive a reload."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    rows = (
        await session.execute(
            select(Match, MatchRequest.requester_id)
            .join(MatchParticipant, MatchParticipant.match_id == Match.id)
            .join(MatchRequest, MatchRequest.id == Match.match_request_id)
            .where(MatchParticipant.user_id == user_id)
            .order_by(Match.created_at.desc())
            .limit(50)
        )
    ).all()
    langs = await engine.load_user_languages(
        session, sorted({p.user_id for match, _ in rows for p in match.participants})
    )
    out: list[MyMatchOut] = []
    for match, requester_id in rows:
        me = next(p for p in match.participants if p.user_id == user_id)
        ordered = [me] + [p for p in match.participants if p.user_id != user_id]
        # Full language lists unlock only for members of a confirmed match who accepted.
        unlocked = match.status == "confirmed" and me.response == ParticipantResponse.accepted
        out.append(
            MyMatchOut(
                match_id=match.id,
                match_type=match.match_type,
                display_names=[p.user.anonymous_display_name for p in ordered],
                shared_line=match.shared_line,
                meet_station=match.meet_station,
                assembly_instructions=AssemblyInstructions.model_validate(match.assembly_instructions),
                icebreaker=match.icebreaker,
                safety_notes=list(match.safety_notes or []),
                similarity_reasons=list(match.similarity_reasons or []),
                status=match.status,
                my_response=me.response,
                members=[MemberStatus(display_name=p.user.anonymous_display_name, response=p.response) for p in ordered],
                you_requested=requester_id == user_id,
                created_at=match.created_at,
                **engine.disclosures(user_id, [p.user for p in ordered], langs, confirmed=unlocked),
            )
        )
    return MyMatchesResponse(matches=out)


async def _chat_match(session: AsyncSession, match_id: uuid.UUID, user_id: uuid.UUID) -> tuple[Match, dict[uuid.UUID, str]]:
    """Loads a match the user belongs to; chat is only open once every member has accepted."""
    match = await session.get(Match, match_id)
    if match is None or not any(p.user_id == user_id for p in match.participants):
        # Same response for "no such match" and "not your match": don't leak existence.
        raise HTTPException(status_code=404, detail="match not found")
    if match.status != "confirmed":
        raise HTTPException(status_code=409, detail="chat opens once everyone in the match has accepted")
    return match, {p.user_id: p.user.anonymous_display_name for p in match.participants}


def _message_out(message: MatchMessage, names: dict[uuid.UUID, str], viewer: uuid.UUID) -> ChatMessageOut:
    return ChatMessageOut(
        message_id=message.id,
        match_id=message.match_id,
        sender_display_name=names.get(message.sender_id, "A former member"),
        mine=message.sender_id == viewer,
        body=message.body,
        sent_at=message.created_at,
    )


@app.get("/api/commuter/matches/{match_id}/messages", response_model=MessagesResponse)
async def list_messages(
    match_id: uuid.UUID,
    user_id: uuid.UUID = Query(...),
    after: datetime | None = Query(None, description="Only messages sent after this time (for polling)."),
    session: AsyncSession = Depends(db.get_session),
):
    match, names = await _chat_match(session, match_id, user_id)
    query = select(MatchMessage).where(MatchMessage.match_id == match_id)
    if after is not None:
        query = query.where(MatchMessage.created_at > after)
    rows = (await session.execute(query.order_by(MatchMessage.created_at).limit(200))).scalars().all()
    return MessagesResponse(match_id=match.id, status=match.status, messages=[_message_out(m, names, user_id) for m in rows])


@app.post("/api/commuter/matches/{match_id}/messages", response_model=ChatMessageOut)
async def send_message(match_id: uuid.UUID, body: SendMessageRequest, session: AsyncSession = Depends(db.get_session)):
    match, names = await _chat_match(session, match_id, body.user_id)
    # Redact BEFORE storage. Members' anonymous names are allowed so "Hi Mossy Otter" survives.
    text = privacy.redact_text(body.body.strip(), allow_terms=names.values()).text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="message is empty")
    message = MatchMessage(match_id=match.id, sender_id=body.user_id, body=text[:1000])
    session.add(message)
    await session.commit()
    await session.refresh(message)
    log.info("chat_message", extra={"match_id": str(match.id), "user_id": str(body.user_id)})
    return _message_out(message, names, body.user_id)


# --------------------------------------------------------------- trust badges + journeys
@app.post("/api/commuter/journeys/confirm", response_model=JourneyConfirmResponse)
async def confirm_journey(body: JourneyConfirmRequest, session: AsyncSession = Depends(db.get_session)):
    """"We travelled together". Counts only once 2+ participants confirm the same day (auth not implemented)."""
    try:
        return await trust.confirm_journey(session, body.match_id, body.user_id, body.journey_date)
    except trust.JourneyError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@app.get("/api/commuter/users/{user_id}/trust", response_model=TrustSummary)
async def user_trust(user_id: uuid.UUID, session: AsyncSession = Depends(db.get_session)):
    """Public trust summary: a count and a tier only. Note: auth is not implemented."""
    summary = await trust.get_trust_summary(session, user_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="user not found")
    return summary


# ------------------------------------------------------------------------- languages
@app.get("/api/commuter/languages", response_model=SupportedLanguagesResponse)
async def supported_languages():
    return SupportedLanguagesResponse(languages=[LanguageOut(**item) for item in languages.supported_list()])


@app.patch("/api/commuter/users/{user_id}/languages", response_model=LanguageSettingsOut)
async def update_languages(user_id: uuid.UUID, body: UpdateLanguagesRequest, session: AsyncSession = Depends(db.get_session)):
    """Set the caller's own languages and how they're used. Omitted fields stay as they are (auth not implemented)."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    if body.languages is not None:
        await _replace_languages(session, user.id, body.languages)
    if body.language_matching is not None:
        user.language_matching = body.language_matching
    if body.share_languages is not None:
        user.share_languages = body.share_languages
    await session.commit()
    rows = (await engine.load_user_languages(session, [user.id]))[user.id]
    rows.sort(key=lambda r: (-languages.PROFICIENCY_RANK[LanguageProficiency(r.proficiency).value], r.language_code))
    # Logged without any language data.
    log.info("languages_updated", extra={"user_id": str(user.id)})
    return LanguageSettingsOut(
        languages=_user_languages_out(rows),
        language_matching=user.language_matching,
        share_languages=user.share_languages,
    )
