import type { ApiErrorBody } from "./contract";

export type ApiErrorKind =
  | "network" // server unreachable or CORS
  | "timeout"
  | "http" // non-2xx with a server message
  | "rate_limited"
  | "contract"; // 2xx but the body didn't match the contract

/** Normalised error every API call throws. `message` is always safe to show to a student. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** The backend's machine-readable `error` field, when present (e.g. "Not Found"). */
  readonly serverCode?: string;

  constructor(kind: ApiErrorKind, message: string, options: { status?: number; serverCode?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = options.status;
    this.serverCode = options.serverCode;
  }

  /** True when the route itself doesn't exist (used to detect proposed endpoints not yet built). */
  get isMissingRoute(): boolean {
    return (
      this.kind === "http" &&
      (this.status === 405 || this.status === 501 || (this.status === 404 && this.serverCode === "Not Found"))
    );
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Turns an error body + status into a calm, specific message. Never echoes submitted input. */
export function messageForStatus(status: number, body: ApiErrorBody | undefined): string {
  const detail = body?.detail ?? (typeof body?.error === "string" ? body.error : undefined);
  switch (status) {
    case 400:
    case 422: {
      if (body?.details?.length) {
        const fields = body.details
          .map((d) => d.loc?.filter((part) => part !== "body").join(" → "))
          .filter((loc): loc is string => Boolean(loc));
        return fields.length
          ? `A few details weren't accepted (${Array.from(new Set(fields)).join(", ")}). Please check them and try again.`
          : "A few details weren't accepted. Please check them and try again.";
      }
      return detail && detail !== "validation_error"
        ? `${capitalise(detail)}.`
        : "A few details weren't accepted. Please check them and try again.";
    }
    case 404:
      return "We couldn't find that. If you cleared your data, please join again.";
    case 409:
      return detail ? `${capitalise(detail)}.` : "That clashes with something that already exists.";
    case 429:
      return "That's a lot of requests in a short time. Please wait a minute and try again.";
    default:
      if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
      return "Something went wrong. Please try again.";
  }
}

/** Backend details name fields ("home_station must be..."); make them read like words. */
function capitalise(text: string): string {
  const words = text.replace(/\buniversity_hub\b/g, "campus station").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function friendlyMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  return "Something unexpected happened. Please try again.";
}
