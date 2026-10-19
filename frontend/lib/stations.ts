// GENERATED from the backend's rag_engine.py (MOCK topology). The backend rejects station names
// it does not know, so this list must match it exactly. Regenerate if rag_engine.LINE_STATIONS changes.
// Zones are MOCK data from the backend; undefined means the backend has no zone for that station.

export const LINE_NAMES = ["Piccadilly", "Victoria", "Central", "Northern", "Jubilee", "District", "Elizabeth", "Windrush", "Mildmay"] as const;
export type LineName = (typeof LINE_NAMES)[number];

export interface Station {
  name: string;
  zone?: number;
  lines: LineName[];
}

export const STATIONS: readonly Station[] = [
  { name: "Acton Central", lines: ["Mildmay"] },
  { name: "Acton Main Line", lines: ["Elizabeth"] },
  { name: "Acton Town", zone: 3, lines: ["Piccadilly", "District"] },
  { name: "Aldgate East", lines: ["District"] },
  { name: "Arnos Grove", zone: 4, lines: ["Piccadilly"] },
  { name: "Arsenal", zone: 2, lines: ["Piccadilly"] },
  { name: "Baker Street", lines: ["Jubilee"] },
  { name: "Balham", zone: 3, lines: ["Northern"] },
  { name: "Bank", lines: ["Central"] },
  { name: "Barking", zone: 4, lines: ["District"] },
  { name: "Barons Court", lines: ["Piccadilly", "District"] },
  { name: "Belsize Park", lines: ["Northern"] },
  { name: "Bermondsey", lines: ["Jubilee"] },
  { name: "Bethnal Green", zone: 2, lines: ["Central"] },
  { name: "Blackfriars", lines: ["District"] },
  { name: "Blackhorse Road", zone: 3, lines: ["Victoria"] },
  { name: "Bond Street", lines: ["Central", "Jubilee", "Elizabeth"] },
  { name: "Boston Manor", zone: 4, lines: ["Piccadilly"] },
  { name: "Bounds Green", zone: 3, lines: ["Piccadilly"] },
  { name: "Bow Road", lines: ["District"] },
  { name: "Brent Cross", lines: ["Northern"] },
  { name: "Brixton", zone: 2, lines: ["Victoria"] },
  { name: "Brockley", lines: ["Windrush"] },
  { name: "Bromley-by-Bow", lines: ["District"] },
  { name: "Brondesbury", lines: ["Mildmay"] },
  { name: "Brondesbury Park", lines: ["Mildmay"] },
  { name: "Burnt Oak", zone: 4, lines: ["Northern"] },
  { name: "Caledonian Road", zone: 2, lines: ["Piccadilly"] },
  { name: "Caledonian Road & Barnsbury", lines: ["Mildmay"] },
  { name: "Camden Road", lines: ["Mildmay"] },
  { name: "Camden Town", zone: 2, lines: ["Northern"] },
  { name: "Canada Water", lines: ["Jubilee", "Windrush"] },
  { name: "Canary Wharf", lines: ["Jubilee"] },
  { name: "Canning Town", zone: 3, lines: ["Jubilee"] },
  { name: "Cannon Street", lines: ["District"] },
  { name: "Canonbury", lines: ["Windrush", "Mildmay"] },
  { name: "Canons Park", lines: ["Jubilee"] },
  { name: "Chalk Farm", lines: ["Northern"] },
  { name: "Chancery Lane", lines: ["Central"] },
  { name: "Charing Cross", lines: ["Northern"] },
  { name: "Chiswick Park", lines: ["District"] },
  { name: "Clapham Common", lines: ["Northern"] },
  { name: "Clapham North", lines: ["Northern"] },
  { name: "Clapham South", lines: ["Northern"] },
  { name: "Colindale", zone: 4, lines: ["Northern"] },
  { name: "Colliers Wood", lines: ["Northern"] },
  { name: "Covent Garden", lines: ["Piccadilly"] },
  { name: "Crystal Palace", zone: 4, lines: ["Windrush"] },
  { name: "Dalston Junction", zone: 2, lines: ["Windrush"] },
  { name: "Dalston Kingsland", lines: ["Mildmay"] },
  { name: "Dollis Hill", lines: ["Jubilee"] },
  { name: "Ealing Broadway", zone: 3, lines: ["Central", "District", "Elizabeth"] },
  { name: "Ealing Common", lines: ["District"] },
  { name: "Earl's Court", zone: 2, lines: ["Piccadilly", "District"] },
  { name: "East Acton", lines: ["Central"] },
  { name: "East Ham", zone: 4, lines: ["District"] },
  { name: "Edgware", zone: 5, lines: ["Northern"] },
  { name: "Embankment", lines: ["Northern", "District"] },
  { name: "Euston", zone: 1, lines: ["Victoria", "Northern"] },
  { name: "Farringdon", lines: ["Elizabeth"] },
  { name: "Finchley Road", lines: ["Jubilee"] },
  { name: "Finchley Road & Frognal", lines: ["Mildmay"] },
  { name: "Finsbury Park", zone: 2, lines: ["Piccadilly", "Victoria"] },
  { name: "Forest Gate", zone: 3, lines: ["Elizabeth"] },
  { name: "Forest Hill", lines: ["Windrush"] },
  { name: "Gloucester Road", lines: ["Piccadilly", "District"] },
  { name: "Golders Green", zone: 3, lines: ["Northern"] },
  { name: "Goodge Street", lines: ["Northern"] },
  { name: "Gospel Oak", lines: ["Mildmay"] },
  { name: "Green Park", lines: ["Piccadilly", "Victoria", "Jubilee"] },
  { name: "Gunnersbury", zone: 3, lines: ["Mildmay"] },
  { name: "Hackney Central", zone: 2, lines: ["Mildmay"] },
  { name: "Hackney Wick", zone: 2, lines: ["Mildmay"] },
  { name: "Haggerston", lines: ["Windrush"] },
  { name: "Hammersmith", zone: 2, lines: ["Piccadilly", "District"] },
  { name: "Hampstead", lines: ["Northern"] },
  { name: "Hampstead Heath", lines: ["Mildmay"] },
  { name: "Hendon Central", zone: 3, lines: ["Northern"] },
  { name: "Highbury & Islington", zone: 2, lines: ["Victoria", "Windrush", "Mildmay"] },
  { name: "Holborn", zone: 1, lines: ["Piccadilly", "Central"] },
  { name: "Holland Park", lines: ["Central"] },
  { name: "Holloway Road", zone: 2, lines: ["Piccadilly"] },
  { name: "Homerton", lines: ["Mildmay"] },
  { name: "Honor Oak Park", lines: ["Windrush"] },
  { name: "Hounslow East", zone: 4, lines: ["Piccadilly"] },
  { name: "Hounslow West", zone: 5, lines: ["Piccadilly"] },
  { name: "Hoxton", lines: ["Windrush"] },
  { name: "Hyde Park Corner", lines: ["Piccadilly"] },
  { name: "Ilford", zone: 4, lines: ["Elizabeth"] },
  { name: "Kennington", lines: ["Northern"] },
  { name: "Kensal Rise", lines: ["Mildmay"] },
  { name: "Kentish Town West", lines: ["Mildmay"] },
  { name: "Kew Gardens", lines: ["Mildmay"] },
  { name: "Kilburn", lines: ["Jubilee"] },
  { name: "King's Cross St Pancras", zone: 1, lines: ["Piccadilly", "Victoria"] },
  { name: "Kingsbury", lines: ["Jubilee"] },
  { name: "Knightsbridge", lines: ["Piccadilly"] },
  { name: "Lancaster Gate", lines: ["Central"] },
  { name: "Leicester Square", lines: ["Piccadilly", "Northern"] },
  { name: "Leyton", zone: 3, lines: ["Central"] },
  { name: "Leytonstone", zone: 4, lines: ["Central"] },
  { name: "Liverpool Street", zone: 1, lines: ["Central", "Elizabeth"] },
  { name: "London Bridge", lines: ["Jubilee"] },
  { name: "Manor House", zone: 2, lines: ["Piccadilly"] },
  { name: "Manor Park", lines: ["Elizabeth"] },
  { name: "Mansion House", lines: ["District"] },
  { name: "Marble Arch", lines: ["Central"] },
  { name: "Maryland", zone: 3, lines: ["Elizabeth"] },
  { name: "Mile End", zone: 2, lines: ["Central", "District"] },
  { name: "Monument", lines: ["District"] },
  { name: "Morden", zone: 4, lines: ["Northern"] },
  { name: "Mornington Crescent", lines: ["Northern"] },
  { name: "Neasden", lines: ["Jubilee"] },
  { name: "New Cross Gate", zone: 2, lines: ["Windrush"] },
  { name: "North Acton", zone: 2, lines: ["Central"] },
  { name: "North Greenwich", lines: ["Jubilee"] },
  { name: "Northfields", zone: 3, lines: ["Piccadilly"] },
  { name: "Notting Hill Gate", lines: ["Central"] },
  { name: "Osterley", zone: 4, lines: ["Piccadilly"] },
  { name: "Oval", lines: ["Northern"] },
  { name: "Oxford Circus", lines: ["Victoria", "Central"] },
  { name: "Paddington", lines: ["Elizabeth"] },
  { name: "Piccadilly Circus", lines: ["Piccadilly"] },
  { name: "Pimlico", lines: ["Victoria"] },
  { name: "Plaistow", lines: ["District"] },
  { name: "Queensbury", lines: ["Jubilee"] },
  { name: "Queensway", lines: ["Central"] },
  { name: "Richmond", zone: 4, lines: ["Mildmay"] },
  { name: "Romford", zone: 6, lines: ["Elizabeth"] },
  { name: "Rotherhithe", lines: ["Windrush"] },
  { name: "Russell Square", lines: ["Piccadilly"] },
  { name: "Seven Sisters", zone: 3, lines: ["Victoria"] },
  { name: "Shadwell", lines: ["Windrush"] },
  { name: "Shepherd's Bush", lines: ["Central"] },
  { name: "Shoreditch High Street", lines: ["Windrush"] },
  { name: "Snaresbrook", zone: 4, lines: ["Central"] },
  { name: "South Acton", lines: ["Mildmay"] },
  { name: "South Ealing", zone: 3, lines: ["Piccadilly"] },
  { name: "South Kensington", lines: ["Piccadilly", "District"] },
  { name: "South Wimbledon", lines: ["Northern"] },
  { name: "South Woodford", zone: 4, lines: ["Central"] },
  { name: "Southwark", lines: ["Jubilee"] },
  { name: "St John's Wood", lines: ["Jubilee"] },
  { name: "St Paul's", lines: ["Central"] },
  { name: "Stanmore", zone: 5, lines: ["Jubilee"] },
  { name: "Stepney Green", lines: ["District"] },
  { name: "Stockwell", lines: ["Victoria", "Northern"] },
  { name: "Stratford", zone: 3, lines: ["Central", "Jubilee", "Elizabeth", "Mildmay"] },
  { name: "Surrey Quays", lines: ["Windrush"] },
  { name: "Swiss Cottage", lines: ["Jubilee"] },
  { name: "Sydenham", lines: ["Windrush"] },
  { name: "Temple", lines: ["District"] },
  { name: "Tooting Bec", lines: ["Northern"] },
  { name: "Tooting Broadway", zone: 3, lines: ["Northern"] },
  { name: "Tottenham Court Road", zone: 1, lines: ["Central", "Northern", "Elizabeth"] },
  { name: "Tottenham Hale", zone: 3, lines: ["Victoria"] },
  { name: "Tower Hill", lines: ["District"] },
  { name: "Turnham Green", lines: ["Piccadilly", "District"] },
  { name: "Turnpike Lane", zone: 3, lines: ["Piccadilly"] },
  { name: "Upminster", zone: 6, lines: ["District"] },
  { name: "Upton Park", lines: ["District"] },
  { name: "Vauxhall", lines: ["Victoria"] },
  { name: "Victoria", lines: ["Victoria", "District"] },
  { name: "Walthamstow Central", zone: 3, lines: ["Victoria"] },
  { name: "Wapping", lines: ["Windrush"] },
  { name: "Warren Street", lines: ["Victoria", "Northern"] },
  { name: "Waterloo", lines: ["Northern", "Jubilee"] },
  { name: "Wembley Park", zone: 4, lines: ["Jubilee"] },
  { name: "West Acton", zone: 3, lines: ["Central"] },
  { name: "West Ham", zone: 3, lines: ["Jubilee", "District"] },
  { name: "West Hampstead", lines: ["Jubilee", "Mildmay"] },
  { name: "Westminster", lines: ["Jubilee", "District"] },
  { name: "White City", lines: ["Central"] },
  { name: "Whitechapel", zone: 2, lines: ["District", "Elizabeth", "Windrush"] },
  { name: "Willesden Green", lines: ["Jubilee"] },
  { name: "Willesden Junction", lines: ["Mildmay"] },
  { name: "Wood Green", zone: 3, lines: ["Piccadilly"] },
  { name: "Woodford", zone: 4, lines: ["Central"] },
];

/** Informal names the backend also understands, mapped to the canonical station. */
export const STATION_ALIASES: Readonly<Record<string, string>> = {
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
  "liverpool st": "Liverpool Street"
};

const BY_KEY = new Map<string, Station>(STATIONS.map((s) => [normaliseStationKey(s.name), s]));

export function normaliseStationKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Returns the canonical station for a typed value, or undefined if the backend would reject it. */
export function findStation(value: string): Station | undefined {
  const key = normaliseStationKey(value);
  if (!key) return undefined;
  const direct = BY_KEY.get(key);
  if (direct) return direct;
  for (const [alias, canonical] of Object.entries(STATION_ALIASES)) {
    if (normaliseStationKey(alias) === key) return BY_KEY.get(normaliseStationKey(canonical));
  }
  return undefined;
}

export function isKnownStation(value: string): boolean {
  return findStation(value) !== undefined;
}

/** Ranked autocomplete: prefix matches first, then word-prefix, then substring. */
export function searchStations(query: string, limit = 8): Station[] {
  const q = normaliseStationKey(query);
  if (!q) return STATIONS.slice(0, limit);
  const scored: { station: Station; score: number }[] = [];
  for (const station of STATIONS) {
    const key = normaliseStationKey(station.name);
    let score = -1;
    if (key.startsWith(q)) score = 0;
    else if (key.split(" ").some((word) => word.startsWith(q))) score = 1;
    else if (key.includes(q)) score = 2;
    if (score >= 0) scored.push({ station, score });
  }
  for (const [alias, canonical] of Object.entries(STATION_ALIASES)) {
    if (normaliseStationKey(alias).startsWith(q)) {
      const station = BY_KEY.get(normaliseStationKey(canonical));
      if (station && !scored.some((s) => s.station === station)) scored.push({ station, score: 0 });
    }
  }
  scored.sort((a, b) => a.score - b.score || a.station.name.localeCompare(b.station.name));
  return scored.slice(0, limit).map((s) => s.station);
}

/** Lines that serve both stations (used by the mock parser to infer a line). */
export function sharedLines(a: string, b: string): LineName[] {
  const sa = findStation(a);
  const sb = findStation(b);
  if (!sa || !sb) return [];
  return sa.lines.filter((line) => sb.lines.includes(line));
}
