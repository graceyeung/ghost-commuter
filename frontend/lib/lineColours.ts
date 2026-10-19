/**
 * Approximate London line colours for the line pills. These are hand-picked approximations for a
 * demo, not official TfL brand assets; no logos or roundels are used.
 */
export interface LineColour {
  background: string;
  text: string;
}

const LINE_HEX: Record<string, string> = {
  piccadilly: "#1C3F94",
  victoria: "#0098D4",
  central: "#DC241F",
  northern: "#1A1A1A",
  jubilee: "#8A9399",
  district: "#00782A",
  elizabeth: "#6950A1",
  windrush: "#E1251B",
  mildmay: "#2A72C3",
  bakerloo: "#B26300",
  circle: "#FFD329",
  "hammersmith & city": "#F4A9BE",
  metropolitan: "#9B0058",
  "waterloo & city": "#93CEBA",
  dlr: "#00AFAD",
  liberty: "#5D6061",
  lioness: "#FAA61A",
  suffragette: "#5BB97B",
  weaver: "#823A62",
  overground: "#FA7B05",
};

const FALLBACK = "#5B6478";

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Picks white or near-black text, whichever has the higher contrast against the line colour. */
function readableText(background: string): string {
  const l = relativeLuminance(background);
  const whiteContrast = 1.05 / (l + 0.05);
  const darkContrast = (l + 0.05) / (relativeLuminance("#0B1220") + 0.05);
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#0B1220";
}

export function lineColour(line: string): LineColour {
  const key = line.trim().toLowerCase().replace(/\s+line$/, "").replace(/\band\b/g, "&");
  const background = LINE_HEX[key] ?? FALLBACK;
  return { background, text: readableText(background) };
}

/** The backend may report a shared segment as "Victoria / Piccadilly". */
export function splitLines(sharedLine: string): string[] {
  return sharedLine
    .split(/\s*\/\s*|\s*,\s*|\s+\+\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
