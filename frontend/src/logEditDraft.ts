import type { LogEntryPatchBody } from "./api";
import type { CalmSelectOption } from "./components/CalmSelect";
import type { LogRow, SavedLogEntry } from "./types";

export const ALLOWED_MUSIC = ["No", "Yes, upbeat", "Yes, calm", "Yes, other"] as const;

export const LOG_ADD_SOURCE_OPTIONS: CalmSelectOption[] = [
  { value: "manual", label: "Manual" },
  { value: "text", label: "Text" },
];

export const LOG_EDIT_SOURCE_OPTIONS: CalmSelectOption[] = [
  ...LOG_ADD_SOURCE_OPTIONS,
  { value: "voice", label: "Voice" },
  { value: "import", label: "Import" },
];

export type EditDraft = {
  log_date: string;
  start_time: string;
  end_time: string;
  event: string;
  energy_level: string;
  anxiety: string;
  contentment: string;
  focus: string;
  anger: string;
  music: string;
  comments: string;
  source_type: "manual" | "voice" | "text" | "import";
};

/** Collapsed list: short tokens for the four core metrics only (anger is omitted — see entry detail). */
export function compactMetricSummary(e: SavedLogEntry): string | null {
  const parts: string[] = [];
  if (e.energy_level != null) parts.push(`E${e.energy_level}`);
  if (e.anxiety != null) parts.push(`A${e.anxiety}`);
  if (e.contentment != null) parts.push(`C${e.contentment}`);
  if (e.focus != null) parts.push(`F${e.focus}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function normalizeSourceType(s: string): EditDraft["source_type"] {
  const t = s.trim().toLowerCase();
  if (t === "voice" || t === "text" || t === "manual" || t === "import") return t;
  return "manual";
}

export function entryToDraft(e: SavedLogEntry): EditDraft {
  return {
    log_date: e.log_date,
    start_time: e.start_time ?? "",
    end_time: e.end_time ?? "",
    event: e.event ?? "",
    energy_level: e.energy_level != null ? String(e.energy_level) : "",
    anxiety: e.anxiety != null ? String(e.anxiety) : "",
    contentment: e.contentment != null ? String(e.contentment) : "",
    focus: e.focus != null ? String(e.focus) : "",
    anger: e.anger != null ? String(e.anger) : "",
    music: e.music ?? "",
    comments: e.comments ?? "",
    source_type: normalizeSourceType(e.source_type ?? "manual"),
  };
}

export function parseMusic(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  return ALLOWED_MUSIC.includes(t as (typeof ALLOWED_MUSIC)[number]) ? t : null;
}

export function draftToNewLogRow(d: EditDraft): LogRow {
  const p = draftToPatch(d);
  return {
    start_time: p.start_time ?? null,
    end_time: p.end_time ?? null,
    event: p.event ?? null,
    energy_level: p.energy_level ?? null,
    anxiety: p.anxiety ?? null,
    contentment: p.contentment ?? null,
    focus: p.focus ?? null,
    anger: p.anger ?? null,
    music: p.music ?? null,
    comments: p.comments ?? null,
    source_type: p.source_type,
  };
}

export function emptyDraftForDate(logDate: string): EditDraft {
  return {
    log_date: logDate,
    start_time: "",
    end_time: "",
    event: "",
    energy_level: "",
    anxiety: "",
    contentment: "",
    focus: "",
    anger: "",
    music: "",
    comments: "",
    source_type: "manual",
  };
}

export function draftToPatch(d: EditDraft): LogEntryPatchBody {
  const num = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    log_date: d.log_date,
    start_time: d.start_time.trim() || null,
    end_time: d.end_time.trim() || null,
    event: d.event.trim() || null,
    energy_level: num(d.energy_level),
    anxiety: num(d.anxiety),
    contentment: num(d.contentment),
    focus: num(d.focus),
    anger: num(d.anger),
    music: parseMusic(d.music),
    comments: d.comments.trim() || null,
    source_type: d.source_type,
  };
}
