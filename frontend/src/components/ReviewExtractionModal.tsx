import { useEffect, useRef, useState } from "react";
import type { ExtractLogsResponse, LogRow } from "../types";

const FIELDS: { key: keyof LogRow; label: string; type?: "number" }[] = [
  { key: "start_time", label: "Start" },
  { key: "end_time", label: "End" },
  { key: "event", label: "Event" },
  { key: "event_category", label: "Category" },
  { key: "energy_level", label: "Energy", type: "number" },
  { key: "anxiety", label: "Anxiety", type: "number" },
  { key: "contentment", label: "Contentment", type: "number" },
  { key: "focus", label: "Focus", type: "number" },
  { key: "music", label: "Music" },
  { key: "comments", label: "Comments" },
];

function emptyRow(): LogRow {
  return {
    start_time: null,
    end_time: null,
    event: null,
    event_category: null,
    energy_level: null,
    anxiety: null,
    contentment: null,
    focus: null,
    music: null,
    comments: null,
  };
}

type Props = {
  open: boolean;
  transcript: string;
  logDate: string;
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

  const updateCell = (i: number, field: keyof LogRow, raw: string) => {
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

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-labelledby="review-title">
        <div className="modal-head">
          <h2 id="review-title">Review voice log</h2>
          <p className="modal-sub">
            Date <span className="mono">{logDate}</span> — confirm or edit before saving. Nothing is stored until you
            save.
          </p>
        </div>

        <section className="review-section">
          <h3>Transcript</h3>
          <textarea className="transcript-box" readOnly value={transcript} rows={6} />
        </section>

        <section className="review-section">
          <div className="review-section-head">
            <h3>Extracted summary</h3>
            {extractionLoading && <span className="pill">Extracting…</span>}
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
            <p className="summary-text">{extraction.transcript_summary || "—"}</p>
          )}
        </section>

        <section className="review-section">
          <div className="review-section-head">
            <h3>Rows</h3>
            <button type="button" className="btn ghost small" onClick={addRow}>
              Add row
            </button>
          </div>
          <div className="rows-scroll">
            {rows.length === 0 && !extractionLoading && (
              <p className="muted">No rows yet. Add a row or retry extraction.</p>
            )}
            {rows.map((row, i) => (
              <div key={i} className="row-card">
                <div className="row-card-head">
                  <span className="mono muted">#{i + 1}</span>
                  <button type="button" className="btn ghost small" onClick={() => removeRow(i)}>
                    Remove
                  </button>
                </div>
                <div className="row-grid">
                  {FIELDS.map(({ key, label, type }) => (
                    <label key={key} className="field">
                      <span>{label}</span>
                      <input
                        type={type === "number" ? "number" : "text"}
                        value={row[key] ?? ""}
                        onChange={(e) => updateCell(i, key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {saveError && <p className="error-inline">{saveError}</p>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
          <button type="button" className="btn primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save to log"}
          </button>
        </div>
      </div>
    </div>
  );
}
