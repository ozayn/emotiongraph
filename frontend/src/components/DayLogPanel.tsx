import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  deleteLog,
  extractLogs,
  fetchLogs,
  fetchTrackerDay,
  patchLog,
  saveLogs,
  saveTrackerDay,
} from "../api";
import { todayIsoInTimeZone } from "../datesTz";
import CalmSelect from "./CalmSelect";
import MetricSelect from "./MetricSelect";
import ReviewExtractionModal from "./ReviewExtractionModal";
import {
  compactMetricSummary,
  draftToPatch,
  entryToDraft,
  type EditDraft,
  LOG_EDIT_SOURCE_OPTIONS,
} from "../logEditDraft";
import type { ExtractLogsResponse, LogRow, SavedLogEntry } from "../types";
import { formatSleepQuality, optionsForMetricKey, SLEEP_QUALITY_OPTIONS } from "../trackerOptions";

const MANUAL_MORE_KEYS: { key: keyof Omit<LogRow, "source_type">; label: string }[] = [
  { key: "energy_level", label: "Energy" },
  { key: "anxiety", label: "Anxiety" },
  { key: "contentment", label: "Contentment" },
  { key: "focus", label: "Focus" },
  { key: "music", label: "Music" },
  { key: "comments", label: "Comments" },
];

function emptyManualDraft(): Record<keyof LogRow, string> {
  return {
    start_time: "",
    end_time: "",
    event: "",
    energy_level: "",
    anxiety: "",
    contentment: "",
    focus: "",
    music: "",
    comments: "",
    source_type: "",
  };
}

function parseMusicSelect(s: string): LogRow["music"] {
  const t = s.trim();
  if (!t) return null;
  const allowed: LogRow["music"][] = ["No", "Yes, upbeat", "Yes, calm", "Yes, other"];
  return allowed.includes(t as LogRow["music"]) ? (t as LogRow["music"]) : null;
}

function draftToLogRow(d: Record<keyof LogRow, string>): LogRow {
  const trim = (s: string) => (s.trim() === "" ? null : s.trim());
  const num = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    start_time: trim(d.start_time),
    end_time: trim(d.end_time),
    event: trim(d.event),
    energy_level: num(d.energy_level),
    anxiety: num(d.anxiety),
    contentment: num(d.contentment),
    focus: num(d.focus),
    music: parseMusicSelect(d.music),
    comments: trim(d.comments),
    source_type: "manual",
  };
}

function daySavedTimeDisplay(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = start?.trim() ?? "";
  const t = end?.trim() ?? "";
  if (!s && !t) return null;
  if (s && t) return `${s}–${t}`;
  return s || t;
}

function isReadyUserId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return e instanceof Error && e.name === "AbortError";
}

type Props = {
  userId: number;
  timeZone: string;
  /** Optional: refresh parent lists (e.g. Entries range) after writes */
  onMutate?: () => void | Promise<void>;
  /** When set (e.g. `?day=` in URL), selects that date */
  focusLogDate?: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function DayLogPanel({ userId, timeZone, onMutate, focusLogDate }: Props) {
  const textAreaId = useId();
  const savedEditSourceLabelId = useId();
  const savedEditTitleRef = useRef<HTMLHeadingElement>(null);
  const dayContextFirstFieldRef = useRef<HTMLInputElement>(null);

  const [logDate, setLogDate] = useState(() => todayIsoInTimeZone(timeZone));
  useEffect(() => {
    setLogDate(todayIsoInTimeZone(timeZone));
  }, [userId, timeZone]);

  useEffect(() => {
    if (focusLogDate && ISO_DATE_RE.test(focusLogDate)) {
      setLogDate(focusLogDate);
    }
  }, [focusLogDate, userId]);

  const [saved, setSaved] = useState<SavedLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [freeTextDraft, setFreeTextDraft] = useState("");
  const [extraction, setExtraction] = useState<ExtractLogsResponse | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const [manualDraft, setManualDraft] = useState(emptyManualDraft);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSavedBanner, setManualSavedBanner] = useState(false);
  const [manualSectionOpen, setManualSectionOpen] = useState(false);
  const [textSectionOpen, setTextSectionOpen] = useState(false);

  const [savedMenuOpenId, setSavedMenuOpenId] = useState<number | null>(null);
  const [savedEditEntry, setSavedEditEntry] = useState<SavedLogEntry | null>(null);
  const [savedEditDraft, setSavedEditDraft] = useState<EditDraft | null>(null);
  const [savedEditSaveError, setSavedEditSaveError] = useState<string | null>(null);
  const [savedEditSaving, setSavedEditSaving] = useState(false);
  const [savedActionError, setSavedActionError] = useState<string | null>(null);

  const [dayDraft, setDayDraft] = useState({ cycle_day: "", sleep_hours: "", sleep_quality: "" });
  const [daySaving, setDaySaving] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [daySavedBanner, setDaySavedBanner] = useState(false);
  const [dayContextOpen, setDayContextOpen] = useState(false);
  const [dayContextEditing, setDayContextEditing] = useState(false);

  const refreshSaved = useCallback(async () => {
    if (!isReadyUserId(userId) || !logDate.trim()) return;
    setLoadError(null);
    try {
      const rows = await fetchLogs(userId, logDate);
      setSaved(rows);
    } catch (e) {
      if (isAbortError(e)) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load logs");
    }
  }, [userId, logDate]);

  const refreshDay = useCallback(async () => {
    if (!isReadyUserId(userId) || !logDate.trim()) return;
    setDayError(null);
    try {
      const d = await fetchTrackerDay(userId, logDate);
      setDayDraft({
        cycle_day: d.cycle_day != null ? String(d.cycle_day) : "",
        sleep_hours: d.sleep_hours != null ? String(d.sleep_hours) : "",
        sleep_quality: d.sleep_quality != null ? String(d.sleep_quality) : "",
      });
    } catch (e) {
      if (isAbortError(e)) return;
      setDayError(e instanceof Error ? e.message : "Failed to load day info");
    }
  }, [userId, logDate]);

  const closeSavedEdit = useCallback(() => {
    setSavedEditEntry(null);
    setSavedEditDraft(null);
    setSavedEditSaveError(null);
  }, []);

  const openSavedEdit = useCallback((entry: SavedLogEntry) => {
    setSavedMenuOpenId(null);
    setSavedEditSaveError(null);
    setSavedActionError(null);
    setSavedEditEntry(entry);
    setSavedEditDraft(entryToDraft(entry));
  }, []);

  const handleSavedEditSave = useCallback(async () => {
    if (!savedEditEntry || !savedEditDraft) return;
    setSavedEditSaveError(null);
    setSavedEditSaving(true);
    try {
      await patchLog(userId, savedEditEntry.id, draftToPatch(savedEditDraft));
      closeSavedEdit();
      await refreshSaved();
      await onMutate?.();
    } catch (err) {
      setSavedEditSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavedEditSaving(false);
    }
  }, [userId, savedEditEntry, savedEditDraft, closeSavedEdit, refreshSaved, onMutate]);

  const handleSavedDelete = useCallback(
    async (entry: SavedLogEntry) => {
      setSavedActionError(null);
      if (!window.confirm(`Delete entry #${entry.id}? This cannot be undone.`)) return;
      try {
        await deleteLog(userId, entry.id);
        await refreshSaved();
        await onMutate?.();
      } catch (err) {
        setSavedActionError(err instanceof Error ? err.message : "Could not delete entry");
      }
    },
    [userId, refreshSaved, onMutate],
  );

  const setSavedEditDraftField = useCallback(<K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setSavedEditDraft((d) => (d ? { ...d, [key]: value } : null));
  }, []);

  useEffect(() => {
    setSavedMenuOpenId(null);
  }, [saved, logDate]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (savedEditDraft && savedEditEntry) {
        closeSavedEdit();
      } else if (savedMenuOpenId != null) {
        setSavedMenuOpenId(null);
      }
    };
    if (!savedEditDraft && savedMenuOpenId == null) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [savedEditDraft, savedEditEntry, savedMenuOpenId, closeSavedEdit]);

  useEffect(() => {
    if (savedMenuOpenId == null) return;
    const onPointerDown = (ev: PointerEvent) => {
      const t = ev.target;
      if (t instanceof Element && t.closest("[data-day-log-saved-menu-root]")) return;
      setSavedMenuOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [savedMenuOpenId]);

  useEffect(() => {
    if (!savedEditDraft || !savedEditEntry) return;
    const id = window.requestAnimationFrame(() => savedEditTitleRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [savedEditDraft, savedEditEntry]);

  useEffect(() => {
    if (!isReadyUserId(userId) || !logDate.trim()) return;
    const ac = new AbortController();
    setLoadError(null);
    void (async () => {
      try {
        const rows = await fetchLogs(userId, logDate, { signal: ac.signal });
        if (ac.signal.aborted) return;
        setSaved(rows);
      } catch (e) {
        if (ac.signal.aborted || isAbortError(e)) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load logs");
      }
    })();
    return () => ac.abort();
  }, [userId, logDate]);

  useEffect(() => {
    if (!isReadyUserId(userId) || !logDate.trim()) return;
    const ac = new AbortController();
    setDayError(null);
    void (async () => {
      try {
        const d = await fetchTrackerDay(userId, logDate, { signal: ac.signal });
        if (ac.signal.aborted) return;
        setDayDraft({
          cycle_day: d.cycle_day != null ? String(d.cycle_day) : "",
          sleep_hours: d.sleep_hours != null ? String(d.sleep_hours) : "",
          sleep_quality: d.sleep_quality != null ? String(d.sleep_quality) : "",
        });
      } catch (e) {
        if (ac.signal.aborted || isAbortError(e)) return;
        setDayError(e instanceof Error ? e.message : "Failed to load day info");
      }
    })();
    return () => ac.abort();
  }, [userId, logDate]);

  useEffect(() => {
    setDayContextEditing(false);
    setDayContextOpen(false);
    setFreeTextDraft("");
  }, [logDate]);

  useEffect(() => {
    if (manualError || manualSavedBanner) setManualSectionOpen(true);
  }, [manualError, manualSavedBanner]);

  useEffect(() => {
    if (!dayContextEditing) return;
    const t = window.setTimeout(() => dayContextFirstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [dayContextEditing]);

  useEffect(() => {
    if (!dayContextEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDayContextEditing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayContextEditing]);

  useEffect(() => {
    if (!manualSavedBanner) return;
    const t = window.setTimeout(() => setManualSavedBanner(false), 5000);
    return () => window.clearTimeout(t);
  }, [manualSavedBanner]);

  useEffect(() => {
    if (!daySavedBanner) return;
    const t = window.setTimeout(() => setDaySavedBanner(false), 4000);
    return () => window.clearTimeout(t);
  }, [daySavedBanner]);

  const setManualField = (key: keyof LogRow, value: string) => {
    setManualSavedBanner(false);
    setManualDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleManualSave = async () => {
    setManualError(null);
    const row = draftToLogRow(manualDraft);
    if (!row.event) {
      setManualError("Add a short description under “What happened” to save this entry.");
      return;
    }
    setManualSaving(true);
    try {
      await saveLogs(userId, logDate, [row]);
      setManualDraft(emptyManualDraft());
      setManualSavedBanner(true);
      await refreshSaved();
      await onMutate?.();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Could not save entry");
    } finally {
      setManualSaving(false);
    }
  };

  const handleSaveDay = async () => {
    setDayError(null);
    setDaySaving(true);
    try {
      const cycle = dayDraft.cycle_day.trim() === "" ? null : parseInt(dayDraft.cycle_day, 10);
      const sleepH = dayDraft.sleep_hours.trim() === "" ? null : parseFloat(dayDraft.sleep_hours);
      const sleepQ = dayDraft.sleep_quality.trim() === "" ? null : parseInt(dayDraft.sleep_quality, 10);
      await saveTrackerDay(userId, {
        log_date: logDate,
        cycle_day: cycle != null && Number.isFinite(cycle) ? cycle : null,
        sleep_hours: sleepH != null && Number.isFinite(sleepH) ? sleepH : null,
        sleep_quality: sleepQ != null && Number.isFinite(sleepQ) ? sleepQ : null,
      });
      setDaySavedBanner(true);
      await refreshDay();
      setDayContextEditing(false);
      await onMutate?.();
    } catch (e) {
      setDayError(e instanceof Error ? e.message : "Could not save day info");
    } finally {
      setDaySaving(false);
    }
  };

  const closeReview = () => {
    setReviewOpen(false);
    setExtraction(null);
    setExtractionError(null);
    setExtractionLoading(false);
  };

  const handleSaveRows = async (rows: LogRow[]) => {
    await saveLogs(
      userId,
      logDate,
      rows.map((r) => ({ ...r, source_type: "text" as const })),
    );
    closeReview();
    await refreshSaved();
    await onMutate?.();
  };

  const handleTextExtract = async () => {
    const t = freeTextDraft.trim();
    if (!t) return;
    setExtractionLoading(true);
    setExtractionError(null);
    setExtraction(null);
    try {
      const res = await extractLogs(t, logDate, { timezone: timeZone, captureKind: "text" });
      setExtraction(res);
    } catch (e) {
      setExtractionError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtractionLoading(false);
      setReviewOpen(true);
    }
  };

  const runExtraction = useCallback(
    async (text: string) => {
      setExtractionLoading(true);
      setExtractionError(null);
      setExtraction(null);
      try {
        const res = await extractLogs(text, logDate, { timezone: timeZone, captureKind: "text" });
        setExtraction(res);
      } catch (e) {
        setExtractionError(e instanceof Error ? e.message : "Extraction failed");
      } finally {
        setExtractionLoading(false);
      }
    },
    [logDate, timeZone],
  );

  return (
    <section className="entries-day-panel" aria-labelledby="day-log-panel-title">
      <h2 id="day-log-panel-title" className="entries-day-panel-title">
        Day log
      </h2>
      <p className="entries-day-panel-lead muted small">
        Pick a date, then use text or a manual row, set optional day context, and review saved rows for that day.
      </p>
      <div className="entries-day-panel-date-row">
        <label className="entries-day-panel-date-label">
          <span className="sr-only">Log date</span>
          <input className="date-input date-input--entries-day" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </label>
      </div>

      <section className="today-text-shell entries-day-sub" aria-label="Text extraction">
        <details
          className="today-text-disclosure today-secondary-disclosure"
          open={textSectionOpen}
          onToggle={(e) => setTextSectionOpen(e.currentTarget.open)}
        >
          <summary className="today-text-summary">
            <span className="today-text-summary-stack">
              <span className="today-text-summary-title" id={`text-mode-${textAreaId}`}>
                Text
              </span>
              <span className="today-text-summary-hint muted">Typed note → extract</span>
            </span>
            <span className="today-text-summary-chevron" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <div className="today-text-body">
            <label className="sr-only" htmlFor={`entries-free-text-${textAreaId}`}>
              Natural-language log note for text extraction
            </label>
            <textarea
              id={`entries-free-text-${textAreaId}`}
              className="today-free-text-input today-free-text-input--compact"
              rows={3}
              placeholder="e.g. Rough morning, better after lunch…"
              value={freeTextDraft}
              onChange={(e) => setFreeTextDraft(e.target.value)}
              disabled={reviewOpen || extractionLoading}
            />
            <div className="today-text-extract-actions">
              <button
                type="button"
                className="btn primary small today-text-extract-btn"
                disabled={!freeTextDraft.trim() || reviewOpen || extractionLoading}
                onClick={() => void handleTextExtract()}
              >
                {extractionLoading && !reviewOpen ? "Extracting…" : "Extract"}
              </button>
            </div>
          </div>
        </details>
      </section>

      <section className="today-manual-shell today-secondary-stack entries-day-sub" aria-labelledby="manual-add-heading-entries">
        <details
          className="today-manual today-manual--secondary today-manual-disclosure today-secondary-disclosure"
          open={manualSectionOpen}
          onToggle={(e) => setManualSectionOpen(e.currentTarget.open)}
        >
          <summary className="today-manual-summary">
            <span className="today-manual-summary-stack">
              <span id="manual-add-heading-entries" className="today-manual-summary-title">
                Manual
              </span>
              <span className="today-manual-summary-hint muted">Field by field, direct save</span>
            </span>
            <span className="today-manual-summary-chevron" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <div className="today-manual-body">
            <p className="today-manual-lead muted small">
              Structured fields only — fill what you know and save. No extraction step.
            </p>
            <div className="manual-add-fields">
              <label className="field field--stacked">
                <span>What happened</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. Morning walk"
                  value={manualDraft.event}
                  onChange={(e) => setManualField("event", e.target.value)}
                />
              </label>
              <div className="manual-add-time-row">
                <label className="field field--stacked">
                  <span>Start</span>
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="optional"
                    value={manualDraft.start_time}
                    onChange={(e) => setManualField("start_time", e.target.value)}
                  />
                </label>
                <label className="field field--stacked">
                  <span>End</span>
                  <input
                    type="text"
                    inputMode="text"
                    placeholder="optional"
                    value={manualDraft.end_time}
                    onChange={(e) => setManualField("end_time", e.target.value)}
                  />
                </label>
              </div>
              <details className="manual-add-more">
                <summary className="manual-add-more-summary">More fields</summary>
                <div className="manual-add-more-fields">
                  {MANUAL_MORE_KEYS.map(({ key, label }) => {
                    const opts = optionsForMetricKey(key);
                    if (opts) {
                      return (
                        <MetricSelect
                          key={key}
                          label={label}
                          value={manualDraft[key]}
                          onChange={(v) => setManualField(key, v)}
                          options={opts}
                        />
                      );
                    }
                    return (
                      <label key={key} className="field field--stacked">
                        <span>{label}</span>
                        <input type="text" value={manualDraft[key]} onChange={(e) => setManualField(key, e.target.value)} />
                      </label>
                    );
                  })}
                </div>
              </details>
            </div>
            {manualError && <p className="error-inline manual-add-error">{manualError}</p>}
            {manualSavedBanner && (
              <p className="manual-add-success manual-add-success--compact" role="status">
                Saved.
              </p>
            )}
            <div className="manual-add-actions">
              <button
                type="button"
                className="btn primary small manual-add-save"
                disabled={manualSaving}
                onClick={() => void handleManualSave()}
              >
                {manualSaving ? "Saving…" : "Save entry"}
              </button>
            </div>
          </div>
        </details>
      </section>

      <section className="today-day-context today-day-context--quiet entries-day-sub" aria-labelledby="day-heading-entries">
        <button
          type="button"
          className="day-context-trigger"
          aria-expanded={dayContextOpen}
          aria-controls="day-context-panel-entries"
          onClick={() => {
            setDayContextOpen((open) => {
              if (open) setDayContextEditing(false);
              return !open;
            });
          }}
        >
          <span className="day-context-trigger-text">
            <span className="day-context-trigger-title" id="day-heading-entries">
              Day context
            </span>
            <span className="day-context-trigger-hint muted">Optional</span>
          </span>
          <span className="day-context-trigger-icon" aria-hidden="true">
            {dayContextOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M6 15l6-6 6 6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            )}
          </span>
        </button>

        {!dayContextOpen && dayError && (
          <p className="error-inline manual-add-error day-context-collapsed-msg">{dayError}</p>
        )}
        {!dayContextOpen && daySavedBanner && (
          <p className="manual-add-success day-context-collapsed-msg" role="status">
            Day info saved.
          </p>
        )}

        {dayContextOpen && (
          <div id="day-context-panel-entries" className="day-context-panel">
            <div className="day-context-top">
              <div className="day-context-top-text">
                <p className="day-context-panel-lead muted">
                  {dayContextEditing ? "Save when you're done." : "Signals for this date only — not each log row."}
                </p>
              </div>
              {!dayContextEditing && (
                <button
                  type="button"
                  className="btn ghost small day-context-edit-btn"
                  aria-expanded={false}
                  aria-controls="day-context-editor-entries"
                  onClick={() => setDayContextEditing(true)}
                >
                  Edit
                </button>
              )}
              {dayContextEditing && (
                <span className="sr-only" aria-live="polite">
                  Editing day context
                </span>
              )}
            </div>

            {!dayContextEditing && (
              <div className="day-context-summary" role="group" aria-label="Day context values">
                <div className="day-context-stat">
                  <span className="day-context-stat-label">Cycle day</span>
                  <span className="day-context-stat-value mono">{dayDraft.cycle_day.trim() || "—"}</span>
                </div>
                <div className="day-context-stat">
                  <span className="day-context-stat-label">Sleep</span>
                  <span className="day-context-stat-value mono">
                    {dayDraft.sleep_hours.trim() ? `${dayDraft.sleep_hours.trim()} h` : "—"}
                  </span>
                </div>
                <div className="day-context-stat">
                  <span className="day-context-stat-label">Sleep quality</span>
                  <span className="day-context-stat-value day-context-stat-value--quality">
                    {(() => {
                      const q = dayDraft.sleep_quality.trim();
                      if (!q) return "—";
                      const n = Number.parseInt(q, 10);
                      return Number.isFinite(n) ? formatSleepQuality(n) : "—";
                    })()}
                  </span>
                </div>
              </div>
            )}

            <div className="day-context-editor" id="day-context-editor-entries" hidden={!dayContextEditing}>
              <div className="day-context-metrics" role="group" aria-label="Edit day context">
                <label className="day-context-metric">
                  <span className="day-context-metric-label">Cycle day</span>
                  <input
                    ref={dayContextFirstFieldRef}
                    className="day-context-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={366}
                    placeholder="optional"
                    value={dayDraft.cycle_day}
                    onChange={(e) => setDayDraft((d) => ({ ...d, cycle_day: e.target.value }))}
                  />
                </label>
                <label className="day-context-metric">
                  <span className="day-context-metric-label">Sleep</span>
                  <span className="day-context-metric-unit muted">hours</span>
                  <input
                    className="day-context-input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={24}
                    step={0.25}
                    placeholder="optional"
                    value={dayDraft.sleep_hours}
                    onChange={(e) => setDayDraft((d) => ({ ...d, sleep_hours: e.target.value }))}
                  />
                </label>
                <div className="day-context-metric day-context-metric--quality">
                  <MetricSelect
                    label="Sleep quality"
                    value={dayDraft.sleep_quality}
                    onChange={(v) => setDayDraft((d) => ({ ...d, sleep_quality: v }))}
                    options={SLEEP_QUALITY_OPTIONS}
                    density="dense"
                  />
                </div>
              </div>
              {dayError && <p className="error-inline manual-add-error day-context-inline-msg">{dayError}</p>}
              {daySavedBanner && (
                <p className="manual-add-success day-context-inline-msg" role="status">
                  Day info saved.
                </p>
              )}
              <div className="day-context-edit-footer">
                <button
                  type="button"
                  className="btn ghost small day-context-footer-btn"
                  disabled={daySaving}
                  onClick={() => setDayContextEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary small day-context-footer-btn day-context-footer-save"
                  disabled={daySaving}
                  onClick={() => void handleSaveDay()}
                >
                  {daySaving ? "Saving…" : "Save day info"}
                </button>
              </div>
            </div>

            {!dayContextEditing && dayError && <p className="error-inline manual-add-error day-context-inline-msg">{dayError}</p>}
            {!dayContextEditing && daySavedBanner && (
              <p className="manual-add-success day-context-inline-msg" role="status">
                Day info saved.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="today-entries today-entries--integrated entries-day-sub" aria-labelledby="entries-day-saved-heading">
        <h2 id="entries-day-saved-heading" className="today-entries-heading">
          Saved for this date
        </h2>
        {loadError && <p className="error-inline">{loadError}</p>}
        {savedActionError && <p className="error-inline today-saved-action-error">{savedActionError}</p>}
        {!loadError && saved.length === 0 && <p className="muted today-entries-empty">Nothing saved for this date.</p>}
        <ul className="saved-list today-saved-list">
          {saved.map((e) => {
            const metricsShort = compactMetricSummary(e);
            const timeLine = daySavedTimeDisplay(e.start_time, e.end_time);
            const menuOpen = savedMenuOpenId === e.id;
            const menuDomId = `entries-day-saved-menu-${e.id}`;
            return (
              <li key={e.id} className="saved-item today-saved-item">
                <div className="today-saved-item-head">
                  <div className="today-saved-item-main">
                    <div className="today-saved-item-meta-row">
                      {timeLine != null && <span className="mono muted today-saved-item-times">{timeLine}</span>}
                      {metricsShort && (
                        <span className="today-saved-item-metrics-compact mono muted" aria-label="Metrics summary">
                          {metricsShort}
                        </span>
                      )}
                      <span className="today-saved-item-source">{e.source_type}</span>
                    </div>
                    <p className="today-saved-item-event">{e.event?.trim() ? e.event : "(no event)"}</p>
                    {(e.comments || e.music) && (
                      <p className="today-saved-item-foot muted small">
                        {[e.music && e.music, e.comments].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="entries-item-menu-wrap" data-day-log-saved-menu-root>
                    <button
                      type="button"
                      className="entries-item-menu-trigger"
                      aria-label="Saved entry actions"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-controls={menuDomId}
                      onClick={() => setSavedMenuOpenId((id) => (id === e.id ? null : e.id))}
                    >
                      <span aria-hidden="true" className="entries-item-menu-icon">
                        ⋯
                      </span>
                    </button>
                    {menuOpen && (
                      <ul id={menuDomId} className="entries-item-menu" role="menu">
                        <li role="presentation">
                          <button type="button" className="entries-item-menu-item" role="menuitem" onClick={() => openSavedEdit(e)}>
                            Edit
                          </button>
                        </li>
                        <li role="presentation">
                          <button
                            type="button"
                            className="entries-item-menu-item entries-item-menu-item--danger"
                            role="menuitem"
                            onClick={() => {
                              setSavedMenuOpenId(null);
                              void handleSavedDelete(e);
                            }}
                          >
                            Delete
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {savedEditDraft && savedEditEntry && (
        <>
          <div className="log-edit-backdrop" role="presentation" onClick={closeSavedEdit} />
          <div
            className="log-edit-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="entries-day-log-edit-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="log-edit-sheet-scroll">
              <div className="log-edit-sheet-head">
                <h2 id="entries-day-log-edit-title" ref={savedEditTitleRef} tabIndex={-1}>
                  Edit entry #{savedEditEntry.id}
                </h2>
                <button type="button" className="btn btn-text log-edit-close" onClick={closeSavedEdit}>
                  Close
                </button>
              </div>
              <div className="log-edit-fields">
                <label className="field field--stacked">
                  <span>Log date</span>
                  <input
                    type="date"
                    value={savedEditDraft.log_date}
                    onChange={(ev) => setSavedEditDraftField("log_date", ev.target.value)}
                  />
                </label>
                <label className="field field--stacked">
                  <span id={savedEditSourceLabelId}>Source</span>
                  <CalmSelect
                    variant="field"
                    aria-labelledby={savedEditSourceLabelId}
                    value={savedEditDraft.source_type}
                    onChange={(v) => setSavedEditDraftField("source_type", v as EditDraft["source_type"])}
                    options={LOG_EDIT_SOURCE_OPTIONS}
                  />
                </label>
                <label className="field field--stacked">
                  <span>What happened</span>
                  <input type="text" value={savedEditDraft.event} onChange={(ev) => setSavedEditDraftField("event", ev.target.value)} />
                </label>
                <div className="manual-add-time-row">
                  <label className="field field--stacked">
                    <span>Start</span>
                    <input type="text" value={savedEditDraft.start_time} onChange={(ev) => setSavedEditDraftField("start_time", ev.target.value)} />
                  </label>
                  <label className="field field--stacked">
                    <span>End</span>
                    <input type="text" value={savedEditDraft.end_time} onChange={(ev) => setSavedEditDraftField("end_time", ev.target.value)} />
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
                      value={savedEditDraft[key]}
                      onChange={(v) => setSavedEditDraftField(key, v)}
                      options={opts}
                    />
                  );
                })}
                {optionsForMetricKey("music") && (
                  <MetricSelect
                    label="Music"
                    value={savedEditDraft.music}
                    onChange={(v) => setSavedEditDraftField("music", v)}
                    options={optionsForMetricKey("music")!}
                  />
                )}
                <label className="field field--stacked">
                  <span>Comments</span>
                  <textarea
                    className="log-edit-comments"
                    rows={3}
                    value={savedEditDraft.comments}
                    onChange={(ev) => setSavedEditDraftField("comments", ev.target.value)}
                  />
                </label>
              </div>
              {savedEditSaveError && <p className="error-inline log-edit-error">{savedEditSaveError}</p>}
            </div>
            <div className="log-edit-footer">
              <button type="button" className="btn ghost" onClick={closeSavedEdit} disabled={savedEditSaving}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void handleSavedEditSave()} disabled={savedEditSaving}>
                {savedEditSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      <ReviewExtractionModal
        open={reviewOpen}
        transcript={freeTextDraft}
        logDate={logDate}
        userId={userId}
        extractSourceType="text"
        extraction={extraction}
        extractionLoading={extractionLoading}
        extractionError={extractionError}
        onRetryExtract={() => void runExtraction(freeTextDraft)}
        onSave={handleSaveRows}
        onDiscard={closeReview}
      />
    </section>
  );
}
