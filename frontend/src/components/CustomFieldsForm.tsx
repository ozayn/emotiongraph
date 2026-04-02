import MetricSelect from "./MetricSelect";
import type { TrackerFieldDefinitionDTO, TrackerSelectOptionDTO } from "../trackerConfigTypes";

type Props = {
  fields: TrackerFieldDefinitionDTO[];
  draft: Record<number, string>;
  onChange: (fieldId: number, value: string) => void;
  disabled?: boolean;
  /** Shown above the fields when non-empty */
  heading?: string;
  /** Tighter spacing when nested under disclosure (secondary fields). */
  variant?: "default" | "nested";
};

function activeSelectOptions(opts: TrackerSelectOptionDTO[]): { value: string; label: string }[] {
  return [...opts]
    .filter((o) => o.is_active)
    .sort((a, b) => a.display_order - b.display_order || a.id - b.id)
    .map((o) => ({ value: String(o.id), label: o.label || o.value || `Option ${o.id}` }));
}

export default function CustomFieldsForm({ fields, draft, onChange, disabled, heading, variant = "default" }: Props) {
  if (fields.length === 0) return null;

  const rootClass = variant === "nested" ? "custom-fields-form custom-fields-form--nested" : "custom-fields-form";

  return (
    <div className={rootClass}>
      {heading ? <p className="custom-fields-form-title muted small">{heading}</p> : null}
      <div className="custom-fields-form-fields">
        {fields.map((f) => {
          const v = draft[f.id] ?? "";
          if (f.field_type === "text") {
            return (
              <label key={f.id} className="field field--stacked">
                <span>{f.label}</span>
                <input
                  type="text"
                  autoComplete="off"
                  value={v}
                  disabled={disabled}
                  onChange={(e) => onChange(f.id, e.target.value)}
                />
              </label>
            );
          }
          if (f.field_type === "number") {
            return (
              <label key={f.id} className="field field--stacked">
                <span>{f.label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={v}
                  disabled={disabled}
                  onChange={(e) => onChange(f.id, e.target.value)}
                />
              </label>
            );
          }
          const so = activeSelectOptions(f.options);
          return (
            <MetricSelect
              key={f.id}
              label={f.label}
              value={v}
              onChange={(nv) => onChange(f.id, nv)}
              options={[{ value: "", label: "—" }, ...so]}
              disabled={disabled}
            />
          );
        })}
      </div>
    </div>
  );
}
