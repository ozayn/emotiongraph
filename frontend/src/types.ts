export type LogRow = {
  start_time: string | null;
  end_time: string | null;
  event: string | null;
  event_category: string | null;
  energy_level: number | null;
  anxiety: number | null;
  contentment: number | null;
  focus: number | null;
  music: string | null;
  comments: string | null;
};

export type SavedLogEntry = LogRow & { id: number; log_date: string };

export type ExtractLogsResponse = {
  transcript_summary: string;
  rows: LogRow[];
};
