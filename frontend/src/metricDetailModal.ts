import type { InsightsRecentEntry, SavedLogEntry } from "./types";
import { formatAnxiety, formatContentment, formatEnergy, formatFocus } from "./trackerOptions";

export type EmotionMetricKey = "energy" | "anxiety" | "contentment" | "focus";

export type TrackerMetricKey = "sleep_quality" | "cycle_day" | "sleep_hours";

export type MetricModalState = { category: "emotion"; key: EmotionMetricKey } | { category: "tracker"; key: TrackerMetricKey };

const EMOTION_FIELD: Record<EmotionMetricKey, keyof SavedLogEntry> = {
  energy: "energy_level",
  anxiety: "anxiety",
  contentment: "contentment",
  focus: "focus",
};

export const EMOTION_MODAL_META: Record<
  EmotionMetricKey,
  { label: string; scale: string; blurb: string }
> = {
  energy: {
    label: "Energy",
    scale: "1–3 scale (low to high)",
    blurb: "How energized you felt when you logged this check-in. The card shows the average of every value recorded in the selected period.",
  },
  anxiety: {
    label: "Anxiety",
    scale: "0–3 scale (none to strong)",
    blurb: "How tense or anxious you felt. Higher means more intensity; zero means you marked none for that entry.",
  },
  contentment: {
    label: "Contentment",
    scale: "1–3 scale",
    blurb: "How settled, calm, or content you felt — a companion to energy and anxiety in your day.",
  },
  focus: {
    label: "Focus",
    scale: "1–5 scale",
    blurb: "How able you were to concentrate or stay on task when you saved the entry.",
  },
};

export const TRACKER_MODAL_META: Record<
  TrackerMetricKey,
  { label: string; scale: string; blurb: string }
> = {
  sleep_quality: {
    label: "Sleep quality",
    scale: "1–5 average",
    blurb: "From your day context: subjective sleep quality for dates where you filled it in.",
  },
  cycle_day: {
    label: "Cycle day",
    scale: "Day number",
    blurb: "Cycle day you logged in day context — useful alongside mood and sleep over time.",
  },
  sleep_hours: {
    label: "Sleep hours",
    scale: "Hours",
    blurb: "Hours of sleep recorded in day context for the dates that include it.",
  },
};

export function formatEmotionModalValue(key: EmotionMetricKey, raw: number | null): string {
  if (raw == null) return "—";
  switch (key) {
    case "energy":
      return formatEnergy(raw);
    case "anxiety":
      return formatAnxiety(raw);
    case "contentment":
      return formatContentment(raw);
    case "focus":
      return formatFocus(raw);
    default:
      return String(raw);
  }
}

export function averageEmotionFromEntries(entries: SavedLogEntry[], key: EmotionMetricKey): number | null {
  const field = EMOTION_FIELD[key];
  const vals = entries.map((e) => e[field] as number | null | undefined).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function recentEmotionSamplesFromSaved(entries: SavedLogEntry[], key: EmotionMetricKey, limit = 5) {
  const field = EMOTION_FIELD[key];
  const sorted = [...entries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const out: { timeLabel: string; value: string }[] = [];
  for (const e of sorted) {
    const v = e[field] as number | null | undefined;
    if (v == null) continue;
    out.push({ timeLabel: formatTimeShort(e.created_at), value: formatEmotionModalValue(key, v) });
    if (out.length >= limit) break;
  }
  return out;
}

export function recentEmotionSamplesFromInsights(entries: InsightsRecentEntry[], key: EmotionMetricKey, limit = 5) {
  const field = EMOTION_FIELD[key] as keyof InsightsRecentEntry;
  const sorted = [...entries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const out: { timeLabel: string; value: string }[] = [];
  for (const e of sorted) {
    const v = e[field] as number | null | undefined;
    if (v == null) continue;
    out.push({ timeLabel: formatTimeShort(e.created_at), value: formatEmotionModalValue(key, v) });
    if (out.length >= limit) break;
  }
  return out;
}
