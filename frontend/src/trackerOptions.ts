import type { LogRow } from "./types";

export const ENERGY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "1", label: "1 — Low energy" },
  { value: "2", label: "2 — Neutral" },
  { value: "3", label: "3 — High energy" },
];

export const ANXIETY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "0", label: "0 — Not at all" },
  { value: "1", label: "1 — A little" },
  { value: "2", label: "2 — Moderately" },
  { value: "3", label: "3 — Very much" },
];

export const CONTENTMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "1", label: "1 — A little" },
  { value: "2", label: "2 — Moderately" },
  { value: "3", label: "3 — Very much" },
];

export const FOCUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "1", label: "1 — Distracted" },
  { value: "2", label: "2 — Mostly distracted" },
  { value: "3", label: "3 — Mixed" },
  { value: "4", label: "4 — Mostly focused" },
  { value: "5", label: "5 — Deep focus" },
];

export const MUSIC_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "No", label: "No" },
  { value: "Yes, upbeat", label: "Yes, upbeat" },
  { value: "Yes, calm", label: "Yes, calm" },
  { value: "Yes, other", label: "Yes, other" },
];

export const SLEEP_QUALITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "1", label: "1 — Very poor" },
  { value: "2", label: "2 — Poor" },
  { value: "3", label: "3 — OK" },
  { value: "4", label: "4 — Good" },
  { value: "5", label: "5 — Excellent" },
];

const energyLabel: Record<number, string> = { 1: "Low energy", 2: "Neutral", 3: "High energy" };
const anxietyLabel: Record<number, string> = {
  0: "Not at all",
  1: "A little",
  2: "Moderately",
  3: "Very much",
};
const contentmentLabel: Record<number, string> = { 1: "A little", 2: "Moderately", 3: "Very much" };
const focusLabel: Record<number, string> = {
  1: "Distracted",
  2: "Mostly distracted",
  3: "Mixed",
  4: "Mostly focused",
  5: "Deep focus",
};

export function formatEnergy(n: number): string {
  return energyLabel[n] ?? String(n);
}
export function formatAnxiety(n: number): string {
  return anxietyLabel[n] ?? String(n);
}
export function formatContentment(n: number): string {
  return contentmentLabel[n] ?? String(n);
}
export function formatFocus(n: number): string {
  return focusLabel[n] ?? String(n);
}

export function formatSleepQuality(n: number): string {
  const o = SLEEP_QUALITY_OPTIONS.find((x) => x.value === String(n));
  return o?.label.replace(/^\d+\s—\s/, "") ?? String(n);
}

/** Compact labels aligned with the entries table (En / Ax / Co / Fo). */
export const EMOTION_METRIC_ABBR = {
  energy: "En",
  anxiety: "Ax",
  contentment: "Co",
  focus: "Fo",
} as const;

export type EmotionMetricAbbrKey = keyof typeof EMOTION_METRIC_ABBR;

export function optionsForMetricKey(key: keyof Omit<LogRow, "source_type">): { value: string; label: string }[] | null {
  switch (key) {
    case "energy_level":
      return ENERGY_OPTIONS;
    case "anxiety":
      return ANXIETY_OPTIONS;
    case "contentment":
      return CONTENTMENT_OPTIONS;
    case "focus":
      return FOCUS_OPTIONS;
    case "music":
      return MUSIC_OPTIONS;
    default:
      return null;
  }
}
