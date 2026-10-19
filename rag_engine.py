"""Transit knowledge for Ghost Commuter: a small MOCK network topology plus a
ChromaDB vector store of MOCK safety/layout documents.

Everything in this module is illustrative demo data, not verified TfL information.
chromadb is imported lazily so that the topology helpers (used by privacy.py and
the rule-based fallback) work without the vector store installed or running.
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
import threading
from functools import lru_cache

from config import settings

log = logging.getLogger("ghost.rag")

MOCK_LABEL = "MOCK DATA (demo only, not verified TfL information):"

# --------------------------------------------------------------------------------------
# MOCK network topology. Ordered station lists, simplified to one branch per line.
# --------------------------------------------------------------------------------------
LINE_STATIONS: dict[str, list[str]] = {
    "Piccadilly": [
        "Hounslow West", "Hounslow East", "Osterley", "Boston Manor", "Northfields",
        "South Ealing", "Acton Town", "Turnham Green", "Hammersmith", "Barons Court",
        "Earl's Court", "Gloucester Road", "South Kensington", "Knightsbridge",
        "Hyde Park Corner", "Green Park", "Piccadilly Circus", "Leicester Square",
        "Covent Garden", "Holborn", "Russell Square", "King's Cross St Pancras",
        "Caledonian Road", "Holloway Road", "Arsenal", "Finsbury Park", "Manor House",
        "Turnpike Lane", "Wood Green", "Bounds Green", "Arnos Grove",
    ],
    "Victoria": [
        "Brixton", "Stockwell", "Vauxhall", "Pimlico", "Victoria", "Green Park",
        "Oxford Circus", "Warren Street", "Euston", "King's Cross St Pancras",
        "Highbury & Islington", "Finsbury Park", "Seven Sisters", "Tottenham Hale",
        "Blackhorse Road", "Walthamstow Central",
    ],
    "Central": [
        "Ealing Broadway", "West Acton", "North Acton", "East Acton", "White City",
        "Shepherd's Bush", "Holland Park", "Notting Hill Gate", "Queensway",
        "Lancaster Gate", "Marble Arch", "Bond Street", "Oxford Circus",
        "Tottenham Court Road", "Holborn", "Chancery Lane", "St Paul's", "Bank",
        "Liverpool Street", "Bethnal Green", "Mile End", "Stratford", "Leyton",
        "Leytonstone", "Snaresbrook", "South Woodford", "Woodford",
    ],
    "Northern": [
        "Edgware", "Burnt Oak", "Colindale", "Hendon Central", "Brent Cross",
        "Golders Green", "Hampstead", "Belsize Park", "Chalk Farm", "Camden Town",
        "Mornington Crescent", "Euston", "Warren Street", "Goodge Street",
        "Tottenham Court Road", "Leicester Square", "Charing Cross", "Embankment",
        "Waterloo", "Kennington", "Oval", "Stockwell", "Clapham North",
        "Clapham Common", "Clapham South", "Balham", "Tooting Bec",
        "Tooting Broadway", "Colliers Wood", "South Wimbledon", "Morden",
    ],
    "Jubilee": [
        "Stanmore", "Canons Park", "Queensbury", "Kingsbury", "Wembley Park",
        "Neasden", "Dollis Hill", "Willesden Green", "Kilburn", "West Hampstead",
        "Finchley Road", "Swiss Cottage", "St John's Wood", "Baker Street",
        "Bond Street", "Green Park", "Westminster", "Waterloo", "Southwark",
        "London Bridge", "Bermondsey", "Canada Water", "Canary Wharf",
        "North Greenwich", "Canning Town", "West Ham", "Stratford",
    ],
    "District": [
        "Ealing Broadway", "Ealing Common", "Acton Town", "Chiswick Park",
        "Turnham Green", "Hammersmith", "Barons Court", "Earl's Court",
        "Gloucester Road", "South Kensington", "Victoria", "Westminster",
        "Embankment", "Temple", "Blackfriars", "Mansion House", "Cannon Street",
        "Monument", "Tower Hill", "Aldgate East", "Whitechapel", "Stepney Green",
        "Mile End", "Bow Road", "Bromley-by-Bow", "West Ham", "Plaistow",
        "Upton Park", "East Ham", "Barking", "Upminster",
    ],
    "Elizabeth": [
        "Ealing Broadway", "Acton Main Line", "Paddington", "Bond Street",
        "Tottenham Court Road", "Farringdon", "Liverpool Street", "Whitechapel",
        "Stratford", "Maryland", "Forest Gate", "Manor Park", "Ilford", "Romford",
    ],
    "Windrush": [
        "Highbury & Islington", "Canonbury", "Dalston Junction", "Haggerston",
        "Hoxton", "Shoreditch High Street", "Whitechapel", "Shadwell", "Wapping",
        "Rotherhithe", "Canada Water", "Surrey Quays", "New Cross Gate", "Brockley",
        "Honor Oak Park", "Forest Hill", "Sydenham", "Crystal Palace",
    ],
    "Mildmay": [
        "Richmond", "Kew Gardens", "Gunnersbury", "South Acton", "Acton Central",
        "Willesden Junction", "Kensal Rise", "Brondesbury Park", "Brondesbury",
        "West Hampstead", "Finchley Road & Frognal", "Hampstead Heath", "Gospel Oak",
        "Kentish Town West", "Camden Road", "Caledonian Road & Barnsbury",
        "Highbury & Islington", "Canonbury", "Dalston Kingsland", "Hackney Central",
        "Homerton", "Hackney Wick", "Stratford",
    ],
}

LINE_NAMES: tuple[str, ...] = tuple(LINE_STATIONS)
KNOWN_STATIONS: frozenset[str] = frozenset(s for stations in LINE_STATIONS.values() for s in stations)

# MOCK fare zones (simplified: boundary stations take the outer zone).
STATION_ZONES: dict[str, int] = {
    "Hounslow West": 5, "Hounslow East": 4, "Osterley": 4, "Boston Manor": 4, "Northfields": 3,
    "South Ealing": 3, "Acton Town": 3, "Hammersmith": 2, "Earl's Court": 2, "Holborn": 1,
    "King's Cross St Pancras": 1, "Euston": 1, "Caledonian Road": 2, "Holloway Road": 2,
    "Arsenal": 2, "Finsbury Park": 2, "Manor House": 2, "Turnpike Lane": 3, "Wood Green": 3,
    "Bounds Green": 3, "Arnos Grove": 4, "Highbury & Islington": 2, "Seven Sisters": 3,
    "Tottenham Hale": 3, "Blackhorse Road": 3, "Walthamstow Central": 3, "Brixton": 2,
    "Ealing Broadway": 3, "West Acton": 3, "North Acton": 2, "Liverpool Street": 1,
    "Bethnal Green": 2, "Mile End": 2, "Stratford": 3, "Leyton": 3, "Leytonstone": 4,
    "Snaresbrook": 4, "South Woodford": 4, "Woodford": 4, "Edgware": 5, "Burnt Oak": 4,
    "Colindale": 4, "Hendon Central": 3, "Golders Green": 3, "Camden Town": 2,
    "Tottenham Court Road": 1, "Morden": 4, "Tooting Broadway": 3, "Balham": 3,
    "Stanmore": 5, "Wembley Park": 4, "West Ham": 3, "Canning Town": 3, "Whitechapel": 2,
    "Barking": 4, "Upminster": 6, "East Ham": 4, "Maryland": 3, "Forest Gate": 3,
    "Ilford": 4, "Romford": 6, "New Cross Gate": 2, "Crystal Palace": 4, "Dalston Junction": 2,
    "Hackney Central": 2, "Hackney Wick": 2, "Richmond": 4, "Gunnersbury": 3,
}

# Days on which a line runs a through-the-night service (MOCK). Schedules are keyed
# to the night they start on, so "fri" covers Friday night into Saturday morning.
NIGHT_SERVICE_DAYS: dict[str, frozenset[str]] = {
    "Piccadilly": frozenset({"fri", "sat"}),
    "Victoria": frozenset({"fri", "sat"}),
    "Central": frozenset({"fri", "sat"}),
    "Northern": frozenset({"fri", "sat"}),
    "Jubilee": frozenset({"fri", "sat"}),
    "Windrush": frozenset({"fri", "sat"}),
    "District": frozenset(),
    "Elizabeth": frozenset(),
    "Mildmay": frozenset(),
}

# Regular (non-night) service is assumed to stop around 00:30 (MOCK).
LAST_REGULAR_DEPARTURE_MIN = 24 * 60 + 30

# MOCK per-station safety profile, consistent with the documents below.
STATION_SAFETY: dict[str, dict[str, bool]] = {
    "King's Cross St Pancras": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Euston": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Acton Town": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Finsbury Park": {"staffed_late": True, "well_lit_exit": False, "cctv": True},
    "Stratford": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Highbury & Islington": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Whitechapel": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Camden Town": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Holborn": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Hammersmith": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Hounslow West": {"staffed_late": False, "well_lit_exit": True, "cctv": True},
    "Seven Sisters": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Walthamstow Central": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Leytonstone": {"staffed_late": True, "well_lit_exit": False, "cctv": True},
    "Liverpool Street": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Tottenham Court Road": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
    "Wood Green": {"staffed_late": True, "well_lit_exit": True, "cctv": True},
}

# MOCK platform meeting points used for assembly instructions.
MEET_POINTS: dict[str, dict[str, str]] = {
    "King's Cross St Pancras": {
        "carriage": "front carriage (car 1)",
        "landmark": "the Piccadilly/Victoria platform end nearest the Way Out sign, under the help point",
    },
    "Euston": {
        "carriage": "middle carriages (cars 3-4)",
        "landmark": "the Victoria line platform help point opposite the map board",
    },
    "Holborn": {
        "carriage": "rear carriage (car 6)",
        "landmark": "the bench beside the platform help point at the interchange tunnel mouth",
    },
    "Acton Town": {
        "carriage": "middle carriages (cars 3-4)",
        "landmark": "the staffed ticket hall barriers, then together to the lit forecourt",
    },
    "Finsbury Park": {
        "carriage": "middle carriages (cars 3-4)",
        "landmark": "the Wells Terrace exit ticket hall under the departure boards",
    },
    "Stratford": {
        "carriage": "front carriage (car 1)",
        "landmark": "the Central line platform help point by the stairs to the mezzanine",
    },
    "Highbury & Islington": {
        "carriage": "middle carriages (cars 3-4)",
        "landmark": "the cross-platform interchange help point",
    },
    "Whitechapel": {
        "carriage": "middle carriages",
        "landmark": "the staffed bridge concourse above the platforms",
    },
    "Camden Town": {
        "carriage": "rear carriage",
        "landmark": "the bottom of the main escalators by the help point",
    },
    "Tottenham Court Road": {
        "carriage": "middle carriages (cars 4-5)",
        "landmark": "the Central line platform help point by the cross-passage",
    },
    "Liverpool Street": {
        "carriage": "front carriage (car 1)",
        "landmark": "the Central line platform help point at the escalator foot",
    },
}

DEFAULT_MEET_POINT = {
    "carriage": "middle carriages (cars 3-4)",
    "landmark": "the platform help point under the CCTV camera",
}

_STATION_ALIASES: dict[str, str] = {
    "kings cross": "King's Cross St Pancras",
    "king's cross": "King's Cross St Pancras",
    "kx": "King's Cross St Pancras",
    "st pancras": "King's Cross St Pancras",
    "kings cross st pancras": "King's Cross St Pancras",
    "highbury and islington": "Highbury & Islington",
    "highbury": "Highbury & Islington",
    "tcr": "Tottenham Court Road",
    "walthamstow": "Walthamstow Central",
    "earls court": "Earl's Court",
    "shepherds bush": "Shepherd's Bush",
    "st pauls": "St Paul's",
    "liverpool st": "Liverpool Street",
}

_LINE_ALIASES: dict[str, str] = {
    "piccadilly": "Piccadilly",
    "picc": "Piccadilly",
    "victoria line": "Victoria",
    "vic line": "Victoria",
    "central": "Central",
    "northern": "Northern",
    "jubilee": "Jubilee",
    "district": "District",
    "elizabeth": "Elizabeth",
    "lizzy line": "Elizabeth",
    "crossrail": "Elizabeth",
    "windrush": "Windrush",
    "east london line": "Windrush",
    "mildmay": "Mildmay",
    "north london line": "Mildmay",
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().replace("’", "'")).strip()


@lru_cache(maxsize=1)
def _station_lookup() -> list[tuple[str, str]]:
    """(lower-case pattern, canonical name), longest patterns first."""
    pairs = {_norm(s): s for s in KNOWN_STATIONS}
    pairs.update({_norm(s.replace("'", "")): s for s in KNOWN_STATIONS})
    pairs.update(_STATION_ALIASES)
    return sorted(pairs.items(), key=lambda kv: len(kv[0]), reverse=True)


def normalize_station(text: str | None) -> str | None:
    if not text:
        return None
    key = _norm(text)
    for pattern, canonical in _station_lookup():
        if key == pattern:
            return canonical
    return None


def find_stations_in_text(text: str) -> list[tuple[int, str]]:
    """Return (position, canonical station) for every station mentioned, in order."""
    lowered = _norm(text)
    found: list[tuple[int, str]] = []
    taken: list[tuple[int, int]] = []
    for pattern, canonical in _station_lookup():
        for m in re.finditer(r"(?<![\w'])" + re.escape(pattern) + r"(?![\w'])", lowered):
            span = (m.start(), m.end())
            if any(span[0] < e and s < span[1] for s, e in taken):
                continue
            # "Victoria" alone is ambiguous with the line; skip if followed by "line".
            if canonical == "Victoria" and (
                lowered[m.end():m.end() + 6].strip().startswith("line") or lowered[:m.start()].endswith("the ")
            ):
                continue
            taken.append(span)
            found.append((m.start(), canonical))
    return sorted(found)


def find_lines_in_text(text: str) -> list[str]:
    lowered = _norm(text)
    hits: list[tuple[int, str]] = []
    for alias, canonical in sorted(_LINE_ALIASES.items(), key=lambda kv: len(kv[0]), reverse=True):
        m = re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", lowered)
        if m and canonical not in [c for _, c in hits]:
            if canonical == "Central" and re.search(r"walthamstow central", lowered) and not re.search(
                r"central line", lowered
            ):
                continue
            if canonical == "Elizabeth" and alias == "elizabeth" and not re.search(r"elizabeth (line|ln)", lowered):
                continue
            hits.append((m.start(), canonical))
    if re.search(r"\bvictoria line\b|\bthe victoria\b", lowered) and "Victoria" not in [c for _, c in hits]:
        hits.append((lowered.find("victoria"), "Victoria"))
    if re.search(r"\b(overground|ginger line)\b", lowered) and not any(c in ("Windrush", "Mildmay") for _, c in hits):
        hits.append((lowered.find("overground") if "overground" in lowered else 0, "Mildmay"))
    return [c for _, c in sorted(hits)]


def lines_serving(station: str) -> list[str]:
    return [line for line, stations in LINE_STATIONS.items() if station in stations]


@lru_cache(maxsize=None)
def intersecting_lines(line: str) -> frozenset[str]:
    """The line itself plus every line sharing at least one station with it."""
    if line not in LINE_STATIONS:
        return frozenset({line})
    own = set(LINE_STATIONS[line])
    return frozenset(other for other, stations in LINE_STATIONS.items() if own & set(stations))


def infer_lines(origin: str, destination: str) -> list[str]:
    return [line for line, s in LINE_STATIONS.items() if origin in s and destination in s]


def journey_stations(line: str, origin: str, destination: str) -> list[str] | None:
    """Ordered stations from origin to destination on a line, or None if not on it."""
    stations = LINE_STATIONS.get(line)
    if not stations or origin not in stations or destination not in stations:
        return None
    i, j = stations.index(origin), stations.index(destination)
    return stations[i : j + 1] if i <= j else list(reversed(stations[j : i + 1]))


def shared_segment(
    line_a: str, origin_a: str, dest_a: str, line_b: str, origin_b: str, dest_b: str
) -> list[str]:
    """Stations both riders pass through together, ordered in rider A's direction.

    Same line and same direction: the overlapping run of stations.
    Different (intersecting) lines: only a common boarding or alighting station.
    Returns [] when the journeys never coincide.
    """
    if line_a == line_b:
        ja = journey_stations(line_a, origin_a, dest_a)
        jb = journey_stations(line_b, origin_b, dest_b)
        if ja and jb and len(ja) > 1 and len(jb) > 1:
            stations = LINE_STATIONS[line_a]
            dir_a = stations.index(ja[-1]) - stations.index(ja[0])
            dir_b = stations.index(jb[-1]) - stations.index(jb[0])
            if (dir_a > 0) != (dir_b > 0):
                return []
            set_b = set(jb)
            return [s for s in ja if s in set_b]
    common: list[str] = []
    if origin_a == origin_b:
        common.append(origin_a)
    if dest_a == dest_b and dest_a not in common:
        common.append(dest_a)
    return common


def night_service_available(line: str, day: str) -> bool:
    return day in NIGHT_SERVICE_DAYS.get(line, frozenset())


def station_zone(station: str, default: int = 4) -> int:
    return STATION_ZONES.get(station, default)


def meet_point(station: str) -> dict[str, str]:
    return MEET_POINTS.get(station, DEFAULT_MEET_POINT)


def station_safety_score(station: str) -> float:
    """0..1 deterministic score from the MOCK safety profile."""
    profile = STATION_SAFETY.get(station)
    if not profile:
        return 0.5
    return round(
        0.3 + 0.3 * profile["staffed_late"] + 0.25 * profile["well_lit_exit"] + 0.15 * profile["cctv"], 2
    )


# --------------------------------------------------------------------------------------
# MOCK documents for the vector store.
# --------------------------------------------------------------------------------------
def _doc(doc_id: str, text: str, station: str, line: str, doc_type: str, zone: int, night: bool) -> dict:
    return {
        "id": doc_id,
        "text": f"{MOCK_LABEL} {text}",
        "metadata": {
            "station": station,
            "line": line,
            "doc_type": doc_type,
            "zone": zone,
            "night_service": night,
            "mock": True,
        },
    }


MOCK_DOCUMENTS: list[dict] = [
    # ---- Interchange layouts -----------------------------------------------------------
    _doc("layout-kxsp", "King's Cross St Pancras interchange: Piccadilly and Victoria platforms are linked by a "
         "short, well-lit tunnel with a staffed control room at the junction. Late at night the Western Ticket "
         "Hall stays open longest. Best meeting point is the front of the Piccadilly line westbound platform, "
         "under the help point.", "King's Cross St Pancras", "Piccadilly", "interchange_layout", 1, True),
    _doc("layout-euston", "Euston interchange: the Victoria and Northern (Charing Cross branch) platforms share "
         "a cross-platform layout, so changing does not require escalators. Staff patrol the lower concourse "
         "until close. Meet at the Victoria line platform help point opposite the map board.",
         "Euston", "Victoria", "interchange_layout", 1, True),
    _doc("layout-acton-town", "Acton Town: District and Piccadilly lines share an island platform layout above "
         "ground. The station is staffed until the last train; the ticket hall has bright lighting and CCTV "
         "covering the forecourt onto Gunnersbury Lane. Middle carriages stop nearest the stairs.",
         "Acton Town", "Piccadilly", "interchange_layout", 3, True),
    _doc("layout-finsbury-park", "Finsbury Park: Victoria and Piccadilly lines are cross-platform in the same "
         "direction, making it a very easy change. Two exits: the Wells Terrace exit is busier and staffed later; "
         "the Station Place exit is quieter after 23:00.", "Finsbury Park", "Victoria", "interchange_layout", 2, True),
    _doc("layout-stratford", "Stratford: large interchange for Central, Jubilee, Elizabeth, DLR and Overground. "
         "Central line platforms are at ground level beside the Elizabeth line. The main concourse is staffed "
         "through Night Tube hours with extensive CCTV; use the mezzanine route rather than the outer subway late at night.",
         "Stratford", "Central", "interchange_layout", 3, True),
    _doc("layout-highbury", "Highbury & Islington: Victoria line connects to Windrush and Mildmay Overground. "
         "Same-direction Victoria/Overground transfers are cross-platform on the lower level. Staffed ticket hall "
         "with good lighting on the main road frontage.", "Highbury & Islington", "Victoria", "interchange_layout", 2, True),
    _doc("layout-whitechapel", "Whitechapel: District, Hammersmith & City, Elizabeth line and Windrush Overground. "
         "A long, bright, staffed bridge concourse links everything above the platforms. Elizabeth line platforms "
         "are deep; allow five minutes to reach them.", "Whitechapel", "Elizabeth", "interchange_layout", 2, False),
    _doc("layout-camden", "Camden Town: Northern line junction where the Edgware and High Barnet branches meet. "
         "At weekends some entrances are exit-only during busy periods. The bottom of the main escalators by the "
         "help point is the clearest meeting point.", "Camden Town", "Northern", "interchange_layout", 2, True),
    _doc("layout-holborn", "Holborn: Central and Piccadilly interchange via a short passage with a staffed "
         "help point. The rear of the westbound Piccadilly train stops nearest the passage.",
         "Holborn", "Piccadilly", "interchange_layout", 1, True),
    # ---- Night service by line ---------------------------------------------------------
    _doc("night-piccadilly", "Night Tube on the Piccadilly line runs Friday and Saturday nights between Cockfosters "
         "and Heathrow, roughly every 10 minutes, calling at King's Cross, Holborn, Hammersmith and Acton Town.",
         "network", "Piccadilly", "night_service", 0, True),
    _doc("night-victoria", "Night Tube on the Victoria line runs Friday and Saturday nights along the whole line "
         "from Brixton to Walthamstow Central, around every 10 minutes.",
         "network", "Victoria", "night_service", 0, True),
    _doc("night-central", "Night Tube on the Central line runs Friday and Saturday nights between Ealing Broadway "
         "and Loughton/Hainault, every 10-20 minutes depending on section. Stratford and Liverpool Street are served.",
         "network", "Central", "night_service", 0, True),
    _doc("night-northern", "Night Tube on the Northern line runs Friday and Saturday nights on the Charing Cross "
         "branch via Euston and Camden Town, roughly every 8-15 minutes.", "network", "Northern", "night_service", 0, True),
    _doc("night-jubilee", "Night Tube on the Jubilee line runs Friday and Saturday nights end to end, about every "
         "10 minutes, including Stratford and London Bridge.", "network", "Jubilee", "night_service", 0, True),
    _doc("night-district", "The District line has no Night Tube service. Last westbound trains through Acton Town "
         "leave central London around 00:15-00:30; plan a Piccadilly line alternative on Friday and Saturday nights.",
         "network", "District", "night_service", 0, False),
    # ---- Late-night Overground / Elizabeth line notes ----------------------------------
    _doc("line-windrush-night", "Windrush line (Overground) runs a Night Overground on Friday and Saturday nights "
         "between Highbury & Islington and New Cross Gate, about every 15 minutes, via Whitechapel and Canada Water.",
         "network", "Windrush", "line_notes", 0, True),
    _doc("line-mildmay-late", "Mildmay line (Overground) has no night service. Last trains east towards Stratford "
         "leave Highbury & Islington shortly before midnight; carriages are walk-through and the front car is "
         "usually busiest late.", "network", "Mildmay", "line_notes", 0, False),
    _doc("line-elizabeth-late", "Elizabeth line does not run overnight. Last eastbound trains to Stratford and "
         "beyond leave central London around 00:30. Trains are walk-through with CCTV in every carriage and a "
         "staff presence on most central platforms until close.", "network", "Elizabeth", "line_notes", 0, False),
    _doc("line-general-carriage", "General late-night travel advice: choose a carriage with other passengers, "
         "ideally near the driver's cab or a carriage with a visible help point, and agree an alighting station "
         "before boarding.", "network", "all", "line_notes", 0, True),
    # ---- Lighting / CCTV / staffing safety descriptions --------------------------------
    _doc("safety-kxsp", "King's Cross St Pancras safety: staffed 24 hours on Night Tube nights, British Transport "
         "Police presence at weekends, bright lighting throughout and dense CCTV coverage.",
         "King's Cross St Pancras", "Piccadilly", "station_safety", 1, True),
    _doc("safety-finsbury", "Finsbury Park safety: staffed late, CCTV on all platforms. The Station Place side is "
         "dimmer after 23:00 and has fewer people; the Wells Terrace exit is the better-lit choice.",
         "Finsbury Park", "Victoria", "station_safety", 2, True),
    _doc("safety-stratford", "Stratford safety: very busy and well staffed even late, extensive CCTV, bright "
         "concourses. The route towards the shopping centre stays lit; avoid the outer subway after midnight.",
         "Stratford", "Central", "station_safety", 3, True),
    _doc("safety-acton-town", "Acton Town safety: staffed until the last train, help points on both platforms, "
         "forecourt lit and covered by CCTV. Quiet after midnight, so travelling in company is recommended.",
         "Acton Town", "Piccadilly", "station_safety", 3, True),
    _doc("safety-euston", "Euston safety: busy mainline concourse above, staff on the Underground concourse until "
         "close, bright lighting. Use the main ticket hall exits rather than the side exits late at night.",
         "Euston", "Victoria", "station_safety", 1, True),
    _doc("safety-leytonstone", "Leytonstone safety: staffed late with CCTV, but the bus station side exit is "
         "poorly lit; the main exit onto the high road is brighter and busier.",
         "Leytonstone", "Central", "station_safety", 4, True),
    _doc("safety-hounslow-west", "Hounslow West safety: not routinely staffed after midnight; help points and "
         "CCTV only. Treat as a station to travel to in company.", "Hounslow West", "Piccadilly", "station_safety", 5, True),
    # ---- Last-mile walk notes -----------------------------------------------------------
    _doc("lastmile-acton-town", "Last mile from Acton Town: the main road towards Acton High Street is lit and "
         "has late-opening shops for the first 8-10 minutes; side streets are residential and quiet. A taxi rank "
         "operates outside on weekend nights.", "Acton Town", "Piccadilly", "last_mile", 3, True),
    _doc("lastmile-finsbury-park", "Last mile from Finsbury Park: Seven Sisters Road is well lit with 24-hour "
         "shops and frequent night buses; the park edge path is unlit after dark and should be avoided.",
         "Finsbury Park", "Piccadilly", "last_mile", 2, True),
    _doc("lastmile-stratford", "Last mile from Stratford: the walk via the Broadway and the shopping centre is "
         "lit and staffed late; routes through the Olympic Park after midnight are long and quiet. Night buses "
         "leave from the bus station beside the main exit.", "Stratford", "Central", "last_mile", 3, True),
    _doc("lastmile-walthamstow", "Last mile from Walthamstow Central: Hoe Street is busy and well lit until late; "
         "the bus station is staffed and next to the exit.", "Walthamstow Central", "Victoria", "last_mile", 3, True),
    _doc("lastmile-seven-sisters", "Last mile from Seven Sisters: High Road is lit with late shops; cross at the "
         "main junction rather than the subway after midnight.", "Seven Sisters", "Victoria", "last_mile", 3, True),
    _doc("lastmile-hammersmith", "Last mile from Hammersmith: the Broadway is busy and lit with a staffed bus "
         "station; the riverside paths are dark late at night.", "Hammersmith", "Piccadilly", "last_mile", 2, True),
    _doc("lastmile-leytonstone", "Last mile from Leytonstone: High Road is lit; the green space to the north is "
         "unlit. Night buses stop outside the main exit.", "Leytonstone", "Central", "last_mile", 4, True),
]

# --------------------------------------------------------------------------------------
# Embeddings and Chroma
# --------------------------------------------------------------------------------------
_EMBED_DIM = 384
_TOKEN_RE = re.compile(r"[a-z0-9']+")


class HashingEmbeddingFunction:
    """Deterministic, fully offline embedder (hashed unigrams + bigrams).

    Used when the MiniLM model cannot be loaded, so the demo never depends on a
    model download. Lexical rather than truly semantic, but stable and fast.
    """

    def __call__(self, input):  # noqa: A002  (Chroma's protocol uses `input`)
        return [self._embed(text) for text in input]

    @staticmethod
    def name() -> str:
        return "ghost_hashing_v1"

    def _embed(self, text: str) -> list[float]:
        vec = [0.0] * _EMBED_DIM
        tokens = _TOKEN_RE.findall(text.lower())
        grams = tokens + [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]
        for gram in grams:
            digest = hashlib.md5(gram.encode()).digest()
            idx = int.from_bytes(digest[:4], "little") % _EMBED_DIM
            vec[idx] += 1.0 if digest[4] % 2 else -1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


_init_lock = threading.Lock()
_collection = None
_backend_in_use: str | None = None
_init_failed = False
_DOCS_VERSION = "2026-10-v1"


def _client():
    import chromadb
    from chromadb.config import Settings as ChromaSettings

    return chromadb.PersistentClient(
        path=settings.chroma_path, settings=ChromaSettings(anonymized_telemetry=False)
    )


def _try_collection(client, backend: str):
    if backend == "minilm":
        from chromadb.utils import embedding_functions

        ef = embedding_functions.DefaultEmbeddingFunction()
    else:
        ef = HashingEmbeddingFunction()
    # Separate collections per backend so vectors from different embedders never mix.
    collection = client.get_or_create_collection(
        name=f"ghost_transit_{backend}", embedding_function=ef, metadata={"hnsw:space": "cosine"}
    )
    existing = collection.get(ids=["__version__"])
    if existing["ids"] and existing["metadatas"] and existing["metadatas"][0].get("v") == _DOCS_VERSION:
        if collection.count() >= len(MOCK_DOCUMENTS) + 1:
            return collection
    collection.upsert(
        ids=[d["id"] for d in MOCK_DOCUMENTS] + ["__version__"],
        documents=[d["text"] for d in MOCK_DOCUMENTS] + ["version marker"],
        metadatas=[d["metadata"] for d in MOCK_DOCUMENTS]
        + [{"station": "__meta__", "line": "__meta__", "doc_type": "__meta__", "zone": 0,
            "night_service": False, "mock": True, "v": _DOCS_VERSION}],
    )
    return collection


def init_vector_store() -> int:
    """Idempotently create and populate the vector store. Returns document count.

    Safe to call repeatedly: documents are upserted by fixed IDs and skipped
    entirely when the stored version marker matches.
    """
    global _collection, _backend_in_use, _init_failed
    with _init_lock:
        if _collection is not None:
            return len(MOCK_DOCUMENTS)
        if _init_failed:
            raise RuntimeError("vector store unavailable")
        try:
            client = _client()
        except Exception as exc:  # chromadb missing or path unwritable
            _init_failed = True
            raise RuntimeError("vector store unavailable") from exc
        order = {"auto": ["minilm", "hash"], "minilm": ["minilm", "hash"], "hash": ["hash"]}.get(
            settings.embedding_backend, ["hash"]
        )
        last_error: Exception | None = None
        for backend in order:
            try:
                _collection = _try_collection(client, backend)
                _backend_in_use = backend
                log.info("vector_store_ready", extra={"backend": backend, "documents": len(MOCK_DOCUMENTS)})
                return len(MOCK_DOCUMENTS)
            except Exception as exc:  # model download failures, onnx issues, etc.
                last_error = exc
                log.warning("vector_store_backend_failed", extra={"backend": backend, "reason_code": type(exc).__name__})
        _init_failed = True  # don't retry on every request; keyword fallback takes over
        raise RuntimeError("vector store unavailable") from last_error


def _query(collection, text: str, where: dict | None, n: int) -> list[tuple[str, str]]:
    try:
        res = collection.query(query_texts=[text], n_results=max(1, n), where=where)
    except Exception as exc:
        log.warning("vector_query_failed", extra={"reason_code": type(exc).__name__})
        return []
    ids = (res.get("ids") or [[]])[0]
    docs = (res.get("documents") or [[]])[0]
    return [(i, d) for i, d in zip(ids, docs) if i != "__version__"]


def _keyword_fallback(origin: str, destination: str, line: str | None, k: int) -> list[tuple[str, str]]:
    """Used when Chroma is not available: same metadata filter, no vectors."""
    stations = {origin, destination}
    ranked: list[tuple[int, str, str]] = []
    for d in MOCK_DOCUMENTS:
        md = d["metadata"]
        score = 0
        if md["station"] in stations:
            score += 3
        if line and md["line"] in (line, "all") and md["doc_type"] in ("night_service", "line_notes"):
            score += 2
        if md["doc_type"] in ("station_safety", "last_mile") and md["station"] in stations:
            score += 1
        if score:
            ranked.append((score, d["id"], d["text"]))
    ranked.sort(key=lambda t: (-t[0], t[1]))
    return [(i, t) for _, i, t in ranked[: k + 3]]


def get_transit_safety_context(origin: str, destination: str, line: str | None = None, k: int = 6) -> list[str]:
    """Metadata-filtered semantic retrieval of MOCK transit safety facts.

    1. Station-scoped docs (layout, safety, last mile) for origin/destination.
    2. Line-scoped night-service / late-running notes for `line`.
    3. Unfiltered semantic top-up if still short.
    Results are de-duplicated and capped at ~1500 characters in total.
    """
    query_text = (
        f"late night safety lighting staffing CCTV interchange layout last mile walk "
        f"{origin} {destination} {line or ''} night service"
    )
    hits: list[tuple[str, str]] = []
    collection = None
    try:
        init_vector_store()
        collection = _collection
    except Exception:
        collection = None

    if collection is None:
        hits = _keyword_fallback(origin, destination, line, k)
    else:
        hits += _query(collection, query_text, {"station": {"$in": [origin, destination]}}, k)
        if line:
            hits += _query(
                collection,
                f"{line} night service late trains",
                {"$and": [{"line": {"$in": [line, "all"]}},
                          {"doc_type": {"$in": ["night_service", "line_notes"]}}]},
                3,
            )
        if len(hits) < k:
            hits += _query(collection, query_text, {"doc_type": {"$ne": "__meta__"}}, k)

    seen: set[str] = set()
    out: list[str] = []
    budget = 1500
    for doc_id, text in hits:
        if doc_id in seen:
            continue
        seen.add(doc_id)
        if len(out) >= k + 2:
            break
        if len(text) > budget:
            if budget > 200:
                out.append(text[: budget - 1].rsplit(" ", 1)[0] + "…")
            break
        out.append(text)
        budget -= len(text)
    return out


def vector_backend() -> str | None:
    return _backend_in_use
