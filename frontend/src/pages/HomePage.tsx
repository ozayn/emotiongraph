import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { blobFailsMinimumSpeechEnergy } from "../audioSilence";
import { extractLogs, fetchLogs, saveLogs, transcribeAudio } from "../api";
import { useSession } from "../session/SessionContext";
import { todayIsoInTimeZone } from "../datesTz";
import AudioRecorder from "../components/AudioRecorder";
import ReviewExtractionModal from "../components/ReviewExtractionModal";
import { displayNameForUser } from "../userDisplay";
import type { ExtractLogsResponse, LogRow, User } from "../types";

type Props = { userId: number; timeZone: string; users?: User[] };

type CaptureMode = "voice" | "text";

export default function HomePage({ userId, timeZone, users }: Props) {
  const { pathFor } = useSession();
  const textAreaId = useId();
  /** Always “today” for the active profile’s effective timezone — no picker on home. */
  const logDate = todayIsoInTimeZone(timeZone);

  const [captureMode, setCaptureMode] = useState<CaptureMode>("voice");
  const [textDraft, setTextDraft] = useState("");
  const [reviewCaptureKind, setReviewCaptureKind] = useState<"voice" | "text">("voice");

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
  const [textSavedAck, setTextSavedAck] = useState(false);
  const textSavedAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTextSavedAckTimer = useCallback(() => {
    if (textSavedAckTimerRef.current != null) {
      clearTimeout(textSavedAckTimerRef.current);
      textSavedAckTimerRef.current = null;
    }
  }, []);

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

  useEffect(() => {
    return () => clearTextSavedAckTimer();
  }, [clearTextSavedAckTimer]);

  useEffect(() => {
    if (captureMode !== "text") {
      setTextSavedAck(false);
      clearTextSavedAckTimer();
    }
  }, [captureMode, clearTextSavedAckTimer]);

  const runExtraction = useCallback(
    async (text: string) => {
      setExtractionLoading(true);
      setExtractionError(null);
      setExtraction(null);
      try {
        const res = await extractLogs(text, logDate, { timezone: timeZone, captureKind: reviewCaptureKind });
        setExtraction(res);
      } catch (e) {
        setExtractionError(e instanceof Error ? e.message : "Extraction failed");
      } finally {
        setExtractionLoading(false);
      }
    },
    [logDate, timeZone, reviewCaptureKind],
  );

  const handleRecordingComplete = async (recording: Blob) => {
    setReviewCaptureKind("voice");
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

  const handleTextExtract = async () => {
    const t = textDraft.trim();
    if (!t) return;
    setReviewCaptureKind("text");
    setTranscript(t);
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

  const closeReview = () => {
    setReviewOpen(false);
    setTranscript("");
    setExtraction(null);
    setExtractionError(null);
    setExtractionLoading(false);
    setBlob(null);
  };

  const handleSaveRows = async (rows: LogRow[]) => {
    const fromTextCapture = reviewCaptureKind === "text";
    const sourceType = fromTextCapture ? ("text" as const) : ("voice" as const);
    await saveLogs(
      userId,
      logDate,
      rows.map((r) => ({ ...r, source_type: sourceType })),
    );
    closeReview();
    if (fromTextCapture) {
      setTextDraft("");
      clearTextSavedAckTimer();
      setTextSavedAck(true);
      textSavedAckTimerRef.current = setTimeout(() => {
        setTextSavedAck(false);
        textSavedAckTimerRef.current = null;
      }, 2600);
    }
    void refreshTodayLogCount();
  };

  const recordingLocked = pipelineLoading || reviewOpen || extractionLoading;
  const textInputLocked = reviewOpen || extractionLoading;
  const modeSwitchLocked =
    pipelineLoading ||
    reviewOpen ||
    extractionLoading ||
    recordingActive ||
    (captureMode === "voice" && blob != null && !pipelineLoading && !reviewOpen);

  const recordPanelClass = [
    "today-record",
    "today-record--primary",
    "today-record--voice-home",
    "panel-elevated",
    "record-panel",
    captureMode === "voice" && recordingActive && "record-panel--live",
    captureMode === "voice" && pipelineLoading && "record-panel--processing",
    captureMode === "voice" && blob && !pipelineLoading && !reviewOpen && "record-panel--captured",
  ]
    .filter(Boolean)
    .join(" ");

  const textCapturePanelClass = [
    "today-record",
    "today-record--primary",
    "today-record--voice-home",
    "panel-elevated",
    "home-capture-text-panel",
  ].join(" ");

  const profileSelf = users?.find((u) => u.id === userId);
  const profileName = profileSelf ? displayNameForUser(profileSelf) : "there";

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
            <p className="today-voice-home-greeting">Hello, {profileName}</p>
            <div className="home-capture-mode-switch" role="tablist" aria-label="Capture mode">
              <button
                type="button"
                role="tab"
                id="home-capture-voice"
                aria-selected={captureMode === "voice"}
                aria-controls="home-capture-panel"
                className="home-capture-mode-btn"
                disabled={modeSwitchLocked && captureMode !== "voice"}
                onClick={() => setCaptureMode("voice")}
              >
                Voice
              </button>
              <button
                type="button"
                role="tab"
                id="home-capture-text"
                aria-selected={captureMode === "text"}
                aria-controls="home-capture-panel"
                className="home-capture-mode-btn"
                disabled={modeSwitchLocked && captureMode !== "text"}
                onClick={() => setCaptureMode("text")}
              >
                Text
              </button>
            </div>
          </div>

          <section
            id="home-capture-panel"
            role="tabpanel"
            aria-labelledby={captureMode === "voice" ? "home-capture-voice" : "home-capture-text"}
            className={captureMode === "voice" ? recordPanelClass : textCapturePanelClass}
            aria-label={captureMode === "voice" ? "Voice recording" : "Text log"}
          >
            {captureMode === "voice" ? (
              <>
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
              </>
            ) : (
              <>
                <h2 className="sr-only">Text log</h2>
                <label className="sr-only" htmlFor={`home-free-text-${textAreaId}`}>
                  Natural-language log note for text extraction
                </label>
                <textarea
                  id={`home-free-text-${textAreaId}`}
                  className="today-free-text-input today-free-text-input--compact home-capture-textarea"
                  rows={4}
                  placeholder="e.g. Rough morning, better after lunch…"
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  disabled={textInputLocked}
                />
                <div className="today-text-extract-actions home-capture-text-actions">
                  <button
                    type="button"
                    className="btn primary small today-text-extract-btn"
                    disabled={!textDraft.trim() || textInputLocked}
                    onClick={() => void handleTextExtract()}
                  >
                    {extractionLoading && !reviewOpen ? "Extracting…" : "Extract"}
                  </button>
                </div>
                {textSavedAck ? (
                  <p className="home-capture-saved-hint" role="status" aria-live="polite">
                    Saved to Today
                  </p>
                ) : null}
              </>
            )}
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
        extractSourceType={reviewCaptureKind}
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
