import type { ExtractLogsResponse, LogRow, SavedLogEntry } from "./types";

const base = () => import.meta.env.VITE_API_BASE ?? "";

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

export async function saveLogs(logDate: string, rows: LogRow[]): Promise<SavedLogEntry[]> {
  const res = await fetch(`${base()}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ log_date: logDate, rows }),
  });
  return parseJson(res);
}

export async function fetchLogs(logDate: string): Promise<SavedLogEntry[]> {
  const q = new URLSearchParams({ log_date: logDate });
  const res = await fetch(`${base()}/logs?${q.toString()}`);
  return parseJson(res);
}
