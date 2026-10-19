import type { ZodType, ZodTypeDef } from "zod";
import {
  AddScheduleRequestSchema,
  ApiErrorBodySchema,
  BlockRequestSchema,
  BlockResponseSchema,
  DeleteUserResponseSchema,
  ENDPOINTS,
  FindMatchesRequestSchema,
  FindMatchesResponseSchema,
  HealthResponseSchema,
  JourneyConfirmRequestSchema,
  JourneyConfirmResponseSchema,
  LanguageSettingsSchema,
  MessagesResponseSchema,
  MyMatchesResponseSchema,
  ChatMessageSchema,
  SendMessageRequestSchema,
  RegisterProfileRequestSchema,
  RegisterProfileResponseSchema,
  ReportRequestSchema,
  ReportResponseSchema,
  RespondRequestSchema,
  RespondResponseSchema,
  SupportedLanguagesResponseSchema,
  TrustSummarySchema,
  UpdateLanguagesRequestSchema,
  UpdateProfileRequestSchema,
  UpdateProfileResponseSchema,
  type GhostApi,
  type Proposed,
} from "./contract";
import { ApiError, messageForStatus } from "./errors";
import { randomId, readJson, writeJson } from "../storage";

const DEFAULT_TIMEOUT_MS = 20_000;
/** Matching can run three model calls when the backend has an Anthropic key. */
const MATCH_TIMEOUT_MS = 90_000;

interface RequestOptions<Out> {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema: ZodType<Out, ZodTypeDef, unknown>;
  timeoutMs?: number;
}

export interface HttpClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function createHttpClient({ baseUrl, fetchImpl }: HttpClientOptions): GhostApi {
  const doFetch: typeof fetch = fetchImpl ?? ((...args) => fetch(...args));

  async function request<Out>(path: string, options: RequestOptions<Out>): Promise<Out> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: options.method,
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          "X-Request-ID": randomId().replace(/-/g, "").slice(0, 12),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("timeout", "This is taking longer than usual. Please try again.");
      }
      throw new ApiError(
        "network",
        "We couldn't reach Ghost Commuter. Check your connection (or that the backend is running) and try again.",
      );
    } finally {
      clearTimeout(timer);
    }

    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      const parsedBody = ApiErrorBodySchema.safeParse(payload);
      const body = parsedBody.success ? parsedBody.data : undefined;
      const serverCode = typeof body?.error === "string" ? body.error : undefined;
      if (response.status === 429) {
        throw new ApiError("rate_limited", messageForStatus(429, body), { status: 429, serverCode });
      }
      throw new ApiError("http", messageForStatus(response.status, body), { status: response.status, serverCode });
    }

    const parsed = options.schema.safeParse(payload);
    if (!parsed.success) {
      // Log only field paths, never values: responses can contain other students' display names.
      console.warn(
        "[ghost-commuter] Response did not match contract",
        path,
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`),
      );
      throw new ApiError(
        "contract",
        "We got an unexpected reply from the server, so we didn't show it. Please try again in a moment.",
        { status: response.status },
      );
    }
    return parsed.data;
  }

  /** Calls a proposed endpoint; if the backend doesn't have it yet, records the action on this device. */
  async function proposed<Out>(call: () => Promise<Out>, localFallback: () => Out): Promise<Proposed<Out>> {
    try {
      return { data: await call(), delivered: "server" };
    } catch (error) {
      if (error instanceof ApiError && error.isMissingRoute) return { data: localFallback(), delivered: "this_device" };
      throw error;
    }
  }

  return {
    kind: "http",

    health: () => request(ENDPOINTS.health, { method: "GET", schema: HealthResponseSchema }),

    registerProfile: (body) =>
      request(ENDPOINTS.registerProfile, {
        method: "POST",
        body: RegisterProfileRequestSchema.parse(body),
        schema: RegisterProfileResponseSchema,
        timeoutMs: 45_000,
      }),

    addSchedule: (userId, body) =>
      request(ENDPOINTS.addSchedule(userId), {
        method: "POST",
        body: AddScheduleRequestSchema.parse(body),
        schema: RegisterProfileResponseSchema,
        timeoutMs: 45_000,
      }),

    findMatches: (body) =>
      request(ENDPOINTS.findMatches, {
        method: "POST",
        body: FindMatchesRequestSchema.parse(body),
        schema: FindMatchesResponseSchema,
        timeoutMs: MATCH_TIMEOUT_MS,
      }),

    respond: (matchId, body) =>
      request(ENDPOINTS.respond(matchId), {
        method: "POST",
        body: RespondRequestSchema.parse(body),
        schema: RespondResponseSchema,
      }),

    listMyMatches: (userId) => request(ENDPOINTS.myMatches(userId), { method: "GET", schema: MyMatchesResponseSchema }),

    listMessages: (matchId, userId, after) => {
      const query = new URLSearchParams({ user_id: userId });
      if (after) query.set("after", after);
      return request(`${ENDPOINTS.messages(matchId)}?${query.toString()}`, { method: "GET", schema: MessagesResponseSchema });
    },

    sendMessage: (matchId, body) =>
      request(ENDPOINTS.messages(matchId), {
        method: "POST",
        body: SendMessageRequestSchema.parse(body),
        schema: ChatMessageSchema,
      }),

    confirmJourney: (body) =>
      request(ENDPOINTS.confirmJourney, {
        method: "POST",
        body: JourneyConfirmRequestSchema.parse(body),
        schema: JourneyConfirmResponseSchema,
      }),

    getTrust: (userId) => request(ENDPOINTS.trust(userId), { method: "GET", schema: TrustSummarySchema }),

    updateLanguages: (userId, body) =>
      request(ENDPOINTS.languages(userId), {
        method: "PATCH",
        body: UpdateLanguagesRequestSchema.parse(body),
        schema: LanguageSettingsSchema,
      }),

    listLanguages: () => request(ENDPOINTS.supportedLanguages, { method: "GET", schema: SupportedLanguagesResponseSchema }),

    reportMatch: (matchId, body) =>
      proposed(
        () =>
          request(ENDPOINTS.report(matchId), {
            method: "POST",
            body: ReportRequestSchema.parse(body),
            schema: ReportResponseSchema,
          }),
        () => {
          const reportId = randomId();
          appendDeviceLog({ kind: "report", matchId, reason: body.reason, at: new Date().toISOString(), reportId });
          return { report_id: reportId, status: "received" as const };
        },
      ),

    blockUser: (body) =>
      proposed(
        () => request(ENDPOINTS.block, { method: "POST", body: BlockRequestSchema.parse(body), schema: BlockResponseSchema }),
        () => {
          appendDeviceLog({ kind: "block", name: body.blocked_display_name, at: new Date().toISOString() });
          return { status: "blocked" as const, blocked_display_name: body.blocked_display_name };
        },
      ),

    updateProfile: (userId, body) =>
      proposed(
        () =>
          request(ENDPOINTS.user(userId), {
            method: "PATCH",
            body: UpdateProfileRequestSchema.parse(body),
            schema: UpdateProfileResponseSchema,
          }),
        () => ({ status: "updated" as const, is_active: body.is_active ?? true }),
      ),

    deleteUser: (userId) =>
      proposed(
        () => request(ENDPOINTS.user(userId), { method: "DELETE", schema: DeleteUserResponseSchema }),
        () => ({ status: "deleted" as const }),
      ),
  };
}

// ----------------------------------------------- on-device record of proposed-endpoint actions
const DEVICE_LOG_KEY = "ghost-commuter:device-safety-log";

type DeviceLogEntry =
  | { kind: "report"; matchId: string; reason: string; at: string; reportId: string }
  | { kind: "block"; name: string; at: string };

function appendDeviceLog(entry: DeviceLogEntry): void {
  const log = readJson<DeviceLogEntry[]>(DEVICE_LOG_KEY, []);
  writeJson(DEVICE_LOG_KEY, [...log, entry].slice(-50));
}
