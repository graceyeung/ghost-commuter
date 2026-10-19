// NEXT_PUBLIC_* values are inlined at build time, so they must be read with literal property access.
const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;
const rawMocks = process.env.NEXT_PUBLIC_USE_MOCKS;

export const env = {
  apiBaseUrl: (rawBase && rawBase.trim() ? rawBase.trim() : "http://localhost:8000").replace(/\/+$/, ""),
  /** Mocks are on unless explicitly disabled, so a fresh clone is demoable offline. */
  useMocks: rawMocks === undefined || rawMocks.trim().toLowerCase() !== "false",
} as const;
