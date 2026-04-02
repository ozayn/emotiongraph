import type { TrackerFieldDefinitionDTO } from "./trackerConfigTypes";

export type CustomValueDTO = {
  field_definition_id: number;
  value_text: string | null;
  value_number: number | null;
  select_option_id: number | null;
};

/** Map API custom_values + definitions to string draft (per field id). */
export function customValuesToDraft(
  values: CustomValueDTO[] | undefined,
  fields: TrackerFieldDefinitionDTO[],
): Record<number, string> {
  const m: Record<number, string> = {};
  for (const f of fields) {
    m[f.id] = "";
  }
  if (!values?.length) return m;
  for (const v of values) {
    const f = fields.find((x) => x.id === v.field_definition_id);
    if (!f) continue;
    if (f.field_type === "text") m[f.id] = v.value_text ?? "";
    else if (f.field_type === "number") m[f.id] = v.value_number != null ? String(v.value_number) : "";
    else if (f.field_type === "select") m[f.id] = v.select_option_id != null ? String(v.select_option_id) : "";
  }
  return m;
}

/** Build PUT body for every custom field in `fields` (clears omitted keys). */
export function buildCustomValuesPayload(
  draft: Record<number, string>,
  fields: TrackerFieldDefinitionDTO[],
): CustomValueDTO[] {
  return fields.map((f) => {
    const raw = (draft[f.id] ?? "").trim();
    if (f.field_type === "text") {
      return {
        field_definition_id: f.id,
        value_text: raw === "" ? null : raw,
        value_number: null,
        select_option_id: null,
      };
    }
    if (f.field_type === "number") {
      if (raw === "") {
        return { field_definition_id: f.id, value_text: null, value_number: null, select_option_id: null };
      }
      const n = Number.parseFloat(raw);
      return {
        field_definition_id: f.id,
        value_text: null,
        value_number: Number.isFinite(n) ? n : null,
        select_option_id: null,
      };
    }
    if (raw === "") {
      return { field_definition_id: f.id, value_text: null, value_number: null, select_option_id: null };
    }
    const sid = Number.parseInt(raw, 10);
    return {
      field_definition_id: f.id,
      value_text: null,
      value_number: null,
      select_option_id: Number.isFinite(sid) ? sid : null,
    };
  });
}

export function filterCustomFormFields(fields: TrackerFieldDefinitionDTO[], scope: "entry" | "day"): TrackerFieldDefinitionDTO[] {
  return fields.filter(
    (f) =>
      !f.is_builtin &&
      f.is_active &&
      f.scope === scope &&
      (f.field_type === "text" || f.field_type === "number" || f.field_type === "select"),
  );
}

/** Human-readable value for summaries (draft stores option id as string for selects). */
export function formatCustomFieldDisplay(f: TrackerFieldDefinitionDTO, raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "—";
  if (f.field_type === "select") {
    const id = Number.parseInt(t, 10);
    if (!Number.isFinite(id)) return "—";
    const opt = f.options.find((o) => o.id === id);
    const lab = opt?.label?.trim();
    if (lab) return lab;
    if (opt?.value) return opt.value;
    return "—";
  }
  return t;
}

export function countFilledCustomDraft(fields: TrackerFieldDefinitionDTO[], draft: Record<number, string>): number {
  return fields.filter((f) => (draft[f.id] ?? "").trim().length > 0).length;
}
