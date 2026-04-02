import { useEffect, useRef, useState } from "react";
import type { ExtractLogsResponse, LogRow } from "../types";
import MetricSelect from "./MetricSelect";
import { optionsForMetricKey } from "../trackerOptions";

const FIELDS: { key: keyof Omit<LogRow, "source_type">; label: string }[] = [
  { key: "start_time", label: "Start" },
  { key: "end_time", label: "End" },
  { key: "event", label: "Event" },
  { key: "energy_level", label: "Energy" },
  { key: "anxiety", label: "Anxiety" },
  { key: "contentment", label: "Contentment" },
  { key: "focus", label: "Focus" },
  { key: "music", label: "Music" },
  { key: "comments", label: "Comments" },
];

function emptyRow(): LogRow {
  return {
    start_time: null,
    end_time: null,
    event: null,
    energy_level: null,
    anxiety: null,
    contentment: null,
    focus: null,
    music: null,
    comments: null,
  };
}

type ExtractSourceType = "voice" | "text";

function extractDownloadFilename(sourceType: ExtractSourceType, logDate: string): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `emotiongraph_extract_${sourceType}_${logDate}_${hh}${mm}.json`;
}

type Props = {
  open: boolean;
  transcript: string;
  logDate: string;
  /** How the input was produced; used in dev JSON export and filename. */
  extractSourceType: ExtractSourceType;
  extraction: ExtractLogsResponse | null;
  extractionLoading: boolean;
  extractionError: string | null;
  onRetryExtract: () => void;
  onSave: (rows: LogRow[]) => Promise<void>;
  onDiscard: () => void;
};

export default function ReviewExtractionModal({
  open,
  transcript,
  logDate,
  extractSourceType,
  extraction,
  extractionLoading,
  extractionError,
  onRetryExtract,
  onSave,
  onDiscard,
}: Props) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const rowsTouched = useRef(false);
  const lastExtractionKey = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      rowsTouched.current = false;
      lastExtractionKey.current = null;
      setRows([]);
      return;
    }
    setSaveError(null);
    rowsTouched.current = false;
    setRows([]);
  }, [open]);

  useEffect(() => {
    if (!open || !extraction) return;
    const key = JSON.stringify(extraction);
    if (lastExtractionKey.current === key) return;
    lastExtractionKey.current = key;
    if (rowsTouched.current) return;
    const r = extraction.rows ?? [];
    setRows(r.map((row) => ({ ...emptyRow(), ...row })));
  }, [open, extraction]);

  if (!open) return null;

  const updateCell = (i: number, field: keyof Omit<LogRow, "source_type">, raw: string) => {
    rowsTouched.current = true;
    setRows((prev) => {
      const next = [...prev];
      const row: LogRow = { ...emptyRow(), ...next[i] };
      const t = raw.trim();
      switch (field) {
        case "energy_level":
        case "anxiety":
        case "contentment":
        case "focus": {
          if (t === "") row[field] = null;
          else {
            const n = Number.parseInt(t, 10);
            row[field] = Number.isNaN(n) ? null : n;
          }
          break;
        }
        case "music":
          row.music = t === "" ? null : (t as LogRow["music"]);
          break;
        default:
          row[field] = t === "" ? null : t;
      }
      next[i] = row;
      return next;
    });
  };

  const addRow = () => {
    rowsTouched.current = true;
    setRows((prev) => [...prev, emptyRow()]);
  };
  const removeRow = (i: number) => {
    rowsTouched.current = true;
    setRows((prev) => prev.filter((_, j) => j !== i));
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(rows);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const downloadExtractionJson = () => {
    if (!extraction) return;
    const extracted_output: Record<string, unknown> = {
      transcript_summary: extraction.transcript_summary,
      summary: extraction.transcript_summary,
      rows,
    };
    if (extraction.day_context != null) {
      extracted_output.day_context = extraction.day_context;
    }
    const payload = {
      input_text: transcript,
      log_date: logDate,
      source_type: extractSourceType,
      extracted_output,
      created_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = extractDownloadFilename(extractSourceType, logDate);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const canDownloadExtract = Boolean(!extractionLoading && extraction);

  return (
    <div className="review-backdrop" role="presentation">
      <div className="review-sheet" role="dialog" aria-labelledby="review-title" aria-modal="true">
        <div className="review-sheet-scroll">
          <div className="review-sheet-head">
            <h2 id="review-title">Review</h2>
            <p className="review-sheet-sub">
              <span className="mono">{logDate}</span>
              <span className="review-sheet-sub-sep">·</span>
              <span>Edits are saved only when you confirm below.</span>
            </p>
            {canDownloadExtract && (
              <button
                type="button"
                className="btn btn-text small review-dev-download"
                onClick={downloadExtractionJson}
              >
                Download JSON (dev)
              </button>
            )}
          </div>

          <section className="review-block">
            <div className="review-block-head">
              <h3 className="review-block-title">Summary</h3>
              {extractionLoading && <span className="pill">Working…</span>}
            </div>
            {extractionError && (
              <p className="error-inline">
                {extractionError}{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    rowsTouched.current = false;
                    lastExtractionKey.current = null;
                    onRetryExtract();
                  }}
                >
                  Retry
                </button>
              </p>
            )}
            {!extractionLoading && extraction && <p className="summary-text">{extraction.transcript_summary || "—"}</p>}
          </section>

          <section className="review-block">
            <div className="review-block-head">
              <h3 className="review-block-title">Entries</h3>
              <button type="button" className="btn btn-minimal small" onClick={addRow}>
                + Add
              </button>
            </div>
            <div className="row-stack">
              {rows.length === 0 && !extractionLoading && (
                <p className="muted review-rows-empty">No entries yet. Add one or retry extraction.</p>
              )}
              {rows.map((row, i) => (
                <article key={i} className="entry-card">
                  <div className="entry-card-head">
                    <span className="entry-card-label">Entry {i + 1}</span>
                    <button type="button" className="btn btn-minimal small" onClick={() => removeRow(i)}>
                      Remove
                    </button>
                  </div>
                  <div className="entry-card-fields">
                    {FIELDS.map(({ key, label }) => {
                      const opts = optionsForMetricKey(key);
                      if (opts) {
                        return (
                          <MetricSelect
                            key={key}
                            label={label}
                            value={row[key] == null ? "" : String(row[key])}
                            onChange={(v) => updateCell(i, key, v)}
                            options={opts}
                          />
                        );
                      }
                      return (
                        <label key={key} className="field field--stacked">
                          <span>{label}</span>
                          <input
                            type="text"
                            value={row[key] ?? ""}
                            onChange={(e) => updateCell(i, key, e.target.value)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <details className="transcript-details" open>
            <summary className="transcript-details-summary">
              <span className="transcript-details-label">Transcript</span>
              <span className="transcript-details-cue" aria-hidden="true" />
            </summary>
            <div className="transcript-panel">
              <p className="transcript-body">{transcript || "—"}</p>
            </div>
          </details>

          {saveError && <p className="error-inline review-save-error">{saveError}</p>}
          <div className="review-scroll-spacer" aria-hidden="true" />
        </div>

        <div className="review-sticky-footer">
          <button type="button" className="btn btn-discard-footer" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
          <button type="button" className="btn primary btn-save-footer" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save to log"}
          </button>
        </div>
      </div>
    </div>
  );
}
