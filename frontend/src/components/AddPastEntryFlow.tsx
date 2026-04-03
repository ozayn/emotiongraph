import { useEffect, useId, useRef, useState } from "react";
import { saveLogs } from "../api";
import { todayIsoInTimeZone } from "../datesTz";
import CalmSelect from "./CalmSelect";
import InlineHelp from "./InlineHelp";
import MetricSelect from "./MetricSelect";
import { draftToNewLogRow, emptyDraftForDate, type EditDraft, LOG_ADD_SOURCE_OPTIONS } from "../logEditDraft";
import { optionsForMetricKey } from "../trackerOptions";

type Props = {
  userId: number;
  timeZone: string;
  onSaved?: () => void;
};

export default function AddPastEntryFlow({ userId, timeZone, onSaved }: Props) {
  const addSourceLabelId = useId();
  const addSheetTitleRef = useRef<HTMLHeadingElement>(null);
  const [addDraft, setAddDraft] = useState<EditDraft | null>(null);
  const [addSaveError, setAddSaveError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  const openAddPast = () => {
    setAddSaveError(null);
    setAddDraft(emptyDraftForDate(todayIsoInTimeZone(timeZone)));
  };

  const closeAddPast = () => {
    setAddDraft(null);
    setAddSaveError(null);
  };

  useEffect(() => {
    if (!addDraft) return;
    const id = window.requestAnimationFrame(() => {
      addSheetTitleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [addDraft]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !addDraft) return;
      closeAddPast();
    };
    if (!addDraft) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addDraft]);

  const setAddDraftField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setAddDraft((d) => (d ? { ...d, [key]: value } : null));
  };

  const handleAddSave = async () => {
    if (!addDraft) return;
    setAddSaveError(null);
    setAddSaving(true);
    try {
      await saveLogs(userId, addDraft.log_date, [draftToNewLogRow(addDraft)]);
      closeAddPast();
      onSaved?.();
    } catch (e) {
      setAddSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div className="profile-settings-field profile-manual-row-field">
      <div className="profile-data-kicker-row">
        <h3 className="profile-data-kicker">Manual row</h3>
        <InlineHelp label="Manual log row">
          <p>One structured row for any date — same fields as your day log.</p>
        </InlineHelp>
      </div>
      <button type="button" className="btn ghost small" onClick={openAddPast}>
        Add row
      </button>

      {addDraft && (
        <>
          <div className="log-edit-backdrop" role="presentation" onClick={closeAddPast} />
          <div
            className="log-edit-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-log-add-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="log-edit-sheet-scroll">
              <div className="log-edit-sheet-head">
                <div className="log-edit-sheet-title-cluster">
                  <h2 id="profile-log-add-title" ref={addSheetTitleRef} tabIndex={-1}>
                    Add entry
                  </h2>
                  <InlineHelp label="Past-date entry">
                    <p>Saved as a normal log row for the date you choose — same fields as other days.</p>
                  </InlineHelp>
                </div>
                <button type="button" className="btn btn-text log-edit-close" onClick={closeAddPast}>
                  Close
                </button>
              </div>
              <div className="log-edit-fields">
                <label className="field field--stacked">
                  <span>Log date</span>
                  <input type="date" value={addDraft.log_date} onChange={(ev) => setAddDraftField("log_date", ev.target.value)} />
                </label>
                <label className="field field--stacked">
                  <span id={addSourceLabelId}>Source</span>
                  <CalmSelect
                    variant="field"
                    aria-labelledby={addSourceLabelId}
                    value={addDraft.source_type}
                    onChange={(v) => setAddDraftField("source_type", v as EditDraft["source_type"])}
                    options={LOG_ADD_SOURCE_OPTIONS}
                  />
                </label>
                <label className="field field--stacked">
                  <span>What happened</span>
                  <input type="text" value={addDraft.event} onChange={(ev) => setAddDraftField("event", ev.target.value)} />
                </label>
                <div className="manual-add-time-row">
                  <label className="field field--stacked">
                    <span>Start</span>
                    <input type="text" value={addDraft.start_time} onChange={(ev) => setAddDraftField("start_time", ev.target.value)} />
                  </label>
                  <label className="field field--stacked">
                    <span>End</span>
                    <input type="text" value={addDraft.end_time} onChange={(ev) => setAddDraftField("end_time", ev.target.value)} />
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
                      value={addDraft[key]}
                      onChange={(v) => setAddDraftField(key, v)}
                      options={opts}
                    />
                  );
                })}
                {optionsForMetricKey("music") && (
                  <MetricSelect
                    label="Music"
                    value={addDraft.music}
                    onChange={(v) => setAddDraftField("music", v)}
                    options={optionsForMetricKey("music")!}
                  />
                )}
                <label className="field field--stacked">
                  <span>Comments</span>
                  <textarea className="log-edit-comments" rows={3} value={addDraft.comments} onChange={(ev) => setAddDraftField("comments", ev.target.value)} />
                </label>
              </div>
              {addSaveError && <p className="error-inline log-edit-error">{addSaveError}</p>}
            </div>
            <div className="log-edit-footer">
              <button type="button" className="btn ghost" onClick={closeAddPast} disabled={addSaving}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void handleAddSave()} disabled={addSaving}>
                {addSaving ? "Saving…" : "Save entry"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
