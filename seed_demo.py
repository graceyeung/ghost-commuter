"""Seed 12 fictional students for the demo. Idempotent: re-running replaces them.

Run after `docker compose up`:
    python seed_demo.py                       # from the host (uses DATABASE_URL, default localhost:5432)
    docker compose exec api python seed_demo.py

All students are fictional. Display names are anonymous; no real names, addresses or
contact details are stored. Contact handles are obviously fake in-app handles.

Designed demo outcomes:
  - Thursday, Victoria/Piccadilly north (Lunar Hare): walk-home pair at Finsbury Park + an
    "urban planning" study group on the Victoria line.
  - Friday, Piccadilly west (Velvet Owl): walk-home pair at Acton Town + a "statistics" group.
  - Friday Night Tube, Central line east (Granite Puffin): walk-home pair at Stratford; the
    Elizabeth line student at 00:50 is excluded because that line has no night service.

Trust badges and languages (so live demos show both):
  - Journey counts span every tier: New (0) through Commute veteran (25+). They are seeded straight
    into the cached users.journeys_completed_count column; no fake journey history is created.
  - Lunar Hare and Mossy Otter both speak Bengali, so their Thursday pair shows
    "You both speak: English, Bengali". Velvet Owl and Cobalt Heron share Mandarin Chinese.
  - Hushed Marten uses require_shared with only Portuguese listed, so Granite Puffin's Friday
    search leaves them out. Polar Newt has language matching off; Dusky Plover hides their languages.
"""
from __future__ import annotations

import asyncio
from datetime import time

from sqlalchemy import delete, select

import db
import rag_engine
from models import CommuteSchedule, User, UserContact, UserLanguage
from schemas import GenderIdentity as G
from schemas import GenderPreference as P
from schemas import LanguageMatching as LM
from schemas import LanguageProficiency as LP

# Per student: (journeys_completed_count, [(language_code, proficiency)], language_matching, share_languages)
TRUST_AND_LANGUAGES: dict[str, tuple[int, list[tuple[str, LP]], LM, bool]] = {
    "Velvet Owl": (3, [("en", LP.fluent), ("zh", LP.native)], LM.prefer_shared, True),
    "Cobalt Heron": (27, [("en", LP.native), ("zh", LP.conversational), ("fr", LP.fluent)], LM.prefer_shared, True),
    "Granite Badger": (0, [("en", LP.native), ("ur", LP.fluent), ("pa", LP.conversational)], LM.prefer_shared, True),
    "Copper Lynx": (9, [("en", LP.fluent), ("yue", LP.native)], LM.prefer_shared, True),
    "Lunar Hare": (0, [("en", LP.native), ("bn", LP.fluent)], LM.prefer_shared, True),
    "Mossy Otter": (12, [("en", LP.native), ("bn", LP.native), ("syl", LP.conversational)], LM.prefer_shared, True),
    "Misty Kestrel": (6, [("en", LP.native), ("es", LP.fluent)], LM.prefer_shared, True),
    "Tidal Stoat": (2, [("en", LP.native), ("pl", LP.native)], LM.prefer_shared, True),
    "Granite Puffin": (15, [("en", LP.native), ("so", LP.native), ("ar", LP.conversational)], LM.prefer_shared, True),
    "Hushed Marten": (1, [("pt", LP.native)], LM.require_shared, True),
    "Polar Newt": (0, [("en", LP.native), ("ta", LP.native)], LM.off, True),
    "Dusky Plover": (5, [("en", LP.native), ("yo", LP.fluent)], LM.prefer_shared, False),
}

STUDENTS = [
    # ---- Cluster A: Piccadilly westbound, Friday ~23:30
    dict(name="Velvet Owl", uni="UCL", hub="King's Cross St Pancras", home="Acton Town",
         gender=G.woman, pref=P.any, interests=["machine learning", "statistics"],
         safety=["well_lit", "staffed_station"], bio="Second-year stats student, always in the library till close.",
         line="Piccadilly", origin="King's Cross St Pancras", days=["thu", "fri"], start=time(23, 30),
         raw="Leave King's Cross on the Piccadilly to Acton Town at 11:30pm Thursdays and Fridays."),
    dict(name="Cobalt Heron", uni="UAL Central Saint Martins", hub="King's Cross St Pancras", home="Acton Town",
         gender=G.non_binary, pref=P.any, interests=["statistics", "philosophy"],
         safety=["well_lit", "busy_carriage"], bio="Design-meets-data person. Will talk about Bayesian priors.",
         line="Piccadilly", origin="King's Cross St Pancras", days=["fri"], start=time(23, 45),
         raw="Fridays around midnight, King's Cross to Acton Town on the Piccadilly."),
    dict(name="Granite Badger", uni="SOAS", hub="Holborn", home="Hounslow West",
         gender=G.woman, pref=P.women_only, interests=["machine learning", "design"],
         safety=["staffed_station", "cctv"], bio="Commutes to Zone 5, likes company on the long ride.",
         line="Piccadilly", origin="Holborn", days=["fri"], start=time(23, 30),
         raw="Holborn to Hounslow West, Piccadilly line, Friday nights about 11:45."),
    dict(name="Copper Lynx", uni="UCL", hub="King's Cross St Pancras", home="Hammersmith",
         gender=G.man, pref=P.any, interests=["machine learning", "statistics"],
         safety=["well_lit"], bio="MSc data science. Happy to swap lecture notes.",
         line="Piccadilly", origin="King's Cross St Pancras", days=["fri"], start=time(23, 40),
         raw="King's Cross to Hammersmith on the Piccadilly, Fridays 11:40pm."),
    # ---- Cluster B: Victoria / Piccadilly north, Thursday ~22:30
    dict(name="Lunar Hare", uni="UCL", hub="Euston", home="Finsbury Park",
         gender=G.woman, pref=P.any, interests=["architecture", "urban planning"],
         safety=["well_lit", "avoid_isolated_exits"], bio="Bartlett student, sketchbook always out on the train.",
         line="Victoria", origin="Euston", days=["thu"], start=time(22, 30),
         raw="Thursdays I leave Euston at 10:30pm on the Victoria line to Finsbury Park."),
    dict(name="Mossy Otter", uni="Central Saint Martins", hub="King's Cross St Pancras", home="Finsbury Park",
         gender=G.man, pref=P.any, interests=["urban planning", "data visualisation"],
         safety=["well_lit"], bio="Maps nerd. Currently obsessed with bus network diagrams.",
         line="Piccadilly", origin="King's Cross St Pancras", days=["thu"], start=time(22, 45),
         raw="King's Cross to Finsbury Park on the Piccadilly, Thursday nights around 11."),
    dict(name="Misty Kestrel", uni="UCL", hub="Euston", home="Seven Sisters",
         gender=G.woman, pref=P.non_binary_inclusive, interests=["urban planning", "sociology"],
         safety=["staffed_station", "well_lit"], bio="Housing policy dissertation, very into community land trusts.",
         line="Victoria", origin="Euston", days=["thu"], start=time(22, 30),
         raw="Euston to Seven Sisters, Victoria line, Thursdays about half 10."),
    dict(name="Tidal Stoat", uni="UCL", hub="King's Cross St Pancras", home="Walthamstow Central",
         gender=G.non_binary, pref=P.any, interests=["urban planning", "architecture"],
         safety=["busy_carriage"], bio="Planning MSc, collects photos of good bus shelters.",
         line="Victoria", origin="King's Cross St Pancras", days=["thu"], start=time(22, 40),
         raw="Victoria line from King's Cross to Walthamstow Central on Thursdays at 10:40pm."),
    # ---- Cluster C: Central line Night Tube east, Friday ~00:45
    dict(name="Granite Puffin", uni="QMUL", hub="Holborn", home="Stratford",
         gender=G.woman, pref=P.any, interests=["medicine", "biochemistry"],
         safety=["night_tube_only", "staffed_station"], bio="Medic, out late after society events.",
         line="Central", origin="Holborn", days=["fri"], start=time(0, 45),
         raw="Friday nights after socials, Holborn to Stratford on the Central line Night Tube around 1am."),
    dict(name="Hushed Marten", uni="UCL", hub="Tottenham Court Road", home="Leytonstone",
         gender=G.woman, pref=P.women_only, interests=["biochemistry", "chemistry"],
         safety=["well_lit", "staffed_station"], bio="Lab-based PhD, often leaving after late experiments.",
         line="Central", origin="Tottenham Court Road", days=["fri"], start=time(0, 45),
         raw="Tottenham Court Road to Leytonstone, Central line, Fridays at 00:45."),
    dict(name="Polar Newt", uni="QMUL", hub="Liverpool Street", home="Stratford",
         gender=G.man, pref=P.any, interests=["medicine", "neuroscience"],
         safety=["staffed_station"], bio="Neuro intercalation year, big fan of podcasts on the train.",
         line="Central", origin="Liverpool Street", days=["fri"], start=time(1, 0),
         raw="Liverpool Street to Stratford on the Central line Friday nights at 1am."),
    dict(name="Dusky Plover", uni="QMUL", hub="Whitechapel", home="Stratford",
         gender=G.woman, pref=P.any, interests=["law", "medicine"],
         safety=["well_lit"], bio="Law student, moot court practice runs late.",
         line="Elizabeth", origin="Whitechapel", days=["fri"], start=time(0, 50),
         raw="Whitechapel to Stratford on the Elizabeth line, Fridays 00:50."),
]


def _plus30(t: time) -> time:
    m = (t.hour * 60 + t.minute + 30) % 1440
    return time(m // 60, m % 60)


async def seed() -> dict[str, str]:
    await db.init_db()
    names = [s["name"] for s in STUDENTS]
    ids: dict[str, str] = {}
    async with db.SessionLocal() as session:
        await session.execute(delete(User).where(User.anonymous_display_name.in_(names)))
        await session.flush()
        for s in STUDENTS:
            assert s["home"] in rag_engine.KNOWN_STATIONS and s["origin"] in rag_engine.KNOWN_STATIONS
            journeys, spoken, matching, share = TRUST_AND_LANGUAGES[s["name"]]
            user = User(
                anonymous_display_name=s["name"],
                uni_affiliation=s["uni"],
                university_hub=s["hub"],
                home_station=s["home"],
                home_zone=rag_engine.station_zone(s["home"]),
                gender_identity=s["gender"],
                gender_preference=s["pref"],
                safety_preferences=s["safety"],
                study_interests=s["interests"],
                bio_freetext=s["bio"],
                is_active=True,
                journeys_completed_count=journeys,
                language_matching=matching,
                share_languages=share,
            )
            session.add(user)
            await session.flush()
            for code, proficiency in spoken:
                session.add(UserLanguage(user_id=user.id, language_code=code, proficiency=proficiency))
            handle = "ghost-" + s["name"].lower().replace(" ", "-")
            session.add(UserContact(user_id=user.id, contact_handle=f"in-app:{handle}"))
            for day in s["days"]:
                session.add(CommuteSchedule(
                    user_id=user.id,
                    day_of_week=day,
                    departure_window_start=s["start"],
                    departure_window_end=_plus30(s["start"]),
                    primary_line=s["line"],
                    origin_station=s["origin"],
                    destination_station=s["home"],
                    raw_input_text=s["raw"],
                ))
            ids[s["name"]] = str(user.id)
        await session.commit()
        count = len((await session.execute(select(User.id).where(User.anonymous_display_name.in_(names)))).all())
    await db.dispose()
    print(f"Seeded {count} demo students.\n")
    for name, uid in ids.items():
        print(f"  {name:<16} {uid}")
    print(
        "\nTry:\n"
        f"  curl -s -X POST localhost:8000/api/commuter/find-matches -H 'Content-Type: application/json' "
        f"-d '{{\"user_id\": \"{ids['Lunar Hare']}\", \"day_of_week\": \"thu\"}}'\n"
        f"  curl -s -X POST localhost:8000/api/commuter/find-matches -H 'Content-Type: application/json' "
        f"-d '{{\"user_id\": \"{ids['Velvet Owl']}\", \"day_of_week\": \"fri\"}}'\n"
        f"  curl -s -X POST localhost:8000/api/commuter/find-matches -H 'Content-Type: application/json' "
        f"-d '{{\"user_id\": \"{ids['Granite Puffin']}\", \"day_of_week\": \"fri\"}}'"
    )
    return ids


if __name__ == "__main__":
    asyncio.run(seed())
