"""Deterministic PII detection and redaction. Privacy never depends on the prompt alone.

Used in four places:
  1. Inbound: commute descriptions and bios are redacted BEFORE storage or any model call.
  2. Outbound: every match proposal (model-written or rule-based) passes `sanitize_match`.
  3. Outbound: `disclosure_findings` drops proposals that mention a journey date, a language not
     shared by every member, or anyone's religion, ethnicity or nationality.
  4. Display names: `looks_like_real_name` rejects user-chosen names that resemble real ones.

Findings record only the kind and span, never the matched value, so they are safe to log.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

REDACTED = "[redacted]"

# ----------------------------------------------------------------------- patterns
# Full UK postcode, e.g. "N4 3AB", "E15 2PB", "SW1A 1AA" (space optional).
_POSTCODE_FULL = re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", re.IGNORECASE)
# District-only outward code for London and nearby areas, e.g. "E15", "N4", "SW9". Case-sensitive.
_POSTCODE_OUTWARD = re.compile(
    r"\b(?:EC|WC|NW|SE|SW|IG|RM|HA|UB|TW|EN|CR|BR|DA|KT|SM|E|N|W)\d{1,2}[A-Z]?\b"
)
_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_EMAIL_OBFUSCATED = re.compile(
    r"\b[A-Za-z0-9._%+-]+\s*[\[(]\s*at\s*[\])]\s*[A-Za-z0-9-]+\s*(?:[\[(]\s*dot\s*[\])]|\.)\s*[A-Za-z]{2,}\b",
    re.IGNORECASE,
)
# UK numbers: +44 / 0044 / leading 0, with optional spaces, dashes, dots or brackets.
_PHONE_UK = re.compile(r"(?<![\w+])(?:(?:\+|00)44\s?\(?0?\)?|0)\s?(?:\d[\s.\-]?){8,9}\d\b")
# Any other international number.
_PHONE_INTL = re.compile(r"(?<![\w])\+\d{1,3}[\s.\-]?(?:\d[\s.\-]?){6,12}\d\b")
# Social handles such as @night_owl. Not preceded by a word char (so emails are separate).
_HANDLE = re.compile(r"(?<![\w@.])@[A-Za-z0-9_.]{3,30}\b")

_STREET_SUFFIX = (
    r"Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Close|Crescent|Cres|Drive|Dr|Gardens|Gdns|Grove|"
    r"Place|Pl|Square|Sq|Terrace|Tce|Way|Court|Ct|Mews|Hill|Rise|Walk|Row|Parade|Vale|View|Park"
)
_HOUSE_NUMBER_ADDRESS = re.compile(
    rf"\b(\d{{1,4}}[A-Za-z]?),?\s+((?:[A-Za-z'’\-]+\s+){{1,3}}(?:{_STREET_SUFFIX}))\b",
    re.IGNORECASE,
)
_FLAT_NUMBER = re.compile(r"\b(?:flat|apt|apartment|unit|house no\.?|no\.)\s*#?\d+[A-Za-z]?\b", re.IGNORECASE)
_ADDRESS_STOPWORDS = {
    "stops", "stop", "minutes", "minute", "mins", "min", "to", "from", "the", "at", "on", "in",
    "carriage", "carriages", "car", "cars", "platform", "platforms", "trains", "train", "people",
    "students", "of", "and", "or", "a", "an", "by", "via", "past", "towards", "near",
}
_ADDRESS_PRECEDERS = re.compile(r"(?:platform|car|carriage|exit|zone|gate|line|cars)\s*$", re.IGNORECASE)

_SELF_INTRO = re.compile(
    r"\b(?i:my name is|my name's|i am called|i'm called|call me|this is|i'm|i am|name:)\s+"
    r"([A-Z][a-z'’\-]+)(?:\s+([A-Z][a-z'’\-]+))?"
)
_BIGRAM = re.compile(r"(?=\b([A-Z][a-z'’\-]+)\s+((?:Mc|Mac|O['’])?[A-Z][a-z'’\-]+)\b)")

# Common first names. Ambiguous English words (Will, May, Grace, Hope, Rose…) are
# intentionally excluded to avoid redacting ordinary sentences.
FIRST_NAMES = frozenset(
    """
    aaliyah aaron abdul abigail adam adrian ahmed aisha alex alexander alexandra alice alicia amara amelia
    amir amy ana andrea andrew angela anna anne anthony arjun arthur ava ayesha ben benjamin beth bethany
    brandon callum cameron caroline catherine charles charlie charlotte chloe chris christopher claire connor
    daniel david deborah diana dylan edward elena eleanor elijah elizabeth ella ellie emily emma ethan eva
    fatima felix finn freya gabriel george georgia hamza hannah harry harvey hassan helen henry
    holly hugo ibrahim imogen isaac isabel isabella isla jack jacob james jasmine jessica joanna john jonathan
    joseph joshua julia kai karen katherine kate katie kevin kieran laura lauren leah leo liam lily lucas lucy
    luke maria mariam mark martha mary matthew maya megan mia michael mohammed muhammad naomi nathan nia nicholas
    noah oliver olivia omar oscar owen patrick paul peter phoebe priya rachel rahul rebecca rhys richard riya
    robert rosie ryan sam samuel sara sarah scarlett sebastian sienna simon sofia sophia sophie stephen steven
    susan thomas tom tyler victoria wei william xin yasmin yusuf zain zara zoe
    """.split()
)

# Words that, as the second token, mean the bigram is a place/line, not a person.
TRANSIT_WORDS = frozenset(
    """
    line lines station stations road street st park square cross town central broadway green hill lane gate
    court circus bridge junction east west north south common overground tube night underground platform
    platforms carriage exit terrace place gardens way avenue wood oak ham city end heath vale arch
    """.split()
)


@dataclass
class Finding:
    kind: str  # postcode | email | phone | address | name | handle
    start: int
    end: int


@dataclass
class RedactionResult:
    text: str
    findings: list[Finding] = field(default_factory=list)

    @property
    def kinds(self) -> list[str]:
        return sorted({f.kind for f in self.findings})


HIGH_SEVERITY = frozenset({"postcode", "email", "phone", "address", "handle"})


def _default_allow_phrases() -> list[str]:
    try:
        from rag_engine import KNOWN_STATIONS, LINE_NAMES

        return sorted(set(KNOWN_STATIONS) | {f"{n} line" for n in LINE_NAMES} | set(LINE_NAMES), key=len, reverse=True)
    except Exception:  # pragma: no cover - rag_engine is stdlib-only, but stay defensive
        return []


_ALLOW_CACHE: list[str] | None = None


def _allow_phrases() -> list[str]:
    global _ALLOW_CACHE
    if _ALLOW_CACHE is None:
        _ALLOW_CACHE = _default_allow_phrases()
    return _ALLOW_CACHE


def _allowed_spans(text: str, extra: Iterable[str]) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    lowered = text.lower()
    for phrase in list(extra) + _allow_phrases():
        p = phrase.lower()
        if not p:
            continue
        start = 0
        while True:
            idx = lowered.find(p, start)
            if idx < 0:
                break
            spans.append((idx, idx + len(p)))
            start = idx + len(p)
    return spans


def _inside(span: tuple[int, int], allowed: list[tuple[int, int]]) -> bool:
    return any(a <= span[0] and span[1] <= b for a, b in allowed)


def scan_text(text: str, allow_terms: Iterable[str] = ()) -> list[Finding]:
    """Detect PII spans. `allow_terms` are exact phrases (e.g. anonymous display names) never flagged."""
    if not text:
        return []
    allow_terms = list(allow_terms)
    allowed = _allowed_spans(text, allow_terms)
    findings: list[Finding] = []

    def add(kind: str, start: int, end: int) -> None:
        findings.append(Finding(kind, start, end))

    for m in _EMAIL.finditer(text):
        add("email", m.start(), m.end())
    for m in _EMAIL_OBFUSCATED.finditer(text):
        add("email", m.start(), m.end())
    for m in _PHONE_UK.finditer(text):
        add("phone", m.start(), m.end())
    for m in _PHONE_INTL.finditer(text):
        add("phone", m.start(), m.end())
    for m in _HANDLE.finditer(text):
        add("handle", m.start(), m.end())
    for m in _POSTCODE_FULL.finditer(text):
        add("postcode", m.start(), m.end())
    for m in _POSTCODE_OUTWARD.finditer(text):
        add("postcode", m.start(), m.end())

    for m in _HOUSE_NUMBER_ADDRESS.finditer(text):
        words = m.group(2).lower().split()
        if any(w in _ADDRESS_STOPWORDS for w in words[:-1]):
            continue
        if _ADDRESS_PRECEDERS.search(text[max(0, m.start() - 12) : m.start()]):
            continue
        # A bare time like "11 Park" is unlikely; require the number not to be part of HH:MM.
        if m.start() > 0 and text[m.start() - 1] == ":":
            continue
        add("address", m.start(), m.end())
    for m in _FLAT_NUMBER.finditer(text):
        add("address", m.start(), m.end())

    for m in _SELF_INTRO.finditer(text):
        first, last = m.group(1), m.group(2)
        span_end = m.end(2) if last and last.lower() not in TRANSIT_WORDS else m.end(1)
        span = (m.start(1), span_end)
        if _inside(span, allowed):
            continue
        if first.lower() in FIRST_NAMES or (last and last.lower() not in TRANSIT_WORDS):
            add("name", *span)
    for m in _BIGRAM.finditer(text):  # zero-width lookahead: finds overlapping pairs
        first, last = m.group(1), m.group(2)
        span = (m.start(1), m.end(2))
        if first.lower() not in FIRST_NAMES:
            continue
        if last.lower() in TRANSIT_WORDS:
            continue
        if _inside(span, allowed):  # e.g. "Russell Square", an allowed display name
            continue
        add("name", *span)

    # Drop anything fully covered by an allow-listed phrase (stations, display names).
    return [f for f in findings if not (_inside((f.start, f.end), allowed) and f.kind in ("name", "postcode"))]


def redact_text(text: str | None, allow_terms: Iterable[str] = ()) -> RedactionResult:
    if not text:
        return RedactionResult(text or "", [])
    findings = scan_text(text, allow_terms)
    if not findings:
        return RedactionResult(text, [])
    spans = sorted((f.start, f.end) for f in findings)
    merged: list[list[int]] = []
    for s, e in spans:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    out, cursor = [], 0
    for s, e in merged:
        out.append(text[cursor:s])
        out.append(REDACTED)
        cursor = e
    out.append(text[cursor:])
    return RedactionResult("".join(out), findings)


def contains_pii(text: str | None, allow_terms: Iterable[str] = ()) -> bool:
    return bool(scan_text(text or "", allow_terms))


def looks_like_real_name(display_name: str) -> bool:
    """True if a chosen display name resembles a real person's name or contact detail."""
    tokens = re.findall(r"[A-Za-z'’\-]+", display_name)
    if any(t.lower() in FIRST_NAMES for t in tokens):
        return True
    return bool({f.kind for f in scan_text(display_name)} & (HIGH_SEVERITY | {"name"}))


def sanitize_match(
    match: dict[str, Any],
    allowed_display_names: Iterable[str],
    known_stations: Iterable[str] | None = None,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Redact every free-text field of a match; drop the match if it is unsafe.

    A match is dropped when:
      - any display name is not one of the allowed anonymous display names,
      - meet_station is not a known station (when a station list is supplied),
      - any field contains a high-severity finding (postcode, email, phone, address, handle).
    Name-like findings are redacted in place and the match is kept.
    Returns (clean_match_or_None, finding_kinds).
    """
    allowed = list(allowed_display_names)
    allowed_set = set(allowed)
    clean = {k: (dict(v) if isinstance(v, dict) else list(v) if isinstance(v, list) else v) for k, v in match.items()}
    kinds: set[str] = set()

    names = clean.get("display_names", [])
    if any(n not in allowed_set for n in names):
        return None, ["unknown_display_name"]
    if known_stations is not None and clean.get("meet_station") not in set(known_stations):
        return None, ["unknown_station"]

    def scrub(value: Any) -> Any:
        if isinstance(value, str):
            result = redact_text(value, allowed)
            kinds.update(result.kinds)
            return result.text
        if isinstance(value, list):
            return [scrub(v) for v in value]
        if isinstance(value, dict):
            return {k: scrub(v) for k, v in value.items()}
        return value

    for key in ("icebreaker", "assembly_instructions", "safety_notes", "similarity_reasons", "shared_line"):
        if key in clean:
            clean[key] = scrub(clean[key])
    # meet_station is validated against the station list rather than rewritten.
    if known_stations is None and "meet_station" in clean:
        clean["meet_station"] = scrub(clean["meet_station"])

    if kinds & HIGH_SEVERITY:
        return None, sorted(kinds)
    return clean, sorted(kinds)


# ------------------------------------------------------------- disclosure check
_MONTHS = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|"
    r"Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b"
)
_DATE_PATTERNS = (
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),  # ISO 2026-10-16
    re.compile(r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b"),  # 16/10, 16/10/2026
    re.compile(rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?{_MONTHS}\b"),  # 16th October
    re.compile(rf"\b{_MONTHS}\s+\d{{1,2}}(?:st|nd|rd|th)?\b"),  # October 16
    re.compile(r"\b(?:yesterday|last (?:night|week|time)|travelled together)\b", re.IGNORECASE),
)
# The matcher must never assume or mention these; a mention drops the proposal.
_SENSITIVE_ATTRIBUTE = re.compile(
    r"\b(?:religio\w*|muslim|christian|hindu|sikh|jewish|buddhist|ethnic\w*|nationalit\w*|heritage)\b",
    re.IGNORECASE,
)


def _strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [s for v in value for s in _strings(v)]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _strings(v)]
    return []


def disclosure_findings(
    match: dict[str, Any],
    allowed_language_codes: Iterable[str],
    allow_terms: Iterable[str] = (),
) -> list[str]:
    """Kinds of forbidden disclosure in a match's free-text fields (empty = safe).

    - journey_date: any calendar date or reference to past journeys (journey history is private).
    - non_shared_language: a language that is not shared by every member (pre-accept rule).
    - sensitive_attribute: religion, ethnicity or nationality.
    `allow_terms` (e.g. study interests like "spanish literature") are ignored for the language check.
    """
    import languages  # local import: languages is stdlib-only, but keep privacy importable on its own

    allowed = set(allowed_language_codes)
    terms = list(allow_terms)
    kinds: set[str] = set()
    for key in ("icebreaker", "assembly_instructions", "safety_notes", "similarity_reasons", "shared_line"):
        for text in _strings(match.get(key)):
            if any(p.search(text) for p in _DATE_PATTERNS):
                kinds.add("journey_date")
            if languages.mentioned_language_codes(text, terms) - allowed:
                kinds.add("non_shared_language")
            if _SENSITIVE_ATTRIBUTE.search(text):
                kinds.add("sensitive_attribute")
    return sorted(kinds)
