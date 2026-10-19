"""Deterministic privacy filter tests. No database, network or model needed."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from privacy import (  # noqa: E402
    REDACTED,
    contains_pii,
    looks_like_real_name,
    redact_text,
    sanitize_match,
    scan_text,
)

STATIONS = {"Finsbury Park", "Acton Town", "King's Cross St Pancras", "Stratford"}


def kinds(text: str, allow=()) -> set[str]:
    return {f.kind for f in scan_text(text, allow)}


# ------------------------------------------------------------------- postcodes
@pytest.mark.parametrize("text", [
    "I live near N4 3AB, by the shops.",
    "postcode e15 2pb please",
    "SW1A 1AA is not my house",
    "My area is E15 if that helps",
])
def test_postcodes_are_redacted(text):
    result = redact_text(text)
    assert "postcode" in result.kinds
    assert REDACTED in result.text
    for token in ("N4 3AB", "e15 2pb", "SW1A 1AA", "E15"):
        assert token not in result.text


# ---------------------------------------------------------------------- emails
@pytest.mark.parametrize("text", [
    "email me at sarah.t@ucl.ac.uk",
    "contact: night.owl+late@gmail.com",
    "write to jo (at) gmail (dot) com",
])
def test_emails_are_redacted(text):
    result = redact_text(text)
    assert "email" in result.kinds
    assert "@" not in result.text and "(at)" not in result.text


# ---------------------------------------------------------------------- phones
@pytest.mark.parametrize("text", [
    "text me on 07700 900123",
    "call +44 7700 900123 tonight",
    "landline 020 7946 0958",
    "whatsapp +33 6 12 34 56 78",
])
def test_phone_numbers_are_redacted(text):
    result = redact_text(text)
    assert "phone" in result.kinds
    assert not any(ch.isdigit() for ch in result.text.replace(REDACTED, ""))


def test_times_and_carriage_numbers_are_not_phones():
    text = "Meet at 23:45 by car 4, train leaves 00:15 from platform 2"
    assert redact_text(text).text == text


# ----------------------------------------------------------------------- names
@pytest.mark.parametrize("text, leaked", [
    ("Hi, my name is Sarah Thompson", "Sarah"),
    ("I'm Priya, see you at the barriers", "Priya"),
    ("Ask Oliver Brown about the notes", "Oliver Brown"),
    ("Victoria Smith says hi", "Victoria Smith"),
    ("Hi Sarah Jones, nice to meet you", "Sarah Jones"),
])
def test_full_names_are_redacted(text, leaked):
    result = redact_text(text)
    assert "name" in result.kinds
    assert leaked not in result.text


@pytest.mark.parametrize("text", [
    "Take the Victoria line to Finsbury Park",
    "Change at Russell Square, then the Elizabeth line",
    "Meet by the help point at King's Cross St Pancras",
])
def test_station_and_line_names_are_not_redacted(text):
    assert redact_text(text).text == text


def test_display_names_in_allow_list_are_kept():
    text = "Hi Velvet Owl and Cobalt Heron, both into statistics!"
    assert redact_text(text, ["Velvet Owl", "Cobalt Heron"]).text == text


# -------------------------------------------------------- addresses and handles
def test_house_number_addresses_and_handles_are_redacted():
    result = redact_text("I'm at 12 Acacia Avenue, flat 3. Insta @ghost_fox_99")
    assert {"address", "handle"} <= set(result.kinds)
    assert "12 Acacia" not in result.text and "@ghost_fox_99" not in result.text


def test_stop_counts_are_not_addresses():
    text = "It is 3 stops to Holloway Road and a 10 min walk"
    assert redact_text(text).text == text


# ----------------------------------------------------------- match sanitiser
def _match(**overrides):
    base = {
        "match_type": "walk_home_pair",
        "display_names": ["Velvet Owl", "Cobalt Heron"],
        "shared_line": "Piccadilly",
        "meet_station": "Acton Town",
        "assembly_instructions": {
            "carriage_position": "middle carriages",
            "landmark": "help point",
            "meet_time": "23:45",
            "last_mile_handoff": "Walk the lit main road together.",
        },
        "icebreaker": "Hi Cobalt Heron! Both into statistics?",
        "safety_notes": ["Staffed until the last train."],
        "similarity_reasons": ["Same home station"],
    }
    base.update(overrides)
    return base


def test_sanitize_keeps_clean_match():
    clean, found = sanitize_match(_match(), ["Velvet Owl", "Cobalt Heron"], STATIONS)
    assert clean is not None and found == []
    assert clean["icebreaker"] == "Hi Cobalt Heron! Both into statistics?"


def test_sanitize_drops_match_with_email_or_phone():
    for leak in ("Email me: a.b@ucl.ac.uk", "Ring 07700 900123", "I'm at N4 3AB"):
        clean, found = sanitize_match(_match(icebreaker=leak), ["Velvet Owl", "Cobalt Heron"], STATIONS)
        assert clean is None, leak
        assert found


def test_sanitize_redacts_names_but_keeps_match():
    clean, found = sanitize_match(
        _match(icebreaker="Hi Cobalt Heron, I'm Sarah Thompson!"), ["Velvet Owl", "Cobalt Heron"], STATIONS
    )
    assert clean is not None
    assert "Sarah" not in clean["icebreaker"] and "Cobalt Heron" in clean["icebreaker"]
    assert found == ["name"]


def test_sanitize_drops_unknown_display_name_or_station():
    assert sanitize_match(_match(display_names=["Velvet Owl", "Sarah Thompson"]), ["Velvet Owl"], STATIONS)[0] is None
    assert sanitize_match(_match(meet_station="12 Acacia Avenue"), ["Velvet Owl", "Cobalt Heron"], STATIONS)[0] is None


def test_real_looking_display_names_rejected():
    assert looks_like_real_name("Sarah K")
    assert looks_like_real_name("night@owl.com")
    assert not looks_like_real_name("Lunar Hare")
    assert not contains_pii("Lunar Hare")
