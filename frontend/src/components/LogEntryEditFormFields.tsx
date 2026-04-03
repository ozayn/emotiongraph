import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { EditDraft } from "../logEditDraft";
import { LOG_EDIT_SOURCE_OPTIONS } from "../logEditDraft";
import type { TrackerFieldDefinitionDTO } from "../trackerConfigTypes";
import { optionsForMetricKey } from "../trackerOptions";
import CalmSelect from "./CalmSelect";
import CustomFieldsForm from "./CustomFieldsForm";
import MetricSelect from "./MetricSelect";
import OptionalAngerMetric from "./OptionalAngerMetric";

const CORE_METRIC_KEYS = ["energy_level", "anxiety", "contentment", "focus"] as const;
type CoreMetricKey = (typeof CORE_METRIC_KEYS)[number];

function metricLabel(key: CoreMetricKey): string {
  if (key === "energy_level") return "Energy";
  if (key === "anxiety") return "Anxiety";
  if (key === "contentment") return "Contentment";
  return "Focus";
}

function draftHasMetricValue(draft: EditDraft, key: keyof EditDraft): boolean {
  const v = draft[key];
  return typeof v === "string" && v.trim() !== "";
}

export type LogEntryEditFormFieldsProps = {
  entryId: number;
  draft: EditDraft;
  setDraftField: <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => void;
  sourceLabelId: string;
  disabled: boolean;
  customEntryFields: TrackerFieldDefinitionDTO[];
  customDraft: Record<number, string>;
  setCustomDraft: Dispatch<SetStateAction<Record<number, string>>>;
};

export default function LogEntryEditFormFields({
  entryId,
  draft,
  setDraftField,
  sourceLabelId,
  disabled,
  customEntryFields,
  customDraft,
  setCustomDraft,
}: LogEntryEditFormFieldsProps) {
  const [showAllFields, setShowAllFields] = useState(false);

  useEffect(() => {
    setShowAllFields(false);
  }, [entryId]);

  const hasComments = draft.comments.trim() !== "";

  const renderCoreMetric = (key: CoreMetricKey) => {
    const opts = optionsForMetricKey(key);
    if (!opts) return null;
    return (
      <MetricSelect
        key={key}
        label={metricLabel(key)}
        value={draft[key]}
        onChange={(v) => setDraftField(key, v)}
        options={opts}
      />
    );
  };

  const customDisclosure =
    customEntryFields.length > 0 ? (
      <details className="log-edit-custom-disclosure">
        <summary className="log-edit-custom-summary muted small">Optional team fields</summary>
        <CustomFieldsForm
          fields={customEntryFields}
          draft={customDraft}
          onChange={(fid, v) => setCustomDraft((p) => ({ ...p, [fid]: v }))}
          disabled={disabled}
          variant="nested"
        />
      </details>
    ) : null;

  return (
    <div className={`log-edit-fields ${showAllFields ? "" : "log-edit-fields--compact-first"}`}>
      {!showAllFields ? (
        <>
          <div className="manual-add-time-row">
            <label className="field field--stacked">
              <span>Start</span>
              <input
                type="text"
                value={draft.start_time}
                onChange={(ev) => setDraftField("start_time", ev.target.value)}
              />
            </label>
            <label className="field field--stacked">
              <span>End</span>
              <input type="text" value={draft.end_time} onChange={(ev) => setDraftField("end_time", ev.target.value)} />
            </label>
          </div>
          <label className="field field--stacked">
            <span>What happened</span>
            <input type="text" value={draft.event} onChange={(ev) => setDraftField("event", ev.target.value)} />
          </label>
          {CORE_METRIC_KEYS.map((key) => (draftHasMetricValue(draft, key) ? renderCoreMetric(key) : null))}
          {draftHasMetricValue(draft, "anger") ? (
            <OptionalAngerMetric value={draft.anger} onChange={(v) => setDraftField("anger", v)} disabled={disabled} />
          ) : null}
          {hasComments ? (
            <label className="field field--stacked">
              <span>Comments</span>
              <textarea
                className="log-edit-comments log-edit-comments--compact"
                rows={2}
                value={draft.comments}
                onChange={(ev) => setDraftField("comments", ev.target.value)}
              />
            </label>
          ) : null}
          <div className="log-edit-disclose-more">
            <button
              type="button"
              className="btn btn-text small log-edit-disclose-more-btn"
              onClick={() => setShowAllFields(true)}
            >
              Show all fields
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="field field--stacked">
            <span>Log date</span>
            <input type="date" value={draft.log_date} onChange={(ev) => setDraftField("log_date", ev.target.value)} />
          </label>
          <label className="field field--stacked">
            <span id={sourceLabelId}>Source</span>
            <CalmSelect
              variant="field"
              aria-labelledby={sourceLabelId}
              value={draft.source_type}
              onChange={(v) => setDraftField("source_type", v as EditDraft["source_type"])}
              options={LOG_EDIT_SOURCE_OPTIONS}
            />
          </label>
          <label className="field field--stacked">
            <span>What happened</span>
            <input type="text" value={draft.event} onChange={(ev) => setDraftField("event", ev.target.value)} />
          </label>
          <div className="manual-add-time-row">
            <label className="field field--stacked">
              <span>Start</span>
              <input
                type="text"
                value={draft.start_time}
                onChange={(ev) => setDraftField("start_time", ev.target.value)}
              />
            </label>
            <label className="field field--stacked">
              <span>End</span>
              <input type="text" value={draft.end_time} onChange={(ev) => setDraftField("end_time", ev.target.value)} />
            </label>
          </div>
          {CORE_METRIC_KEYS.map((key) => renderCoreMetric(key))}
          <OptionalAngerMetric value={draft.anger} onChange={(v) => setDraftField("anger", v)} disabled={disabled} />
          {optionsForMetricKey("music") && (
            <MetricSelect
              label="Music"
              value={draft.music}
              onChange={(v) => setDraftField("music", v)}
              options={optionsForMetricKey("music")!}
            />
          )}
          <label className="field field--stacked">
            <span>Comments</span>
            <textarea
              className="log-edit-comments"
              rows={3}
              value={draft.comments}
              onChange={(ev) => setDraftField("comments", ev.target.value)}
            />
          </label>
          <div className="log-edit-disclose-more log-edit-disclose-more--after-full">
            <button
              type="button"
              className="btn btn-text small log-edit-disclose-more-btn"
              onClick={() => setShowAllFields(false)}
            >
              Fewer fields
            </button>
          </div>
        </>
      )}
      {customDisclosure}
    </div>
  );
}
