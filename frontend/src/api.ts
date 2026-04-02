import type {
  ExtractLogsResponse,
  InsightsPayload,
  LogRow,
  SavedLogEntry,
  TrackerDay,
  User,
} from "./types";

const base = () => import.meta.env.VITE_API_BASE ?? "";

function userScopedHeaders(userId: number): Record<string, string> {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("Invalid user id for scoped request");
  }
  return { "X-User-Id": String(userId) };
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

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${base()}/users`);
  return parseJson(res);
}

export async function transcribeAudio(blob: Blob, filename: string): Promise<{ transcript: string }> {
  const fd = new FormData();
  fd.append("audio", blob, filename);
  const res = await fetch(`${base()}/transcribe`, { method: "POST", body: fd });
  return parseJson(res);
}

export async function extractLogs(transcript: string, logDate: string): Promise<ExtractLogsResponse> {
  const res = await fetch(`${base()}/extract-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, log_date: logDate }),
  });
  return parseJson(res);
}

export async function saveLogs(userId: number, logDate: string, rows: LogRow[]): Promise<SavedLogEntry[]> {
  const res = await fetch(`${base()}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...userScopedHeaders(userId) },
    body: JSON.stringify({ log_date: logDate, rows }),
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
    headers: { ...userScopedHeaders(userId) },
    signal: options?.signal,
  });
  return parseJson(res);
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
    headers: { ...userScopedHeaders(userId) },
    signal: options?.signal,
  });
  return parseJson(res);
}

export async function saveTrackerDay(userId: number, body: TrackerDay): Promise<TrackerDay> {
  const res = await fetch(`${base()}/tracker-day`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...userScopedHeaders(userId) },
    body: JSON.stringify(body),
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
    headers: { ...userScopedHeaders(userId) },
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
    headers: { ...userScopedHeaders(userId) },
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
