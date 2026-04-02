import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTrackerConfig, patchTrackerField, patchTrackerOption } from "../trackerConfigApi";
import { useSession } from "../session/SessionContext";
import type { TrackerFieldDefinitionDTO, TrackerSelectOptionDTO } from "../trackerConfigTypes";

export default function AdminTrackerPage() {
  const { pathFor } = useSession();
  const [fields, setFields] = useState<TrackerFieldDefinitionDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const data = await fetchTrackerConfig();
      setFields(data.fields);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

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
      await patchTrackerField(f.id, {
        label: f.label,
        is_required: f.is_required,
        is_active: f.is_active,
        display_order: f.display_order,
      });
      setStatus(`Saved field “${f.key}”`);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const saveOption = async (fieldId: number, o: TrackerSelectOptionDTO) => {
    setLoadError(null);
    try {
      await patchTrackerOption(o.id, {
        label: o.label,
        display_order: o.display_order,
        is_active: o.is_active,
      });
      setStatus(`Saved option for field id ${fieldId}`);
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
          ← Today
        </Link>
      </nav>

      <header className="admin-header">
        <h1 className="admin-title">Tracker config</h1>
        <p className="muted small admin-lead">
          Internal field definitions and select options. Keys must stay aligned with <span className="mono">log_entries</span> and{" "}
          <span className="mono">tracker_days</span> columns. Forms still use fixed UI for now; this API is ready for dynamic rendering next.
        </p>
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
          <section className="admin-section">
            <h2 className="admin-section-title">Entry fields</h2>
            <div className="admin-field-list">
              {entryFields.map((f) => (
                <FieldEditorCard
                  key={f.id}
                  f={f}
                  onChange={updateFieldLocal}
                  onOptionChange={updateOptionLocal}
                  onSaveField={() => void saveField(f)}
                  onSaveOption={saveOption}
                />
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">Day fields</h2>
            <div className="admin-field-list">
              {dayFields.map((f) => (
                <FieldEditorCard
                  key={f.id}
                  f={f}
                  onChange={updateFieldLocal}
                  onOptionChange={updateOptionLocal}
                  onSaveField={() => void saveField(f)}
                  onSaveOption={saveOption}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type CardProps = {
  f: TrackerFieldDefinitionDTO;
  onChange: (id: number, patch: Partial<TrackerFieldDefinitionDTO>) => void;
  onOptionChange: (fieldId: number, optionId: number, patch: Partial<TrackerSelectOptionDTO>) => void;
  onSaveField: () => void;
  onSaveOption: (fieldId: number, o: TrackerSelectOptionDTO) => void;
};

function FieldEditorCard({ f, onChange, onOptionChange, onSaveField, onSaveOption }: CardProps) {
  return (
    <article className="admin-field-card panel-elevated">
      <div className="admin-field-head">
        <span className="mono admin-field-key">{f.key}</span>
        <span className="admin-badges">
          <span className="admin-badge">{f.scope}</span>
          <span className="admin-badge">{f.field_type}</span>
        </span>
      </div>
      <label className="field field--stacked">
        <span>Label</span>
        <input type="text" value={f.label} onChange={(e) => onChange(f.id, { label: e.target.value })} />
      </label>
      <div className="admin-field-row">
        <label className="field field--stacked admin-field-narrow">
          <span>Order</span>
          <input
            type="number"
            inputMode="numeric"
            value={f.display_order}
            onChange={(e) => onChange(f.id, { display_order: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </label>
        <label className="admin-check">
          <input type="checkbox" checked={f.is_active} onChange={(e) => onChange(f.id, { is_active: e.target.checked })} />
          <span>Active</span>
        </label>
        <label className="admin-check">
          <input type="checkbox" checked={f.is_required} onChange={(e) => onChange(f.id, { is_required: e.target.checked })} />
          <span>Required</span>
        </label>
      </div>
      <div className="admin-field-actions">
        <button type="button" className="btn primary small" onClick={onSaveField}>
          Save field
        </button>
      </div>

      {f.field_type === "select" && f.options.length > 0 && (
        <details className="admin-options">
          <summary className="admin-options-summary">Select options ({f.options.length})</summary>
          <ul className="admin-option-list">
            {f.options.map((o) => (
              <li key={o.id} className="admin-option-row">
                <span className="mono admin-option-value" title="Stored value">
                  {o.value === "" ? "∅" : o.value}
                </span>
                <label className="field field--stacked admin-option-label">
                  <span className="sr-only">Label</span>
                  <input
                    type="text"
                    value={o.label}
                    onChange={(e) => onOptionChange(f.id, o.id, { label: e.target.value })}
                  />
                </label>
                <label className="field field--stacked admin-option-order">
                  <span className="sr-only">Order</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="admin-option-order-input"
                    value={o.display_order}
                    onChange={(e) =>
                      onOptionChange(f.id, o.id, { display_order: Number.parseInt(e.target.value, 10) || 0 })
                    }
                  />
                </label>
                <label className="admin-check admin-option-active">
                  <input
                    type="checkbox"
                    checked={o.is_active}
                    onChange={(e) => onOptionChange(f.id, o.id, { is_active: e.target.checked })}
                  />
                  <span>On</span>
                </label>
                <button type="button" className="btn btn-minimal small" onClick={() => onSaveOption(f.id, o)}>
                  Save
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
