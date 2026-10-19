"""Ghost Commuter LangGraph pipeline.

    START -> data_structurer -> (parse mode: END)
                            -> geographic_router -> (no candidates: END)
                                                 -> safety_guard_matcher -> END

Node 1 (Data Structurer, fast model): redacted free text -> ParsedCommute.
Node 2 (Geographic Router, fast model): SQL pre-filter + one batched route-safety call.
Node 3 (Safety Guard & Matcher, matcher model): one call -> proposals, then deterministic
        validation and privacy.sanitize_match on every proposal.

Trust and languages: Node 2's SQL pre-filter enforces require_shared; Node 3 receives each
candidate's trust tier and only the languages they share with the requester, both as soft
signals. Every proposal is then checked by privacy.disclosure_findings (no journey dates, no
non-shared languages, no religion/ethnicity/nationality).

Every model call has a deterministic rule-based twin. With no ANTHROPIC_API_KEY, or when a
call fails validation twice, the rule-based path runs instead and the response says so.
"""
from __future__ import annotations

import asyncio
import itertools
import logging
import operator
import re
import uuid
from datetime import datetime, time, timedelta
from typing import Annotated, Any, Literal, TypedDict
from zoneinfo import ZoneInfo

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ValidationError
from sqlalchemy import and_, case, exists, extract, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import languages
import privacy
import prompts
import rag_engine
import trust
from config import settings
from models import CommuteSchedule, Match, MatchParticipant, MatchRequest, User, UserContact, UserLanguage
from schemas import (
    AssemblyInstructions,
    DayOfWeek,
    FindMatchesResponse,
    GenderIdentity,
    GenderPreference,
    LanguageMatching,
    LanguageOut,
    MatcherOutput,
    MatchOut,
    MatchProposal,
    MatchType,
    MemberStatus,
    ParsedCommute,
    ParticipantLanguages,
    ParticipantResponse,
    ParticipantTrust,
    RespondChoice,
    RespondResponse,
    RouteOverlap,
    RouteRankingOutput,
    SafetyTag,
    UnlockedContact,
    UserLanguageOut,
    is_hhmm,
    tool_definition,
)

log = logging.getLogger("ghost.engine")

DAYS: list[str] = [d.value for d in DayOfWeek]
WINDOW_TOLERANCE_MIN = 30
MAX_CANDIDATES_SQL = 60
MAX_OVERLAPS = 8


# ======================================================================== time helpers
def hhmm_to_min(value: str) -> int:
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def min_to_hhmm(minutes: int) -> str:
    minutes %= 1440
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def time_to_min(t: time) -> int:
    return t.hour * 60 + t.minute


def service_min(minutes: int) -> int:
    """Map clock minutes onto a single 'night' axis: 00:00-04:59 count as after 24:00."""
    return minutes + 1440 if minutes < 300 else minutes


def window_service(start: time, end: time) -> tuple[int, int]:
    s, e = service_min(time_to_min(start)), service_min(time_to_min(end))
    if e < s:
        e += 1440
    return s, e


def normalize_window(start_hhmm: str) -> tuple[str, str]:
    m = hhmm_to_min(start_hhmm)
    m = int(round(m / 5.0) * 5) % 1440
    return min_to_hhmm(m), min_to_hhmm(m + 30)


def hhmm_time(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


# ================================================================ gender compatibility
_ACCEPTS: dict[GenderPreference, frozenset[GenderIdentity]] = {
    GenderPreference.any: frozenset(GenderIdentity),
    GenderPreference.women_only: frozenset({GenderIdentity.woman}),
    GenderPreference.men_only: frozenset({GenderIdentity.man}),
    GenderPreference.non_binary_inclusive: frozenset({GenderIdentity.woman, GenderIdentity.non_binary}),
}


def accepted_genders(pref: GenderPreference) -> frozenset[GenderIdentity]:
    return _ACCEPTS[GenderPreference(pref)]


def prefs_accepting(gender: GenderIdentity) -> list[GenderPreference]:
    return [p for p, ok in _ACCEPTS.items() if GenderIdentity(gender) in ok]


def compatible(a_gender, a_pref, b_gender, b_pref) -> bool:
    return GenderIdentity(b_gender) in accepted_genders(a_pref) and GenderIdentity(a_gender) in accepted_genders(b_pref)


# ========================================================================= LLM helper
_anthropic_client = None


def _anthropic():
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import AsyncAnthropic

        _anthropic_client = AsyncAnthropic(
            api_key=settings.anthropic_api_key, timeout=settings.llm_timeout_seconds, max_retries=2
        )
    return _anthropic_client


async def call_structured(
    *,
    agent: str,
    model: str,
    system: str,
    user: str,
    tool_name: str,
    tool_description: str,
    output_model: type[BaseModel],
) -> BaseModel | None:
    """Forced tool call -> Pydantic validation. Retry once, then return None (fail safe)."""
    if not settings.llm_enabled:
        return None
    tool = tool_definition(tool_name, tool_description, output_model)
    for attempt in (1, 2):
        try:
            response = await _anthropic().messages.create(
                model=model,
                max_tokens=settings.llm_max_tokens,
                system=system,
                tools=[tool],
                tool_choice={"type": "tool", "name": tool_name},
                messages=[{"role": "user", "content": user}],
            )
            block = next(
                (b for b in response.content if getattr(b, "type", None) == "tool_use" and b.name == tool_name),
                None,
            )
            if block is None:
                raise ValueError("missing tool_use block")
            result = output_model.model_validate(block.input)
            log.info("llm_call_ok", extra={"agent": agent, "model": model, "attempt": attempt})
            return result
        except ValidationError:
            log.warning("llm_output_invalid", extra={"agent": agent, "attempt": attempt, "reason_code": "validation"})
        except Exception as exc:  # network, rate limit, bad model id...
            log.warning("llm_call_failed", extra={"agent": agent, "attempt": attempt, "reason_code": type(exc).__name__})
    return None


# ============================================================ Node 1 rule-based parser
_DAY_PATTERNS: dict[str, str] = {
    "mon": r"\bmon(?:day)?s?\b",
    "tue": r"\btue(?:s|sday)?s?\b",
    "wed": r"\bwed(?:s|nesday)?s?\b",
    "thu": r"\bthu(?:r|rs|rsday)?s?\b",
    "fri": r"\bfri(?:day)?s?\b",
    "sat": r"\bsat(?:urday)?s?\b",
    "sun": r"\bsun(?:day)?s?\b",
}

_INTEREST_KEYWORDS: dict[str, str] = {
    r"\bmachine learning\b|\bml\b|\bdeep learning\b": "machine learning",
    r"\bstat(?:s|istics)\b": "statistics",
    r"\bdata vis(?:ualisation|ualization)?\b|\bdataviz\b": "data visualisation",
    r"\barchitecture\b": "architecture",
    r"\burban (?:planning|design)\b": "urban planning",
    r"\bmedicine\b|\bmedical\b": "medicine",
    r"\bbiochem(?:istry)?\b": "biochemistry",
    r"\bchemistry\b": "chemistry",
    r"\bneuro(?:science)?\b": "neuroscience",
    r"\blaw\b|\blegal\b": "law",
    r"\beconomics\b|\becon\b": "economics",
    r"\bphilosophy\b": "philosophy",
    r"\bhistory of art\b|\bart history\b": "history of art",
    r"\bsociology\b": "sociology",
    r"\bcomputer science\b|\bcomp ?sci\b|\bcoding\b|\bprogramming\b": "computer science",
    r"\bmaths?\b|\bmathematics\b": "mathematics",
    r"\bphysics\b": "physics",
    r"\bdesign\b": "design",
    r"\bpsychology\b": "psychology",
    r"\bengineering\b": "engineering",
    r"\bfinance\b": "finance",
    r"\bliterature\b|\benglish lit\b": "literature",
}

_SAFETY_KEYWORDS: dict[str, SafetyTag] = {
    r"well[- ]lit|\blit\b|bright": SafetyTag.well_lit,
    r"staffed|\bstaff\b": SafetyTag.staffed_station,
    r"cctv|camera": SafetyTag.cctv,
    r"night tube only|only (?:the )?night tube": SafetyTag.night_tube_only,
    r"short walk|short last mile|close to the station|near the station": SafetyTag.short_last_mile,
    r"busy carriage|busy carriages|crowded carriage|people around": SafetyTag.busy_carriage,
    r"isolated|quiet exit|dark exit|empty exit": SafetyTag.avoid_isolated_exits,
}


def _parse_days(text: str) -> list[str]:
    t = text.lower()
    if re.search(r"\bevery (?:night|day|evening)\b|\bdaily\b|\bnightly\b", t):
        return list(DAYS)
    days: set[str] = set()
    if re.search(r"\bweek ?(?:nights|days)\b", t):
        days.update(DAYS[:5])
    if re.search(r"\bweekends?\b", t):
        days.update({"sat", "sun"})
    for day, pattern in _DAY_PATTERNS.items():
        if re.search(pattern, t):
            days.add(day)
    return [d for d in DAYS if d in days]


def _clock(hour: int, minute: int, meridiem: str | None) -> int | None:
    if minute > 59 or hour > 24:
        return None
    if meridiem == "pm" and hour < 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    elif meridiem is None and hour <= 23:
        if hour == 12 or hour == 24:
            hour = 0
        elif 6 <= hour <= 11:
            hour += 12  # late-night context: "11" means 23:00
    return (hour % 24) * 60 + minute


def _parse_time(text: str) -> tuple[int, str] | None:
    """Return (clock minutes, qualifier) where qualifier is exact|around|after|before."""
    t = text.lower()
    candidates: list[tuple[int, int, int, int]] = []  # (priority, position, minutes, end)

    def push(pos: int, end: int, minutes: int | None, priority: int = 0) -> None:
        # Explicit clock formats (priority 0) beat bare hours like "around 11" (priority 1).
        if minutes is not None:
            candidates.append((priority, pos, minutes, end))

    for m in re.finditer(r"\bmidnight\b", t):
        push(m.start(), m.end(), 0)
    for m in re.finditer(r"\bhalf\s*(?:past\s*)?(\d{1,2})\b", t):
        push(m.start(), m.end(), _clock(int(m.group(1)), 30, None))
    for m in re.finditer(r"\bquarter\s+past\s+(\d{1,2})\b", t):
        push(m.start(), m.end(), _clock(int(m.group(1)), 15, None))
    for m in re.finditer(r"\bquarter\s+to\s+(\d{1,2})\b", t):
        push(m.start(), m.end(), _clock(int(m.group(1)) - 1, 45, None))
    for m in re.finditer(r"\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b", t):
        push(m.start(), m.end(), _clock(int(m.group(1)), int(m.group(2)), m.group(3)))
    for m in re.finditer(r"\b(\d{1,2})\s*(am|pm)\b", t):
        push(m.start(), m.end(), _clock(int(m.group(1)), 0, m.group(2)))
    for m in re.finditer(r"\b(?:around|about|after|before|by|at|from|leave|leaving|roughly)\s+(\d{1,2})(?:\s*-?ish)?\b(?![:.]\d)", t):
        push(m.start(1), m.end(), _clock(int(m.group(1)), 0, None), 1)
    for m in re.finditer(r"\b(\d{1,2})\s*-?ish\b", t):
        push(m.start(), m.end(), _clock(int(m.group(1)), 0, None), 1)
    if not candidates:
        return None
    _, pos, minutes, end = sorted(candidates)[0]
    before = t[max(0, pos - 14) : pos]
    after = t[end : end + 5]
    if re.search(r"(around|about|roughly|approx\w*|~)\s*$", before) or "ish" in t[pos:end + 4] or after.strip().startswith("ish"):
        qualifier = "around"
    elif re.search(r"(after|from)\s*$", before):
        qualifier = "after"
    elif re.search(r"(before|by)\s*$", before):
        qualifier = "before"
    else:
        qualifier = "exact"
    return minutes, qualifier


def _window_from(minutes: int, qualifier: str) -> tuple[str, str]:
    offset = {"around": -15, "after": 0, "before": -30, "exact": 0}[qualifier]
    return normalize_window(min_to_hhmm(minutes + offset))


def rule_based_parse(text: str, hints: dict[str, str] | None = None) -> ParsedCommute:
    hints = hints or {}
    lowered = text.lower()
    confidence = 0.0

    stations = rag_engine.find_stations_in_text(text)
    origin = destination = None
    for pos, station in stations:
        before = lowered[max(0, pos - 30) : pos]
        if destination is None and re.search(r"(\bto|home|live\w*|back|towards|get off at|alight at|in|near)\s+(the\s+)?$", before):
            destination = station
        elif origin is None and re.search(r"(from|leave|leaving|depart\w*|at|campus|uni)\s+(the\s+)?$", before):
            origin = station
    remaining = [s for _, s in stations if s not in (origin, destination)]
    if origin is None and remaining:
        origin = remaining.pop(0)
    if destination is None and remaining:
        destination = remaining.pop(0)

    if origin:
        confidence += 0.2
    elif hints.get("university_hub"):
        origin = hints["university_hub"]
        confidence += 0.1
    if destination:
        confidence += 0.25
    elif hints.get("home_station"):
        destination = hints["home_station"]
        confidence += 0.15

    mentioned_lines = rag_engine.find_lines_in_text(text)
    line = None
    if origin and destination:
        serving = rag_engine.infer_lines(origin, destination)
        line = next((ln for ln in mentioned_lines if ln in serving), None)
        if line:
            confidence += 0.15
        elif serving:
            line = serving[0]
            confidence += 0.1
    if line is None and mentioned_lines:
        line = mentioned_lines[0]
        confidence += 0.1

    days = _parse_days(text)
    if days:
        confidence += 0.2

    window_start = window_end = None
    parsed_time = _parse_time(text)
    if parsed_time:
        window_start, window_end = _window_from(*parsed_time)
        confidence += 0.2

    interests = [canon for pattern, canon in _INTEREST_KEYWORDS.items() if re.search(pattern, lowered)]
    safety = list(dict.fromkeys(tag for pattern, tag in _SAFETY_KEYWORDS.items() if re.search(pattern, lowered)))

    question = None
    if not window_start:
        question = "Roughly what time do you usually head home (for example 'around 11:30pm')?"
    elif not days:
        question = "Which nights of the week do you usually make this journey?"
    elif not origin or not destination:
        question = "Which station do you usually leave from, and which station do you travel home to?"
    elif not line:
        question = "Which line do you usually take for this journey?"

    return ParsedCommute(
        origin_station=origin,
        destination_station=destination,
        line=line,
        days=days,
        window_start=window_start,
        window_end=window_end,
        study_interests=interests[:8],
        safety_preferences=safety,
        languages=[{"code": c, "proficiency": p} for c, p in languages.extract_languages(text)],
        confidence=round(min(confidence, 1.0), 2),
        clarification_question=question if confidence < 0.5 or question else None,
    )


def finalize_parsed(parsed: ParsedCommute, hints: dict[str, str], text: str = "") -> ParsedCommute:
    """Deterministic normalisation applied to BOTH model and rule-based output.

    Languages: a model-proposed language survives only if the text itself states it
    (languages.verify_explicit), so nothing can be inferred from names or stations.
    """
    data = parsed.model_dump()
    proposed = [(lang["code"], getattr(lang["proficiency"], "value", lang["proficiency"])) for lang in data["languages"]]
    data["languages"] = [
        {"code": c, "proficiency": p}
        for c, p in languages.merge(languages.verify_explicit(text, proposed), languages.extract_languages(text))
    ][:10]
    data["origin_station"] = rag_engine.normalize_station(data["origin_station"]) or None
    data["destination_station"] = rag_engine.normalize_station(data["destination_station"]) or None
    if not data["origin_station"] and hints.get("university_hub"):
        data["origin_station"] = hints["university_hub"]
    if not data["destination_station"] and hints.get("home_station"):
        data["destination_station"] = hints["home_station"]

    line = data["line"]
    if line:
        found = rag_engine.find_lines_in_text(line if " " in line else f"{line} line")
        line = found[0] if found else (line if line in rag_engine.LINE_NAMES else None)
    o, d = data["origin_station"], data["destination_station"]
    if o and d:
        serving = rag_engine.infer_lines(o, d)
        if serving and line not in serving:
            line = serving[0]
    data["line"] = line

    if data["window_start"] and is_hhmm(data["window_start"]):
        data["window_start"], data["window_end"] = normalize_window(data["window_start"])
    else:
        data["window_start"] = data["window_end"] = None

    missing = [k for k in ("origin_station", "destination_station", "line", "window_start") if not data[k]]
    if not data["days"]:
        missing.append("days")
    if o and d and o == d:
        missing.append("destination_station")
    if missing and data["confidence"] >= 0.5:
        data["confidence"] = 0.45
    if data["confidence"] < 0.5 and not data["clarification_question"]:
        data["clarification_question"] = (
            "Could you tell me which station you leave from, where you travel home to, "
            "which nights, and roughly what time?"
        )
    if data["confidence"] >= 0.5:
        data["clarification_question"] = None
    if data["clarification_question"]:
        data["clarification_question"] = privacy.redact_text(data["clarification_question"]).text
    return ParsedCommute.model_validate(data)


# ===================================================================== pipeline state
class PipelineState(TypedDict, total=False):
    mode: Literal["parse", "match"]
    # parse mode
    raw_text: str  # already privacy-redacted
    hints: dict[str, str]
    parsed: dict[str, Any] | None
    clarification: str | None
    # match mode
    user_id: str
    day_of_week: str | None
    requester: dict[str, Any]
    overlaps: list[dict[str, Any]]
    rag_context: dict[str, list[str]]
    matches: list[dict[str, Any]]
    # accumulated
    notes: Annotated[list[str], operator.add]
    engines: Annotated[list[str], operator.add]  # "anthropic" | "rule_based" per agent


# ============================================================ Node 1: Data Structurer
async def data_structurer(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    if state.get("mode") != "parse":
        return {"notes": []}  # match mode starts from an already-structured schedule
    text = state.get("raw_text", "")
    hints = state.get("hints", {})
    notes: list[str] = []
    parsed = await call_structured(
        agent="structurer",
        model=settings.model_fast,
        system=prompts.STRUCTURER_SYSTEM,
        user=prompts.build_structurer_user(text, hints),
        tool_name=prompts.STRUCTURER_TOOL,
        tool_description="Record the structured commute extracted from the student's description.",
        output_model=ParsedCommute,
    )
    engine = "anthropic"
    if parsed is None:
        engine = "rule_based"
        if settings.llm_enabled:
            notes.append("The AI parser was unavailable, so a rule-based parser was used.")
        parsed = rule_based_parse(text, hints)
    parsed = finalize_parsed(parsed, hints, text)
    log.info("structured", extra={"mode": engine, "confidence": parsed.confidence})
    return {
        "parsed": parsed.model_dump(mode="json"),
        "clarification": parsed.clarification_question if parsed.confidence < 0.5 else None,
        "notes": notes,
        "engines": [engine],
    }


# ========================================================== Node 2: Geographic Router
def _svc_sql(col):
    seconds = extract("epoch", col)  # EXTRACT(EPOCH FROM time) -> seconds since midnight
    return case((seconds < 5 * 3600, seconds / 60 + 1440), else_=seconds / 60)


def default_day(schedule_days: list[str]) -> str | None:
    if not schedule_days:
        return None
    now = datetime.now(ZoneInfo(settings.timezone))
    if now.hour < 5:  # still "last night"
        now -= timedelta(days=1)
    today = DAYS[now.weekday()]
    if today in schedule_days:
        return today
    # next scheduled night from today
    for offset in range(1, 8):
        day = DAYS[(now.weekday() + offset) % 7]
        if day in schedule_days:
            return day
    return schedule_days[0]


def _segment_key(line: str, segment: list[str]) -> str:
    return f"{line}: {segment[0]} -> {segment[-1]}"


def latest_hhmm(times: list[str]) -> str:
    """Latest clock time on the night axis (so 00:45 counts as later than 23:30)."""
    return min_to_hhmm(max(service_min(hhmm_to_min(t)) for t in times))


def _deterministic_safety(segment: list[str], night_ok: bool) -> float:
    score = 0.5 * rag_engine.station_safety_score(segment[0]) + 0.5 * rag_engine.station_safety_score(segment[-1])
    return round(min(1.0, score + (0.1 if night_ok else -0.2)), 2)


def _rank(o: RouteOverlap) -> float:
    # Trust is deliberately absent: a "New" student must rank exactly like a veteran (cold start).
    return round(
        0.4 * o.route_safety_score
        + 0.25 * min(1.0, len(o.segment) / 6)
        + 0.2 * min(1.0, len(o.shared_interests) / 2)
        + 0.15 * (1 - min(o.window_gap_minutes, 30) / 30)
        + 0.1 * (1.0 if o.same_home_station else 0.0)
        + 0.05 * (1.0 if o.shared_languages else 0.0),
        3,
    )


# ============================================================ languages: loading + filter
async def load_user_languages(session: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[UserLanguage]]:
    out: dict[uuid.UUID, list[UserLanguage]] = {uid: [] for uid in user_ids}
    if not user_ids:
        return out
    rows = (await session.execute(select(UserLanguage).where(UserLanguage.user_id.in_(user_ids)))).scalars().all()
    for row in rows:
        out.setdefault(row.user_id, []).append(row)
    return out


def language_profile(user: User, rows: list[UserLanguage]) -> languages.LanguageProfile:
    mode = getattr(user.language_matching, "value", user.language_matching) or LanguageMatching.prefer_shared.value
    return languages.LanguageProfile(mode=mode, share=bool(user.share_languages), codes=frozenset(r.language_code for r in rows))


def language_prefilter(me: languages.LanguageProfile) -> list[Any]:
    """SQL WHERE clauses: if either side requires a shared language, require one (usable on both sides).

    prefer_shared never filters; "off" means the requester has no usable languages, so a
    require_shared candidate is excluded and the requester's own choice imposes nothing.
    """
    shares_one = (
        exists().where(UserLanguage.user_id == User.id, UserLanguage.language_code.in_(sorted(me.codes)))
        if me.usable and me.codes
        else false()
    )
    clauses: list[Any] = [
        or_(
            User.language_matching != LanguageMatching.require_shared,
            and_(User.language_matching != LanguageMatching.off, shares_one),
        )
    ]
    if me.mode == languages.REQUIRE_SHARED:
        clauses.append(and_(User.language_matching != LanguageMatching.off, shares_one))
    return clauses


NO_NIGHT_SERVICE = "no_night_service"


def compute_overlap(requester: dict[str, Any], sched: Any, user: Any, s: Any) -> RouteOverlap | str | None:
    """Pure per-candidate overlap computation (no I/O), shared by the router and tests.

    `sched` is the requester's CommuteSchedule; `user`/`s` the candidate's User/CommuteSchedule.
    Returns a RouteOverlap, NO_NIGHT_SERVICE, or None when the journeys never coincide.
    Only the overlapping part of the candidate's schedule is kept.
    """
    day = requester["day"]
    my_start, my_end = window_service(sched.departure_window_start, sched.departure_window_end)
    segment = rag_engine.shared_segment(
        sched.primary_line, sched.origin_station, sched.destination_station,
        s.primary_line, s.origin_station, s.destination_station,
    )
    if not segment:
        return None
    their_start, their_end = window_service(s.departure_window_start, s.departure_window_end)
    if their_start > my_end + WINDOW_TOLERANCE_MIN or their_end < my_start - WINDOW_TOLERANCE_MIN:
        return None
    meet = max(my_start, their_start)
    gap = max(0, their_start - my_end, my_start - their_end)
    late = meet >= rag_engine.LAST_REGULAR_DEPARTURE_MIN
    night_ok = (not late) or rag_engine.night_service_available(sched.primary_line, day)
    if s.primary_line != sched.primary_line and late:
        night_ok = night_ok and rag_engine.night_service_available(s.primary_line, day)
    if not night_ok:
        return NO_NIGHT_SERVICE
    interests = list(user.study_interests or [])
    overlap = RouteOverlap(
        ref="",
        user_id=str(user.id),
        display_name=user.anonymous_display_name,
        gender_identity=user.gender_identity,
        gender_preference=user.gender_preference,
        shared_line=sched.primary_line if s.primary_line == sched.primary_line
        else f"{sched.primary_line} / {s.primary_line}",
        same_line=s.primary_line == sched.primary_line,
        segment=segment,
        meet_time=min_to_hhmm(meet),
        window_gap_minutes=gap,
        same_home_station=s.destination_station == sched.destination_station,
        shared_interests=[i for i in requester["interests"] if i in interests],
        candidate_interests=interests,
        candidate_safety=list(user.safety_preferences or []),
        bio_snippet=privacy.redact_text(user.bio_freetext or "").text[:300] or None,
        night_service=late,
        route_safety_score=_deterministic_safety(segment, night_ok),
        recommended_meet_station=segment[0],
        safety_rationale="",
    )
    overlap.rank_score = _rank(overlap)
    return overlap


async def geographic_router(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    session: AsyncSession = config["configurable"]["session"]
    me = await session.get(User, uuid.UUID(state["user_id"]))
    if me is None or not me.is_active:
        return {"overlaps": [], "notes": ["Profile not found or inactive."], "engines": []}

    schedule_days = sorted({s.day_of_week for s in me.schedules}, key=DAYS.index)
    day = state.get("day_of_week") or default_day(schedule_days)
    mine = [s for s in me.schedules if s.day_of_week == day]
    if not mine:
        return {
            "overlaps": [],
            "day_of_week": day,
            "notes": [f"You have no commute saved for {day or 'any night'} yet."],
            "engines": [],
        }
    sched = min(mine, key=lambda s: time_to_min(s.departure_window_start))
    my_start, my_end = window_service(sched.departure_window_start, sched.departure_window_end)

    my_profile = language_profile(me, (await load_user_languages(session, [me.id]))[me.id])
    requester = {
        "user_id": str(me.id),
        "display_name": me.anonymous_display_name,
        "language_matching": my_profile.mode,
        "gender_identity": me.gender_identity.value,
        "gender_preference": me.gender_preference.value,
        "line": sched.primary_line,
        "origin": sched.origin_station,
        "destination": sched.destination_station,
        "day": day,
        "window_start": min_to_hhmm(my_start),
        "window_end": min_to_hhmm(my_end),
        "start_min": my_start,
        "interests": list(me.study_interests or []),
        "safety_preferences": list(me.safety_preferences or []),
        "bio": me.bio_freetext,
    }

    # ---- SQL pre-filter: same night, window +/- 30 min, same/intersecting line,
    #      mutual gender-preference compatibility, require_shared languages, active.
    lines = sorted(rag_engine.intersecting_lines(sched.primary_line))
    stmt = (
        select(User, CommuteSchedule)
        .join(CommuteSchedule, CommuteSchedule.user_id == User.id)
        .where(
            User.is_active.is_(True),
            User.id != me.id,
            CommuteSchedule.day_of_week == day,
            CommuteSchedule.primary_line.in_(lines),
            _svc_sql(CommuteSchedule.departure_window_start) <= my_end + WINDOW_TOLERANCE_MIN,
            _svc_sql(CommuteSchedule.departure_window_end) >= my_start - WINDOW_TOLERANCE_MIN,
            User.gender_identity.in_(list(accepted_genders(me.gender_preference))),
            User.gender_preference.in_(prefs_accepting(me.gender_identity)),
            *language_prefilter(my_profile),
        )
        .limit(MAX_CANDIDATES_SQL)
    )
    rows = (await session.execute(stmt)).all()
    cand_langs = await load_user_languages(session, sorted({user.id for user, _ in rows}))

    no_night_service = 0
    best: dict[str, RouteOverlap] = {}
    for user, s in rows:
        their_profile = language_profile(user, cand_langs.get(user.id, []))
        if not languages.can_match(my_profile, their_profile):  # defence in depth: mirrors the SQL
            continue
        overlap = compute_overlap(requester, sched, user, s)
        if overlap == NO_NIGHT_SERVICE:
            no_night_service += 1
            continue
        if overlap is None:
            continue
        overlap.shared_languages = languages.shared_codes([my_profile, their_profile])
        overlap.journeys_completed = user.journeys_completed_count or 0
        overlap.tier_label = trust.tier_label(overlap.journeys_completed)
        overlap.rank_score = _rank(overlap)
        prev = best.get(overlap.user_id)
        if prev is None or overlap.rank_score > prev.rank_score:
            best[overlap.user_id] = overlap

    notes: list[str] = []
    if no_night_service:
        notes.append(
            f"{no_night_service} potential companion(s) were excluded because their line has no "
            f"night service at that hour on {day}."
        )
    overlaps = sorted(best.values(), key=lambda o: -o.rank_score)[: MAX_OVERLAPS * 2]
    for i, o in enumerate(overlaps, start=1):
        o.ref = f"C{i}"

    # ---- RAG context per unique line segment (requester's segment always included)
    segments: dict[str, tuple[str, list[str]]] = {
        _segment_key(sched.primary_line, [sched.origin_station, sched.destination_station]):
            (sched.primary_line, [sched.origin_station, sched.destination_station])
    }
    for o in overlaps:
        line = sched.primary_line if o.same_line else o.shared_line.split(" / ")[-1]
        segments.setdefault(_segment_key(line, o.segment), (line, o.segment))
    keys = list(segments)
    contexts = await asyncio.gather(
        *[asyncio.to_thread(rag_engine.get_transit_safety_context, seg[0], seg[-1], line, 6)
          for line, seg in segments.values()]
    )
    rag_context = dict(zip(keys, contexts))

    if not overlaps:
        notes.append(
            f"No one else currently shares your route and departure window on {day}. "
            "Try another night, or check back as more students join."
        )
        return {"requester": requester, "overlaps": [], "rag_context": rag_context,
                "day_of_week": day, "notes": notes, "engines": []}

    # ---- one batched model call for route safety
    engine = "rule_based"
    if settings.llm_enabled:
        cand_views = [
            {
                "candidate_ref": o.ref,
                "shared_line": o.shared_line,
                "shared_segment": o.segment,
                "segment_context_key": _segment_key(
                    sched.primary_line if o.same_line else o.shared_line.split(" / ")[-1], o.segment),
                "meet_time": o.meet_time,
                "window_gap_minutes": o.window_gap_minutes,
                "same_home_station": o.same_home_station,
            }
            for o in overlaps
        ]
        req_view = {k: requester[k] for k in ("line", "origin", "destination", "day", "window_start", "window_end", "safety_preferences")}
        result = await call_structured(
            agent="router",
            model=settings.model_fast,
            system=prompts.ROUTER_SYSTEM,
            user=prompts.build_router_user(req_view, cand_views, rag_context),
            tool_name=prompts.ROUTER_TOOL,
            tool_description="Record one route-safety assessment per candidate.",
            output_model=RouteRankingOutput,
        )
        if result is not None:
            engine = "anthropic"
            by_ref = {o.ref: o for o in overlaps}
            excluded = 0
            for a in result.assessments:
                o = by_ref.get(a.candidate_ref)
                if o is None:
                    continue
                if a.exclude:
                    excluded += 1
                    by_ref.pop(a.candidate_ref)
                    continue
                o.route_safety_score = a.route_safety_score
                o.safety_rationale = privacy.redact_text(a.safety_rationale, [o.display_name]).text
                if a.recommended_meet_station in o.segment:
                    o.recommended_meet_station = a.recommended_meet_station
                o.rank_score = _rank(o)
            overlaps = list(by_ref.values())
            if excluded:
                notes.append(f"{excluded} potential companion(s) were excluded after the route safety review.")
        else:
            notes.append("The AI route check was unavailable, so rule-based route scoring was used.")

    overlaps = sorted(overlaps, key=lambda o: -o.rank_score)[:MAX_OVERLAPS]
    log.info("routed", extra={"mode": engine, "candidates": len(overlaps), "day_of_week": day})
    return {
        "requester": requester,
        "overlaps": [o.model_dump(mode="json") for o in overlaps],
        "rag_context": rag_context,
        "day_of_week": day,
        "notes": notes,
        "engines": [engine],
    }


# ==================================================== Node 3: Safety Guard & Matcher
def _context_for(rag_context: dict[str, list[str]], overlap: RouteOverlap, requester_line: str) -> list[str]:
    line = requester_line if overlap.same_line else overlap.shared_line.split(" / ")[-1]
    return rag_context.get(_segment_key(line, overlap.segment), [])


def _mock_safety_notes(docs: list[str], limit: int = 2) -> list[str]:
    notes: list[str] = []
    for doc in docs:
        body = doc.replace(rag_engine.MOCK_LABEL, "").strip()
        sentence = re.split(r"(?<=[.!?])\s+", body)[0]
        if re.search(r"staff|lit|CCTV|night|Night|light", body):
            notes.append(f"(Mock transit data) {sentence[:180]}")
        if len(notes) >= limit:
            break
    return notes


def _common_safety(requester: dict[str, Any], members: list[RouteOverlap]) -> list[str]:
    common = set(requester["safety_preferences"])
    for m in members:
        common &= set(m.candidate_safety)
    return sorted(common)


def build_match(
    proposal: MatchProposal,
    overlaps_by_ref: dict[str, RouteOverlap],
    requester: dict[str, Any],
) -> dict[str, Any] | None:
    """Deterministically validate a proposal (from the model or the rule engine).

    Enforces: refs exist and are unique, pair/group size and eligibility, pairwise gender
    compatibility within groups, meet station on every member's shared segment, and a meet
    time no earlier than any member can make. Returns a client-shaped dict or None.
    """
    refs = proposal.member_refs
    if len(set(refs)) != len(refs) or any(r not in overlaps_by_ref for r in refs):
        return None
    members = [overlaps_by_ref[r] for r in refs]

    if proposal.match_type == MatchType.walk_home_pair:
        if len(members) != 1 or not members[0].same_home_station:
            return None
        shared_line = members[0].shared_line
    else:
        if not 2 <= len(members) <= 4 or not all(m.same_line for m in members):
            return None
        for a, b in itertools.combinations(members, 2):
            if not compatible(a.gender_identity, a.gender_preference, b.gender_identity, b.gender_preference):
                return None
        shared_line = requester["line"]

    common = [s for s in members[0].segment if all(s in m.segment for m in members[1:])]
    if not common:
        return None
    meet_station = proposal.meet_station if proposal.meet_station in common else common[0]

    latest = max(service_min(hhmm_to_min(m.meet_time)) for m in members)
    assembly = proposal.assembly_instructions.model_dump()
    proposed = assembly.get("meet_time", "")
    if not is_hhmm(proposed) or service_min(hhmm_to_min(proposed)) < latest:
        assembly["meet_time"] = min_to_hhmm(latest)

    return {
        "match_type": proposal.match_type.value,
        "display_names": [requester["display_name"]] + [m.display_name for m in members],
        "shared_line": shared_line,
        "meet_station": meet_station,
        "assembly_instructions": assembly,
        "icebreaker": proposal.icebreaker,
        "safety_notes": list(proposal.safety_notes),
        "similarity_reasons": list(proposal.similarity_reasons),
        "similarity_score": proposal.similarity_score,
        "member_user_ids": [requester["user_id"]] + [m.user_id for m in members],
    }


def match_shared_languages(members: list[RouteOverlap]) -> list[str]:
    """Languages EVERY member shares with the requester (each overlap holds its pairwise, displayable set)."""
    if not members:
        return []
    common = set(members[0].shared_languages)
    for m in members[1:]:
        common &= set(m.shared_languages)
    return [c for c in members[0].shared_languages if c in common]


def _language_reason(codes: list[str], group: bool) -> str:
    names = ", ".join(languages.language_name(c) for c in codes)
    return f"{'You all' if group else 'You both'} speak {names}"


def _with_greeting(icebreaker: str, requester: dict[str, Any], codes: list[str]) -> str:
    """English icebreaker plus one short neutral greeting in a shared non-English language (prefer_shared only)."""
    greeting = languages.greeting_for(codes) if requester.get("language_matching") == languages.PREFER_SHARED else None
    if not greeting:
        return icebreaker[:280]
    extra = f" ({greeting[1]})"
    return (icebreaker[: 280 - len(extra)] + extra) if len(icebreaker) + len(extra) > 280 else icebreaker + extra


def _reasons(
    requester: dict[str, Any],
    members: list[RouteOverlap],
    topic: str | None,
    segment: list[str],
    shared_langs: list[str] | None = None,
) -> list[str]:
    reasons = [f"Departure windows line up (meet around {latest_hhmm([m.meet_time for m in members])})"]
    if len(segment) > 1:
        reasons.append(f"You share {len(segment) - 1} stop(s): {segment[0]} to {segment[-1]}")
    else:
        reasons.append(f"You both use {segment[0]}")
    if topic:
        reasons.append(f"Shared study interest: {topic}")
    if shared_langs:
        reasons.append(_language_reason(list(shared_langs), group=len(members) > 1))
    common = _common_safety(requester, members)
    if common:
        reasons.append("Same safety priorities: " + ", ".join(c.replace("_", " ") for c in common))
    return reasons[:4]


def rule_based_proposals(
    requester: dict[str, Any], overlaps: list[RouteOverlap], rag_context: dict[str, list[str]]
) -> list[MatchProposal]:
    proposals: list[MatchProposal] = []
    line = requester["line"]

    # Walk-home pairs: same home station, best ranked first.
    for o in [o for o in overlaps if o.same_home_station][:2]:
        topic = o.shared_interests[0] if o.shared_interests else None
        station = o.recommended_meet_station or o.segment[0]
        mp = rag_engine.meet_point(station)
        home = requester["destination"]
        ice = _with_greeting(
            f"Hi {o.display_name}! We're both heading to {home} around {o.meet_time}"
            + (f" and both into {topic}. What are you working on this term?" if topic
               else ". Fancy sharing the ride and the walk from the station?"),
            requester,
            o.shared_languages,
        )
        proposals.append(MatchProposal(
            match_type=MatchType.walk_home_pair,
            member_refs=[o.ref],
            shared_line=o.shared_line,
            meet_station=station,
            assembly_instructions=AssemblyInstructions(
                carriage_position=mp["carriage"],
                landmark=mp["landmark"],
                meet_time=o.meet_time,
                last_mile_handoff=(
                    f"Ride together to {home}, leave by the main staffed exit and walk together along the "
                    f"busiest, best-lit main road before splitting at a lit junction; both check in on the "
                    f"in-app thread once home."
                ),
            ),
            icebreaker=ice[:280],
            safety_notes=_mock_safety_notes(_context_for(rag_context, o, line)),
            similarity_reasons=_reasons(requester, [o], topic, o.segment, o.shared_languages),
            similarity_score=min(1.0, o.rank_score),
        ))

    # Study groups: same line, shared segment of 2+ stations, shared topic, pairwise compatible.
    pool = [o for o in overlaps if o.same_line and len(o.segment) >= 2]
    used_sets: list[set[str]] = []
    topics = sorted(
        requester["interests"],
        key=lambda t: -sum(1 for o in pool if t in o.shared_interests),
    )
    for topic in topics:
        group: list[RouteOverlap] = []
        for o in sorted(pool, key=lambda x: -x.rank_score):
            if topic not in o.shared_interests or len(group) >= 4:
                continue
            if all(compatible(o.gender_identity, o.gender_preference, g.gender_identity, g.gender_preference) for g in group):
                common = [s for s in o.segment if all(s in g.segment for g in group)]
                if len(common) >= 2:
                    group.append(o)
        if len(group) < 2:
            continue
        refs = {g.ref for g in group}
        if refs in used_sets:
            continue
        used_sets.append(refs)
        common = [s for s in group[0].segment if all(s in g.segment for g in group[1:])]
        station = common[0]
        mp = rag_engine.meet_point(station)
        meet_time = latest_hhmm([g.meet_time for g in group])
        names = ", ".join(g.display_name for g in group)
        group_langs = match_shared_languages(group)
        proposals.append(MatchProposal(
            match_type=MatchType.study_group,
            member_refs=[g.ref for g in group],
            shared_line=line,
            meet_station=station,
            assembly_instructions=AssemblyInstructions(
                carriage_position=mp["carriage"],
                landmark=mp["landmark"],
                meet_time=meet_time,
                last_mile_handoff=(
                    f"Study together from {common[0]} to {common[-1]}; anyone alighting earlier leaves by the "
                    f"staffed exit and checks in on the group thread once home."
                ),
            ),
            icebreaker=_with_greeting(
                f"Hi {names}! {topic.capitalize()} crew on the {line} line: "
                f"what's the toughest thing on your reading list this week?",
                requester,
                group_langs,
            ),
            safety_notes=_mock_safety_notes(_context_for(rag_context, group[0], line)),
            similarity_reasons=_reasons(requester, group, topic, common, group_langs),
            similarity_score=min(1.0, sum(g.rank_score for g in group) / len(group)),
        ))
        if sum(1 for p in proposals if p.match_type == MatchType.study_group) >= 2:
            break
    return proposals


def finalize_matches(
    proposals: list[MatchProposal],
    overlaps_by_ref: dict[str, RouteOverlap],
    requester: dict[str, Any],
) -> tuple[list[dict[str, Any]], int]:
    """Validate, privacy-filter and de-duplicate proposals. Returns (matches, dropped)."""
    allowed_names = [requester["display_name"]] + [o.display_name for o in overlaps_by_ref.values()]
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, frozenset[str]]] = set()
    dropped = 0
    per_type: dict[str, int] = {}
    for proposal in proposals:
        built = build_match(proposal, overlaps_by_ref, requester)
        if built is None:
            dropped += 1
            continue
        key = (built["match_type"], frozenset(built["member_user_ids"]))
        if key in seen or per_type.get(built["match_type"], 0) >= 2:
            dropped += 1
            continue
        member_ids = built.pop("member_user_ids")
        clean, kinds = privacy.sanitize_match(built, allowed_names, rag_engine.KNOWN_STATIONS)
        if clean is None:
            dropped += 1
            log.warning("match_dropped_privacy", extra={"finding_kinds": kinds})
            continue
        # No journey dates, no language that isn't shared by every member, no religion/ethnicity/nationality.
        members = [overlaps_by_ref[r] for r in proposal.member_refs]
        shared = match_shared_languages(members)
        # Display names and study interests ("spanish literature") aren't language disclosures.
        terms = allowed_names + list(requester["interests"]) + [i for m in members for i in m.candidate_interests]
        disclosure = privacy.disclosure_findings(clean, shared, allow_terms=terms)
        if disclosure:
            dropped += 1
            log.warning("match_dropped_disclosure", extra={"finding_kinds": disclosure})
            continue
        clean["member_user_ids"] = member_ids
        seen.add(key)
        per_type[clean["match_type"]] = per_type.get(clean["match_type"], 0) + 1
        out.append(clean)
    return out, dropped


async def safety_guard_matcher(state: PipelineState, config: RunnableConfig) -> dict[str, Any]:
    requester = state["requester"]
    overlaps = [RouteOverlap.model_validate(o) for o in state.get("overlaps", [])]
    rag_context = state.get("rag_context", {})
    by_ref = {o.ref: o for o in overlaps}
    notes: list[str] = []
    engine = "rule_based"
    proposals: list[MatchProposal] | None = None
    llm_reason: str | None = None

    if settings.llm_enabled:
        cand_views = [
            {
                "candidate_ref": o.ref,
                "display_name": o.display_name,
                "shared_line": o.shared_line,
                "same_line": o.same_line,
                "shared_segment": o.segment,
                "meet_time": o.meet_time,
                "same_home_station": o.same_home_station,
                "shared_interests": o.shared_interests,
                "interests": o.candidate_interests,
                "safety_preferences": o.candidate_safety,
                "route_safety_score": o.route_safety_score,
                "route_safety_rationale": o.safety_rationale,
                "recommended_meet_station": o.recommended_meet_station,
                # Soft signals only. Trust: a count and tier (no dates, partners or routes).
                "trust": {"journeys_completed": o.journeys_completed, "tier_label": o.tier_label},
                # Only languages this candidate and ME both speak and agreed to show.
                "shared_languages": [{"code": c, "name": languages.language_name(c)} for c in o.shared_languages],
            }
            for o in overlaps
        ]
        req_view = {
            "ref": "ME",
            "display_name": requester["display_name"],
            "language_matching": requester["language_matching"],
            "line": requester["line"],
            "origin": requester["origin"],
            "destination": requester["destination"],
            "window": f"{requester['window_start']}-{requester['window_end']}",
            "interests": requester["interests"],
            "safety_preferences": requester["safety_preferences"],
        }
        bios = {o.ref: o.bio_snippet for o in overlaps if o.bio_snippet}
        if requester.get("bio"):
            bios["ME"] = privacy.redact_text(requester["bio"]).text[:300]
        incompatible = [
            [a.ref, b.ref]
            for a, b in itertools.combinations(overlaps, 2)
            if not compatible(a.gender_identity, a.gender_preference, b.gender_identity, b.gender_preference)
        ]
        stations = {s for o in overlaps for s in o.segment}
        meet_points = {s: rag_engine.meet_point(s) for s in sorted(stations) if s in rag_engine.MEET_POINTS}
        result = await call_structured(
            agent="matcher",
            model=settings.model_matcher,
            system=prompts.MATCHER_SYSTEM,
            user=prompts.build_matcher_user(req_view, cand_views, bios, incompatible, rag_context, meet_points),
            tool_name=prompts.MATCHER_TOOL,
            tool_description="Record the proposed walk-home pairs and train-carriage study groups.",
            output_model=MatcherOutput,
        )
        if result is not None:
            engine = "anthropic"
            proposals = result.matches
            llm_reason = result.no_safe_option_reason
        else:
            notes.append("The AI matcher was unavailable, so rule-based matching was used.")

    if proposals is None:
        proposals = rule_based_proposals(requester, overlaps, rag_context)

    matches, dropped = finalize_matches(proposals, by_ref, requester)
    if dropped:
        notes.append(f"{dropped} suggestion(s) were removed by safety, privacy or consistency checks.")
    if not matches:
        reason = llm_reason or (
            "No safe pairing or study group could be formed from the students sharing your route "
            f"on {requester['day']}. Pairs need the same home station; groups need two or more "
            "compatible students on your line who share a study topic."
        )
        notes.append(privacy.redact_text(reason).text)
    log.info("matched", extra={"mode": engine, "matches": len(matches), "dropped": dropped})
    return {"matches": matches, "notes": notes, "engines": [engine]}


# ======================================================================== graph wiring
def _after_structurer(state: PipelineState) -> str:
    return "route" if state.get("mode") == "match" else "end"


def _after_router(state: PipelineState) -> str:
    return "match" if state.get("overlaps") else "end"


def build_graph():
    builder = StateGraph(PipelineState)
    builder.add_node("data_structurer", data_structurer)
    builder.add_node("geographic_router", geographic_router)
    builder.add_node("safety_guard_matcher", safety_guard_matcher)
    builder.add_edge(START, "data_structurer")
    builder.add_conditional_edges("data_structurer", _after_structurer, {"route": "geographic_router", "end": END})
    builder.add_conditional_edges("geographic_router", _after_router, {"match": "safety_guard_matcher", "end": END})
    builder.add_edge("safety_guard_matcher", END)
    return builder.compile()


_GRAPH = None


def graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH


def _mode_label(engines: list[str]) -> str:
    if not engines:
        return settings.llm_mode
    if all(e == "anthropic" for e in engines):
        return "anthropic"
    if all(e == "rule_based" for e in engines):
        return "rule_based"
    return "mixed"


# ===================================================================== disclosures
def disclosures(
    viewer_id: uuid.UUID,
    members: list[User],
    langs: dict[uuid.UUID, list[UserLanguage]],
    confirmed: bool,
) -> dict[str, Any]:
    """What `viewer_id` may see about the other members of one match. Enforced here, in code.

    - participants_trust: count + tier for every other member (never dates, partners or routes).
    - shared_languages: only languages EVERY member speaks and agreed to show.
    - participant_languages: full lists only once the match is confirmed (mutual accept), and only
      for members with share_languages on and language_matching not off.
    """
    others = [u for u in members if u.id != viewer_id]
    profiles = {u.id: language_profile(u, langs.get(u.id, [])) for u in members}
    shared = languages.shared_codes(profiles.values())
    participant_languages = None
    if confirmed:
        participant_languages = [
            ParticipantLanguages(
                display_name=u.anonymous_display_name,
                languages=[
                    UserLanguageOut(code=r.language_code, name=languages.language_name(r.language_code), proficiency=r.proficiency)
                    for r in sorted(langs.get(u.id, []), key=lambda r: -languages.PROFICIENCY_RANK[r.proficiency.value])
                ],
            )
            for u in others
            if languages.full_list_visible(profiles[u.id], confirmed) and langs.get(u.id)
        ]
    return {
        "participants_trust": [
            ParticipantTrust(
                display_name=u.anonymous_display_name,
                journeys_completed=u.journeys_completed_count or 0,
                tier_label=trust.tier_label(u.journeys_completed_count or 0),
            )
            for u in others
        ],
        "shared_languages": [LanguageOut(code=c, name=languages.language_name(c)) for c in shared],
        "participant_languages": participant_languages,
    }


# ======================================================================= orchestration
async def run_parse(redacted_text: str, hints: dict[str, str], session: AsyncSession | None = None) -> dict[str, Any]:
    state: PipelineState = {"mode": "parse", "raw_text": redacted_text, "hints": hints, "notes": [], "engines": []}
    result = await graph().ainvoke(state, config={"configurable": {"session": session}})
    result["mode_label"] = _mode_label(result.get("engines", []))
    return result


async def run_find_matches(session: AsyncSession, user_id: uuid.UUID, day: str | None) -> FindMatchesResponse:
    state: PipelineState = {
        "mode": "match", "user_id": str(user_id), "day_of_week": day, "notes": [], "engines": [],
    }
    result = await graph().ainvoke(state, config={"configurable": {"session": session}})
    matches = result.get("matches", [])
    day_out = result.get("day_of_week") or day
    mode = _mode_label(result.get("engines", []))
    notes = list(dict.fromkeys(result.get("notes", [])))

    request = MatchRequest(requester_id=user_id, day_of_week=day_out or "mon", llm_mode=mode, notes=notes)
    session.add(request)
    await session.flush()

    out: list[MatchOut] = []
    member_ids = sorted({uuid.UUID(uid) for m in matches for uid in m["member_user_ids"]})
    langs = await load_user_languages(session, member_ids)
    for m in matches:
        members = [await session.get(User, uuid.UUID(uid)) for uid in m["member_user_ids"]]
        row = Match(
            match_request_id=request.id,
            match_type=MatchType(m["match_type"]),
            status="pending",
            shared_line=m["shared_line"],
            meet_station=m["meet_station"],
            assembly_instructions=m["assembly_instructions"],
            icebreaker=m["icebreaker"],
            safety_notes=m["safety_notes"],
            similarity_reasons=m["similarity_reasons"],
            similarity_score=float(m["similarity_score"]),
        )
        session.add(row)
        await session.flush()
        for uid in m["member_user_ids"]:
            session.add(MatchParticipant(match_id=row.id, user_id=uuid.UUID(uid), response=ParticipantResponse.pending))
        out.append(MatchOut(
            match_id=row.id,
            match_type=row.match_type,
            display_names=m["display_names"],
            shared_line=m["shared_line"],
            meet_station=m["meet_station"],
            assembly_instructions=AssemblyInstructions.model_validate(m["assembly_instructions"]),
            icebreaker=m["icebreaker"],
            safety_notes=m["safety_notes"],
            similarity_reasons=m["similarity_reasons"],
            **disclosures(user_id, [u for u in members if u is not None], langs, confirmed=False),
        ))
    await session.commit()
    log.info("find_matches_done", extra={"user_id": str(user_id), "matches": len(out), "mode": mode})
    return FindMatchesResponse(
        matches=out, notes=notes, day_of_week=DayOfWeek(day_out) if day_out else None, mode=mode
    )


class MatchAccessError(Exception):
    """Raised when the match does not exist or the user is not a participant."""


async def respond_to_match(
    session: AsyncSession, match_id: uuid.UUID, user_id: uuid.UUID, choice: RespondChoice
) -> RespondResponse:
    match = await session.get(Match, match_id)
    if match is None:
        raise MatchAccessError()
    participant = next((p for p in match.participants if p.user_id == user_id), None)
    if participant is None:
        raise MatchAccessError()

    if match.status != "declined":
        participant.response = (
            ParticipantResponse.accepted if choice == RespondChoice.accept else ParticipantResponse.declined
        )
        participant.responded_at = datetime.now(ZoneInfo("UTC"))
        responses = [p.response for p in match.participants]
        if ParticipantResponse.declined in responses:
            match.status = "declined"
        elif all(r == ParticipantResponse.accepted for r in responses):
            match.status = "confirmed"
        else:
            match.status = "pending"
    await session.commit()  # expire_on_commit=False keeps the loaded participants usable

    members = [
        MemberStatus(display_name=p.user.anonymous_display_name, response=p.response) for p in match.participants
    ]
    contacts: list[UnlockedContact] | None = None
    participant_languages = None
    if match.status == "confirmed" and participant.response == ParticipantResponse.accepted:
        users = [p.user for p in match.participants]
        langs = await load_user_languages(session, [u.id for u in users])
        participant_languages = disclosures(user_id, users, langs, confirmed=True)["participant_languages"]
        others = [p.user_id for p in match.participants if p.user_id != user_id]
        rows = (await session.execute(select(UserContact).where(UserContact.user_id.in_(others)))).scalars().all()
        handles = {r.user_id: r.contact_handle for r in rows}
        contacts = [
            UnlockedContact(
                display_name=p.user.anonymous_display_name,
                contact_handle=handles.get(p.user_id, "No contact handle shared; use the in-app thread."),
            )
            for p in match.participants
            if p.user_id != user_id
        ]
    log.info("match_response", extra={"match_id": str(match_id), "user_id": str(user_id), "event": match.status})
    return RespondResponse(
        match_id=match.id,
        status=match.status,
        members=members,
        contacts=contacts,
        participant_languages=participant_languages,
    )
