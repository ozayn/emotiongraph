export type User = {
  id: number;
  name: string;
  email: string;
  /** Optional preferred form of address; UI falls back to `name` when null or empty. */
  display_name: string | null;
  /** Saved IANA override, or null to use the device/browser zone on the client. */
  timezone: string | null;
  created_at: string;
  /** From server allowlist (ADMIN_EMAIL_ALLOWLIST); used to gate /admin UI. */
  is_admin?: boolean;
  /** From server allowlist (OWNER_EMAIL_ALLOWLIST); used to gate /owner and owner-only APIs. */
  is_owner?: boolean;
};

/** GET /owner/summary (owner allowlist + Bearer). */
export type OwnerSummary = {
  environment: {
    database_profile: string;
    cors_allowed_origin_count: number;
    allow_unauthenticated_full_user_list: boolean;
    allow_public_demo_user_list: boolean;
    allow_x_user_id_any: boolean;
    admin_allowlist_configured: boolean;
    owner_allowlist_configured: boolean;
  };
  migrations: {
    current_revisions: string[];
    script_head_revision: string | null;
    script_has_multiple_heads: boolean;
    database_at_head: boolean | null;
  };
  usage: {
    user_count: number;
    log_entry_count: number;
    tracker_field_definition_count: number;
  };
  debug: {
    log_save_dry_run_post_path: string;
    note: string;
  };
};

/** Phase 1 custom tracker values (manual-only); not used in CSV/extraction/insights. */
export type LogCustomValue = {
  field_definition_id: number;
  value_text: string | null;
  value_number: number | null;
  select_option_id: number | null;
};

export type LogRow = {
  start_time: string | null;
  end_time: string | null;
  event: string | null;
  energy_level: number | null;
  anxiety: number | null;
  contentment: number | null;
  focus: number | null;
  /** Optional experimental 0–3 intensity; not used in core summaries or extraction. */
  anger: number | null;
  /** Prefer tracker option strings; legacy free text may still appear from older rows. */
  music: string | null;
  comments: string | null;
  /** Sent on save; omitted or empty defaults to "manual" on the server. */
  source_type?: "manual" | "voice" | "text" | "import";
};

export type SavedLogEntry = LogRow & {
  id: number;
  user_id: number;
  log_date: string;
  created_at: string;
  source_type: "manual" | "voice" | "text" | "import";
  custom_values?: LogCustomValue[];
};

/** Response from POST /debug/logs (dry-run save diagnostics). Requires owner allowlist on the server. */
export type DebugLogsSaveResponse = {
  user_id: number;
  log_date: string;
  row_count: number;
  rows: LogRow[];
};

/** One row from CSV import preview / commit (matches backend LogImportRowIn). */
export type LogImportRow = {
  log_date: string;
  start_time: string | null;
  end_time: string | null;
  event: string | null;
  energy_level: number | null;
  anxiety: number | null;
  contentment: number | null;
  focus: number | null;
  anger: number | null;
  music: string | null;
  comments: string | null;
  cycle_day: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
};

export type LogsImportPreviewResponse = {
  rows: LogImportRow[];
  parse_errors: string[];
  row_count: number;
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
  custom_values?: LogCustomValue[];
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
  anger: number | null;
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
