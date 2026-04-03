import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SoftHoverHint from "../components/SoftHoverHint";
import { useFinePointerTitle } from "../hooks/useFinePointerTitle";
import {
  createTrackerField,
  createTrackerSelectOption,
  fetchTrackerConfig,
  patchTrackerField,
  patchTrackerOption,
} from "../trackerConfigApi";
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

function AdminOrdHashLabel({ hint }: { hint: string }) {
  const h = useFinePointerTitle(hint);
  return (
    <SoftHoverHint hint={h}>
      <span className="admin-tool-ord-hint" aria-hidden="true">
        #
      </span>
    </SoftHoverHint>
  );
}

function AdminOptionCodeLine({ value }: { value: string }) {
  const h = useFinePointerTitle("Internal code — stable value stored with this choice");
  return (
    <SoftHoverHint hint={h} variant="multiline">
      <p className="admin-option-stored muted small admin-option-stored--fold">
        Code: <code className="admin-option-stored-code">{value === "" ? "—" : value}</code>
      </p>
    </SoftHoverHint>
  );
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
      const body: {
        label: string;
        is_active: boolean;
        display_order: number;
        is_required?: boolean;
      } = {
        label: f.label,
        is_active: f.is_active,
        display_order: f.display_order,
      };
      if (f.is_builtin) {
        body.is_required = f.is_required;
      } else {
        body.is_required = false;
      }
      await patchTrackerField(userId, f.id, body);
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

  const [createScope, setCreateScope] = useState<TrackerFieldScope>("entry");
  const [createType, setCreateType] = useState<"text" | "number" | "select">("text");
  const [createLabel, setCreateLabel] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createOptRows, setCreateOptRows] = useState<{ value: string; label: string }[]>([
    { value: "1", label: "First choice" },
  ]);
  const [createFieldError, setCreateFieldError] = useState<string | null>(null);

  const submitCreateField = async () => {
    const lab = createLabel.trim();
    if (!lab || userId == null) return;
    setCreateFieldError(null);
    setCreateBusy(true);
    try {
      const initial_options =
        createType === "select"
          ? createOptRows
              .map((r, i) => ({
                value: r.value.trim(),
                label: r.label.trim(),
                display_order: (i + 1) * 10,
              }))
              .filter((r) => r.value && r.label)
          : [];
      if (createType === "select" && initial_options.length === 0) {
        setCreateFieldError("Add at least one choice (value + label) for a dropdown field.");
        return;
      }
      await createTrackerField(userId, {
        scope: createScope,
        field_type: createType,
        label: lab,
        initial_options: createType === "select" ? initial_options : undefined,
      });
      setStatus(`Added custom field “${lab}”`);
      setCreateLabel("");
      setCreateOptRows([{ value: "1", label: "First choice" }]);
      await load();
    } catch (e) {
      setCreateFieldError(e instanceof Error ? e.message : "Could not create field");
    } finally {
      setCreateBusy(false);
    }
  };

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
          Relabel or hide built-ins; add optional text, number, or dropdown fields (no new DB columns).
        </p>
        <details className="admin-doc-disclosure">
          <summary className="admin-doc-disclosure-summary">Technical reference</summary>
          <div className="admin-doc-disclosure-body muted small">
            <p>
              Built-in fields use fixed internal keys (e.g. <span className="mono">start_time</span>) tied to core storage.
              Rename labels freely; do not change those keys here without a developer.
            </p>
            <p>
              Custom fields get a system-generated key and store values separately—adding them from this page is supported and
              does not require schema migrations.
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
          <section className="admin-section admin-section--create" aria-labelledby="admin-create-heading">
            <h2 id="admin-create-heading" className="admin-section-title">
              Add custom field
            </h2>
            <p className="admin-section-hint muted small">
              Shown in Add entry / day log. Hide with Visible off — data is kept.
            </p>
            <div className="admin-create-custom">
              {createFieldError && <p className="error-inline admin-create-error">{createFieldError}</p>}
              <label className="field field--stacked admin-create-row">
                <span className="admin-field-inline-label">Scope</span>
                <select
                  className="admin-field-label-input admin-field-label-input--dense"
                  value={createScope}
                  onChange={(e) => setCreateScope(e.target.value as TrackerFieldScope)}
                >
                  <option value="entry">Log entry</option>
                  <option value="day">Day</option>
                </select>
              </label>
              <label className="field field--stacked admin-create-row">
                <span className="admin-field-inline-label">Type</span>
                <select
                  className="admin-field-label-input admin-field-label-input--dense"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value as "text" | "number" | "select")}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="select">Dropdown</option>
                </select>
              </label>
              <label className="field field--stacked admin-create-row admin-create-row--grow">
                <span className="admin-field-inline-label">Label</span>
                <input
                  className="admin-field-label-input admin-field-label-input--dense"
                  value={createLabel}
                  onChange={(e) => setCreateLabel(e.target.value)}
                  placeholder="Shown in the app"
                  autoComplete="off"
                />
              </label>
              {createType === "select" && (
                <div className="admin-create-options">
                  <span className="admin-field-inline-label">Choices</span>
                  <p className="muted small admin-create-options-hint">
                    Internal code + label shown in the app (like built-in dropdowns).
                  </p>
                  {createOptRows.map((row, idx) => (
                    <div key={idx} className="admin-create-option-pair">
                      <input
                        className="admin-field-label-input admin-field-label-input--dense"
                        placeholder="Code (stable)"
                        value={row.value}
                        onChange={(e) =>
                          setCreateOptRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)),
                          )
                        }
                      />
                      <input
                        className="admin-field-label-input admin-field-label-input--dense"
                        placeholder="Label shown to people"
                        value={row.label}
                        onChange={(e) =>
                          setCreateOptRows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)),
                          )
                        }
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setCreateOptRows((rows) => [...rows, { value: "", label: "" }])}
                  >
                    Add choice row
                  </button>
                </div>
              )}
              <div className="admin-create-actions">
                <button
                  type="button"
                  className="btn primary small"
                  disabled={createBusy || !createLabel.trim() || userId == null}
                  onClick={() => void submitCreateField()}
                >
                  {createBusy ? "Creating…" : "Create field"}
                </button>
              </div>
            </div>
          </section>

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
                  userId={userId}
                  onReload={() => void load()}
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
                  userId={userId}
                  onReload={() => void load()}
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
  userId: number | null;
  onReload: () => void;
  onChange: (id: number, patch: Partial<TrackerFieldDefinitionDTO>) => void;
  onOptionChange: (fieldId: number, optionId: number, patch: Partial<TrackerSelectOptionDTO>) => void;
  onSaveField: () => void;
  onSaveOption: (fieldId: number, o: TrackerSelectOptionDTO) => void;
};

function FieldEditorRow({ f, userId, onReload, onChange, onOptionChange, onSaveField, onSaveOption }: RowProps) {
  const choiceGroupName = `admin-choices-${f.id}`;
  const inactiveCount = f.field_type === "select" ? f.options.filter((o) => !o.is_active).length : 0;
  const [newOptValue, setNewOptValue] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");
  const [newOptBusy, setNewOptBusy] = useState(false);

  const addCustomOption = async () => {
    const v = newOptValue.trim();
    const lab = newOptLabel.trim();
    if (!v || !lab || userId == null) return;
    setNewOptBusy(true);
    try {
      await createTrackerSelectOption(userId, f.id, {
        value: v,
        label: lab,
        display_order: (f.options.reduce((m, o) => Math.max(m, o.display_order), 0) || 0) + 10,
      });
      setNewOptValue("");
      setNewOptLabel("");
      onReload();
    } finally {
      setNewOptBusy(false);
    }
  };

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
          <span className="admin-type-tag">
            {!f.is_builtin ? "Custom · " : ""}
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
          <div className="admin-tool-ord">
            <AdminOrdHashLabel hint="Display order" />
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
          {f.is_builtin && (
            <label className="admin-check admin-check--dense">
              <input type="checkbox" checked={f.is_required} onChange={(e) => onChange(f.id, { is_required: e.target.checked })} />
              <span>Required</span>
            </label>
          )}
          <button type="button" className="btn primary small admin-slab-save" onClick={onSaveField}>
            Save
          </button>
        </div>
      </div>

      {f.field_type === "select" && !f.is_builtin && (
        <div className="admin-add-option-bar muted small">
          <span className="admin-field-inline-label">Quick add choice</span>
          <input
            className="admin-field-label-input admin-field-label-input--dense"
            placeholder="Code (stable)"
            value={newOptValue}
            onChange={(e) => setNewOptValue(e.target.value)}
            disabled={newOptBusy}
          />
          <input
            className="admin-field-label-input admin-field-label-input--dense"
            placeholder="Label shown to people"
            value={newOptLabel}
            onChange={(e) => setNewOptLabel(e.target.value)}
            disabled={newOptBusy}
          />
          <button
            type="button"
            className="btn secondary small"
            disabled={newOptBusy || !newOptValue.trim() || !newOptLabel.trim()}
            onClick={() => void addCustomOption()}
          >
            Add
          </button>
        </div>
      )}

      {f.field_type === "select" && (f.options.length > 0 || !f.is_builtin) && (
        <details className="admin-options admin-options--nested">
          <summary className="admin-options-summary">
            Edit existing choices
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
                      <AdminOptionCodeLine value={o.value} />
                      <div className="admin-option-fold-tools">
                        <div className="admin-tool-ord">
                          <AdminOrdHashLabel hint="Choice order" />
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
