import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { deleteLog, fetchLogsRange, patchLog, putLogEntryCustomValues } from "../api";
import CalmSelect from "../components/CalmSelect";
import CustomFieldsForm from "../components/CustomFieldsForm";
import { IconRowEdit, IconRowTrash } from "../components/RowActionIcons";
import EntryDetailModal from "../components/EntryDetailModal";
import SourceTypeIndicator from "../components/SourceTypeIndicator";
import { TableAbbrevHint, TableCellMultilineHint } from "../components/tableHoverHints";
import TodaySnapshot from "../components/TodaySnapshot";
import MetricSelect from "../components/MetricSelect";
import { buildCustomValuesPayload, customValuesToDraft, filterCustomFormFields } from "../customFieldValues";
import { fetchTrackerConfig } from "../trackerConfigApi";
import type { TrackerFieldDefinitionDTO } from "../trackerConfigTypes";
import type { SavedLogEntry } from "../types";
import { addCalendarDaysToIso, todayIsoInTimeZone } from "../datesTz";
import { compactMetricSummary, draftToPatch, entryToDraft, type EditDraft, LOG_EDIT_SOURCE_OPTIONS } from "../logEditDraft";
import { useSession } from "../session/SessionContext";
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

function tableCommentsCell(comments: string | null | undefined): { text: string; title?: string } {
  const t = comments?.trim() ?? "";
  if (!t) return { text: "—" };
  return { text: t, title: t };
}

function shortDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export type LogsPageVariant = "history" | "today";

type Props = { userId: number; timeZone: string; variant?: LogsPageVariant };

function parseDayQueryParam(raw: string | null): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

export default function LogsPage({ userId, timeZone, variant = "history" }: Props) {
  const { pathFor } = useSession();
  const [searchParams] = useSearchParams();
  const focusLogDate = variant === "history" ? parseDayQueryParam(searchParams.get("day")) : undefined;
  const editSourceLabelId = useId();
  const [startDate, setStartDate] = useState(() => addCalendarDaysToIso(todayIsoInTimeZone(timeZone), -60));
  const [endDate, setEndDate] = useState(() => todayIsoInTimeZone(timeZone));

  useEffect(() => {
    if (variant === "today") {
      const t = todayIsoInTimeZone(timeZone);
      setStartDate(t);
      setEndDate(t);
    } else if (focusLogDate) {
      setStartDate(focusLogDate);
      setEndDate(focusLogDate);
    } else {
      setStartDate(addCalendarDaysToIso(todayIsoInTimeZone(timeZone), -60));
      setEndDate(todayIsoInTimeZone(timeZone));
    }
  }, [userId, timeZone, focusLogDate, variant]);
  const [entries, setEntries] = useState<SavedLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedLogEntry | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [trackerFields, setTrackerFields] = useState<TrackerFieldDefinitionDTO[]>([]);
  const [editCustomDraft, setEditCustomDraft] = useState<Record<number, string>>({});
  const customEntryFields = useMemo(() => filterCustomFormFields(trackerFields, "entry"), [trackerFields]);
  const rangeRef = useRef({ start: startDate, end: endDate });
  rangeRef.current = { start: startDate, end: endDate };

  const sheetTitleRef = useRef<HTMLHeadingElement>(null);
  const [visibleCount, setVisibleCount] = useState(ENTRIES_LIST_INITIAL);
  const [cardMenuOpenId, setCardMenuOpenId] = useState<number | null>(null);
  const [entryDetail, setEntryDetail] = useState<SavedLogEntry | null>(null);
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
    if (!Number.isInteger(userId) || userId < 1) return;
    void fetchTrackerConfig(userId)
      .then((c) => setTrackerFields(c.fields))
      .catch(() => {
        /* optional */
      });
  }, [userId]);

  const scrolledHistoryKey = useRef<string>("");
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash;
    const wantScroll =
      (variant === "today" && hash === "#entries-history-focus") || (variant === "history" && focusLogDate != null);
    if (!wantScroll) {
      if (variant === "history" && !focusLogDate) scrolledHistoryKey.current = "";
      return;
    }
    const key =
      variant === "today" ? `today-${userId}-${hash}` : `${focusLogDate}-${userId}`;
    if (scrolledHistoryKey.current === key) return;
    scrolledHistoryKey.current = key;
    const id = window.requestAnimationFrame(() => {
      document.getElementById("entries-history-focus")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusLogDate, loading, userId, variant]);

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
      } else if (cardMenuOpenId != null) {
        setCardMenuOpenId(null);
      }
    };
    if (!draft && cardMenuOpenId == null) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, cardMenuOpenId]);

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

  const openEdit = (e: SavedLogEntry) => {
    setEntryDetail(null);
    setCardMenuOpenId(null);
    setSaveError(null);
    setActionError(null);
    setEditing(e);
    setDraft(entryToDraft(e));
    setEditCustomDraft(customValuesToDraft(e.custom_values, filterCustomFormFields(trackerFields, "entry")));
  };

  const closeEdit = () => {
    setEditing(null);
    setDraft(null);
    setEditCustomDraft({});
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editing || !draft) return;
    setSaveError(null);
    setSaving(true);
    try {
      await patchLog(userId, editing.id, draftToPatch(draft));
      if (customEntryFields.length > 0) {
        await putLogEntryCustomValues(
          userId,
          editing.id,
          buildCustomValuesPayload(editCustomDraft, customEntryFields),
        );
      }
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
      setEntryDetail((d) => (d?.id === entry.id ? null : d));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete entry");
    }
  };

  const setDraftField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : null));
  };

  const todayIso = todayIsoInTimeZone(timeZone);
  const todayDateDisplay = (() => {
    if (variant !== "today") return "";
    const parts = todayIso.split("-").map(Number);
    const [y, m, d] = parts;
    if (!y || !m || !d || parts.length !== 3) return todayIso;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  })();

  return (
    <div className={`entries-page${variant === "today" ? " entries-page--today" : ""}`}>
      <nav className="entries-nav entries-nav--split">
        <Link className="linkish entries-back" to={pathFor("/")}>
          ← Home
        </Link>
        {variant === "today" ? (
          <div className="entries-nav-inline">
            <Link className="linkish entries-nav-secondary" to={`${pathFor("/add-entry")}?day=${todayIso}`}>
              Add entry
            </Link>
            <span className="entries-nav-dot muted" aria-hidden="true">
              ·
            </span>
            <Link className="linkish entries-back" to={pathFor("/entries")}>
              All entries →
            </Link>
          </div>
        ) : (
          <Link className="linkish entries-back" to={pathFor("/profile#data")}>
            Profile →
          </Link>
        )}
      </nav>
      <header className="entries-header">
        {variant === "today" ? (
          <>
            <div className="entries-title-row">
              <h1 className="entries-title">Today</h1>
              <p className="muted small entries-today-date" aria-live="polite">
                {todayDateDisplay}
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="entries-title">Entries</h1>
            <p className="muted small entries-lead">
              Pick a range, then edit or delete.{" "}
              <Link className="linkish" to={pathFor("/add-entry")}>
                Add entry
              </Link>
              {" · "}
              <Link className="linkish" to={pathFor("/profile#data")}>
                Import / export
              </Link>
            </p>
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
          </>
        )}
      </header>

      {variant === "today" ? (
        <TodaySnapshot
          userId={userId}
          logDate={todayIso}
          entries={entries}
          entriesLoading={loading}
        />
      ) : null}

      <section className="entries-history-block" id="entries-history-focus" aria-label="Log history">
        {loading && <p className="muted">Loading…</p>}
        {loadError && <p className="error-inline">{loadError}</p>}
        {actionError && <p className="error-inline entries-action-error">{actionError}</p>}
        {!loading && !loadError && entries.length === 0 && <p className="muted entries-empty">No entries in this range.</p>}

        {!loading && !loadError && entries.length > 0 && (
        <>
          <div className="entries-view-bar" role="group" aria-label="Entry list layout">
            <span className="entries-view-bar-label muted small sr-only" id="entries-view-mode-label">
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
                const onCardKeyDown = (ev: ReactKeyboardEvent<HTMLLIElement>) => {
                  if (ev.key !== "Enter" && ev.key !== " ") return;
                  ev.preventDefault();
                  setEntryDetail(e);
                };
                return (
                  <li
                    key={e.id}
                    className="entries-item entries-item--interactive"
                    tabIndex={0}
                    onClick={() => setEntryDetail(e)}
                    onKeyDown={onCardKeyDown}
                  >
                    <div className="entries-item-cardhead">
                      <div className="entries-item-cardhead-main">
                        <span className="entries-item-date">{shortDate(e.log_date)}</span>
                        <span className="entries-item-times mono muted" aria-label="Start to end time">
                          {e.start_time ?? "—"}–{e.end_time ?? "—"}
                        </span>
                        <span className="entries-item-source">
                          <SourceTypeIndicator source={e.source_type} />
                        </span>
                      </div>
                      <div
                        className="entries-item-menu-wrap"
                        data-entries-card-menu-root
                        onClick={(ev) => ev.stopPropagation()}
                      >
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
                                className="entries-item-menu-item entries-item-menu-item--icon-action"
                                role="menuitem"
                                aria-label={`Edit entry ${e.id}`}
                                onClick={() => {
                                  setCardMenuOpenId(null);
                                  openEdit(e);
                                }}
                              >
                                <IconRowEdit />
                              </button>
                            </li>
                            <li role="presentation">
                              <button
                                type="button"
                                className="entries-item-menu-item entries-item-menu-item--danger entries-item-menu-item--icon-action"
                                role="menuitem"
                                aria-label={`Delete entry ${e.id}`}
                                onClick={() => {
                                  setCardMenuOpenId(null);
                                  void handleDelete(e);
                                }}
                              >
                                <IconRowTrash />
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
                    <th scope="col" className="entries-table-comments-col">
                      <span className="sr-only">Comments</span>
                      <TableAbbrevHint abbr="Cm" hint="Comments" />
                    </th>
                    <th scope="col" className="entries-table-src-head">
                      <span className="sr-only">Source type</span>
                      <TableAbbrevHint abbr="Src" hint="Source type" />
                    </th>
                    <th scope="col" className="entries-table-num">
                      <span className="sr-only">Energy level</span>
                      <TableAbbrevHint abbr="En" hint="Energy level" />
                    </th>
                    <th scope="col" className="entries-table-num">
                      <span className="sr-only">Anxiety</span>
                      <TableAbbrevHint abbr="Ax" hint="Anxiety" />
                    </th>
                    <th scope="col" className="entries-table-num">
                      <span className="sr-only">Contentment</span>
                      <TableAbbrevHint abbr="Co" hint="Contentment" />
                    </th>
                    <th scope="col" className="entries-table-num">
                      <span className="sr-only">Focus</span>
                      <TableAbbrevHint abbr="Fo" hint="Focus" />
                    </th>
                    <th scope="col" className="entries-table-actions-col">
                      <span className="sr-only">Row actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedEntries.map((e) => {
                    const commentCell = tableCommentsCell(e.comments);
                    return (
                      <tr
                        key={e.id}
                        className="entries-table-row entries-table-row--interactive"
                        tabIndex={0}
                        onClick={() => setEntryDetail(e)}
                        onKeyDown={(ev) => {
                          if (ev.key !== "Enter" && ev.key !== " ") return;
                          ev.preventDefault();
                          setEntryDetail(e);
                        }}
                      >
                        <td className="mono entries-table-date">{e.log_date}</td>
                        <td className="mono entries-table-time">{e.start_time ?? "—"}</td>
                        <td className="mono entries-table-time">{e.end_time ?? "—"}</td>
                        <td className="entries-table-event">
                          <TableCellMultilineHint hintText={e.event?.trim() ? e.event : undefined}>
                            <span className="entries-table-event-inner">{e.event?.trim() ? e.event : "—"}</span>
                          </TableCellMultilineHint>
                        </td>
                        <td className="entries-table-comments-col">
                          <TableCellMultilineHint hintText={commentCell.title}>
                            <span className="entries-table-comments-inner">{commentCell.text}</span>
                          </TableCellMultilineHint>
                        </td>
                        <td className="entries-table-src-cell">
                          <SourceTypeIndicator source={e.source_type} />
                        </td>
                        <td className="mono entries-table-num">{tableMetricCell(e.energy_level)}</td>
                        <td className="mono entries-table-num">{tableMetricCell(e.anxiety)}</td>
                        <td className="mono entries-table-num">{tableMetricCell(e.contentment)}</td>
                        <td className="mono entries-table-num">{tableMetricCell(e.focus)}</td>
                        <td className="entries-table-actions" onClick={(ev) => ev.stopPropagation()}>
                          <button
                            type="button"
                            className="entries-row-icon-btn"
                            aria-label={`Edit entry ${e.id}`}
                            onClick={() => openEdit(e)}
                          >
                            <IconRowEdit />
                          </button>
                          <button
                            type="button"
                            className="entries-row-icon-btn entries-row-icon-btn--delete"
                            aria-label={`Delete entry ${e.id}`}
                            onClick={() => void handleDelete(e)}
                          >
                            <IconRowTrash />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
      </section>

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
                {customEntryFields.length > 0 && (
                  <details className="log-edit-custom-disclosure">
                    <summary className="log-edit-custom-summary muted small">Optional team fields</summary>
                    <CustomFieldsForm
                      fields={customEntryFields}
                      draft={editCustomDraft}
                      onChange={(fid, v) => setEditCustomDraft((p) => ({ ...p, [fid]: v }))}
                      disabled={saving}
                      variant="nested"
                    />
                  </details>
                )}
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

      <EntryDetailModal
        open={entryDetail != null}
        entry={entryDetail}
        onClose={() => setEntryDetail(null)}
        fieldDefinitions={customEntryFields}
      />
    </div>
  );
}
