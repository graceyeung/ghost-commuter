"""Pydantic v2 models: enums, LLM tool I/O contracts, internal pipeline records and API DTOs.

Every tool the model is forced to call gets its JSON Schema from these models via
`tool_definition()`, so the schema the model sees and the validator we run are
the same object.
"""
from __future__ import annotations

import copy
import re
from datetime import date, datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

import languages

HHMM_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"
_HHMM_RE = re.compile(HHMM_PATTERN)


# ------------------------------------------------------------------------- enums
class DayOfWeek(str, Enum):
    mon = "mon"
    tue = "tue"
    wed = "wed"
    thu = "thu"
    fri = "fri"
    sat = "sat"
    sun = "sun"


class GenderIdentity(str, Enum):
    woman = "woman"
    man = "man"
    non_binary = "non_binary"
    undisclosed = "undisclosed"


class GenderPreference(str, Enum):
    any = "any"
    women_only = "women_only"
    men_only = "men_only"
    non_binary_inclusive = "non_binary_inclusive"  # women and non-binary people


class SafetyTag(str, Enum):
    well_lit = "well_lit"
    staffed_station = "staffed_station"
    cctv = "cctv"
    night_tube_only = "night_tube_only"
    short_last_mile = "short_last_mile"
    busy_carriage = "busy_carriage"
    avoid_isolated_exits = "avoid_isolated_exits"


class MatchType(str, Enum):
    walk_home_pair = "walk_home_pair"
    study_group = "study_group"


class ParticipantResponse(str, Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class RespondChoice(str, Enum):
    accept = "accept"
    decline = "decline"


class LanguageProficiency(str, Enum):
    native = "native"
    fluent = "fluent"
    conversational = "conversational"


class LanguageMatching(str, Enum):
    off = "off"  # languages are never used or shown
    prefer_shared = "prefer_shared"  # shared languages are a soft signal; nobody is filtered out
    require_shared = "require_shared"  # only match people with at least one shared language


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------- Agent 1: Data Structurer
class ParsedLanguage(_Strict):
    code: str = Field(..., description="Language code from the supported list in <reference>, e.g. 'bn'.", max_length=3)
    proficiency: LanguageProficiency = Field(
        LanguageProficiency.fluent, description="native / fluent / conversational, only as the student states it."
    )


class ParsedCommute(_Strict):
    """Structured view of a student's free-text commute description."""

    origin_station: str | None = Field(None, description="Station the student departs from (usually near campus).", max_length=60)
    destination_station: str | None = Field(None, description="Station the student travels home to.", max_length=60)
    line: str | None = Field(None, description="Primary line, e.g. 'Piccadilly', 'Victoria', 'Windrush'.", max_length=30)
    days: list[DayOfWeek] = Field(default_factory=list, description="Nights this commute happens.", max_length=7)
    window_start: str | None = Field(None, description="Departure window start, 24h HH:MM.", pattern=HHMM_PATTERN)
    window_end: str | None = Field(None, description="Departure window end, 24h HH:MM; exactly 30 minutes after start.", pattern=HHMM_PATTERN)
    study_interests: list[str] = Field(default_factory=list, description="Lower-case study topics.", max_length=8)
    safety_preferences: list[SafetyTag] = Field(default_factory=list, max_length=7)
    languages: list[ParsedLanguage] = Field(
        default_factory=list,
        max_length=10,
        description="Only languages the student explicitly says they speak. Never inferred from anything else.",
    )
    confidence: float = Field(..., ge=0.0, le=1.0, description="How confident the extraction is overall.")
    clarification_question: str | None = Field(
        None, description="If confidence < 0.5: one short question asking for the missing detail.", max_length=240
    )

    @field_validator("study_interests")
    @classmethod
    def _lower_interests(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for item in v:
            item = item.strip().lower()[:40]
            if item and item not in out:
                out.append(item)
        return out


# ------------------------------------------------------ Agent 2: Geographic Router
class RouteAssessment(_Strict):
    candidate_ref: str = Field(..., description="Opaque candidate reference such as 'C1'.", pattern=r"^C\d{1,3}$")
    route_safety_score: float = Field(..., ge=0.0, le=1.0)
    night_service_confirmed: bool = Field(..., description="True only if the supplied context confirms service at that time.")
    recommended_meet_station: str = Field(..., description="A station on the shared segment, exactly as written in the input.", max_length=60)
    safety_rationale: str = Field(..., description="One sentence grounded only in the supplied context.", max_length=300)
    exclude: bool = Field(False, description="True if no safe option exists for this candidate.")


class RouteRankingOutput(_Strict):
    assessments: list[RouteAssessment] = Field(default_factory=list, max_length=40)
    notes: list[str] = Field(default_factory=list, max_length=5)


# ------------------------------------------------- Agent 3: Safety Guard & Matcher
class AssemblyInstructions(_Strict):
    carriage_position: str = Field(..., max_length=120)
    landmark: str = Field(..., max_length=200)
    meet_time: str = Field(..., pattern=HHMM_PATTERN, description="24h HH:MM")
    last_mile_handoff: str = Field(..., max_length=280, description="Station-level plan for after alighting.")


class MatchProposal(_Strict):
    match_type: MatchType
    member_refs: list[str] = Field(
        ..., min_length=1, max_length=4,
        description="Candidate refs joining the requester (who is implicit). Pair: exactly 1. Group: 2-4.",
    )
    shared_line: str = Field(..., max_length=40)
    meet_station: str = Field(..., max_length=60)
    assembly_instructions: AssemblyInstructions
    icebreaker: str = Field(..., max_length=280)
    safety_notes: list[str] = Field(default_factory=list, max_length=4)
    similarity_reasons: list[str] = Field(..., min_length=1, max_length=4)
    similarity_score: float = Field(..., ge=0.0, le=1.0)


class MatcherOutput(_Strict):
    matches: list[MatchProposal] = Field(default_factory=list, max_length=6)
    no_safe_option_reason: str | None = Field(None, max_length=300)


# --------------------------------------------------------- internal pipeline record
class RouteOverlap(BaseModel):
    """Internal: never serialised to the client. user_id/gender stay server-side."""

    ref: str
    user_id: str
    display_name: str
    gender_identity: GenderIdentity
    gender_preference: GenderPreference
    shared_line: str
    same_line: bool
    segment: list[str]
    meet_time: str
    window_gap_minutes: int
    same_home_station: bool
    shared_interests: list[str]
    candidate_interests: list[str]
    candidate_safety: list[str]
    bio_snippet: str | None = None
    night_service: bool
    # Soft signals for Agent 3. shared_languages: codes this candidate and the requester both speak
    # and both agreed to show. Trust never affects ranking or eligibility.
    shared_languages: list[str] = Field(default_factory=list)
    journeys_completed: int = 0
    tier_label: str = "New"
    route_safety_score: float = 0.5
    safety_rationale: str = ""
    recommended_meet_station: str = ""
    rank_score: float = 0.0


# ------------------------------------------------------------------------ API DTOs
class LanguageIn(_Strict):
    code: str = Field(..., min_length=2, max_length=40, description="Supported language code, e.g. 'bn'.")
    proficiency: LanguageProficiency = LanguageProficiency.fluent

    @field_validator("code")
    @classmethod
    def _supported(cls, v: str) -> str:
        code = languages.normalise_code(v)
        if code is None:
            raise ValueError("unsupported language code")
        return code


def _dedupe_languages(items: list[LanguageIn]) -> list[LanguageIn]:
    merged = languages.merge((i.code, i.proficiency.value) for i in items)
    return [LanguageIn(code=c, proficiency=LanguageProficiency(p)) for c, p in merged]


class LanguageOut(BaseModel):
    code: str
    name: str


class UserLanguageOut(LanguageOut):
    proficiency: LanguageProficiency


class RegisterProfileRequest(_Strict):
    anonymous_display_name: str | None = Field(None, min_length=3, max_length=40)
    uni_affiliation: str = Field(..., min_length=2, max_length=80)
    university_hub: str = Field(..., min_length=2, max_length=60, description="Station nearest campus.")
    home_station: str = Field(..., min_length=2, max_length=60)
    gender_identity: GenderIdentity = GenderIdentity.undisclosed
    gender_preference: GenderPreference = GenderPreference.any
    safety_preferences: list[SafetyTag] = Field(default_factory=list)
    study_interests: list[str] = Field(default_factory=list, max_length=8)
    bio_freetext: str | None = Field(None, max_length=600)
    commute_description: str = Field(..., min_length=5, max_length=1200)
    contact_handle: str | None = Field(
        None, max_length=120, description="Shared only after every match member accepts."
    )
    languages: list[LanguageIn] = Field(default_factory=list, max_length=12)
    language_matching: LanguageMatching = LanguageMatching.prefer_shared
    share_languages: bool = True

    @field_validator("languages")
    @classmethod
    def _dedupe(cls, v: list[LanguageIn]) -> list[LanguageIn]:
        return _dedupe_languages(v)


class AddScheduleRequest(_Strict):
    commute_description: str = Field(..., min_length=5, max_length=1200)


class ParsedScheduleOut(BaseModel):
    origin_station: str
    destination_station: str
    line: str
    days: list[DayOfWeek]
    window_start: str
    window_end: str
    study_interests: list[str]
    safety_preferences: list[SafetyTag]
    confidence: float


class RegisterProfileResponse(BaseModel):
    user_id: UUID
    anonymous_display_name: str
    status: str  # "registered" | "needs_clarification"
    parsed_schedule: ParsedScheduleOut | None = None
    clarification_question: str | None = None
    mode: str
    # Languages found in the commute text that are NOT saved yet: shown back for confirmation,
    # then saved with PATCH /users/{id}/languages.
    detected_languages: list[UserLanguageOut] = Field(default_factory=list)


class FindMatchesRequest(_Strict):
    user_id: UUID
    day_of_week: DayOfWeek | None = None


class ParticipantTrust(BaseModel):
    """Public trust signal: a count and a tier. Never dates, partners or routes."""

    display_name: str
    journeys_completed: int
    tier_label: str


class ParticipantLanguages(BaseModel):
    display_name: str
    languages: list[UserLanguageOut]


class MatchOut(BaseModel):
    match_id: UUID
    match_type: MatchType
    display_names: list[str]
    shared_line: str
    meet_station: str
    assembly_instructions: AssemblyInstructions
    icebreaker: str
    safety_notes: list[str]
    similarity_reasons: list[str]
    # One entry per OTHER participant, in display_names order.
    participants_trust: list[ParticipantTrust] = Field(default_factory=list)
    # Only languages every participant speaks and agreed to show.
    shared_languages: list[LanguageOut] = Field(default_factory=list)
    # Full lists, only after mutual acceptance and only for participants with share_languages on.
    participant_languages: list[ParticipantLanguages] | None = None


class FindMatchesResponse(BaseModel):
    matches: list[MatchOut]
    notes: list[str]
    day_of_week: DayOfWeek | None = None
    mode: str


class RespondRequest(_Strict):
    user_id: UUID
    response: RespondChoice


class MemberStatus(BaseModel):
    display_name: str
    response: ParticipantResponse


class UnlockedContact(BaseModel):
    display_name: str
    contact_handle: str


class RespondResponse(BaseModel):
    match_id: UUID
    status: str  # pending | confirmed | declined
    members: list[MemberStatus]
    contacts: list[UnlockedContact] | None = None
    participant_languages: list[ParticipantLanguages] | None = None


class MyMatchOut(MatchOut):
    """A match the user belongs to. display_names[0] is the viewing user."""

    status: str  # pending | confirmed | declined
    my_response: ParticipantResponse
    members: list[MemberStatus]
    you_requested: bool
    created_at: datetime


class MyMatchesResponse(BaseModel):
    matches: list[MyMatchOut]


class SendMessageRequest(_Strict):
    user_id: UUID
    body: str = Field(..., min_length=1, max_length=1000)


class ChatMessageOut(BaseModel):
    message_id: UUID
    match_id: UUID
    sender_display_name: str
    mine: bool
    body: str
    sent_at: datetime


class MessagesResponse(BaseModel):
    match_id: UUID
    status: str
    messages: list[ChatMessageOut]


# ---------------------------------------------------------------- trust + journeys
class TrustSummary(BaseModel):
    journeys_completed: int
    tier: str
    tier_label: str
    next_tier_at: int | None = None  # journeys needed for the next tier; None at the top tier


class JourneyConfirmRequest(_Strict):
    user_id: UUID
    match_id: UUID
    journey_date: date | None = Field(None, description="Defaults to today (Europe/London).")


class JourneyConfirmResponse(BaseModel):
    status: Literal["waiting_for_partner", "completed"]
    journeys_completed: int
    tier_label: str


# ---------------------------------------------------------------------- languages
class UpdateLanguagesRequest(_Strict):
    """Omitted fields are left unchanged. `languages`, when given, replaces the whole list."""

    languages: list[LanguageIn] | None = Field(None, max_length=12)
    language_matching: LanguageMatching | None = None
    share_languages: bool | None = None

    @field_validator("languages")
    @classmethod
    def _dedupe(cls, v: list[LanguageIn] | None) -> list[LanguageIn] | None:
        return None if v is None else _dedupe_languages(v)


class LanguageSettingsOut(BaseModel):
    languages: list[UserLanguageOut]
    language_matching: LanguageMatching
    share_languages: bool


class SupportedLanguagesResponse(BaseModel):
    languages: list[LanguageOut]


# ------------------------------------------------------------- tool schema helpers
def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Resolve local $ref/$defs so the tool input_schema is a single flat document."""
    schema = copy.deepcopy(schema)
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                target = resolve(copy.deepcopy(defs[node["$ref"].split("/")[-1]]))
                extra = {k: resolve(v) for k, v in node.items() if k != "$ref"}
                return {**target, **extra}
            return {k: resolve(v) for k, v in node.items()}
        if isinstance(node, list):
            return [resolve(x) for x in node]
        return node

    return resolve(schema)


def tool_definition(name: str, description: str, model: type[BaseModel]) -> dict[str, Any]:
    return {"name": name, "description": description, "input_schema": _inline_refs(model.model_json_schema())}


def is_hhmm(value: str) -> bool:
    return bool(_HHMM_RE.match(value or ""))
