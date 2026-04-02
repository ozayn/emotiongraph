import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  commitLogsImport,
  deleteLog,
  fetchLogsRange,
  patchLog,
  previewLogsImportCsv,
  saveLogs,
} from "../api";
import CalmSelect from "../components/CalmSelect";
import MetricSelect from "../components/MetricSelect";
import type { LogImportRow, LogsImportPreviewResponse, SavedLogEntry } from "../types";
import { addCalendarDaysToIso, todayIsoInTimeZone } from "../datesTz";
import {
  compactMetricSummary,
  draftToNewLogRow,
  draftToPatch,
  emptyDraftForDate,
  entryToDraft,
  type EditDraft,
  LOG_ADD_SOURCE_OPTIONS,
  LOG_EDIT_SOURCE_OPTIONS,
} from "../logEditDraft";
import { optionsForMetricKey } from "../trackerOptions";

const ENTRIES_VIEW_STORAGE_KEY = "emotiongraph_entries_view";

/** First paint and “Show less” target for the entries list (both views). */
const ENTRIES_LIST_INITIAL = 20;
/** How many extra rows each “Show more” reveals. */
const ENTRIES_LIST_STEP = 20;

type EntriesViewMode = "cards" | "table";

function readStoredEntriesViewMode(): EntriesViewMode {
  if (typeof window === "undefined") return "cards";
  try {
    const raw = localStorage.getItem(ENTRIES_VIEW_STORAGE_KEY);
    if (raw === "table" || raw === "cards") return raw;
  } catch {
    /* ignore */
  }
  return "cards";
}

function tableMetricCell(v: number | null | undefined): string {
  return v != null ? String(v) : "—";
}

function shortDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type Props = { userId: number; timeZone: string };

export default function LogsPage({ userId, timeZone }: Props) {
  const addSourceLabelId = useId();
  const editSourceLabelId = useId();
  const [startDate, setStartDate] = useState(() => addCalendarDaysToIso(todayIsoInTimeZone(timeZone), -60));
  const [endDate, setEndDate] = useState(() => todayIsoInTimeZone(timeZone));

  useEffect(() => {
    setStartDate(addCalendarDaysToIso(todayIsoInTimeZone(timeZone), -60));
    setEndDate(todayIsoInTimeZone(timeZone));
  }, [userId, timeZone]);
  const [entries, setEntries] = useState<SavedLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedLogEntry | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<EditDraft | null>(null);
  const [addSaveError, setAddSaveError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [importPreview, setImportPreview] = useState<LogsImportPreviewResponse | null>(null);
  const [importInputKey, setImportInputKey] = useState(0);
  const [importSelectedName, setImportSelectedName] = useState<string | null>(null);
  const [importPickErr, setImportPickErr] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importCommitErr, setImportCommitErr] = useState<string | null>(null);

  const rangeRef = useRef({ start: startDate, end: endDate });
  rangeRef.current = { start: startDate, end: endDate };

  const sheetTitleRef = useRef<HTMLHeadingElement>(null);
  const addSheetTitleRef = useRef<HTMLHeadingElement>(null);
  const importFileRef = useRef<File | null>(null);
  const [visibleCount, setVisibleCount] = useState(ENTRIES_LIST_INITIAL);
  const [cardMenuOpenId, setCardMenuOpenId] = useState<number | null>(null);
  const [viewMode, setViewModeState] = useState<EntriesViewMode>(() => readStoredEntriesViewMode());

  const setViewMode = useCallback((mode: EntriesViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(ENTRIES_VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

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
    setVisibleCount(ENTRIES_LIST_INITIAL);
  }, [entries]);

  useEffect(() => {
    setCardMenuOpenId(null);
  }, [entries]);

  const displayedEntries = useMemo(() => entries.slice(0, visibleCount), [entries, visibleCount]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (draft) {
        setEditing(null);
        setDraft(null);
        setSaveError(null);
      } else if (addDraft) {
        setAddDraft(null);
        setAddSaveError(null);
      } else if (cardMenuOpenId != null) {
        setCardMenuOpenId(null);
      }
    };
    if (!draft && !addDraft && cardMenuOpenId == null) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, addDraft, cardMenuOpenId]);

  useEffect(() => {
    if (cardMenuOpenId == null) return;
    const onPointerDown = (ev: PointerEvent) => {
      const el = ev.target;
      if (el instanceof Element && el.closest("[data-entries-card-menu-root]")) return;
      setCardMenuOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [cardMenuOpenId]);

  useEffect(() => {
    if (!draft || !editing) return;
    const id = window.requestAnimationFrame(() => {
      sheetTitleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [draft, editing]);

  useEffect(() => {
    if (!addDraft) return;
    const id = window.requestAnimationFrame(() => {
      addSheetTitleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [addDraft]);

  const openAddPast = () => {
    setEditing(null);
    setDraft(null);
    setSaveError(null);
    setActionError(null);
    setAddSaveError(null);
    setAddDraft(emptyDraftForDate(endDate));
  };

  const closeAddPast = () => {
    setAddDraft(null);
    setAddSaveError(null);
  };

  const handleAddSave = async () => {
    if (!addDraft) return;
    setAddSaveError(null);
    setAddSaving(true);
    try {
      await saveLogs(userId, addDraft.log_date, [draftToNewLogRow(addDraft)]);
      closeAddPast();
      await applyRange();
    } catch (e) {
      setAddSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAddSaving(false);
    }
  };

  const onImportFilePicked = (files: FileList | null) => {
    setImportPreview(null);
    setImportCommitErr(null);
    setImportPickErr(null);
    const f = files?.[0] ?? null;
    importFileRef.current = f;
    setImportSelectedName(f?.name ?? null);
  };

  const runImportPreview = async () => {
    const f = importFileRef.current;
    if (!f) {
      setImportPickErr("Choose a CSV file first.");
      return;
    }
    setImportBusy(true);
    setImportPickErr(null);
    setImportCommitErr(null);
    try {
      const prev = await previewLogsImportCsv(userId, f);
      setImportPreview(prev);
    } catch (e) {
      setImportPickErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setImportBusy(false);
    }
  };

  const runImportCommit = async () => {
    if (!importPreview?.rows.length) return;
    setImportCommitErr(null);
    setImportBusy(true);
    try {
      await commitLogsImport(userId, importPreview.rows);
      setImportPreview(null);
      importFileRef.current = null;
      setImportSelectedName(null);
      setImportInputKey((k) => k + 1);
      await applyRange();
    } catch (e) {
      setImportCommitErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  };

  const openEdit = (e: SavedLogEntry) => {
    setCardMenuOpenId(null);
    setAddDraft(null);
    setAddSaveError(null);
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

  const setAddDraftField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setAddDraft((d) => (d ? { ...d, [key]: value } : null));
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
        <p className="muted small entries-lead">
          View, edit, or delete log rows. Add a structured row for any past date, or import many rows from CSV.
        </p>
        <div className="entries-actions">
          <button type="button" className="btn ghost small" onClick={openAddPast}>
            Add past entry
          </button>
        </div>
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

      <section className="entries-import" aria-labelledby="entries-import-title">
        <h2 id="entries-import-title" className="entries-subtitle">
          Import from CSV
        </h2>
        <p className="muted small entries-import-hint">
          UTF-8. Use <span className="mono">log_date</span> (YYYY-MM-DD) per row—exports from this app include it as the first column. Rows save for the current user with source{" "}
          <span className="mono">import</span>.
        </p>
        <div className="entries-import-upload">
          <div className="entries-import-dropzone">
            <input
              id="entries-import-csv-input"
              key={importInputKey}
              type="file"
              accept=".csv,text/csv"
              className="entries-import-input-hidden"
              aria-label="Choose CSV file to import"
              onChange={(ev) => onImportFilePicked(ev.target.files)}
            />
            <div className="entries-import-dropzone-inner">
              <label htmlFor="entries-import-csv-input" className="entries-import-choose">
                Choose CSV
              </label>
              <span className="entries-import-filename mono muted small" aria-live="polite">
                {importSelectedName ?? "No file selected"}
              </span>
            </div>
          </div>
          <button type="button" className="btn ghost small entries-import-preview-btn" disabled={importBusy} onClick={() => void runImportPreview()}>
            {importBusy && !importPreview ? "Preview…" : "Preview"}
          </button>
        </div>
        {importPickErr && <p className="error-inline">{importPickErr}</p>}
        {importCommitErr && <p className="error-inline">{importCommitErr}</p>}
        {importPreview && (
          <div className="entries-import-preview">
            <p className="muted small">
              <strong>{importPreview.row_count}</strong> row{importPreview.row_count === 1 ? "" : "s"} ready
              {importPreview.parse_errors.length > 0 ? " (some lines skipped)" : ""}.
            </p>
            {importPreview.parse_errors.length > 0 && (
              <ul className="entries-import-errors muted small">
                {importPreview.parse_errors.slice(0, 8).map((err) => (
                  <li key={err}>{err}</li>
                ))}
                {importPreview.parse_errors.length > 8 && <li>…</li>}
              </ul>
            )}
            {importPreview.rows.length > 0 && (
              <div className="entries-import-table-wrap">
                <table className="entries-import-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Start</th>
                      <th>Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.slice(0, 8).map((r: LogImportRow, i: number) => (
                      <tr key={`${r.log_date}-${i}`}>
                        <td className="mono">{r.log_date}</td>
                        <td className="mono">{r.start_time ?? "—"}</td>
                        <td>{r.event ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              className="btn primary small entries-import-save"
              disabled={importBusy || importPreview.rows.length === 0}
              onClick={() => void runImportCommit()}
            >
              {importBusy ? "Saving…" : `Save ${importPreview.row_count} imported row${importPreview.row_count === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </section>

      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="error-inline">{loadError}</p>}
      {actionError && <p className="error-inline entries-action-error">{actionError}</p>}
      {!loading && !loadError && entries.length === 0 && <p className="muted entries-empty">No entries in this range.</p>}

      {!loading && !loadError && entries.length > 0 && (
        <>
          <div className="entries-view-bar" role="group" aria-label="Entry list layout">
            <span className="entries-view-bar-label muted small" id="entries-view-mode-label">
              View
            </span>
            <div className="entries-view-toggle" role="tablist" aria-labelledby="entries-view-mode-label">
              <button
                type="button"
                role="tab"
                className={`entries-view-tab${viewMode === "cards" ? " entries-view-tab--active" : ""}`}
                aria-selected={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
              >
                Cards
              </button>
              <button
                type="button"
                role="tab"
                className={`entries-view-tab${viewMode === "table" ? " entries-view-tab--active" : ""}`}
                aria-selected={viewMode === "table"}
                onClick={() => setViewMode("table")}
              >
                Table
              </button>
            </div>
          </div>

          <p className="entries-list-status muted small" aria-live="polite">
            Showing {displayedEntries.length} of {entries.length}
          </p>

          {viewMode === "cards" && (
            <ul className="entries-list">
              {displayedEntries.map((e) => {
                const metricsShort = compactMetricSummary(e);
                const menuOpen = cardMenuOpenId === e.id;
                const menuDomId = `entry-card-actions-${e.id}`;
                return (
                  <li key={e.id} className="entries-item">
                    <div className="entries-item-cardhead">
                      <div className="entries-item-cardhead-main">
                        <span className="entries-item-date">{shortDate(e.log_date)}</span>
                        <span className="entries-item-times mono muted" aria-label="Start to end time">
                          {e.start_time ?? "—"}–{e.end_time ?? "—"}
                        </span>
                        <span className="entries-item-source">{e.source_type}</span>
                      </div>
                      <div className="entries-item-menu-wrap" data-entries-card-menu-root>
                        <button
                          type="button"
                          className="entries-item-menu-trigger"
                          aria-label="Entry actions"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-controls={menuDomId}
                          onClick={() => setCardMenuOpenId((id) => (id === e.id ? null : e.id))}
                        >
                          <span aria-hidden="true" className="entries-item-menu-icon">
                            ⋯
                          </span>
                        </button>
                        {menuOpen && (
                          <ul id={menuDomId} className="entries-item-menu" role="menu">
                            <li role="presentation">
                              <button
                                type="button"
                                className="entries-item-menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setCardMenuOpenId(null);
                                  openEdit(e);
                                }}
                              >
                                Edit
                              </button>
                            </li>
                            <li role="presentation">
                              <button
                                type="button"
                                className="entries-item-menu-item entries-item-menu-item--danger"
                                role="menuitem"
                                onClick={() => {
                                  setCardMenuOpenId(null);
                                  void handleDelete(e);
                                }}
                              >
                                Delete
                              </button>
                            </li>
                          </ul>
                        )}
                      </div>
                    </div>
                    <p className="entries-item-event entries-item-event--clamp">
                      {e.event?.trim() ? e.event : "(no event)"}
                    </p>
                    {metricsShort && (
                      <p className="entries-item-metrics-compact mono muted small" aria-label="Metrics summary">
                        {metricsShort}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {viewMode === "table" && (
            <div className="entries-table-scroll">
              <table className="entries-table">
                <caption className="sr-only">Log entries in table layout</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Start</th>
                    <th scope="col">End</th>
                    <th scope="col">Event</th>
                    <th scope="col">Source</th>
                    <th scope="col" className="entries-table-num" title="Energy level">
                      En
                    </th>
                    <th scope="col" className="entries-table-num" title="Anxiety">
                      Ax
                    </th>
                    <th scope="col" className="entries-table-num" title="Contentment">
                      Co
                    </th>
                    <th scope="col" className="entries-table-num" title="Focus">
                      Fo
                    </th>
                    <th scope="col" className="entries-table-actions-col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedEntries.map((e) => (
                    <tr key={e.id}>
                      <td className="mono entries-table-date">{e.log_date}</td>
                      <td className="mono entries-table-time">{e.start_time ?? "—"}</td>
                      <td className="mono entries-table-time">{e.end_time ?? "—"}</td>
                      <td className="entries-table-event" title={e.event ?? undefined}>
                        {e.event?.trim() ? e.event : "—"}
                      </td>
                      <td className="entries-table-src">{e.source_type}</td>
                      <td className="mono entries-table-num">{tableMetricCell(e.energy_level)}</td>
                      <td className="mono entries-table-num">{tableMetricCell(e.anxiety)}</td>
                      <td className="mono entries-table-num">{tableMetricCell(e.contentment)}</td>
                      <td className="mono entries-table-num">{tableMetricCell(e.focus)}</td>
                      <td className="entries-table-actions">
                        <button type="button" className="btn btn-text small entries-table-action" onClick={() => openEdit(e)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-text small entries-table-action entries-delete"
                          onClick={() => void handleDelete(e)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(visibleCount < entries.length || visibleCount > ENTRIES_LIST_INITIAL) && (
            <div className="entries-list-pagination muted small">
              <div className="entries-list-pagination-actions">
                {visibleCount < entries.length && (
                  <button
                    type="button"
                    className="btn btn-text small entries-pagination-btn"
                    onClick={() =>
                      setVisibleCount((c) => Math.min(c + ENTRIES_LIST_STEP, entries.length))
                    }
                  >
                    Show more
                  </button>
                )}
                {visibleCount > ENTRIES_LIST_INITIAL && (
                  <button
                    type="button"
                    className="btn btn-text small entries-pagination-btn"
                    onClick={() => setVisibleCount(ENTRIES_LIST_INITIAL)}
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {addDraft && (
        <>
          <div className="log-edit-backdrop" role="presentation" onClick={closeAddPast} />
          <div
            className="log-edit-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-add-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="log-edit-sheet-scroll">
              <div className="log-edit-sheet-head">
                <h2 id="log-add-title" ref={addSheetTitleRef} tabIndex={-1}>
                  Add entry (past date)
                </h2>
                <button type="button" className="btn btn-text log-edit-close" onClick={closeAddPast}>
                  Close
                </button>
              </div>
              <p className="muted small log-edit-past-note">Separate from Today’s voice flow. Saved as a normal log row for the date you choose.</p>
              <div className="log-edit-fields">
                <label className="field field--stacked">
                  <span>Log date</span>
                  <input
                    type="date"
                    value={addDraft.log_date}
                    onChange={(ev) => setAddDraftField("log_date", ev.target.value)}
                  />
                </label>
                <label className="field field--stacked">
                  <span id={addSourceLabelId}>Source</span>
                  <CalmSelect
                    variant="field"
                    aria-labelledby={addSourceLabelId}
                    value={addDraft.source_type}
                    onChange={(v) => setAddDraftField("source_type", v as EditDraft["source_type"])}
                    options={LOG_ADD_SOURCE_OPTIONS}
                  />
                </label>
                <label className="field field--stacked">
                  <span>What happened</span>
                  <input type="text" value={addDraft.event} onChange={(ev) => setAddDraftField("event", ev.target.value)} />
                </label>
                <div className="manual-add-time-row">
                  <label className="field field--stacked">
                    <span>Start</span>
                    <input
                      type="text"
                      value={addDraft.start_time}
                      onChange={(ev) => setAddDraftField("start_time", ev.target.value)}
                    />
                  </label>
                  <label className="field field--stacked">
                    <span>End</span>
                    <input type="text" value={addDraft.end_time} onChange={(ev) => setAddDraftField("end_time", ev.target.value)} />
                  </label>
                </div>
                {(["energy_level", "anxiety", "contentment", "focus"] as const).map((key) => {
                  const opts = optionsForMetricKey(key);
                  if (!opts) return null;
                  return (
                    <MetricSelect
                      key={key}
                      label={
                        key === "energy_level"
                          ? "Energy"
                          : key === "anxiety"
                            ? "Anxiety"
                            : key === "contentment"
                              ? "Contentment"
                              : "Focus"
                      }
                      value={addDraft[key]}
                      onChange={(v) => setAddDraftField(key, v)}
                      options={opts}
                    />
                  );
                })}
                {optionsForMetricKey("music") && (
                  <MetricSelect
                    label="Music"
                    value={addDraft.music}
                    onChange={(v) => setAddDraftField("music", v)}
                    options={optionsForMetricKey("music")!}
                  />
                )}
                <label className="field field--stacked">
                  <span>Comments</span>
                  <textarea
                    className="log-edit-comments"
                    rows={3}
                    value={addDraft.comments}
                    onChange={(ev) => setAddDraftField("comments", ev.target.value)}
                  />
                </label>
              </div>
              {addSaveError && <p className="error-inline log-edit-error">{addSaveError}</p>}
            </div>
            <div className="log-edit-footer">
              <button type="button" className="btn ghost" onClick={closeAddPast} disabled={addSaving}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void handleAddSave()} disabled={addSaving}>
                {addSaving ? "Saving…" : "Save entry"}
              </button>
            </div>
          </div>
        </>
      )}

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
                  <span id={editSourceLabelId}>Source</span>
                  <CalmSelect
                    variant="field"
                    aria-labelledby={editSourceLabelId}
                    value={draft.source_type}
                    onChange={(v) => setDraftField("source_type", v as EditDraft["source_type"])}
                    options={LOG_EDIT_SOURCE_OPTIONS}
                  />
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
