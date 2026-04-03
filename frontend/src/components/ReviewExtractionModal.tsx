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

export type ReviewSaveMeta = {
  /** Parallel to `rows`: existing log entry id after auto-save, or undefined for new rows. */
  serverIds: (number | undefined)[];
};

type Props = {
  open: boolean;
  transcript: string;
  logDate: string;
  /** Scoped profile user id (passed through for consistency with save flows). */
  userId: number;
  /** How the input was produced; used in dev JSON export and filename. */
  extractSourceType: ExtractSourceType;
  extraction: ExtractLogsResponse | null;
  extractionLoading: boolean;
  extractionError: string | null;
  /** When set and lengths match extracted rows, saves become updates (PATCH) instead of duplicate inserts. */
  initialServerIds?: number[] | null;
  onRetryExtract: () => void;
  onSave: (rows: LogRow[], meta?: ReviewSaveMeta) => Promise<void>;
  onDiscard: () => void;
};

function compactEntryTitle(row: LogRow, index: number): string {
  const e = row.event?.trim();
  if (e) return e.length > 72 ? `${e.slice(0, 71)}…` : e;
  return `Entry ${index + 1}`;
}

function compactEntrySubtitle(row: LogRow): string {
  const timeParts: string[] = [];
  if (row.start_time?.trim()) timeParts.push(row.start_time.trim());
  if (row.end_time?.trim()) timeParts.push(row.end_time.trim());
  const times = timeParts.length ? timeParts.join(" → ") : null;
  const metrics: string[] = [];
  if (row.energy_level != null) metrics.push(`Energy ${row.energy_level}`);
  if (row.anxiety != null) metrics.push(`Anxiety ${row.anxiety}`);
  if (row.contentment != null) metrics.push(`Contentment ${row.contentment}`);
  if (row.focus != null) metrics.push(`Focus ${row.focus}`);
  const m = metrics.slice(0, 3).join(" · ");
  const seg = [times, m].filter(Boolean).join(" · ");
  if (seg) return seg;
  const c = row.comments?.trim();
  if (c) return c.length > 56 ? `${c.slice(0, 55)}…` : c;
  return "No details yet";
}

export default function ReviewExtractionModal({
  open,
  transcript,
  logDate,
  userId: _userId,
  extractSourceType,
  extraction,
  extractionLoading,
  extractionError,
  initialServerIds = null,
  onRetryExtract,
  onSave,
  onDiscard,
}: Props) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [rowServerIds, setRowServerIds] = useState<(number | undefined)[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const rowsTouched = useRef(false);
  const lastExtractionKey = useRef<string | null>(null);
  const [fullDetailsOpen, setFullDetailsOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      rowsTouched.current = false;
      lastExtractionKey.current = null;
      setRows([]);
      setRowServerIds([]);
      setFullDetailsOpen(false);
      return;
    }
    setSaveError(null);
    rowsTouched.current = false;
    setRows([]);
    setRowServerIds([]);
    lastExtractionKey.current = null;
  }, [open]);

  useEffect(() => {
    if (!open || !extraction) return;
    const key = JSON.stringify(extraction);
    if (lastExtractionKey.current === key) return;
    lastExtractionKey.current = key;
    if (rowsTouched.current) return;
    const r = extraction.rows ?? [];
    setRows(r.map((row) => ({ ...emptyRow(), ...row })));
    const ids =
      initialServerIds != null && initialServerIds.length === r.length ? initialServerIds : undefined;
    setRowServerIds(ids ?? r.map(() => undefined));
  }, [open, extraction, initialServerIds]);

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
    setRowServerIds((prev) => [...prev, undefined]);
  };
  const removeRow = (i: number) => {
    rowsTouched.current = true;
    setRows((prev) => prev.filter((_, j) => j !== i));
    setRowServerIds((prev) => prev.filter((_, j) => j !== i));
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(rows, { serverIds: rowServerIds });
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
      <div
        className={`review-sheet ${fullDetailsOpen ? "review-sheet--details-open" : "review-sheet--compact-first"}`}
        role="dialog"
        aria-labelledby="review-title"
        aria-modal="true"
      >
        <div className={`review-sheet-scroll ${fullDetailsOpen ? "" : "review-sheet-scroll--compact"}`}>
          <div className="review-sheet-head">
            <p className="review-sheet-eyebrow">Review</p>
            <h2 id="review-title" className="review-sheet-title-date mono">
              {logDate}
            </h2>
            {fullDetailsOpen ? (
              <p className="review-sheet-sub">Edits are saved only when you tap Save below.</p>
            ) : (
              <p className="review-sheet-sub review-sheet-sub--light">Check the summary, then save or edit details.</p>
            )}
          </div>

          <section className="review-block review-block--tight-top">
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
            {!extractionLoading && extraction && (
              <p className={`summary-text ${fullDetailsOpen ? "" : "summary-text--compact"}`}>
                {extraction.transcript_summary || "—"}
              </p>
            )}
          </section>

          <section className="review-block">
            <div className="review-block-head">
              <h3 className="review-block-title">Entries</h3>
              {fullDetailsOpen ? (
                <button type="button" className="btn btn-minimal small" onClick={addRow}>
                  + Add
                </button>
              ) : null}
            </div>

            {!fullDetailsOpen ? (
              <>
                <div className="review-entry-preview-stack">
                  {rows.length === 0 && !extractionLoading && (
                    <p className="muted review-rows-empty">No entries yet. Retry extraction or use Edit details to add a row.</p>
                  )}
                  {rows.map((row, i) => (
                    <div key={i} className="review-entry-preview">
                      <div className="review-entry-preview-body">
                        <p className="review-entry-preview-title">{compactEntryTitle(row, i)}</p>
                        <p className="review-entry-preview-meta muted small">{compactEntrySubtitle(row)}</p>
                      </div>
                      <button
                        type="button"
                        className="review-entry-preview-remove linkish"
                        onClick={() => removeRow(i)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="review-compact-actions">
                  <button
                    type="button"
                    className="btn ghost small review-edit-details-btn"
                    onClick={() => setFullDetailsOpen(true)}
                  >
                    Edit details
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="review-expanded-toolbar">
                  <button
                    type="button"
                    className="btn btn-text small review-hide-details-btn"
                    onClick={() => setFullDetailsOpen(false)}
                  >
                    Hide details
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
              </>
            )}
          </section>

          <details className="transcript-details">
            <summary className="transcript-details-summary">
              <span className="transcript-details-label">Original input</span>
              <span className="transcript-details-cue" aria-hidden="true" />
            </summary>
            <div className="transcript-panel">
              <p className="transcript-body">{transcript || "—"}</p>
            </div>
          </details>

          {canDownloadExtract && (
            <details className="review-dev-details">
              <summary className="review-dev-details-summary">Developer</summary>
              <div className="review-dev-details-body">
                <button type="button" className="btn btn-text small review-dev-download" onClick={downloadExtractionJson}>
                  Download JSON (dev)
                </button>
              </div>
            </details>
          )}

          {saveError && <p className="error-inline review-save-error">{saveError}</p>}
          <div className="review-scroll-spacer" aria-hidden="true" />
        </div>

        <div className="review-sticky-footer">
          <button type="button" className="btn btn-discard-footer" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
          <div className="review-footer-save-row">
            <button
              type="button"
              className="btn primary btn-save-footer"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
