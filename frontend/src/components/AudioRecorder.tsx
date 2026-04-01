import { useCallback, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  onRecorded: (blob: Blob) => void;
  /** Fires when the mic is actively recording (for parent UI state). */
  onRecordingActiveChange?: (active: boolean) => void;
};

export default function AudioRecorder({ disabled, onRecorded, onRecordingActiveChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

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
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        stopTracks(rec);
        mediaRef.current = null;
        setRecording(false);
        onRecordingActiveChange?.(false);
        onRecorded(blob);
      };
      rec.onerror = () => {
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

  const stop = () => {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  return (
    <div className="audio-recorder">
      <div className="audio-recorder-actions">
        {!recording ? (
          <button type="button" className="btn primary btn-record-update" disabled={disabled} onClick={() => void start()}>
            Record update
          </button>
        ) : (
          <button type="button" className="btn btn-stop btn-record-update" onClick={stop}>
            Stop recording
          </button>
        )}
      </div>
      {recording && <p className="hint recording-hint recording-hint--live">Listening… tap stop when you’re done.</p>}
      {error && <p className="error-inline error-inline--spaced">{error}</p>}
    </div>
  );
}
