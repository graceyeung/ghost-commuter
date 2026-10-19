"""Privacy for trust badges and languages: responses, logs, the matcher's input and its output."""
from __future__ import annotations

import asyncio
import dataclasses
import io
import logging
import re

import commute_agent_engine as engine
import privacy
import prompts
import trust
from config import JsonFormatter
from schemas import AssemblyInstructions, GenderIdentity, GenderPreference, MatchProposal, MatchType, RouteOverlap

ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
FORBIDDEN_KEYS = ("journey_date", "confirmed_at", "completed_at", "participant_ids", "journeys")


def _keys(value) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in _keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in _keys(v)}
    return set()


# ---------------------------------------------------------------- API responses (DB)
def test_no_journey_dates_in_any_response(harness):
    async def scenario(h):
        a = await h.user("Viewer Hare", languages=[("bn", "fluent")])
        b = await h.user("Partner Otter", languages=[("bn", "native")], journeys=4)
        found = await h.client.post("/api/commuter/find-matches", json={"user_id": str(a), "day_of_week": "thu"})
        pair = next(m for m in found.json()["matches"] if m["match_type"] == "walk_home_pair")
        for uid in (a, b):
            await h.client.post(f"/api/commuter/matches/{pair['match_id']}/respond", json={"user_id": str(uid), "response": "accept"})
        today = trust.london_now().date().isoformat()
        confirm_a = await h.confirm(a, pair["match_id"], today)
        confirm_b = await h.confirm(b, pair["match_id"], today)
        assert confirm_b.json()["status"] == "completed"

        # Confirm + trust responses carry no date of any kind.
        for response in (confirm_a, confirm_b, await h.client.get(f"/api/commuter/users/{b}/trust")):
            assert not ISO_DATE.search(response.text), response.text
            assert not _keys(response.json()) & set(FORBIDDEN_KEYS)
        # Match listings (both sides) expose a count and tier, never journey history.
        for uid in (a, b):
            listing = (await h.client.get(f"/api/commuter/users/{uid}/matches")).json()
            assert not _keys(listing) & set(FORBIDDEN_KEYS)
        theirs = (await h.client.get(f"/api/commuter/users/{a}/matches")).json()["matches"][0]
        assert theirs["participants_trust"] == [{"display_name": "Partner Otter", "journeys_completed": 5, "tier_label": "Regular"}]

    harness.run(scenario)


def test_no_language_data_or_journey_dates_in_log_lines(harness):
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.addHandler(handler)
    previous = root.level
    root.setLevel(logging.INFO)

    async def scenario(h):
        reg = (await h.client.post("/api/commuter/register-profile", json={
            "uni_affiliation": "UCL", "university_hub": "Euston", "home_station": "Finsbury Park",
            "commute_description": "Thursdays I leave Euston at 10:30pm on the Victoria line to Finsbury Park. I speak Bengali and Tamil.",
            "languages": [{"code": "ur", "proficiency": "native"}],
        })).json()
        await h.client.patch(f"/api/commuter/users/{reg['user_id']}/languages", json={"languages": [{"code": "ur"}, {"code": "bn"}, {"code": "ta"}], "language_matching": "require_shared"})
        partner = await h.user("Partner Otter", languages=[("bn", "native"), ("ta", "native")])
        found = (await h.client.post("/api/commuter/find-matches", json={"user_id": reg["user_id"], "day_of_week": "thu"})).json()
        pair = found["matches"][0]
        for uid in (reg["user_id"], str(partner)):
            await h.client.post(f"/api/commuter/matches/{pair['match_id']}/respond", json={"user_id": uid, "response": "accept"})
        today = trust.london_now().date().isoformat()
        await h.confirm(reg["user_id"], pair["match_id"], today)
        await h.confirm(partner, pair["match_id"], today)
        return today

    try:
        today = harness.run(scenario)
    finally:
        root.removeHandler(handler)
        root.setLevel(previous)
    logs = stream.getvalue()
    assert "journey_confirmed" in logs and "languages_updated" in logs  # the events were logged...
    for leaked in ("Bengali", "Tamil", "Urdu", '"bn"', '"ta"', '"ur"', "require_shared", "language_code", f'"{today}"', "journey_date"):
        assert leaked not in logs, leaked  # ...without any language data or journey date


# --------------------------------------------------------- deterministic filter (pure)
def _overlap(ref: str, name: str, shared: list[str], journeys: int = 0, **extra) -> RouteOverlap:
    base = dict(
        ref=ref, user_id=f"00000000-0000-0000-0000-00000000000{ref[-1]}", display_name=name,
        gender_identity=GenderIdentity.undisclosed, gender_preference=GenderPreference.any,
        shared_line="Victoria", same_line=True, segment=["Euston", "King's Cross St Pancras", "Highbury & Islington", "Finsbury Park"],
        meet_time="22:45", window_gap_minutes=0, same_home_station=True, shared_interests=["urban planning"],
        candidate_interests=["urban planning", "spanish literature"], candidate_safety=[], night_service=False,
        route_safety_score=0.8, recommended_meet_station="Euston", shared_languages=shared,
        journeys_completed=journeys, tier_label=trust.tier_label(journeys),
    )
    base.update(extra)
    return RouteOverlap(**base)


REQUESTER = {
    "user_id": "00000000-0000-0000-0000-000000000000", "display_name": "Lunar Hare", "line": "Victoria",
    "destination": "Finsbury Park", "interests": ["urban planning"], "safety_preferences": [], "language_matching": "prefer_shared",
}


def _proposal(icebreaker: str, reasons: list[str], refs=("C1",), kind=MatchType.walk_home_pair) -> MatchProposal:
    return MatchProposal(
        match_type=kind, member_refs=list(refs), shared_line="Victoria", meet_station="Euston",
        assembly_instructions=AssemblyInstructions(carriage_position="middle", landmark="help point", meet_time="22:45", last_mile_handoff="Walk the lit main road."),
        icebreaker=icebreaker, similarity_reasons=reasons, similarity_score=0.8,
    )


def test_matcher_output_with_non_shared_language_date_or_religion_is_dropped():
    overlaps = {"C1": _overlap("C1", "Mossy Otter", ["bn"])}
    cases = {
        "ok": _proposal("Hi Mossy Otter! Kemon acho?", ["You both speak Bengali", "Shared study interest: spanish literature"]),
        "language": _proposal("Hi Mossy Otter! I hear you speak Urdu too?", ["You both speak Bengali"]),
        "date": _proposal("Hi Mossy Otter!", ["You travelled together on 14 October"]),
        "iso": _proposal("Hi Mossy Otter!", ["Last journey 2026-10-14"]),
        "religion": _proposal("Hi Mossy Otter!", ["You're both Muslim students"]),
        "nationality": _proposal("Hi Mossy Otter!", ["Same nationality"]),
    }
    for name, proposal in cases.items():
        matches, dropped = engine.finalize_matches([proposal], overlaps, REQUESTER)
        assert (len(matches), dropped) == ((1, 0) if name == "ok" else (0, 1)), name


def test_group_may_only_mention_languages_every_member_shares():
    overlaps = {"C1": _overlap("C1", "Mossy Otter", ["bn", "en"]), "C2": _overlap("C2", "Tidal Stoat", ["en"])}
    group = lambda reason: _proposal("Hi both!", [reason], refs=("C1", "C2"), kind=MatchType.study_group)  # noqa: E731
    assert engine.finalize_matches([group("You all speak English")], overlaps, REQUESTER)[1] == 0
    assert engine.finalize_matches([group("Two of you speak Bengali")], overlaps, REQUESTER)[1] == 1
    assert privacy.disclosure_findings({"icebreaker": "Time to polish off that essay!"}, []) == []  # lower-case words aren't names
    # A chosen display name that happens to contain a language word isn't a disclosure.
    assert privacy.disclosure_findings({"icebreaker": "Hi Welsh Corgi!"}, [], allow_terms=["Welsh Corgi"]) == []


# ------------------------------------------------- matcher input + cold-start fairness
def test_matcher_receives_trust_and_only_shared_languages(monkeypatch):
    captured = {}

    async def fake_model(**kwargs):
        captured.update(kwargs)
        return None  # fall back to rule-based

    monkeypatch.setattr(engine, "settings", dataclasses.replace(engine.settings, anthropic_api_key="test-key"))
    monkeypatch.setattr(engine, "call_structured", fake_model)
    state = {
        "requester": {**REQUESTER, "origin": "Euston", "window_start": "22:30", "window_end": "23:00", "day": "thu", "bio": None},
        "overlaps": [_overlap("C1", "Mossy Otter", ["bn"], journeys=12).model_dump(mode="json"),
                     _overlap("C2", "Tidal Stoat", [], journeys=0).model_dump(mode="json")],
        "rag_context": {},
    }
    result = asyncio.run(engine.safety_guard_matcher(state, {"configurable": {}}))
    payload = captured["user"]
    assert '"tier_label": "Trusted"' in payload and '"tier_label": "New"' in payload
    assert '"code": "bn"' in payload and '"name": "Bengali"' in payload
    for absent in ("Urdu", "French", "journey_date", "user_id", "gender"):
        assert absent not in payload
    # The New student is still matched (rule-based fallback): trust never excludes anyone.
    assert any("Tidal Stoat" in m["display_names"] for m in result["matches"])


def test_trust_never_changes_rank():
    new = _overlap("C1", "Tidal Stoat", [], journeys=0)
    veteran = _overlap("C2", "Mossy Otter", [], journeys=40)
    assert engine._rank(new) == engine._rank(veteran)


def test_prompts_carry_the_fairness_and_inference_rules():
    assert "must NEVER exclude" in prompts.MATCHER_SYSTEM and "cold-start fairness" in prompts.MATCHER_SYSTEM
    assert "Never assume or mention anyone's ethnicity, nationality or religion" in prompts.MATCHER_SYSTEM
    assert "Never infer a language from a name, university, home station" in prompts.STRUCTURER_SYSTEM
