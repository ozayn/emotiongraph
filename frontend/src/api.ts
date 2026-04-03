import { getBrowserIanaTimeZone, wallClockHHMMInTimeZone } from "./datesTz";
import type {
  DebugLogsSaveResponse,
  ExtractLogsResponse,
  InsightsPayload,
  LogCustomValue,
  LogImportRow,
  LogRow,
  LogsImportPreviewResponse,
  OwnerSummary,
  SavedLogEntry,
  TrackerDay,
  User,
} from "./types";

const base = () => import.meta.env.VITE_API_BASE ?? "";

const PRIVATE_TOKEN_KEY = "emotiongraph_private_access_token";

function privateAccessToken(): string | null {
  try {
    const t = localStorage.getItem(PRIVATE_TOKEN_KEY);
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

/** Authorization header when the private app has stored a JWT (same key as PrivateAuthProvider). */
export function authHeaders(): Record<string, string> {
  const t = privateAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Private (non-demo) calls that must identify the current user (e.g. /tracker-config). */
export function headersForAuthenticatedUser(userId: number): Record<string, string> {
  const a = authHeaders();
  if (a.Authorization) {
    return { ...a };
  }
  return { "X-User-Id": String(userId) };
}

function userScopedHeaders(userId: number): Record<string, string> {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("Invalid user id for scoped request");
  }
  return { "X-User-Id": String(userId) };
}

function isPublicDemoRoute(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/demo" || p.startsWith("/demo/");
}

/** Mark requests from the `/demo` UI so the API can restrict user scope to the Test sandbox. */
function demoPublicHeaders(): Record<string, string> {
  return isPublicDemoRoute() ? { "X-Public-Demo": "1" } : {};
}

/**
 * Prefer Bearer on the private app (`/`). On `/demo/*`, never send the private JWT — otherwise
 * GET /users and scoped routes resolve to the signed-in private user (e.g. Azin) instead of Test.
 */
function scopedAuthHeaders(userId: number): Record<string, string> {
  if (isPublicDemoRoute()) {
    return { ...userScopedHeaders(userId), ...demoPublicHeaders() };
  }
  const a = authHeaders();
  if (a.Authorization) {
    return a;
  }
  return { ...userScopedHeaders(userId), ...demoPublicHeaders() };
}

export class ApiUnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ApiUnauthorizedError";
  }
}

/** Positive integer ids from the server; avoids user-scoped HTTP calls before selection is ready. */
function isReadyUserId(userId: number): boolean {
  return Number.isInteger(userId) && userId > 0;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* keep text */
    }
    throw new Error(detail || res.statusText);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type { OwnerSummary };

/** Owner-only dashboard payload; requires Bearer JWT and OWNER_EMAIL_ALLOWLIST. */
export async function fetchOwnerSummary(): Promise<OwnerSummary> {
  const res = await fetch(`${base()}/owner/summary`, { headers: { ...authHeaders() } });
  if (res.status === 401) {
    throw new ApiUnauthorizedError();
  }
  return parseJson(res);
}

export async function fetchUsers(isDemoRealm = false): Promise<User[]> {
  const headers: Record<string, string> = {};
  if (!isDemoRealm) {
    Object.assign(headers, authHeaders());
  }
  if (isDemoRealm) {
    headers["X-Public-Demo"] = "1";
  }
  const res = await fetch(`${base()}/users`, { headers });
  if (res.status === 401) {
    throw new ApiUnauthorizedError();
  }
  return parseJson(res);
}

export type GoogleAuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
};

export async function postGoogleAuth(credential: string): Promise<GoogleAuthResponse> {
  const res = await fetch(`${base()}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  return parseJson(res);
}

export async function patchUserTimezone(userId: number, timezone: string | null): Promise<User> {
  const res = await fetch(`${base()}/user/timezone`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify({ timezone }),
  });
  return parseJson(res);
}

export async function patchUserDisplayName(userId: number, displayName: string | null): Promise<User> {
  const res = await fetch(`${base()}/user/display-name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify({ display_name: displayName }),
  });
  return parseJson(res);
}

export async function transcribeAudio(blob: Blob, filename: string): Promise<{ transcript: string }> {
  const fd = new FormData();
  fd.append("audio", blob, filename);
  const res = await fetch(`${base()}/transcribe`, { method: "POST", body: fd });
  return parseJson(res);
}

/** Client device wall clock as HH:MM (24h); same instant as wallClockHHMMInTimeZone(browser TZ). */
export function localWallClockHHMM(): string {
  return wallClockHHMMInTimeZone(getBrowserIanaTimeZone());
}

export async function extractLogs(
  transcript: string,
  logDate: string,
  options?: { captureTimeLocal?: string | null; timezone?: string | null; captureKind?: "voice" | "text" },
): Promise<ExtractLogsResponse> {
  const savedTz = options?.timezone?.trim() || null;
  /** IANA zone for wall clock + model context: saved preference, else this device. */
  const effectiveIana = savedTz ?? getBrowserIanaTimeZone();
  const capture_time_local =
    options?.captureTimeLocal === undefined
      ? wallClockHHMMInTimeZone(effectiveIana)
      : options.captureTimeLocal === null
        ? undefined
        : options.captureTimeLocal;
  const body: Record<string, unknown> = {
    transcript,
    log_date: logDate,
    capture_kind: options?.captureKind ?? "text",
  };
  if (capture_time_local != null) {
    body.capture_time_local = capture_time_local;
  }
  body.timezone = effectiveIana;
  const res = await fetch(`${base()}/extract-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function saveLogs(userId: number, logDate: string, rows: LogRow[]): Promise<SavedLogEntry[]> {
  const res = await fetch(`${base()}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify({ log_date: logDate, rows }),
  });
  return parseJson(res);
}

/** Same JSON body as saveLogs but POST /debug/logs (no DB write). Server requires owner allowlist. */
export async function debugSaveLogsPayload(
  userId: number,
  logDate: string,
  rows: LogRow[],
): Promise<DebugLogsSaveResponse> {
  const res = await fetch(`${base()}/debug/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify({ log_date: logDate, rows }),
  });
  return parseJson(res);
}

export async function previewLogsImportCsv(userId: number, file: File): Promise<LogsImportPreviewResponse> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch(`${base()}/logs/import-csv/preview`, {
    method: "POST",
    headers: { ...scopedAuthHeaders(userId) },
    body: fd,
  });
  return parseJson(res);
}

export async function commitLogsImport(userId: number, rows: LogImportRow[]): Promise<SavedLogEntry[]> {
  const res = await fetch(`${base()}/logs/import-rows`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify({ rows }),
  });
  return parseJson(res);
}

export type UserScopedFetchOptions = {
  signal?: AbortSignal;
};

export async function fetchLogs(
  userId: number,
  logDate: string,
  options?: UserScopedFetchOptions,
): Promise<SavedLogEntry[]> {
  if (!isReadyUserId(userId) || !logDate.trim()) {
    return [];
  }
  const q = new URLSearchParams({ log_date: logDate });
  const res = await fetch(`${base()}/logs?${q.toString()}`, {
    headers: { ...scopedAuthHeaders(userId) },
    signal: options?.signal,
  });
  return parseJson(res);
}

export async function fetchLogsRange(
  userId: number,
  startDate: string,
  endDate: string,
  options?: UserScopedFetchOptions,
): Promise<SavedLogEntry[]> {
  if (!isReadyUserId(userId) || !startDate.trim() || !endDate.trim()) {
    return [];
  }
  const q = new URLSearchParams({ start_date: startDate, end_date: endDate });
  const res = await fetch(`${base()}/logs?${q.toString()}`, {
    headers: { ...scopedAuthHeaders(userId) },
    signal: options?.signal,
  });
  return parseJson(res);
}

export type LogEntryPatchBody = {
  log_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  event?: string | null;
  energy_level?: number | null;
  anxiety?: number | null;
  contentment?: number | null;
  focus?: number | null;
  anger?: number | null;
  music?: string | null;
  comments?: string | null;
  source_type?: "manual" | "voice" | "text" | "import";
};

export async function patchLog(userId: number, entryId: number, body: LogEntryPatchBody): Promise<SavedLogEntry> {
  const res = await fetch(`${base()}/logs/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function deleteLog(userId: number, entryId: number): Promise<void> {
  const res = await fetch(`${base()}/logs/${entryId}`, {
    method: "DELETE",
    headers: { ...scopedAuthHeaders(userId) },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* keep text */
    }
    throw new Error(detail || res.statusText);
  }
}

export async function fetchTrackerDay(
  userId: number,
  logDate: string,
  options?: UserScopedFetchOptions,
): Promise<TrackerDay> {
  if (!isReadyUserId(userId) || !logDate.trim()) {
    return {
      log_date: logDate,
      cycle_day: null,
      sleep_hours: null,
      sleep_quality: null,
    };
  }
  const q = new URLSearchParams({ log_date: logDate });
  const res = await fetch(`${base()}/tracker-day?${q.toString()}`, {
    headers: { ...scopedAuthHeaders(userId) },
    signal: options?.signal,
  });
  return parseJson(res);
}

export async function saveTrackerDay(userId: number, body: TrackerDay): Promise<TrackerDay> {
  const res = await fetch(`${base()}/tracker-day`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function putLogEntryCustomValues(
  userId: number,
  entryId: number,
  values: LogCustomValue[],
): Promise<SavedLogEntry> {
  const res = await fetch(`${base()}/logs/${entryId}/custom-values`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify({ values }),
  });
  return parseJson(res);
}

export async function putTrackerDayCustomValues(
  userId: number,
  logDate: string,
  values: LogCustomValue[],
): Promise<TrackerDay> {
  const res = await fetch(`${base()}/tracker-day/custom-values`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...scopedAuthHeaders(userId) },
    body: JSON.stringify({ log_date: logDate, values }),
  });
  return parseJson(res);
}

export async function fetchInsights(
  userId: number,
  startDate: string,
  endDate: string,
  options?: UserScopedFetchOptions,
): Promise<InsightsPayload> {
  if (!isReadyUserId(userId) || !startDate.trim() || !endDate.trim()) {
    throw new Error("User and date range are required");
  }
  const q = new URLSearchParams({ start_date: startDate, end_date: endDate });
  const res = await fetch(`${base()}/insights?${q.toString()}`, {
    headers: { ...scopedAuthHeaders(userId) },
    signal: options?.signal,
  });
  return parseJson(res);
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].replace(/^["']|["']$/g, "").trim());
    } catch {
      /* fall through */
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted) return quoted[1];
  const bare = /filename=([^;\s]+)/i.exec(header);
  if (bare) return bare[1].replace(/^["']|["']$/g, "");
  return fallback;
}

/** Download CSV for the current user and date range (uses X-User-Id). */
export async function downloadLogsCsvExport(userId: number, startDate: string, endDate: string): Promise<void> {
  if (!isReadyUserId(userId) || !startDate.trim() || !endDate.trim()) {
    throw new Error("User and date range are required");
  }
  const q = new URLSearchParams({ start_date: startDate, end_date: endDate });
  const res = await fetch(`${base()}/export/logs-csv?${q.toString()}`, {
    headers: { ...scopedAuthHeaders(userId) },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* keep text */
    }
    throw new Error(detail || res.statusText);
  }
  const blob = await res.blob();
  const fallback = `emotiongraph_export_${startDate}_to_${endDate}.csv`;
  const filename = filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallback);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
