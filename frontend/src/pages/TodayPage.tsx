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
  const [busy, setBusy] = useState(false);
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

  const openReviewPipeline = async () => {
    if (!blob) return;
    setStepError(null);
    setBusy(true);
    try {
      const { transcript: text } = await transcribeAudio(blob, "recording.webm");
      setTranscript(text);
      setReviewOpen(true);
      void runExtraction(text);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setBusy(false);
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

  return (
    <div className="today-page">
      <div className="page-intro">
        <h1>Today</h1>
        <p className="lede">Log date</p>
        <input
          className="date-input"
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
        />
      </div>

      <section className="panel">
        <h2>Voice log</h2>
        <p className="muted small">
          Record, then open review. Transcription and extraction run on the server; only your explicit save writes to
          the database.
        </p>
        <AudioRecorder disabled={busy || reviewOpen} onRecorded={setBlob} />
        <div className="voice-actions">
          <button
            type="button"
            className="btn primary"
            disabled={!blob || busy || reviewOpen}
            onClick={() => void openReviewPipeline()}
          >
            {busy ? "Working…" : "Transcribe & review"}
          </button>
          {blob && !reviewOpen && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setBlob(null)}>
              Clear recording
            </button>
          )}
        </div>
        {stepError && <p className="error-inline">{stepError}</p>}
      </section>

      <section className="panel">
        <h2>Saved entries</h2>
        {loadError && <p className="error-inline">{loadError}</p>}
        {!loadError && saved.length === 0 && <p className="muted">No entries for this date.</p>}
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
