import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteLog, fetchLogsRange, patchLog, type LogEntryPatchBody } from "../api";
import MetricSelect from "../components/MetricSelect";
import type { SavedLogEntry } from "../types";
import {
  formatAnxiety,
  formatContentment,
  formatEnergy,
  formatFocus,
  optionsForMetricKey,
} from "../trackerOptions";

const ALLOWED_MUSIC = ["No", "Yes, upbeat", "Yes, calm", "Yes, other"] as const;

type EditDraft = {
  log_date: string;
  start_time: string;
  end_time: string;
  event: string;
  energy_level: string;
  anxiety: string;
  contentment: string;
  focus: string;
  music: string;
  comments: string;
  source_type: "manual" | "voice" | "text";
};

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function normalizeSourceType(s: string): "manual" | "voice" | "text" {
  const t = s.trim().toLowerCase();
  if (t === "voice" || t === "text" || t === "manual") return t;
  return "manual";
}

function entryToDraft(e: SavedLogEntry): EditDraft {
  return {
    log_date: e.log_date,
    start_time: e.start_time ?? "",
    end_time: e.end_time ?? "",
    event: e.event ?? "",
    energy_level: e.energy_level != null ? String(e.energy_level) : "",
    anxiety: e.anxiety != null ? String(e.anxiety) : "",
    contentment: e.contentment != null ? String(e.contentment) : "",
    focus: e.focus != null ? String(e.focus) : "",
    music: e.music ?? "",
    comments: e.comments ?? "",
    source_type: normalizeSourceType(e.source_type ?? "manual"),
  };
}

function parseMusic(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  return ALLOWED_MUSIC.includes(t as (typeof ALLOWED_MUSIC)[number]) ? t : null;
}

function draftToPatch(d: EditDraft): LogEntryPatchBody {
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
    music: parseMusic(d.music),
    comments: d.comments.trim() || null,
    source_type: d.source_type,
  };
}

type Props = { userId: number };

export default function LogsPage({ userId }: Props) {
  const [startDate, setStartDate] = useState(() => isoDaysAgo(60));
  const [endDate, setEndDate] = useState(isoToday);
  const [entries, setEntries] = useState<SavedLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedLogEntry | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rangeRef = useRef({ start: startDate, end: endDate });
  rangeRef.current = { start: startDate, end: endDate };

  const sheetTitleRef = useRef<HTMLHeadingElement>(null);

  const applyRange = useCallback(async () => {
    setLoadError(null);
    setActionError(null);
    setLoading(true);
    const { start, end } = rangeRef.current;
    try {
      const rows = await fetchLogsRange(userId, start, end);
      setEntries(rows);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void applyRange();
  }, [applyRange]);

  useEffect(() => {
    if (!draft) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setEditing(null);
        setDraft(null);
        setSaveError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  useEffect(() => {
    if (!draft || !editing) return;
    const id = window.requestAnimationFrame(() => {
      sheetTitleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [draft, editing]);

  const openEdit = (e: SavedLogEntry) => {
    setSaveError(null);
    setActionError(null);
    setEditing(e);
    setDraft(entryToDraft(e));
  };

  const closeEdit = () => {
    setEditing(null);
    setDraft(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editing || !draft) return;
    setSaveError(null);
    setSaving(true);
    try {
      await patchLog(userId, editing.id, draftToPatch(draft));
      closeEdit();
      await applyRange();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: SavedLogEntry) => {
    setActionError(null);
    if (!window.confirm(`Delete entry #${entry.id}? This cannot be undone.`)) return;
    try {
      await deleteLog(userId, entry.id);
      await applyRange();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete entry");
    }
  };

  const setDraftField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : null));
  };

  return (
    <div className="entries-page">
      <nav className="entries-nav">
        <Link className="linkish entries-back" to="/today">
          ← Today
        </Link>
      </nav>
      <header className="entries-header">
        <h1 className="entries-title">Entries</h1>
        <p className="muted small entries-lead">View, edit, or delete saved log rows for the current user.</p>
        <div className="entries-range">
          <label className="entries-range-field">
            <span className="sr-only">Start date</span>
            <input
              type="date"
              className="date-input date-input--compact"
              value={startDate}
              onChange={(ev) => {
                setActionError(null);
                setStartDate(ev.target.value);
              }}
            />
          </label>
          <span className="entries-range-sep muted" aria-hidden="true">
            –
          </span>
          <label className="entries-range-field">
            <span className="sr-only">End date</span>
            <input
              type="date"
              className="date-input date-input--compact"
              value={endDate}
              onChange={(ev) => {
                setActionError(null);
                setEndDate(ev.target.value);
              }}
            />
          </label>
          <button type="button" className="btn ghost small entries-apply" onClick={() => void applyRange()}>
            Apply range
          </button>
        </div>
      </header>

      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="error-inline">{loadError}</p>}
      {actionError && <p className="error-inline entries-action-error">{actionError}</p>}
      {!loading && !loadError && entries.length === 0 && <p className="muted entries-empty">No entries in this range.</p>}

      <ul className="entries-list">
        {entries.map((e) => (
          <li key={e.id} className="entries-item">
            <div className="entries-item-top">
              <span className="entries-item-date muted small">{shortDate(e.log_date)}</span>
              <span className="mono muted entries-item-times">
                {e.start_time ?? "—"} – {e.end_time ?? "—"}
              </span>
            </div>
            <div className="entries-item-body">{e.event ?? "(no event)"}</div>
            <div className="entries-item-meta muted small">
              <span className="mono">#{e.id}</span>
              <span className="entries-item-source">{e.source_type}</span>
            </div>
            {(e.energy_level != null || e.anxiety != null || e.contentment != null || e.focus != null) && (
              <div className="entries-item-metrics muted small">
                {[
                  e.energy_level != null ? `Energy · ${formatEnergy(e.energy_level)}` : null,
                  e.anxiety != null ? `Anxiety · ${formatAnxiety(e.anxiety)}` : null,
                  e.contentment != null ? `Contentment · ${formatContentment(e.contentment)}` : null,
                  e.focus != null ? `Focus · ${formatFocus(e.focus)}` : null,
                ]
                  .filter((x): x is string => x != null)
                  .join(" · ")}
              </div>
            )}
            <div className="entries-item-actions">
              <button type="button" className="btn ghost small" onClick={() => openEdit(e)}>
                Edit
              </button>
              <button type="button" className="btn ghost small entries-delete" onClick={() => void handleDelete(e)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {draft && editing && (
        <>
          <div className="log-edit-backdrop" role="presentation" onClick={closeEdit} />
          <div
            className="log-edit-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-edit-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="log-edit-sheet-scroll">
              <div className="log-edit-sheet-head">
                <h2 id="log-edit-title" ref={sheetTitleRef} tabIndex={-1}>
                  Edit entry #{editing.id}
                </h2>
                <button type="button" className="btn btn-text log-edit-close" onClick={closeEdit}>
                  Close
                </button>
              </div>
              <div className="log-edit-fields">
                <label className="field field--stacked">
                  <span>Log date</span>
                  <input type="date" value={draft.log_date} onChange={(ev) => setDraftField("log_date", ev.target.value)} />
                </label>
                <label className="field field--stacked">
                  <span>Source</span>
                  <select
                    className="field-select"
                    value={draft.source_type}
                    onChange={(ev) => setDraftField("source_type", ev.target.value as EditDraft["source_type"])}
                  >
                    <option value="manual">Manual</option>
                    <option value="text">Text</option>
                    <option value="voice">Voice</option>
                  </select>
                </label>
                <label className="field field--stacked">
                  <span>What happened</span>
                  <input type="text" value={draft.event} onChange={(ev) => setDraftField("event", ev.target.value)} />
                </label>
                <div className="manual-add-time-row">
                  <label className="field field--stacked">
                    <span>Start</span>
                    <input type="text" value={draft.start_time} onChange={(ev) => setDraftField("start_time", ev.target.value)} />
                  </label>
                  <label className="field field--stacked">
                    <span>End</span>
                    <input type="text" value={draft.end_time} onChange={(ev) => setDraftField("end_time", ev.target.value)} />
                  </label>
                </div>
                {(["energy_level", "anxiety", "contentment", "focus"] as const).map((key) => {
                  const opts = optionsForMetricKey(key);
                  if (!opts) return null;
                  return (
                    <MetricSelect
                      key={key}
                      label={key === "energy_level" ? "Energy" : key === "anxiety" ? "Anxiety" : key === "contentment" ? "Contentment" : "Focus"}
                      value={draft[key]}
                      onChange={(v) => setDraftField(key, v)}
                      options={opts}
                    />
                  );
                })}
                {optionsForMetricKey("music") && (
                  <MetricSelect
                    label="Music"
                    value={draft.music}
                    onChange={(v) => setDraftField("music", v)}
                    options={optionsForMetricKey("music")!}
                  />
                )}
                <label className="field field--stacked">
                  <span>Comments</span>
                  <textarea
                    className="log-edit-comments"
                    rows={3}
                    value={draft.comments}
                    onChange={(ev) => setDraftField("comments", ev.target.value)}
                  />
                </label>
              </div>
              {saveError && <p className="error-inline log-edit-error">{saveError}</p>}
            </div>
            <div className="log-edit-footer">
              <button type="button" className="btn ghost" onClick={closeEdit} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
