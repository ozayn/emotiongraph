import { useCallback, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  /** True while transcribing / extracting after a completed recording (voice pipeline). */
  processing?: boolean;
  onRecorded: (blob: Blob) => void;
  /** Fires when the mic is actively recording (for parent UI state). */
  onRecordingActiveChange?: (active: boolean) => void;
};

function MicIcon() {
  return (
    <svg className="voice-recorder__mic-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 11v1a4 4 0 0 0 8 0v-1M12 18v3M9 21h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProcessingRing() {
  return (
    <svg className="voice-recorder__process-ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle className="voice-recorder__process-track" cx="24" cy="24" r="20" fill="none" strokeWidth="1.5" />
      <circle className="voice-recorder__process-arc" cx="24" cy="24" r="20" fill="none" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function AudioRecorder({ disabled, processing, onRecorded, onRecordingActiveChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const discardRef = useRef(false);

  const stopTracks = useCallback((rec: MediaRecorder | null) => {
    rec?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const wasDiscard = discardRef.current;
        discardRef.current = false;
        const mimeType = rec.mimeType;
        stopTracks(rec);
        mediaRef.current = null;
        setRecording(false);
        onRecordingActiveChange?.(false);
        if (!wasDiscard) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          onRecorded(blob);
        }
      };
      rec.onerror = () => {
        discardRef.current = false;
        setError("Recording error");
        stopTracks(rec);
        mediaRef.current = null;
        setRecording(false);
        onRecordingActiveChange?.(false);
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      onRecordingActiveChange?.(true);
    } catch {
      setError("Microphone access denied or unavailable.");
    }
  };

  const finishRecording = () => {
    discardRef.current = false;
    const r = mediaRef.current;
    if (r && r.state !== "inactive") r.stop();
  };

  const discardRecording = () => {
    discardRef.current = true;
    const r = mediaRef.current;
    if (r && r.state !== "inactive") r.stop();
  };

  return (
    <div className="voice-recorder">
      {processing ? (
        <div className="voice-recorder__stack">
          <div
            className="voice-recorder__circle voice-recorder__circle--processing"
            aria-busy="true"
            aria-live="polite"
            aria-label="Processing recording"
          >
            <ProcessingRing />
          </div>
          <p className="voice-recorder__status voice-recorder__status--muted">Preparing transcript…</p>
        </div>
      ) : recording ? (
        <div className="voice-recorder__stack">
          <div className="voice-recorder__circle voice-recorder__circle--recording" aria-live="polite" aria-label="Recording">
            <span className="voice-recorder__live-core" aria-hidden="true" />
          </div>
          <p className="voice-recorder__status voice-recorder__status--live">Recording</p>
          <div className="voice-recorder__controls">
            <button type="button" className="voice-recorder__stop" onClick={finishRecording}>
              Stop
            </button>
            <button type="button" className="voice-recorder__discard" onClick={discardRecording}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="voice-recorder__stack">
          <button
            type="button"
            className="voice-recorder__circle voice-recorder__circle--idle"
            disabled={disabled}
            onClick={() => void start()}
            aria-label="Start voice recording"
          >
            <MicIcon />
          </button>
          <p className="voice-recorder__status voice-recorder__status--muted">Tap to record</p>
        </div>
      )}
      {error && <p className="error-inline error-inline--spaced voice-recorder__error">{error}</p>}
    </div>
  );
}
