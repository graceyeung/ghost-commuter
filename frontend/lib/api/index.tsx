"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GhostApi } from "./contract";
import { createHttpClient } from "./client";
import { createMockClient } from "./mock";
import { env } from "../env";

let defaultApi: GhostApi | null = null;

/** The client selected by NEXT_PUBLIC_USE_MOCKS. Created lazily so the mock only touches storage in the browser. */
export function getDefaultApi(): GhostApi {
  if (!defaultApi) defaultApi = env.useMocks ? createMockClient() : createHttpClient({ baseUrl: env.apiBaseUrl });
  return defaultApi;
}

const ApiContext = createContext<GhostApi | null>(null);

/** Lets tests (and future screens) inject a different client. */
export function ApiProvider({ api, children }: { api?: GhostApi; children: ReactNode }) {
  return <ApiContext.Provider value={api ?? null}>{children}</ApiContext.Provider>;
}

export function useApi(): GhostApi {
  return useContext(ApiContext) ?? getDefaultApi();
}
