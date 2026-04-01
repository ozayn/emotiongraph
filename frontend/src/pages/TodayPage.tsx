import { useCallback, useEffect, useState } from "react";
import { extractLogs, fetchLogs, saveLogs, transcribeAudio } from "../api";
import AudioRecorder from "../components/AudioRecorder";
import ReviewExtractionModal from "../components/ReviewExtractionModal";
import type { ExtractLogsResponse, LogRow, SavedLogEntry } from "../types";

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

  return (
    <div className="today-page">
      {pipelineLoading && (
        <div className="pipeline-overlay" aria-busy="true" aria-live="polite">
          <div className="pipeline-card">
            <div className="pipeline-spinner" />
            <p className="pipeline-title">
              {pipelinePhase === "transcribe" ? "Transcribing…" : "Extracting entries…"}
            </p>
            <p className="pipeline-sub muted">Usually a few seconds.</p>
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

      <section className="today-record panel-elevated">
        <AudioRecorder disabled={recordingLocked} onRecorded={(b) => void handleRecordingComplete(b)} />
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

      <section className="today-entries">
        <h2 className="today-entries-heading">Today&apos;s log</h2>
        {loadError && <p className="error-inline">{loadError}</p>}
        {!loadError && saved.length === 0 && <p className="muted today-entries-empty">Nothing saved for this date yet.</p>}
        <ul className="saved-list">
          {saved.map((e) => (
            <li key={e.id} className="saved-item">
              <div className="saved-item-top">
                <span className="mono muted">
                  {e.start_time ?? "—"} – {e.end_time ?? "—"}
                </span>
              </div>
              <div className="saved-item-body">{e.event ?? "(no event)"}</div>
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
