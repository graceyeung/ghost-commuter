/**
 * Suggested universities and the station nearest each campus (the backend's `university_hub` must be
 * a known station). Students can type any university; they then pick their campus station themselves.
 */
export interface UniversitySuggestion {
  short: string;
  name: string;
  hub: string;
}

export const UNIVERSITIES: readonly UniversitySuggestion[] = [
  { short: "UCL", name: "UCL", hub: "Euston" },
  { short: "KCL", name: "King's College London", hub: "Temple" },
  { short: "LSE", name: "London School of Economics", hub: "Holborn" },
  { short: "Birkbeck", name: "Birkbeck, University of London", hub: "Russell Square" },
  { short: "SOAS", name: "SOAS University of London", hub: "Russell Square" },
  { short: "Imperial", name: "Imperial College London", hub: "South Kensington" },
  { short: "QMUL", name: "Queen Mary University of London", hub: "Mile End" },
  { short: "UAL CSM", name: "UAL Central Saint Martins", hub: "King's Cross St Pancras" },
];
