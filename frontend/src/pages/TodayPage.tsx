import { useCallback, useEffect, useState } from "react";
import { extractLogs, fetchLogs, saveLogs, transcribeAudio } from "../api";
import AudioRecorder from "../components/AudioRecorder";
import ReviewExtractionModal from "../components/ReviewExtractionModal";
import type { ExtractLogsResponse, LogRow, SavedLogEntry } from "../types";

const MANUAL_FIELD_KEYS: { key: keyof LogRow; label: string; type?: "number" }[] = [
  { key: "start_time", label: "Start" },
  { key: "end_time", label: "End" },
  { key: "event", label: "What happened" },
  { key: "event_category", label: "Category" },
  { key: "energy_level", label: "Energy", type: "number" },
  { key: "anxiety", label: "Anxiety", type: "number" },
  { key: "contentment", label: "Contentment", type: "number" },
  { key: "focus", label: "Focus", type: "number" },
  { key: "music", label: "Music" },
  { key: "comments", label: "Comments" },
];

function emptyManualDraft(): Record<keyof LogRow, string> {
  return {
    start_time: "",
    end_time: "",
    event: "",
    event_category: "",
    energy_level: "",
    anxiety: "",
    contentment: "",
    focus: "",
    music: "",
    comments: "",
  };
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
    event_category: trim(d.event_category),
    energy_level: num(d.energy_level),
    anxiety: num(d.anxiety),
    contentment: num(d.contentment),
    focus: num(d.focus),
    music: trim(d.music),
    comments: trim(d.comments),
  };
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function TodayPage() {
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

  const refreshSaved = useCallback(async () => {
    setLoadError(null);
    try {
      const rows = await fetchLogs(logDate);
      setSaved(rows);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load logs");
    }
  }, [logDate]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    if (!manualSavedBanner) return;
    const t = window.setTimeout(() => setManualSavedBanner(false), 5000);
    return () => window.clearTimeout(t);
  }, [manualSavedBanner]);

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
      await saveLogs(logDate, [row]);
      setManualDraft(emptyManualDraft());
      setManualSavedBanner(true);
      await refreshSaved();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Could not save entry");
    } finally {
      setManualSaving(false);
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
    await saveLogs(logDate, rows);
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
            <p className="pipeline-sub muted">This usually takes a few seconds.</p>
          </div>
        </div>
      )}

      <header className="today-header">
        <h1 className="today-title">Today</h1>
        <label className="today-date-label">
          <span className="sr-only">Log date</span>
          <input className="date-input date-input--compact" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </label>
      </header>

      <section className={recordPanelClass}>
        <p className="record-panel-label">Voice</p>
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

      <section className="today-manual panel-elevated" aria-labelledby="manual-add-heading">
        <p className="record-panel-label" id="manual-add-heading">
          Add entry
        </p>
        <p className="manual-add-lead muted small">Type one row and save — no recording needed.</p>
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
              {MANUAL_FIELD_KEYS.filter((f) => !["event", "start_time", "end_time"].includes(f.key)).map(({ key, label, type }) => (
                <label key={key} className="field field--stacked">
                  <span>{label}</span>
                  <input
                    type={type === "number" ? "number" : "text"}
                    inputMode={type === "number" ? "numeric" : undefined}
                    value={manualDraft[key]}
                    onChange={(e) => setManualField(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
        {manualError && <p className="error-inline manual-add-error">{manualError}</p>}
        {manualSavedBanner && (
          <p className="manual-add-success" role="status">
            Saved to your log — it should appear in the list below.
          </p>
        )}
        <div className="manual-add-actions">
          <button type="button" className="btn primary manual-add-save" disabled={manualSaving} onClick={() => void handleManualSave()}>
            {manualSaving ? "Saving…" : "Save entry"}
          </button>
        </div>
      </section>

      <section className="today-entries">
        <h2 className="today-entries-heading">Today&apos;s log</h2>
        {loadError && <p className="error-inline">{loadError}</p>}
        {!loadError && saved.length === 0 && <p className="muted today-entries-empty">Nothing saved for this date yet.</p>}
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
              {e.event_category && <div className="saved-item-category muted small">{e.event_category}</div>}
              {(e.energy_level != null ||
                e.anxiety != null ||
                e.contentment != null ||
                e.focus != null) && (
                <div className="saved-item-metrics mono muted small">
                  {[
                    e.energy_level != null ? `E ${e.energy_level}` : null,
                    e.anxiety != null ? `A ${e.anxiety}` : null,
                    e.contentment != null ? `C ${e.contentment}` : null,
                    e.focus != null ? `F ${e.focus}` : null,
                  ]
                    .filter((x): x is string => x != null)
                    .join(" · ")}
                </div>
              )}
              {(e.comments || e.music) && (
                <div className="saved-item-meta muted small">
                  {[e.music && `Music: ${e.music}`, e.comments].filter(Boolean).join(" · ")}
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
