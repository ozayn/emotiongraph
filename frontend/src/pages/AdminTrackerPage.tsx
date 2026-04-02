import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTrackerConfig, patchTrackerField, patchTrackerOption } from "../trackerConfigApi";
import { useSession } from "../session/SessionContext";
import type {
  TrackerFieldDefinitionDTO,
  TrackerFieldScope,
  TrackerFieldType,
  TrackerSelectOptionDTO,
} from "../trackerConfigTypes";

function scopeDescription(scope: TrackerFieldScope): string {
  return scope === "entry" ? "Each log entry" : "Whole-day summary";
}

function typeDescription(t: TrackerFieldType): string {
  const labels: Record<TrackerFieldType, string> = {
    text: "Short text",
    textarea: "Paragraph",
    select: "Dropdown",
    number: "Number",
    time: "Time",
  };
  return labels[t] ?? t;
}

export default function AdminTrackerPage() {
  const { pathFor, userId } = useSession();
  const [fields, setFields] = useState<TrackerFieldDefinitionDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (userId == null) return;
    setLoadError(null);
    setLoading(true);
    try {
      const data = await fetchTrackerConfig(userId);
      setFields(data.fields);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 3200);
    return () => window.clearTimeout(t);
  }, [status]);

  const updateFieldLocal = (id: number, patch: Partial<TrackerFieldDefinitionDTO>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const updateOptionLocal = (fieldId: number, optionId: number, patch: Partial<TrackerSelectOptionDTO>) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        return {
          ...f,
          options: f.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
        };
      }),
    );
  };

  const saveField = async (f: TrackerFieldDefinitionDTO) => {
    setLoadError(null);
    try {
      if (userId == null) return;
      await patchTrackerField(userId, f.id, {
        label: f.label,
        is_required: f.is_required,
        is_active: f.is_active,
        display_order: f.display_order,
      });
      setStatus(`Saved “${f.label.trim() || f.key}”`);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const saveOption = async (_fieldId: number, o: TrackerSelectOptionDTO, fieldLabel: string) => {
    setLoadError(null);
    try {
      if (userId == null) return;
      await patchTrackerOption(userId, o.id, {
        label: o.label,
        display_order: o.display_order,
        is_active: o.is_active,
      });
      setStatus(`Saved choice in “${fieldLabel.trim() || "dropdown"}”`);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const entryFields = fields.filter((f) => f.scope === "entry");
  const dayFields = fields.filter((f) => f.scope === "day");

  return (
    <div className="admin-page">
      <nav className="admin-nav">
        <Link className="linkish admin-back" to={pathFor("/today")}>
          ← Back
        </Link>
      </nav>

      <header className="admin-header">
        <h1 className="admin-title">Log fields</h1>
        <p className="muted small admin-lead">
          Rename labels and save each field. Technical notes stay in “Technical reference” below.
        </p>
        <details className="admin-doc-disclosure">
          <summary className="admin-doc-disclosure-summary">Technical reference</summary>
          <div className="admin-doc-disclosure-body muted small">
            <p>
              Internal keys (e.g. <span className="mono">start_time</span>) map to database columns. Rename labels freely; do not change keys
              here without a developer.
            </p>
          </div>
        </details>
      </header>

      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="error-inline">{loadError}</p>}
      {status && (
        <p className="admin-status muted small" role="status">
          {status}
        </p>
      )}

      {!loading && (
        <>
          <section className="admin-section" aria-labelledby="admin-entry-heading">
            <div className="admin-section-head">
              <h2 id="admin-entry-heading" className="admin-section-title">
                Log entry fields
              </h2>
              <p className="admin-section-hint muted small">When saving or editing a log row.</p>
            </div>
            <div className="admin-field-list">
              {entryFields.map((f) => (
                <FieldEditorRow
                  key={f.id}
                  f={f}
                  onChange={updateFieldLocal}
                  onOptionChange={updateOptionLocal}
                  onSaveField={() => void saveField(f)}
                  onSaveOption={(fieldId, o) => void saveOption(fieldId, o, f.label)}
                />
              ))}
            </div>
          </section>

          <section className="admin-section" aria-labelledby="admin-day-heading">
            <div className="admin-section-head">
              <h2 id="admin-day-heading" className="admin-section-title">
                Day fields
              </h2>
              <p className="admin-section-hint muted small">Once per calendar day (e.g. sleep, cycle).</p>
            </div>
            <div className="admin-field-list">
              {dayFields.map((f) => (
                <FieldEditorRow
                  key={f.id}
                  f={f}
                  onChange={updateFieldLocal}
                  onOptionChange={updateOptionLocal}
                  onSaveField={() => void saveField(f)}
                  onSaveOption={(fieldId, o) => void saveOption(fieldId, o, f.label)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type RowProps = {
  f: TrackerFieldDefinitionDTO;
  onChange: (id: number, patch: Partial<TrackerFieldDefinitionDTO>) => void;
  onOptionChange: (fieldId: number, optionId: number, patch: Partial<TrackerSelectOptionDTO>) => void;
  onSaveField: () => void;
  onSaveOption: (fieldId: number, o: TrackerSelectOptionDTO) => void;
};

function FieldEditorRow({ f, onChange, onOptionChange, onSaveField, onSaveOption }: RowProps) {
  const choiceGroupName = `admin-choices-${f.id}`;
  const inactiveCount = f.field_type === "select" ? f.options.filter((o) => !o.is_active).length : 0;

  return (
    <article className="admin-field-slab">
      <div className="admin-field-slab-grid">
        <div className="admin-field-slab-label">
          <label className="admin-field-inline-label" htmlFor={`admin-label-${f.id}`}>
            Label
          </label>
          <input
            id={`admin-label-${f.id}`}
            type="text"
            className="admin-field-label-input admin-field-label-input--dense"
            value={f.label}
            onChange={(e) => onChange(f.id, { label: e.target.value })}
            autoComplete="off"
          />
        </div>

        <div className="admin-field-slab-meta">
          <span className="admin-type-tag" title={typeDescription(f.field_type)}>
            {typeDescription(f.field_type)}
          </span>
          <details className="admin-field-tech admin-field-tech--inline">
            <summary className="admin-field-tech-summary admin-field-tech-summary--inline">Details</summary>
            <dl className="admin-field-tech-dl muted small">
              <div className="admin-field-tech-row">
                <dt>Internal key</dt>
                <dd>
                  <code className="admin-field-tech-code">{f.key}</code>
                </dd>
              </div>
              <div className="admin-field-tech-row">
                <dt>Applies to</dt>
                <dd>{scopeDescription(f.scope)}</dd>
              </div>
              <div className="admin-field-tech-row">
                <dt>Input type</dt>
                <dd>{typeDescription(f.field_type)}</dd>
              </div>
            </dl>
          </details>
        </div>

        <div className="admin-field-slab-tools">
          <div className="admin-tool-ord" title="Display order">
            <span className="admin-tool-ord-hint" aria-hidden="true">
              #
            </span>
            <input
              type="number"
              inputMode="numeric"
              className="admin-toolbar-order-input admin-toolbar-order-input--dense"
              aria-label="Display order"
              value={f.display_order}
              onChange={(e) => onChange(f.id, { display_order: Number.parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <label className="admin-check admin-check--dense">
            <input type="checkbox" checked={f.is_active} onChange={(e) => onChange(f.id, { is_active: e.target.checked })} />
            <span>Visible</span>
          </label>
          <label className="admin-check admin-check--dense">
            <input type="checkbox" checked={f.is_required} onChange={(e) => onChange(f.id, { is_required: e.target.checked })} />
            <span>Required</span>
          </label>
          <button type="button" className="btn primary small admin-slab-save" onClick={onSaveField}>
            Save
          </button>
        </div>
      </div>

      {f.field_type === "select" && f.options.length > 0 && (
        <details className="admin-options admin-options--nested">
          <summary className="admin-options-summary">
            Edit dropdown choices
            <span className="admin-options-count">
              {" "}
              ({f.options.length}
              {inactiveCount > 0 ? `, ${inactiveCount} off` : ""})
            </span>
          </summary>
          <ul className="admin-option-accordion-list">
            {f.options.map((o) => (
              <li key={o.id} className="admin-option-accordion-item">
                <details className="admin-option-fold" name={choiceGroupName}>
                  <summary className="admin-option-fold-summary">
                    <span className="admin-option-fold-title">{o.label.trim() || "Untitled choice"}</span>
                    {!o.is_active && <span className="admin-option-fold-badge">Off</span>}
                  </summary>
                  <div className="admin-option-fold-body">
                    <div className="admin-option-fold-grid">
                      <div className="admin-option-fold-field">
                        <label className="admin-field-inline-label" htmlFor={`admin-opt-label-${o.id}`}>
                          Label
                        </label>
                        <input
                          id={`admin-opt-label-${o.id}`}
                          type="text"
                          className="admin-field-label-input admin-field-label-input--dense"
                          value={o.label}
                          onChange={(e) => onOptionChange(f.id, o.id, { label: e.target.value })}
                        />
                      </div>
                      <p className="admin-option-stored muted small admin-option-stored--fold" title="Stored value for exports">
                        Stored: <code className="admin-option-stored-code">{o.value === "" ? "—" : o.value}</code>
                      </p>
                      <div className="admin-option-fold-tools">
                        <div className="admin-tool-ord" title="Choice order">
                          <span className="admin-tool-ord-hint" aria-hidden="true">
                            #
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            className="admin-toolbar-order-input admin-toolbar-order-input--dense"
                            aria-label="Choice order"
                            value={o.display_order}
                            onChange={(e) =>
                              onOptionChange(f.id, o.id, { display_order: Number.parseInt(e.target.value, 10) || 0 })
                            }
                          />
                        </div>
                        <label className="admin-check admin-check--dense">
                          <input
                            type="checkbox"
                            checked={o.is_active}
                            onChange={(e) => onOptionChange(f.id, o.id, { is_active: e.target.checked })}
                          />
                          <span>On</span>
                        </label>
                        <button type="button" className="btn secondary small" onClick={() => onSaveOption(f.id, o)}>
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
