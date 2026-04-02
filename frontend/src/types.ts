export type User = {
  id: number;
  name: string;
  email: string;
  created_at: string;
};

export type LogRow = {
  start_time: string | null;
  end_time: string | null;
  event: string | null;
  energy_level: number | null;
  anxiety: number | null;
  contentment: number | null;
  focus: number | null;
  /** Prefer tracker option strings; legacy free text may still appear from older rows. */
  music: string | null;
  comments: string | null;
  /** Sent on save; omitted or empty defaults to "manual" on the server. */
  source_type?: "manual" | "voice" | "text";
};

export type SavedLogEntry = LogRow & {
  id: number;
  user_id: number;
  log_date: string;
  created_at: string;
  source_type: "manual" | "voice" | "text";
};

export type ExtractLogsResponse = {
  transcript_summary: string;
  rows: LogRow[];
  /** Present when the extraction API returns day-level context (optional / forward-compatible). */
  day_context?: unknown;
};

export type TrackerDay = {
  /** Present on GET responses; omit on PUT (server uses X-User-Id). */
  user_id?: number;
  log_date: string;
  cycle_day: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
};

export type InsightsSummary = {
  entry_count: number;
  days_with_entries: number;
  avg_energy: number | null;
  avg_anxiety: number | null;
  avg_contentment: number | null;
  avg_focus: number | null;
};

export type InsightsDailyPoint = {
  log_date: string;
  entry_count: number;
  avg_energy: number | null;
  avg_anxiety: number | null;
  avg_contentment: number | null;
  avg_focus: number | null;
};

export type InsightsRecentEntry = {
  id: number;
  log_date: string;
  created_at: string;
  event: string | null;
  energy_level: number | null;
  anxiety: number | null;
  contentment: number | null;
  focus: number | null;
  source_type: string;
};

export type InsightsEventPattern = {
  event_label: string;
  count: number;
  avg_energy: number | null;
  avg_anxiety: number | null;
  avg_contentment: number | null;
  avg_focus: number | null;
};

export type InsightsTrackerSummary = {
  days_with_tracker: number;
  has_data: boolean;
  avg_sleep_quality: number | null;
  avg_cycle_day: number | null;
  avg_sleep_hours: number | null;
};

export type InsightsTrackerDailyPoint = {
  log_date: string;
  sleep_quality: number | null;
  cycle_day: number | null;
  sleep_hours: number | null;
};

export type InsightsPayload = {
  start_date: string;
  end_date: string;
  summary: InsightsSummary;
  daily: InsightsDailyPoint[];
  recent_entries: InsightsRecentEntry[];
  event_patterns: InsightsEventPattern[];
  tracker_summary: InsightsTrackerSummary;
  tracker_daily: InsightsTrackerDailyPoint[];
};
