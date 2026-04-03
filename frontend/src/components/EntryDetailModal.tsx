import type { TrackerFieldDefinitionDTO } from "../trackerConfigTypes";
import type { LogCustomValue, SavedLogEntry } from "../types";
import {
  formatAnxiety,
  formatContentment,
  formatEnergy,
  formatFocus,
} from "../trackerOptions";
import DetailSheet from "./DetailSheet";

type Props = {
  open: boolean;
  onClose: () => void;
  entry: SavedLogEntry | null;
  /** Entry-scoped field defs (for custom field labels / select options). */
  fieldDefinitions?: TrackerFieldDefinitionDTO[];
};

function shortDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function lineForCustomValue(
  cv: LogCustomValue,
  fields: TrackerFieldDefinitionDTO[],
): { label: string; value: string } {
  const f = fields.find((x) => x.id === cv.field_definition_id);
  const label = f?.label?.trim() || f?.key || `Field #${cv.field_definition_id}`;
  let value = "—";
  if (f?.field_type === "select" && cv.select_option_id != null) {
    const opt = f.options.find((o) => o.id === cv.select_option_id);
    value = opt?.label?.trim() || opt?.value || "—";
  } else if (cv.value_text != null && cv.value_text.trim() !== "") {
    value = cv.value_text;
  } else if (cv.value_number != null) {
    value = String(cv.value_number);
  }
  return { label, value };
}

function metricRow(label: string, value: string | null) {
  if (value == null) return null;
  return (
    <div className="entry-detail-metric-row">
      <span className="entry-detail-metric-label muted small">{label}</span>
      <span className="entry-detail-metric-val">{value}</span>
    </div>
  );
}

export default function EntryDetailModal({ open, onClose, entry, fieldDefinitions = [] }: Props) {
  if (!entry) return null;

  const title = `Entry #${entry.id}`;
  const when = `${shortDate(entry.log_date)} · ${entry.start_time ?? "—"}–${entry.end_time ?? "—"}`;

  return (
    <DetailSheet open={open} onClose={onClose} title={title}>
      <p className="metric-detail-modal-context muted small">{when}</p>
      <p className="entry-detail-source muted small">
        Source · <span className="entry-detail-source-val">{entry.source_type}</span>
      </p>
      <div className="entry-detail-event-block">
        <p className="entry-detail-event-label muted small">Event</p>
        <p className="entry-detail-event-text">{entry.event?.trim() ? entry.event : "—"}</p>
      </div>
      <div className="entry-detail-metrics" role="group" aria-label="Metrics for this entry">
        {metricRow("Energy", entry.energy_level != null ? formatEnergy(entry.energy_level) : null)}
        {metricRow("Anxiety", entry.anxiety != null ? formatAnxiety(entry.anxiety) : null)}
        {metricRow("Contentment", entry.contentment != null ? formatContentment(entry.contentment) : null)}
        {metricRow("Focus", entry.focus != null ? formatFocus(entry.focus) : null)}
      </div>
      {entry.music?.trim() ? (
        <div className="entry-detail-extra">
          <p className="entry-detail-extra-label muted small">Music</p>
          <p className="entry-detail-extra-text">{entry.music}</p>
        </div>
      ) : null}
      {entry.comments?.trim() ? (
        <div className="entry-detail-extra">
          <p className="entry-detail-extra-label muted small">Comments</p>
          <p className="entry-detail-extra-text">{entry.comments}</p>
        </div>
      ) : null}
      {entry.custom_values && entry.custom_values.length > 0 ? (
        <div className="entry-detail-custom">
          <p className="metric-detail-modal-samples-label muted small">Custom fields</p>
          <ul className="entry-detail-custom-list">
            {entry.custom_values.map((cv) => {
              const { label, value } = lineForCustomValue(cv, fieldDefinitions);
              return (
                <li key={cv.field_definition_id} className="entry-detail-custom-item">
                  <span className="entry-detail-custom-label muted small">{label}</span>
                  <span className="entry-detail-custom-val">{value}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </DetailSheet>
  );
}
