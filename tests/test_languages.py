"""Languages spoken: explicit-only extraction, require/prefer filtering and disclosure rules."""
from __future__ import annotations

import asyncio
import json

import pytest

import commute_agent_engine as engine
import languages
from schemas import ParsedCommute, ParsedLanguage

COMMUTE = "Thursdays I leave Euston at 10:30pm on the Victoria line to Finsbury Park."


# --------------------------------------------------------------- extraction (pure)
@pytest.mark.parametrize("text, expected", [
    ("I speak Bengali and English.", [("bn", "fluent"), ("en", "fluent")]),
    ("Bengali is my first language.", [("bn", "native")]),
    ("I'm fluent in Spanish and speak a bit of French", [("es", "fluent"), ("fr", "conversational")]),
    ("Languages: Urdu, Punjabi", [("ur", "fluent"), ("pa", "fluent")]),
    ("I'm a native speaker of Tamil", [("ta", "native")]),
    ("I can speak Cantonese fluently and Mandarin a little", [("yue", "fluent"), ("zh", "conversational")]),
])
def test_extracts_only_explicit_statements(text, expected):
    assert languages.extract_languages(text) == expected


@pytest.mark.parametrize("text", [
    "I'm Priya, I live near Southall and get off at Bethnal Green.",  # name + stations
    "Hamza Khan here, studying at SOAS, home station Wembley Park.",  # name + university + station
    "I'm Polish and study at King's College London.",  # nationality is not a language
    "My mum speaks Urdu at home.",  # someone else's language
    "I speak to my friend Mohammed on the train.",  # "speak" without a language
    "Polish my essay on the Piccadilly line.",
])
def test_names_stations_and_nationality_never_produce_a_language(text):
    assert languages.extract_languages(text) == []


def test_model_output_is_kept_only_when_the_text_states_it():
    text = "I'm Priya from Southall. I speak Bengali."
    model_said = [("pa", "native"), ("hi", "fluent"), ("bn", "fluent")]  # pa/hi "inferred" from name + area
    assert languages.verify_explicit(text, model_said) == [("bn", "fluent")]


def test_data_structurer_drops_invented_languages_even_from_the_model(monkeypatch):
    text = f"I'm Priya and I live near Southall. {COMMUTE} I speak Bengali."

    async def fake_model(**kwargs):
        return ParsedCommute(
            origin_station="Euston", destination_station="Finsbury Park", line="Victoria", days=["thu"],
            window_start="22:30", window_end="23:00", confidence=0.9,
            languages=[ParsedLanguage(code="pa", proficiency="native"), ParsedLanguage(code="bn", proficiency="native")],
        )

    monkeypatch.setattr(engine, "call_structured", fake_model)

    result = asyncio.run(engine.run_parse(text, {"university_hub": "Euston", "home_station": "Finsbury Park"}))
    assert [lang["code"] for lang in result["parsed"]["languages"]] == ["bn"]


# ------------------------------------------------------- register / PATCH / supported (DB)
REGISTER = {
    "uni_affiliation": "UCL",
    "university_hub": "Euston",
    "home_station": "Finsbury Park",
    "commute_description": f"{COMMUTE} I speak Bengali and English.",
    "languages": [{"code": "en", "proficiency": "native"}],
    "language_matching": "prefer_shared",
}


def test_text_languages_are_shown_back_not_saved_until_confirmed(harness):
    async def scenario(h):
        reg = await h.client.post("/api/commuter/register-profile", json=REGISTER)
        body = reg.json()
        assert body["status"] == "registered"
        assert body["detected_languages"] == [{"code": "bn", "name": "Bengali", "proficiency": "fluent"}]

        from sqlalchemy import select

        from models import UserLanguage

        async with h.Session() as session:
            saved = (await session.execute(select(UserLanguage.language_code).where(UserLanguage.user_id == body["user_id"]))).scalars().all()
        assert saved == ["en"]  # Bengali waits for the student's confirmation

        confirmed = await h.client.patch(
            f"/api/commuter/users/{body['user_id']}/languages",
            json={"languages": [{"code": "en", "proficiency": "native"}, {"code": "bn", "proficiency": "fluent"}]},
        )
        assert confirmed.status_code == 200
        assert [l["code"] for l in confirmed.json()["languages"]] == ["en", "bn"]
        assert confirmed.json()["language_matching"] == "prefer_shared"

    harness.run(scenario)


def test_patch_validates_and_keeps_omitted_fields(harness):
    async def scenario(h):
        uid = await h.user(languages=[("en", "native")])
        bad = await h.client.patch(f"/api/commuter/users/{uid}/languages", json={"languages": [{"code": "xx"}]})
        assert bad.status_code == 422
        only_mode = await h.client.patch(f"/api/commuter/users/{uid}/languages", json={"language_matching": "require_shared", "share_languages": False})
        assert only_mode.json() == {
            "languages": [{"code": "en", "name": "English", "proficiency": "native"}],
            "language_matching": "require_shared",
            "share_languages": False,
        }
        supported = (await h.client.get("/api/commuter/languages")).json()["languages"]
        assert 40 <= len(supported) <= 60
        assert {"code": "bn", "name": "Bengali"} in supported

    harness.run(scenario)


# ------------------------------------------------------------------ matching filter (DB)
async def _candidates(h, requester) -> set[str]:
    async with h.Session() as session:
        state = {"mode": "match", "user_id": str(requester), "day_of_week": "thu", "notes": [], "engines": []}
        result = await engine.geographic_router(state, {"configurable": {"session": session}})
    return {o["display_name"] for o in result["overlaps"]}


def test_require_shared_filters_in_both_directions(harness):
    async def scenario(h):
        me = await h.user("Lunar Requester", languages=[("bn", "fluent")], matching="require_shared")
        await h.user("Shares Bengali", languages=[("bn", "native")])
        await h.user("Only French", languages=[("fr", "native")])
        await h.user("No languages")
        await h.user("Bengali But Off", languages=[("bn", "native")], matching="off")
        assert await _candidates(h, me) == {"Shares Bengali"}

        # Their require_shared excludes a prefer_shared requester who shares nothing with them.
        other = await h.user("Open Requester", languages=[("en", "native")])
        await h.user("Wants Polish", languages=[("pl", "native")], matching="require_shared")
        found = await _candidates(h, other)
        assert "Wants Polish" not in found and "Lunar Requester" not in found
        assert {"Shares Bengali", "Only French", "No languages", "Bengali But Off"} <= found

    harness.run(scenario)


def test_prefer_shared_never_filters(harness):
    async def scenario(h):
        me = await h.user("Prefers Shared", languages=[("bn", "fluent")])
        for name, langs in [("Shares Bengali", [("bn", "native")]), ("Only French", [("fr", "native")]), ("Nothing Listed", [])]:
            await h.user(name, languages=langs)
        assert await _candidates(h, me) == {"Shares Bengali", "Only French", "Nothing Listed"}

    harness.run(scenario)


def test_off_disables_language_use_entirely(harness):
    async def scenario(h):
        me = await h.user("Matching Off", languages=[("bn", "fluent")], matching="off")
        await h.user("Speaks Bengali", languages=[("bn", "native")])
        await h.user("Requires Bengali", languages=[("bn", "native")], matching="require_shared")
        assert await _candidates(h, me) == {"Speaks Bengali"}
        found = (await h.client.post("/api/commuter/find-matches", json={"user_id": str(me), "day_of_week": "thu"})).json()
        assert found["matches"] and all(m["shared_languages"] == [] for m in found["matches"])

    harness.run(scenario)


# --------------------------------------------------------------------- disclosure (DB)
def test_before_accept_only_shared_languages_are_visible(harness):
    async def scenario(h):
        me = await h.user("Viewer Hare", languages=[("en", "native"), ("bn", "fluent"), ("ur", "fluent")])
        them = await h.user("Partner Otter", languages=[("bn", "native"), ("fr", "fluent"), ("so", "conversational")], journeys=12)

        found = await h.client.post("/api/commuter/find-matches", json={"user_id": str(me), "day_of_week": "thu"})
        pair = next(m for m in found.json()["matches"] if m["match_type"] == "walk_home_pair")
        assert pair["shared_languages"] == [{"code": "bn", "name": "Bengali"}]
        assert pair["participant_languages"] is None
        assert pair["participants_trust"] == [{"display_name": "Partner Otter", "journeys_completed": 12, "tier_label": "Trusted"}]
        assert "You both speak Bengali" in pair["similarity_reasons"]
        assert "Kemon acho?" in pair["icebreaker"]  # prefer_shared: English plus a short greeting
        raw = found.text
        for hidden in ("French", "Somali", "Urdu", '"fr"', '"so"', '"ur"'):
            assert hidden not in raw

        # The partner's view of the invitation is just as limited.
        theirs = (await h.client.get(f"/api/commuter/users/{them}/matches")).json()["matches"]
        assert theirs[0]["shared_languages"] == [{"code": "bn", "name": "Bengali"}]
        assert theirs[0]["participant_languages"] is None
        assert "Urdu" not in json.dumps(theirs)

        # After mutual accept, full lists (with proficiency) unlock.
        await h.client.post(f"/api/commuter/matches/{pair['match_id']}/respond", json={"user_id": str(them), "response": "accept"})
        done = (await h.client.post(f"/api/commuter/matches/{pair['match_id']}/respond", json={"user_id": str(me), "response": "accept"})).json()
        assert done["status"] == "confirmed"
        assert done["participant_languages"] == [{
            "display_name": "Partner Otter",
            "languages": [
                {"code": "bn", "name": "Bengali", "proficiency": "native"},
                {"code": "fr", "name": "French", "proficiency": "fluent"},
                {"code": "so", "name": "Somali", "proficiency": "conversational"},
            ],
        }]
        mine = (await h.client.get(f"/api/commuter/users/{me}/matches")).json()["matches"][0]
        assert mine["participant_languages"][0]["display_name"] == "Partner Otter"

    harness.run(scenario)


def test_share_languages_false_is_respected(harness):
    async def scenario(h):
        me = await h.user("Viewer Hare", languages=[("bn", "fluent")])
        them = await h.user("Private Otter", languages=[("bn", "native"), ("fr", "fluent")], share=False)

        found = (await h.client.post("/api/commuter/find-matches", json={"user_id": str(me), "day_of_week": "thu"})).json()
        pair = next(m for m in found["matches"] if m["match_type"] == "walk_home_pair")
        assert pair["shared_languages"] == []
        assert not any("speak" in r for r in pair["similarity_reasons"])

        for uid in (them, me):
            done = (await h.client.post(f"/api/commuter/matches/{pair['match_id']}/respond", json={"user_id": str(uid), "response": "accept"})).json()
        assert done["status"] == "confirmed"
        assert done["participant_languages"] == []  # their list stays hidden even after mutual accept
        theirs = (await h.client.get(f"/api/commuter/users/{them}/matches")).json()["matches"][0]
        assert [p["display_name"] for p in theirs["participant_languages"]] == ["Viewer Hare"]

    harness.run(scenario)
