import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { blobFailsMinimumSpeechEnergy } from "../audioSilence";
import {
  deleteLog,
  extractLogs,
  fetchLogs,
  fetchTrackerDay,
  patchLog,
  putLogEntryCustomValues,
  putTrackerDayCustomValues,
  saveLogs,
  saveTrackerDay,
  transcribeAudio,
  type LogEntryPatchBody,
} from "../api";
import { todayIsoInTimeZone } from "../datesTz";
import AudioRecorder from "./AudioRecorder";
import CalmSelect from "./CalmSelect";
import MetricSelect from "./MetricSelect";
import ReviewExtractionModal, { type ReviewSaveMeta } from "./ReviewExtractionModal";
import {
  compactMetricSummary,
  draftToPatch,
  entryToDraft,
  type EditDraft,
  LOG_EDIT_SOURCE_OPTIONS,
} from "../logEditDraft";
import CustomFieldsForm from "./CustomFieldsForm";
import EntryDetailModal from "./EntryDetailModal";
import SourceTypeIndicator from "./SourceTypeIndicator";
import { IconRowEdit, IconRowTrash } from "./RowActionIcons";
import {
  buildCustomValuesPayload,
  countFilledCustomDraft,
  customValuesToDraft,
  filterCustomFormFields,
  formatCustomFieldDisplay,
} from "../customFieldValues";
import { fetchTrackerConfig } from "../trackerConfigApi";
import type { TrackerFieldDefinitionDTO } from "../trackerConfigTypes";
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

type EntryInputMode = "voice" | "text" | "manual" | "day";

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

/** Calendar YYYY-MM-DD label in the user’s IANA zone (noon-UTC anchor; fine for display). */
function isoYmdLongInTimeZone(iso: string, timeZone: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  } catch {
    return iso;
  }
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

  const [entryMode, setEntryMode] = useState<EntryInputMode>("voice");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewCaptureKind, setReviewCaptureKind] = useState<"voice" | "text">("text");
  const [freeTextDraft, setFreeTextDraft] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [extraction, setExtraction] = useState<ExtractLogsResponse | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [pendingReviewEntryIds, setPendingReviewEntryIds] = useState<number[] | null>(null);
  const reviewSessionInitialIdsRef = useRef<number[] | null>(null);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState<"transcribe" | "extract">("transcribe");
  const [stepError, setStepError] = useState<string | null>(null);
  const [postExtractSaveError, setPostExtractSaveError] = useState<string | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [extractSavedBanner, setExtractSavedBanner] = useState(false);

  const [manualDraft, setManualDraft] = useState(emptyManualDraft);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSavedBanner, setManualSavedBanner] = useState(false);

  const [savedMenuOpenId, setSavedMenuOpenId] = useState<number | null>(null);
  const [savedEntryDetail, setSavedEntryDetail] = useState<SavedLogEntry | null>(null);
  const [savedEditEntry, setSavedEditEntry] = useState<SavedLogEntry | null>(null);
  const [savedEditDraft, setSavedEditDraft] = useState<EditDraft | null>(null);
  const [savedEditSaveError, setSavedEditSaveError] = useState<string | null>(null);
  const [savedEditSaving, setSavedEditSaving] = useState(false);
  const [savedActionError, setSavedActionError] = useState<string | null>(null);

  const [trackerFields, setTrackerFields] = useState<TrackerFieldDefinitionDTO[]>([]);
  const [manualCustomDraft, setManualCustomDraft] = useState<Record<number, string>>({});
  const [savedEditCustomDraft, setSavedEditCustomDraft] = useState<Record<number, string>>({});
  const [dayCustomDraft, setDayCustomDraft] = useState<Record<number, string>>({});

  const [dayDraft, setDayDraft] = useState({ cycle_day: "", sleep_hours: "", sleep_quality: "" });
  const [daySaving, setDaySaving] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [daySavedBanner, setDaySavedBanner] = useState(false);
  const [dayContextEditing, setDayContextEditing] = useState(false);

  const customEntryFields = useMemo(() => filterCustomFormFields(trackerFields, "entry"), [trackerFields]);
  const customDayFields = useMemo(() => filterCustomFormFields(trackerFields, "day"), [trackerFields]);
  const filledDayCustomCount = useMemo(
    () => countFilledCustomDraft(customDayFields, dayCustomDraft),
    [customDayFields, dayCustomDraft],
  );

  useEffect(() => {
    if (!isReadyUserId(userId)) return;
    void fetchTrackerConfig(userId)
      .then((c) => setTrackerFields(c.fields))
      .catch(() => {
        /* optional config */
      });
  }, [userId]);

  useEffect(() => {
    const o: Record<number, string> = {};
    for (const f of customEntryFields) o[f.id] = "";
    setManualCustomDraft(o);
  }, [logDate, customEntryFields]);

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
      setDayCustomDraft(customValuesToDraft(d.custom_values, filterCustomFormFields(trackerFields, "day")));
    } catch (e) {
      if (isAbortError(e)) return;
      setDayError(e instanceof Error ? e.message : "Failed to load day info");
    }
  }, [userId, logDate, trackerFields]);

  const closeSavedEdit = useCallback(() => {
    setSavedEditEntry(null);
    setSavedEditDraft(null);
    setSavedEditCustomDraft({});
    setSavedEditSaveError(null);
  }, []);

  const openSavedEdit = useCallback(
    (entry: SavedLogEntry) => {
      setSavedEntryDetail(null);
      setSavedMenuOpenId(null);
      setSavedEditSaveError(null);
      setSavedActionError(null);
      setSavedEditEntry(entry);
      setSavedEditDraft(entryToDraft(entry));
      setSavedEditCustomDraft(customValuesToDraft(entry.custom_values, filterCustomFormFields(trackerFields, "entry")));
    },
    [trackerFields],
  );

  const handleSavedEditSave = useCallback(async () => {
    if (!savedEditEntry || !savedEditDraft) return;
    setSavedEditSaveError(null);
    setSavedEditSaving(true);
    try {
      await patchLog(userId, savedEditEntry.id, draftToPatch(savedEditDraft));
      if (customEntryFields.length > 0) {
        await putLogEntryCustomValues(
          userId,
          savedEditEntry.id,
          buildCustomValuesPayload(savedEditCustomDraft, customEntryFields),
        );
      }
      closeSavedEdit();
      await refreshSaved();
      await onMutate?.();
    } catch (err) {
      setSavedEditSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavedEditSaving(false);
    }
  }, [
    userId,
    savedEditEntry,
    savedEditDraft,
    savedEditCustomDraft,
    customEntryFields,
    closeSavedEdit,
    refreshSaved,
    onMutate,
  ]);

  const handleSavedDelete = useCallback(
    async (entry: SavedLogEntry) => {
      setSavedActionError(null);
      if (!window.confirm(`Delete entry #${entry.id}? This cannot be undone.`)) return;
      try {
        await deleteLog(userId, entry.id);
        await refreshSaved();
        await onMutate?.();
        setSavedEntryDetail((d) => (d?.id === entry.id ? null : d));
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
        setDayCustomDraft(customValuesToDraft(d.custom_values, filterCustomFormFields(trackerFields, "day")));
      } catch (e) {
        if (ac.signal.aborted || isAbortError(e)) return;
        setDayError(e instanceof Error ? e.message : "Failed to load day info");
      }
    })();
    return () => ac.abort();
  }, [userId, logDate, trackerFields]);

  useEffect(() => {
    setDayContextEditing(false);
    setFreeTextDraft("");
    setVoiceTranscript("");
    setBlob(null);
    setStepError(null);
    setPostExtractSaveError(null);
    setPendingReviewEntryIds(null);
    reviewSessionInitialIdsRef.current = null;
    setRecordingActive(false);
    setPipelineLoading(false);
    setReviewOpen(false);
    setExtraction(null);
    setExtractionError(null);
    setExtractionLoading(false);
    setExtractSavedBanner(false);
  }, [logDate]);

  useEffect(() => {
    if (reviewOpen) {
      reviewSessionInitialIdsRef.current = pendingReviewEntryIds;
    }
  }, [reviewOpen, pendingReviewEntryIds]);

  useEffect(() => {
    if (!extractSavedBanner) return;
    const t = window.setTimeout(() => setExtractSavedBanner(false), 5000);
    return () => clearTimeout(t);
  }, [extractSavedBanner]);

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
      const created = await saveLogs(userId, logDate, [row]);
      if (customEntryFields.length > 0 && created[0]) {
        await putLogEntryCustomValues(
          userId,
          created[0].id,
          buildCustomValuesPayload(manualCustomDraft, customEntryFields),
        );
      }
      setManualDraft(emptyManualDraft());
      const o: Record<number, string> = {};
      for (const f of customEntryFields) o[f.id] = "";
      setManualCustomDraft(o);
      setManualSavedBanner(true);
      await refreshSaved();
      await onMutate?.();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Could not save entry");
    } finally {
      setManualSaving(false);
    }
  };

  const setManualCustomField = (fieldId: number, value: string) => {
    setManualSavedBanner(false);
    setManualCustomDraft((prev) => ({ ...prev, [fieldId]: value }));
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
      if (customDayFields.length > 0) {
        await putTrackerDayCustomValues(userId, logDate, buildCustomValuesPayload(dayCustomDraft, customDayFields));
      }
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

  const closeReviewSheetOnly = useCallback(() => {
    setReviewOpen(false);
    setExtractionLoading(false);
  }, []);

  const closeReviewAfterSave = useCallback(() => {
    closeReviewSheetOnly();
    setExtraction(null);
    setExtractionError(null);
    setBlob(null);
    setVoiceTranscript("");
    setPendingReviewEntryIds(null);
    reviewSessionInitialIdsRef.current = null;
  }, [closeReviewSheetOnly]);

  const handleReviewDiscard = useCallback(() => {
    if (pendingReviewEntryIds != null && pendingReviewEntryIds.length > 0) {
      closeReviewSheetOnly();
      return;
    }
    closeReviewSheetOnly();
    setExtraction(null);
    setExtractionError(null);
    setPendingReviewEntryIds(null);
    reviewSessionInitialIdsRef.current = null;
    setBlob(null);
    setVoiceTranscript("");
  }, [pendingReviewEntryIds, closeReviewSheetOnly]);

  const finishAutoSaveAfterExtract = useCallback(
    async (normalizedRows: LogRow[], sourceKind: "voice" | "text") => {
      const sourceType = sourceKind === "text" ? ("text" as const) : ("voice" as const);
      try {
        const saved = await saveLogs(
          userId,
          logDate,
          normalizedRows.map((r) => ({ ...r, source_type: sourceType })),
        );
        setPendingReviewEntryIds(saved.map((s) => s.id));
        setReviewOpen(false);
        setBlob(null);
        setStepError(null);
        if (sourceKind === "text") {
          setFreeTextDraft("");
        }
        setPostExtractSaveError(null);
        setExtractSavedBanner(true);
        await refreshSaved();
        await onMutate?.();
      } catch (e) {
        setPostExtractSaveError(e instanceof Error ? e.message : "Save failed");
        setPendingReviewEntryIds(null);
        setReviewOpen(true);
      }
    },
    [userId, logDate, refreshSaved, onMutate],
  );

  const beginNewVoiceClip = useCallback(() => {
    setPostExtractSaveError(null);
    setPendingReviewEntryIds(null);
    setReviewOpen(false);
    setVoiceTranscript("");
    setExtraction(null);
    setExtractionError(null);
  }, []);

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
      setVoiceTranscript(text);

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
      setFreeTextDraft("");
    }
    await refreshSaved();
    await onMutate?.();
  };

  const handleTextExtract = async () => {
    const t = freeTextDraft.trim();
    if (!t) return;
    setPostExtractSaveError(null);
    setPendingReviewEntryIds(null);
    setReviewOpen(false);
    setReviewCaptureKind("text");
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
        const res = await extractLogs(text, logDate, {
          timezone: timeZone,
          captureKind: reviewCaptureKind,
        });
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
          /* best-effort */
        }
      }
      await refreshSaved();
    }
    const text = reviewCaptureKind === "voice" ? voiceTranscript : freeTextDraft;
    await runExtraction(text);
  }, [pendingReviewEntryIds, userId, reviewCaptureKind, voiceTranscript, freeTextDraft, runExtraction, refreshSaved]);

  const recordingLocked = pipelineLoading || reviewOpen || extractionLoading;
  const textInputLocked = reviewOpen || extractionLoading;
  const modeSwitchLocked =
    pipelineLoading ||
    reviewOpen ||
    extractionLoading ||
    recordingActive ||
    (entryMode === "voice" && blob != null && !pipelineLoading && !reviewOpen);

  const reviewModalTranscript = reviewCaptureKind === "voice" ? voiceTranscript : freeTextDraft;

  return (
    <section className="entries-day-panel" aria-labelledby="day-log-panel-title">
      {pipelineLoading && (
        <div className="pipeline-overlay" aria-busy="true" aria-live="polite">
          <div className="pipeline-card">
            <div className="pipeline-spinner" aria-hidden="true" />
            <p className="pipeline-title" key={pipelinePhase}>
              {pipelinePhase === "transcribe" ? "Transcribing…" : "Logging…"}
            </p>
          </div>
        </div>
      )}

      <h2 id="day-log-panel-title" className="entries-day-panel-title">
        Add for this date
      </h2>
      <p className="entries-day-panel-lead muted small">Pick a day, choose how to add, then review what&apos;s saved below.</p>
      <div className="entries-day-panel-date-row">
        <label className="entries-day-panel-date-label">
          <span className="sr-only">Log date</span>
          <input className="date-input date-input--entries-day" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </label>
        <span className="entries-day-panel-date-readout muted small">{isoYmdLongInTimeZone(logDate, timeZone)}</span>
      </div>

      <div className="home-capture-mode-switch add-entry-input-mode-switch" role="tablist" aria-label="How to add an entry">
        <button
          type="button"
          role="tab"
          id="add-entry-tab-voice"
          aria-selected={entryMode === "voice"}
          aria-controls="add-entry-mode-panel"
          className="home-capture-mode-btn add-entry-mode-btn"
          disabled={modeSwitchLocked && entryMode !== "voice"}
          onClick={() => setEntryMode("voice")}
        >
          Voice
        </button>
        <button
          type="button"
          role="tab"
          id="add-entry-tab-text"
          aria-selected={entryMode === "text"}
          aria-controls="add-entry-mode-panel"
          className="home-capture-mode-btn add-entry-mode-btn"
          disabled={modeSwitchLocked && entryMode !== "text"}
          onClick={() => setEntryMode("text")}
        >
          Text
        </button>
        <button
          type="button"
          role="tab"
          id="add-entry-tab-manual"
          aria-selected={entryMode === "manual"}
          aria-controls="add-entry-mode-panel"
          className="home-capture-mode-btn add-entry-mode-btn"
          disabled={modeSwitchLocked && entryMode !== "manual"}
          onClick={() => setEntryMode("manual")}
        >
          Manual
        </button>
        <button
          type="button"
          role="tab"
          id="add-entry-tab-day"
          aria-selected={entryMode === "day"}
          aria-controls="add-entry-mode-panel"
          className="home-capture-mode-btn add-entry-mode-btn"
          disabled={modeSwitchLocked && entryMode !== "day"}
          onClick={() => setEntryMode("day")}
        >
          Day
        </button>
      </div>

      <div
        id="add-entry-mode-panel"
        role="tabpanel"
        aria-labelledby={`add-entry-tab-${entryMode}`}
        className="add-entry-mode-panel entries-day-sub"
      >
        {entryMode === "voice" && (
          <div className="add-entry-voice-block">
            <p className="muted small add-entry-mode-hint">
              Voice entries save to the date above — including past days. You can also use Text or Manual anytime.
            </p>
            <div
              className={[
                "add-entry-voice-panel",
                "panel-elevated",
                recordingActive && "add-entry-voice-panel--live",
                pipelineLoading && "add-entry-voice-panel--processing",
                Boolean(blob) && !pipelineLoading && !reviewOpen && "add-entry-voice-panel--captured",
              ]
                .filter(Boolean)
                .join(" ")}
            >
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
                  <button
                    type="button"
                    className="btn btn-text btn-clear-recording"
                    onClick={() => {
                      setBlob(null);
                      setStepError(null);
                    }}
                  >
                    Discard recording
                  </button>
                </div>
              )}
              {stepError && <p className="error-inline error-inline--spaced">{stepError}</p>}
              {postExtractSaveError && !reviewOpen ? (
                <p className="error-inline error-inline--spaced">{postExtractSaveError}</p>
              ) : null}
            </div>
          </div>
        )}

        {entryMode === "text" && (
          <section className="add-entry-text-block" aria-labelledby={`text-mode-${textAreaId}`}>
            <p id={`text-mode-${textAreaId}`} className="add-entry-mode-section-label">
              Text
            </p>
            <p className="muted small add-entry-mode-hint">Write a note, then tap Log to add entries for this date.</p>
            <label className="sr-only" htmlFor={`entries-free-text-${textAreaId}`}>
              Written note to log for this date
            </label>
            <textarea
              id={`entries-free-text-${textAreaId}`}
              className="today-free-text-input today-free-text-input--compact"
              rows={4}
              placeholder="e.g. Rough morning, better after lunch…"
              value={freeTextDraft}
              onChange={(e) => setFreeTextDraft(e.target.value)}
              disabled={textInputLocked}
            />
            <div className="today-text-extract-actions">
              <button
                type="button"
                className="btn primary small today-text-extract-btn"
                disabled={!freeTextDraft.trim() || textInputLocked}
                onClick={() => void handleTextExtract()}
              >
                {extractionLoading && !reviewOpen ? "Logging…" : "Log"}
              </button>
            </div>
            {postExtractSaveError && !reviewOpen ? (
              <p className="error-inline error-inline--spaced">{postExtractSaveError}</p>
            ) : null}
          </section>
        )}

        {entryMode === "manual" && (
          <section className="add-entry-manual-block" aria-labelledby="manual-add-heading-entries">
            <p id="manual-add-heading-entries" className="add-entry-mode-section-label">
              Manual
            </p>
            <p className="muted small add-entry-mode-hint">Fill fields and save directly.</p>
            <div className="today-manual-body add-entry-manual-inner">
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
                <summary className="manual-add-more-summary">More fields (optional extras)</summary>
                <div className="manual-add-more-fields">
                  <p className="muted small manual-add-more-lead">Standard metrics and notes.</p>
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
                  {customEntryFields.length > 0 && (
                    <div className="manual-add-custom-nested">
                      <p className="muted small manual-add-custom-nested-lead">Team-added fields (all optional).</p>
                      <CustomFieldsForm
                        fields={customEntryFields}
                        draft={manualCustomDraft}
                        onChange={setManualCustomField}
                        disabled={manualSaving}
                        variant="nested"
                      />
                    </div>
                  )}
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
          </section>
        )}

        {entryMode === "day" && (
          <section className="today-day-context today-day-context--quiet add-entry-day-block" aria-labelledby="day-heading-entries">
            <p id="day-heading-entries" className="add-entry-mode-section-label">
              Day context
            </p>
            <p className="muted small add-entry-mode-hint">
              Optional signals for this date only — not each log row.
              {customDayFields.length > 0 && filledDayCustomCount > 0
                ? ` ${filledDayCustomCount} team field${filledDayCustomCount === 1 ? "" : "s"} filled.`
                : ""}
            </p>
            {dayError && <p className="error-inline manual-add-error day-context-collapsed-msg">{dayError}</p>}
            {daySavedBanner && (
              <p className="manual-add-success day-context-collapsed-msg" role="status">
                Day info saved.
              </p>
            )}

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
                {customDayFields.length > 0 && (
                  <div className="day-context-custom-summary" role="group" aria-label="Team-added day fields">
                    <p className="day-context-custom-summary-label muted small">Team-added</p>
                    {filledDayCustomCount === 0 ? (
                      <p className="day-context-custom-empty muted small">None filled for this date.</p>
                    ) : (
                      customDayFields.map((f) => (
                        <div key={f.id} className="day-context-stat day-context-stat--custom">
                          <span className="day-context-stat-label">{f.label}</span>
                          <span className="day-context-stat-value day-context-stat-value--custom">
                            {formatCustomFieldDisplay(f, dayCustomDraft[f.id])}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
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
                <div className="day-context-editor-custom">
                  <p className="muted small day-context-editor-custom-lead">Team-added day fields (optional).</p>
                  <CustomFieldsForm
                    fields={customDayFields}
                    draft={dayCustomDraft}
                    onChange={(fid, v) => setDayCustomDraft((p) => ({ ...p, [fid]: v }))}
                    disabled={daySaving}
                    variant="nested"
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
          </section>
        )}

      </div>

      {extractSavedBanner && (
        <p className="manual-add-success add-entry-extract-banner entries-day-sub" role="status">
          Saved new entries for this date.
        </p>
      )}

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
              <li
                key={e.id}
                className="saved-item today-saved-item today-saved-item--interactive"
                tabIndex={0}
                onClick={() => setSavedEntryDetail(e)}
                onKeyDown={(ev) => {
                  if (ev.key !== "Enter" && ev.key !== " ") return;
                  ev.preventDefault();
                  setSavedEntryDetail(e);
                }}
              >
                <div className="today-saved-item-head">
                  <div className="today-saved-item-main">
                    <div className="today-saved-item-meta-row">
                      {timeLine != null && <span className="mono muted today-saved-item-times">{timeLine}</span>}
                      {metricsShort && (
                        <span className="today-saved-item-metrics-compact mono muted" aria-label="Metrics summary">
                          {metricsShort}
                        </span>
                      )}
                      <span className="today-saved-item-source">
                        <SourceTypeIndicator source={e.source_type} />
                      </span>
                    </div>
                    <p className="today-saved-item-event">{e.event?.trim() ? e.event : "(no event)"}</p>
                    {(e.comments || e.music) && (
                      <p className="today-saved-item-foot muted small">
                        {[e.music && e.music, e.comments].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div
                    className="entries-item-menu-wrap"
                    data-day-log-saved-menu-root
                    onClick={(ev) => ev.stopPropagation()}
                  >
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
                          <button
                            type="button"
                            className="entries-item-menu-item entries-item-menu-item--icon-action"
                            role="menuitem"
                            aria-label={`Edit entry ${e.id}`}
                            onClick={() => {
                              setSavedMenuOpenId(null);
                              openSavedEdit(e);
                            }}
                          >
                            <IconRowEdit />
                          </button>
                        </li>
                        <li role="presentation">
                          <button
                            type="button"
                            className="entries-item-menu-item entries-item-menu-item--danger entries-item-menu-item--icon-action"
                            role="menuitem"
                            aria-label={`Delete entry ${e.id}`}
                            onClick={() => {
                              setSavedMenuOpenId(null);
                              void handleSavedDelete(e);
                            }}
                          >
                            <IconRowTrash />
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
                {customEntryFields.length > 0 && (
                  <details className="log-edit-custom-disclosure">
                    <summary className="log-edit-custom-summary muted small">Optional team fields</summary>
                    <CustomFieldsForm
                      fields={customEntryFields}
                      draft={savedEditCustomDraft}
                      onChange={(fid, v) => setSavedEditCustomDraft((p) => ({ ...p, [fid]: v }))}
                      disabled={savedEditSaving}
                      variant="nested"
                    />
                  </details>
                )}
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

      <EntryDetailModal
        open={savedEntryDetail != null}
        entry={savedEntryDetail}
        onClose={() => setSavedEntryDetail(null)}
        fieldDefinitions={customEntryFields}
      />

      <ReviewExtractionModal
        open={reviewOpen}
        transcript={reviewModalTranscript}
        logDate={logDate}
        userId={userId}
        extractSourceType={reviewCaptureKind}
        initialServerIds={pendingReviewEntryIds}
        extraction={extraction}
        extractionLoading={extractionLoading}
        extractionError={extractionError}
        onRetryExtract={() => void retryExtract()}
        onSave={handleSaveRows}
        onDiscard={handleReviewDiscard}
      />
    </section>
  );
}
