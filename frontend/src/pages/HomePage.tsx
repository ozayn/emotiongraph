import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { blobFailsMinimumSpeechEnergy } from "../audioSilence";
import { extractLogs, fetchLogs, saveLogs, transcribeAudio } from "../api";
import { useSession } from "../session/SessionContext";
import { todayIsoInTimeZone } from "../datesTz";
import AudioRecorder from "../components/AudioRecorder";
import ReviewExtractionModal from "../components/ReviewExtractionModal";
import type { ExtractLogsResponse, LogRow, User } from "../types";

type Props = { userId: number; timeZone: string; users?: User[] };

export default function HomePage({ userId, timeZone, users }: Props) {
  const { pathFor } = useSession();
  /** Always “today” for the active profile’s effective timezone — no picker on home. */
  const logDate = todayIsoInTimeZone(timeZone);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<"transcribe" | "extract">("transcribe");
  const [stepError, setStepError] = useState<string | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] = useState<ExtractLogsResponse | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const [recordingActive, setRecordingActive] = useState(false);
  const [todayLogCount, setTodayLogCount] = useState<number | null>(null);

  const refreshTodayLogCount = useCallback(async () => {
    try {
      const rows = await fetchLogs(userId, logDate);
      setTodayLogCount(rows.length);
    } catch {
      setTodayLogCount(null);
    }
  }, [userId, logDate]);

  useEffect(() => {
    void refreshTodayLogCount();
  }, [refreshTodayLogCount]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshTodayLogCount();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshTodayLogCount]);

  const runExtraction = useCallback(
    async (text: string) => {
      setExtractionLoading(true);
      setExtractionError(null);
      setExtraction(null);
      try {
        const res = await extractLogs(text, logDate, { timezone: timeZone, captureKind: "voice" });
        setExtraction(res);
      } catch (e) {
        setExtractionError(e instanceof Error ? e.message : "Extraction failed");
      } finally {
        setExtractionLoading(false);
      }
    },
    [logDate, timeZone],
  );

  const handleRecordingComplete = async (recording: Blob) => {
    setBlob(recording);
    setStepError(null);
    setPipelineLoading(true);
    setPipelinePhase("transcribe");
    const likelySilent = await blobFailsMinimumSpeechEnergy(recording);
    if (likelySilent === true) {
      setStepError("No usable speech detected.");
      setPipelineLoading(false);
      return;
    }
    try {
      const { transcript: text } = await transcribeAudio(recording, "recording.webm");
      setTranscript(text);

      setPipelinePhase("extract");
      setExtractionLoading(true);
      setExtractionError(null);
      setExtraction(null);
      try {
        const res = await extractLogs(text, logDate, { timezone: timeZone, captureKind: "voice" });
        setExtraction(res);
      } catch (e) {
        setExtractionError(e instanceof Error ? e.message : "Extraction failed");
      } finally {
        setExtractionLoading(false);
      }

      setReviewOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("No usable speech detected")) {
        setStepError("No usable speech detected.");
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
    void refreshTodayLogCount();
  };

  const recordingLocked = pipelineLoading || reviewOpen || extractionLoading;

  const recordPanelClass = [
    "today-record",
    "today-record--primary",
    "today-record--voice-home",
    "panel-elevated",
    "record-panel",
    recordingActive && "record-panel--live",
    pipelineLoading && "record-panel--processing",
    blob && !pipelineLoading && !reviewOpen && "record-panel--captured",
  ]
    .filter(Boolean)
    .join(" ");

  const profileName = users?.find((u) => u.id === userId)?.name?.trim() || "there";

  return (
    <div className="today-page today-page--voice-home">
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

      <div className="today-voice-home">
        <div className="launch-backdrop" aria-hidden="true">
          <div className="launch-ambient" />
          <div className="launch-field" />
        </div>
        <div className="today-voice-home-stack">
          <div className="today-voice-home-inner">
            <p className="today-voice-home-greeting">Hi, {profileName}</p>
          </div>

          <section
            className={recordPanelClass}
            aria-label="Voice recording"
          >
            <h2 className="sr-only">Voice log</h2>
            <AudioRecorder
              disabled={recordingLocked}
              processing={pipelineLoading}
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
        </div>
      </div>

      <nav className="home-today-strip" aria-label="Today’s saved entries">
        <Link className="home-today-link" to={`${pathFor("/today")}#entries-history-focus`}>
          <span className="home-today-label">Today</span>
          {todayLogCount != null && todayLogCount > 0 ? (
            <span className="home-today-count mono" aria-label={`${todayLogCount} saved for today`}>
              {todayLogCount}
            </span>
          ) : null}
        </Link>
      </nav>

      <ReviewExtractionModal
        open={reviewOpen}
        transcript={transcript}
        logDate={logDate}
        userId={userId}
        extractSourceType="voice"
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
