"""Languages spoken: supported list, explicit-statement extraction and disclosure rules.

Privacy rules, enforced here in code (never only in prompts):
  - Languages are extracted ONLY from what a student explicitly says about themselves
    ("I speak Bengali and English"). A name, station, university or nationality ("I'm Polish")
    never produces a language: extraction needs a first-person speaking statement followed
    directly by a language name.
  - Model-extracted languages are kept only if the text itself states them (`verify_explicit`).
  - Before mutual acceptance only languages that EVERY participant shares (and agreed to show)
    may be revealed; full lists are revealed only after mutual acceptance and only with
    share_languages on. language_matching = "off" disables language use entirely.

Stdlib only, so schemas.py and privacy.py can import it without cycles.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

OFF = "off"
PREFER_SHARED = "prefer_shared"
REQUIRE_SHARED = "require_shared"

PROFICIENCY_RANK = {"conversational": 0, "fluent": 1, "native": 2}

# ~45 languages commonly spoken by students at London universities. ISO 639-1 where one
# exists; ISO 639-3 otherwise (Cantonese, Sylheti, Twi, British Sign Language).
SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "ar": "Arabic",
    "am": "Amharic",
    "bn": "Bengali",
    "bfi": "British Sign Language",
    "bg": "Bulgarian",
    "yue": "Cantonese",
    "cs": "Czech",
    "nl": "Dutch",
    "fr": "French",
    "de": "German",
    "el": "Greek",
    "gu": "Gujarati",
    "ha": "Hausa",
    "he": "Hebrew",
    "hi": "Hindi",
    "hu": "Hungarian",
    "ig": "Igbo",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "ku": "Kurdish",
    "lt": "Lithuanian",
    "ms": "Malay",
    "ml": "Malayalam",
    "zh": "Mandarin Chinese",
    "ne": "Nepali",
    "fa": "Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "pa": "Punjabi",
    "ro": "Romanian",
    "ru": "Russian",
    "si": "Sinhala",
    "so": "Somali",
    "es": "Spanish",
    "sw": "Swahili",
    "syl": "Sylheti",
    "tl": "Tagalog",
    "ta": "Tamil",
    "te": "Telugu",
    "th": "Thai",
    "ti": "Tigrinya",
    "tr": "Turkish",
    "tw": "Twi",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "yo": "Yoruba",
}

# Extra spellings people actually write. Display names (lower-cased) are added automatically.
_EXTRA_ALIASES: dict[str, str] = {
    "bangla": "bn",
    "mandarin": "zh",
    "chinese": "zh",
    "putonghua": "zh",
    "farsi": "fa",
    "filipino": "tl",
    "kiswahili": "sw",
    "bsl": "bfi",
    "sign language": "bfi",
    "brazilian portuguese": "pt",
    "gaelic": "ga",
    "akan": "tw",
    "panjabi": "pa",
    "castilian": "es",
}

ALIASES: dict[str, str] = {name.lower(): code for code, name in SUPPORTED_LANGUAGES.items()}
ALIASES.update(_EXTRA_ALIASES)
# Longest first so "british sign language" wins over "sign language", "mandarin chinese" over "mandarin".
_ALIAS_PATTERN = "|".join(re.escape(a) for a in sorted(ALIASES, key=len, reverse=True))

# Short, neutral (non-religious) greetings the icebreaker may add for a shared non-English language.
GREETINGS: dict[str, str] = {
    "ar": "Marhaba!",
    "bn": "Kemon acho?",
    "de": "Hallo!",
    "el": "Geia sou!",
    "es": "¡Hola!",
    "fa": "Salam, chetori?",
    "fr": "Salut !",
    "gu": "Kem cho?",
    "hi": "Kaise ho?",
    "it": "Ciao!",
    "ja": "Konnichiwa!",
    "ko": "Annyeong!",
    "pa": "Ki haal aa?",
    "pl": "Cześć!",
    "pt": "Olá!",
    "ro": "Salut!",
    "ru": "Privet!",
    "so": "Iska warran?",
    "sw": "Habari!",
    "ta": "Vanakkam!",
    "tr": "Merhaba!",
    "uk": "Pryvit!",
    "ur": "Kya haal hai?",
    "vi": "Xin chào!",
    "yo": "Báwo ni?",
    "yue": "Néih hóu!",
    "zh": "Nǐ hǎo!",
}


def is_supported(code: str) -> bool:
    return code in SUPPORTED_LANGUAGES


def language_name(code: str) -> str:
    return SUPPORTED_LANGUAGES.get(code, code)


def normalise_code(value: str | None) -> str | None:
    """Accepts a supported code ("bn") or a name/alias ("Bengali", "Bangla")."""
    if not value:
        return None
    v = value.strip().lower()
    if v in SUPPORTED_LANGUAGES:
        return v
    return ALIASES.get(v)


def supported_list() -> list[dict[str, str]]:
    return [{"code": c, "name": n} for c, n in sorted(SUPPORTED_LANGUAGES.items(), key=lambda kv: kv[1])]


def merge(*lists: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    """Merge (code, proficiency) lists, keeping the highest proficiency per code, first-seen order."""
    best: dict[str, str] = {}
    for items in lists:
        for code, prof in items:
            if code not in SUPPORTED_LANGUAGES or prof not in PROFICIENCY_RANK:
                continue
            if code not in best or PROFICIENCY_RANK[prof] > PROFICIENCY_RANK[best[code]]:
                best[code] = prof
    return list(best.items())


# ------------------------------------------------------------------- explicit extraction
# First-person statements that are directly followed by a list of languages.
_FORWARD_TRIGGERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bi(?:'m| am) a native speaker of\b"), "native"),
    (re.compile(r"\bi(?:'m| am) (?:a )?native(?= )(?! speaker of)"), "native"),
    (re.compile(r"\bmy (?:first|native|home|main|mother) (?:language|tongue)s? (?:is|are)\b"), "native"),
    (re.compile(r"\bi(?:'m| am) (?:also )?(?:fluent|bilingual|trilingual) in\b"), "fluent"),
    (re.compile(r"\bi(?:'m| am) (?:also )?conversational in\b"), "conversational"),
    # "I speak ...", and "... and speak ..." continuing a first-person sentence ("I'm fluent in X and speak Y").
    (re.compile(r"(?:\bi|\band|,) (?:also |can |can also |do )?speak\b"), "fluent"),
    (re.compile(r"\blanguages?(?: i speak)?\s*:"), "fluent"),
]
# "Bengali is my first language" (language named BEFORE the statement).
_BACKWARD = re.compile(
    rf"\b({_ALIAS_PATTERN})\s+(?:is|are)\s+my\s+(?:first|native|home|main|mother)\s+(?:language|tongue)s?\b"
)
_QUALIFIERS: list[tuple[str, str]] = [
    ("a little bit of ", "conversational"),
    ("a little ", "conversational"),
    ("a bit of ", "conversational"),
    ("some ", "conversational"),
    ("basic ", "conversational"),
    ("conversational ", "conversational"),
    ("decent ", "conversational"),
    ("fluent ", "fluent"),
    ("native ", "native"),
]
_TRAILING = re.compile(r"^\s*(fluently|natively|a little|a bit|conversationally|well|too|as well|also)\b")
_LIST_SPLIT = re.compile(r"\s*(?:,|&|/|\band\b|\bor\b|\bplus\b|\bas well as\b)\s*")
_CLAUSE_END = re.compile(r"[.!?;:\n]|\b(?:but|so|because|when|on the|at the|from|to|with|if)\b")
_LEAD_ALIAS = re.compile(rf"^({_ALIAS_PATTERN})\b")


def _sentences(text: str) -> list[str]:
    lowered = text.lower().replace("’", "'")
    return [s for s in re.split(r"[.!?;\n]+", lowered) if s.strip()]


def _parse_list(segment: str, default_prof: str) -> list[tuple[str, str]]:
    """Parse "bengali and a bit of french" -> [(bn, default), (fr, conversational)].

    Every chunk must START with an optional qualifier and a language name. The first chunk that
    doesn't ends the list, so "i speak to my friend priya" yields nothing.
    """
    end = _CLAUSE_END.search(segment)
    if end:
        segment = segment[: end.start()]
    out: list[tuple[str, str]] = []
    for chunk in _LIST_SPLIT.split(segment.strip()):
        chunk = chunk.strip()
        if not chunk:
            continue
        prof = default_prof
        for prefix, level in _QUALIFIERS:
            if chunk.startswith(prefix):
                chunk, prof = chunk[len(prefix):], level
                break
        m = _LEAD_ALIAS.match(chunk)
        if not m:
            break
        trailing = _TRAILING.match(chunk[m.end():])
        if trailing and trailing.group(1) in ("a little", "a bit", "conversationally"):
            prof = "conversational"
        elif trailing and trailing.group(1) in ("natively",):
            prof = "native"
        out.append((ALIASES[m.group(1)], prof))
    return out


def extract_languages(text: str | None) -> list[tuple[str, str]]:
    """Languages a student explicitly says they speak, as (code, proficiency).

    Deterministic and deliberately strict: only first-person speaking statements count.
    """
    if not text:
        return []
    found: list[tuple[str, str]] = []
    for sentence in _sentences(text):
        for m in _BACKWARD.finditer(sentence):
            found.append((ALIASES[m.group(1)], "native"))
        for pattern, default in _FORWARD_TRIGGERS:
            for m in pattern.finditer(sentence):
                found.extend(_parse_list(sentence[m.end():], default))
    return merge(found)


_CUE = re.compile(r"\b(?:speak\w*|fluent\w*|native|language\w*|tongue|bilingual|trilingual|conversational)\b")


def verify_explicit(text: str | None, candidates: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    """Code-level guard for model output: keep a language only if the text names it in a sentence
    that talks about speaking languages. Names, stations or universities can never pass."""
    if not text:
        return []
    sentences = _sentences(text)
    kept: list[tuple[str, str]] = []
    for code, prof in candidates:
        code = normalise_code(code) or ""
        if not code:
            continue
        aliases = [a for a, c in ALIASES.items() if c == code]
        for s in sentences:
            if _CUE.search(s) and any(re.search(rf"\b{re.escape(a)}\b", s) for a in aliases):
                kept.append((code, prof))
                break
    return merge(kept)


def mentioned_language_codes(text: str, allow_terms: Iterable[str] = ()) -> set[str]:
    """Language names written in `text` (capitalised, as names are), ignoring any inside an
    allowed phrase such as a shared study interest ("spanish literature")."""
    if not text:
        return set()
    allowed_spans: list[tuple[int, int]] = []
    lowered = text.lower()
    for term in allow_terms:
        t = term.lower().strip()
        start = 0
        while t and (idx := lowered.find(t, start)) >= 0:
            allowed_spans.append((idx, idx + len(t)))
            start = idx + len(t)
    found: set[str] = set()
    for alias, code in ALIASES.items():
        if alias == "bsl":
            pattern = r"\bBSL\b"
        else:
            # Language names are proper nouns: require the capitalised form to avoid "polish my notes".
            pattern = r"\b" + re.escape(" ".join(w.capitalize() for w in alias.split())) + r"\b"
        for m in re.finditer(pattern, text):
            if not any(a <= m.start() and m.end() <= b for a, b in allowed_spans):
                found.add(code)
    return found


# ------------------------------------------------------------------------- disclosure rules
@dataclass(frozen=True)
class LanguageProfile:
    mode: str  # off | prefer_shared | require_shared
    share: bool
    codes: frozenset[str] = field(default_factory=frozenset)

    @property
    def usable(self) -> bool:
        """language_matching = off disables every use of this person's languages."""
        return self.mode != OFF

    @property
    def displayable(self) -> bool:
        return self.usable and self.share


def can_match(a: LanguageProfile, b: LanguageProfile) -> bool:
    """Mirror of the SQL pre-filter: require_shared on either side needs one usable shared language."""
    if a.mode != REQUIRE_SHARED and b.mode != REQUIRE_SHARED:
        return True
    return a.usable and b.usable and bool(a.codes & b.codes)


def shared_codes(profiles: Iterable[LanguageProfile]) -> list[str]:
    """Languages EVERY participant speaks and agreed to show. Empty if anyone has matching off or
    sharing off, so no one learns a language from a person who didn't agree to show it."""
    profiles = list(profiles)
    if len(profiles) < 2 or not all(p.displayable for p in profiles):
        return []
    common = set(profiles[0].codes)
    for p in profiles[1:]:
        common &= p.codes
    return sorted(common, key=lambda c: (c != "en", language_name(c)))


def full_list_visible(profile: LanguageProfile, match_confirmed: bool) -> bool:
    """A participant's full list is shown only after mutual acceptance, and only if they opted in."""
    return match_confirmed and profile.displayable


def greeting_for(codes: Iterable[str]) -> tuple[str, str] | None:
    """(code, greeting) for the first shared non-English language with a neutral greeting."""
    for code in codes:
        if code != "en" and code in GREETINGS:
            return code, GREETINGS[code]
    return None
