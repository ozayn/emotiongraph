import { useCallback, useEffect, useRef, useState } from "react";
import { extractLogs, fetchLogs, fetchTrackerDay, saveLogs, saveTrackerDay, transcribeAudio } from "../api";
import AudioRecorder from "../components/AudioRecorder";
import MetricSelect from "../components/MetricSelect";
import ReviewExtractionModal from "../components/ReviewExtractionModal";
import type { ExtractLogsResponse, LogRow, SavedLogEntry } from "../types";
import {
  formatAnxiety,
  formatContentment,
  formatEnergy,
  formatFocus,
  formatSleepQuality,
  optionsForMetricKey,
  SLEEP_QUALITY_OPTIONS,
} from "../trackerOptions";

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

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateHeading(iso: string): string {
  const parts = iso.split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d || parts.length !== 3) return iso;
  const dt = new Date(y, m - 1, d);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  if (dt.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return dt.toLocaleDateString(undefined, opts);
}

type TodayPageProps = { userId: number };

function isReadyUserId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return e instanceof Error && e.name === "AbortError";
}

export default function TodayPage({ userId }: TodayPageProps) {
  const [logDate, setLogDate] = useState(todayIso);
  const [saved, setSaved] = useState<SavedLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<"transcribe" | "extract">("transcribe");
  const [stepError, setStepError] = useState<string | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] = useState<ExtractLogsResponse | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const [manualDraft, setManualDraft] = useState(emptyManualDraft);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSavedBanner, setManualSavedBanner] = useState(false);

  const [dayDraft, setDayDraft] = useState({ cycle_day: "", sleep_hours: "", sleep_quality: "" });
  const [daySaving, setDaySaving] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [daySavedBanner, setDaySavedBanner] = useState(false);
  const [dayContextOpen, setDayContextOpen] = useState(false);
  const [dayContextEditing, setDayContextEditing] = useState(false);
  const dayContextFirstFieldRef = useRef<HTMLInputElement>(null);

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
  }, [logDate]);

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
    } catch (e) {
      setDayError(e instanceof Error ? e.message : "Could not save day info");
    } finally {
      setDaySaving(false);
    }
  };

  const handleRecordingComplete = async (recording: Blob) => {
    setBlob(recording);
    setStepError(null);
    setPipelineLoading(true);
    setPipelinePhase("transcribe");
    try {
      const { transcript: text } = await transcribeAudio(recording, "recording.webm");
      setTranscript(text);

      setPipelinePhase("extract");
      setExtractionLoading(true);
      setExtractionError(null);
      setExtraction(null);
      try {
        const res = await extractLogs(text, logDate);
        setExtraction(res);
      } catch (e) {
        setExtractionError(e instanceof Error ? e.message : "Extraction failed");
      } finally {
        setExtractionLoading(false);
      }

      setReviewOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("no usable speech")) {
        setStepError("Transcription failed or returned no usable speech.");
      } else {
        setStepError(msg || "Transcription failed");
      }
    } finally {
      setPipelineLoading(false);
    }
  };

  const closeReview = () => {
    setReviewOpen(false);
    setTranscript("");
    setExtraction(null);
    setExtractionError(null);
    setExtractionLoading(false);
    setBlob(null);
  };

  const handleSaveRows = async (rows: LogRow[]) => {
    await saveLogs(
      userId,
      logDate,
      rows.map((r) => ({ ...r, source_type: "voice" as const })),
    );
    closeReview();
    await refreshSaved();
  };

  const runExtraction = useCallback(
    async (text: string) => {
      setExtractionLoading(true);
      setExtractionError(null);
      setExtraction(null);
      try {
        const res = await extractLogs(text, logDate);
        setExtraction(res);
      } catch (e) {
        setExtractionError(e instanceof Error ? e.message : "Extraction failed");
      } finally {
        setExtractionLoading(false);
      }
    },
    [logDate],
  );

  const recordingLocked = pipelineLoading || reviewOpen;
  const [recordingActive, setRecordingActive] = useState(false);

  const recordPanelClass = [
    "today-record",
    "today-record--primary",
    "panel-elevated",
    "record-panel",
    recordingActive && "record-panel--live",
    pipelineLoading && "record-panel--processing",
    blob && !pipelineLoading && !reviewOpen && "record-panel--captured",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="today-page">
      {pipelineLoading && (
        <div className="pipeline-overlay" aria-busy="true" aria-live="polite">
          <div className="pipeline-card">
            <div className="pipeline-spinner" aria-hidden="true" />
            <p className="pipeline-title" key={pipelinePhase}>
              {pipelinePhase === "transcribe" ? "Transcribing…" : "Extracting entries…"}
            </p>
          </div>
        </div>
      )}

      <header className="today-header">
        <h1 className="today-title">
          <time dateTime={logDate}>{formatDateHeading(logDate)}</time>
        </h1>
        <label className="today-date-label">
          <span className="sr-only">Change log date</span>
          <input className="date-input date-input--compact" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </label>
      </header>

      <section className={recordPanelClass} aria-label="Voice log">
        <AudioRecorder
          disabled={recordingLocked}
          onRecorded={(b) => void handleRecordingComplete(b)}
          onRecordingActiveChange={setRecordingActive}
        />
        {blob && !pipelineLoading && !reviewOpen && (
          <div className="today-record-secondary">
            {stepError && (
              <button type="button" className="btn primary btn-retry" onClick={() => void handleRecordingComplete(blob)}>
                Try again
              </button>
            )}
            <button type="button" className="btn btn-text btn-clear-recording" onClick={() => { setBlob(null); setStepError(null); }}>
              Discard recording
            </button>
          </div>
        )}
        {stepError && <p className="error-inline error-inline--spaced">{stepError}</p>}
      </section>

      <section className="today-manual today-manual--secondary" aria-labelledby="manual-add-heading">
        <h2 className="today-manual-heading" id="manual-add-heading">
          Type instead
        </h2>
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
            <summary className="manual-add-more-summary">More fields (optional)</summary>
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
          <p className="manual-add-success" role="status">
            Saved.
          </p>
        )}
        <div className="manual-add-actions">
          <button type="button" className="btn primary manual-add-save" disabled={manualSaving} onClick={() => void handleManualSave()}>
            {manualSaving ? "Saving…" : "Save entry"}
          </button>
        </div>
      </section>

      <section className="today-day-context" aria-labelledby="day-heading">
        <button
          type="button"
          className="day-context-trigger"
          aria-expanded={dayContextOpen}
          aria-controls="day-context-panel"
          onClick={() => {
            setDayContextOpen((open) => {
              if (open) setDayContextEditing(false);
              return !open;
            });
          }}
        >
          <span className="day-context-trigger-text">
            <span className="day-context-trigger-title" id="day-heading">
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
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
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
          <div id="day-context-panel" className="day-context-panel">
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
                  aria-controls="day-context-editor"
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

            <div className="day-context-editor" id="day-context-editor" hidden={!dayContextEditing}>
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

      <section className="today-entries">
        <h2 className="today-entries-heading">Saved</h2>
        {loadError && <p className="error-inline">{loadError}</p>}
        {!loadError && saved.length === 0 && <p className="muted today-entries-empty">Nothing saved yet.</p>}
        <ul className="saved-list">
          {saved.map((e) => (
            <li key={e.id} className="saved-item">
              <div className="saved-item-top">
                <span className="saved-item-id mono" title="Database id">
                  #{e.id}
                </span>
                <span className="mono muted saved-item-times">
                  {e.start_time ?? "—"} – {e.end_time ?? "—"}
                </span>
              </div>
              <div className="saved-item-body">{e.event ?? "(no event)"}</div>
              {(e.energy_level != null ||
                e.anxiety != null ||
                e.contentment != null ||
                e.focus != null) && (
                <div className="saved-item-metrics muted small">
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
              {(e.comments || e.music) && (
                <div className="saved-item-meta muted small">
                  {[e.music && `Music · ${e.music}`, e.comments].filter(Boolean).join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <ReviewExtractionModal
        open={reviewOpen}
        transcript={transcript}
        logDate={logDate}
        extraction={extraction}
        extractionLoading={extractionLoading}
        extractionError={extractionError}
        onRetryExtract={() => void runExtraction(transcript)}
        onSave={handleSaveRows}
        onDiscard={closeReview}
      />
    </div>
  );
}
