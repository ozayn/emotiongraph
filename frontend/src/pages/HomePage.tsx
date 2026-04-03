import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { blobFailsMinimumSpeechEnergy } from "../audioSilence";
import {
  deleteLog,
  extractLogs,
  fetchLogs,
  patchLog,
  saveLogs,
  transcribeAudio,
  type LogEntryPatchBody,
} from "../api";
import { useSession } from "../session/SessionContext";
import { todayIsoInTimeZone } from "../datesTz";
import AudioRecorder from "../components/AudioRecorder";
import ReviewExtractionModal, { type ReviewSaveMeta } from "../components/ReviewExtractionModal";
import { displayNameForUser } from "../userDisplay";
import type { ExtractLogsResponse, LogRow, User } from "../types";

type Props = { userId: number; timeZone: string; users?: User[] };

type CaptureMode = "voice" | "text";

/** Snackbar auto-hide: long enough to read + tap Review (conventional “long” snackbar range). */
const SAVE_TOAST_AUTO_DISMISS_MS = 8500;

function normalizeExtractedRows(raw: LogRow[]): LogRow[] {
  return raw.map((row) => ({
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    event: row.event ?? null,
    energy_level: row.energy_level ?? null,
    anxiety: row.anxiety ?? null,
    contentment: row.contentment ?? null,
    focus: row.focus ?? null,
    music: row.music ?? null,
    comments: row.comments ?? null,
  }));
}

function logRowToPatchBody(row: LogRow): LogEntryPatchBody {
  return {
    start_time: row.start_time,
    end_time: row.end_time,
    event: row.event,
    energy_level: row.energy_level,
    anxiety: row.anxiety,
    contentment: row.contentment,
    focus: row.focus,
    music: row.music,
    comments: row.comments,
  };
}

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
  const [postExtractSaveError, setPostExtractSaveError] = useState<string | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] = useState<ExtractLogsResponse | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  /** After auto-save on home: server ids for this capture (enables review without duplicate insert). */
  const [pendingReviewEntryIds, setPendingReviewEntryIds] = useState<number[] | null>(null);

  const [recordingActive, setRecordingActive] = useState(false);
  const [todayLogCount, setTodayLogCount] = useState<number | null>(null);
  const [saveToastOpen, setSaveToastOpen] = useState(false);
  const [saveToastOfferReview, setSaveToastOfferReview] = useState(false);
  const saveToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewSessionInitialIdsRef = useRef<number[] | null>(null);

  const clearSaveToastTimer = useCallback(() => {
    if (saveToastTimerRef.current != null) {
      clearTimeout(saveToastTimerRef.current);
      saveToastTimerRef.current = null;
    }
  }, []);

  const showSaveToast = useCallback(
    (offerReview: boolean) => {
      clearSaveToastTimer();
      setSaveToastOfferReview(offerReview);
      setSaveToastOpen(true);
      saveToastTimerRef.current = setTimeout(() => {
        setSaveToastOpen(false);
        saveToastTimerRef.current = null;
      }, SAVE_TOAST_AUTO_DISMISS_MS);
    },
    [clearSaveToastTimer],
  );

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
    return () => clearSaveToastTimer();
  }, [clearSaveToastTimer]);

  useEffect(() => {
    if (reviewOpen) {
      reviewSessionInitialIdsRef.current = pendingReviewEntryIds;
    }
  }, [reviewOpen, pendingReviewEntryIds]);

  useEffect(() => {
    if (captureMode !== "text") {
      setSaveToastOpen(false);
      clearSaveToastTimer();
    }
  }, [captureMode, clearSaveToastTimer]);

  const resetCaptureDraft = useCallback(() => {
    setReviewOpen(false);
    setTranscript("");
    setExtraction(null);
    setExtractionError(null);
    setExtractionLoading(false);
    setBlob(null);
    setPendingReviewEntryIds(null);
    reviewSessionInitialIdsRef.current = null;
    setPostExtractSaveError(null);
  }, []);

  const closeReviewSheet = useCallback(() => {
    setReviewOpen(false);
    setExtractionLoading(false);
  }, []);

  const closeReviewAfterSave = useCallback(() => {
    closeReviewSheet();
    setTranscript("");
    setExtraction(null);
    setExtractionError(null);
    setBlob(null);
    setPendingReviewEntryIds(null);
    reviewSessionInitialIdsRef.current = null;
  }, [closeReviewSheet]);

  const handleReviewDiscard = useCallback(() => {
    if (pendingReviewEntryIds != null && pendingReviewEntryIds.length > 0) {
      closeReviewSheet();
      return;
    }
    resetCaptureDraft();
  }, [pendingReviewEntryIds, closeReviewSheet, resetCaptureDraft]);

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

  const retryExtract = useCallback(async () => {
    const ids = pendingReviewEntryIds;
    setPendingReviewEntryIds(null);
    if (ids && ids.length > 0) {
      for (const id of ids) {
        try {
          await deleteLog(userId, id);
        } catch {
          /* best-effort: avoid blocking retry */
        }
      }
      void refreshTodayLogCount();
    }
    void runExtraction(transcript);
  }, [pendingReviewEntryIds, userId, runExtraction, transcript, refreshTodayLogCount]);

  const finishAutoSaveAfterExtract = useCallback(
    async (normalizedRows: LogRow[], sourceKind: "voice" | "text") => {
      const sourceType = sourceKind === "text" ? ("text" as const) : ("voice" as const);
      try {
        const saved = await saveLogs(
          userId,
          logDate,
          normalizedRows.map((r) => ({ ...r, source_type: sourceType })),
        );
        const ids = saved.map((s) => s.id);
        setPendingReviewEntryIds(ids);
        setReviewOpen(false);
        setBlob(null);
        setStepError(null);
        if (sourceKind === "text") {
          setTextDraft("");
        }
        setPostExtractSaveError(null);
        showSaveToast(true);
        void refreshTodayLogCount();
      } catch (e) {
        setPostExtractSaveError(e instanceof Error ? e.message : "Save failed");
        setPendingReviewEntryIds(null);
        setReviewOpen(true);
      }
    },
    [userId, logDate, refreshTodayLogCount, showSaveToast],
  );

  const beginNewVoiceClip = useCallback(() => {
    setPostExtractSaveError(null);
    setPendingReviewEntryIds(null);
    setReviewOpen(false);
    setTranscript("");
    setExtraction(null);
    setExtractionError(null);
    setSaveToastOpen(false);
    clearSaveToastTimer();
  }, [clearSaveToastTimer]);

  const handleRecordingComplete = async (recording: Blob) => {
    beginNewVoiceClip();
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
      let extractErr: string | null = null;
      let res: ExtractLogsResponse | null = null;
      try {
        res = await extractLogs(text, logDate, { timezone: timeZone, captureKind: "voice" });
        setExtraction(res);
      } catch (e) {
        extractErr = e instanceof Error ? e.message : "Extraction failed";
        setExtractionError(extractErr);
      } finally {
        setExtractionLoading(false);
      }

      if (extractErr) {
        setPendingReviewEntryIds(null);
        setReviewOpen(true);
        return;
      }
      const rawRows = res?.rows ?? [];
      if (rawRows.length === 0) {
        setPendingReviewEntryIds(null);
        setReviewOpen(true);
        return;
      }
      await finishAutoSaveAfterExtract(normalizeExtractedRows(rawRows), "voice");
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
    setPostExtractSaveError(null);
    setPendingReviewEntryIds(null);
    setReviewOpen(false);
    setReviewCaptureKind("text");
    setTranscript(t);
    setExtractionLoading(true);
    setExtractionError(null);
    setExtraction(null);
    let extractErr: string | null = null;
    let res: ExtractLogsResponse | null = null;
    try {
      res = await extractLogs(t, logDate, { timezone: timeZone, captureKind: "text" });
      setExtraction(res);
    } catch (e) {
      extractErr = e instanceof Error ? e.message : "Extraction failed";
      setExtractionError(extractErr);
    } finally {
      setExtractionLoading(false);
    }

    if (extractErr) {
      setPendingReviewEntryIds(null);
      setReviewOpen(true);
      return;
    }
    const rawRows = res?.rows ?? [];
    if (rawRows.length === 0) {
      setPendingReviewEntryIds(null);
      setReviewOpen(true);
      return;
    }
    await finishAutoSaveAfterExtract(normalizeExtractedRows(rawRows), "text");
  };

  const handleSaveRows = async (rows: LogRow[], meta?: ReviewSaveMeta) => {
    const fromTextCapture = reviewCaptureKind === "text";
    const sourceType = fromTextCapture ? ("text" as const) : ("voice" as const);
    const serverIds = meta?.serverIds;
    const sessionInitial = reviewSessionInitialIdsRef.current;

    const insertAll = async () => {
      await saveLogs(
        userId,
        logDate,
        rows.map((r) => ({ ...r, source_type: sourceType })),
      );
    };

    if (
      sessionInitial &&
      sessionInitial.length > 0 &&
      serverIds &&
      serverIds.length === rows.length
    ) {
      const currentNumeric = serverIds.filter((x): x is number => typeof x === "number");
      for (const id of sessionInitial) {
        if (!currentNumeric.includes(id)) {
          await deleteLog(userId, id);
        }
      }
      for (let i = 0; i < rows.length; i++) {
        const sid = serverIds[i];
        if (sid != null) {
          await patchLog(userId, sid, logRowToPatchBody(rows[i]));
        } else {
          await saveLogs(userId, logDate, [{ ...rows[i], source_type: sourceType }]);
        }
      }
    } else {
      await insertAll();
    }

    reviewSessionInitialIdsRef.current = null;
    setPendingReviewEntryIds(null);
    closeReviewAfterSave();
    if (fromTextCapture) {
      setTextDraft("");
    }
    showSaveToast(false);
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

  const dismissSaveToast = useCallback(() => {
    clearSaveToastTimer();
    setSaveToastOpen(false);
  }, [clearSaveToastTimer]);

  const openReviewFromToast = useCallback(() => {
    dismissSaveToast();
    setReviewOpen(true);
  }, [dismissSaveToast]);

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
                {postExtractSaveError && !reviewOpen ? (
                  <p className="error-inline error-inline--spaced">{postExtractSaveError}</p>
                ) : null}
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
                {postExtractSaveError && !reviewOpen ? (
                  <p className="error-inline error-inline--spaced">{postExtractSaveError}</p>
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
        initialServerIds={pendingReviewEntryIds}
        onRetryExtract={() => void retryExtract()}
        onSave={handleSaveRows}
        onDiscard={handleReviewDiscard}
      />

      {saveToastOpen ? (
        <div
          className="home-save-snackbar"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="home-save-snackbar-inner">
            <p className="home-save-snackbar-msg">Saved to Today</p>
            <div className="home-save-snackbar-actions">
              {saveToastOfferReview ? (
                <button type="button" className="home-save-snackbar-action" onClick={openReviewFromToast}>
                  Review
                </button>
              ) : null}
              <button type="button" className="home-save-snackbar-dismiss" onClick={dismissSaveToast}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
