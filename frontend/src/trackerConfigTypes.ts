export type TrackerFieldScope = "entry" | "day";

export type TrackerFieldType = "text" | "textarea" | "select" | "number" | "time";

export type TrackerSelectOptionDTO = {
  id: number;
  field_definition_id: number;
  value: string;
  label: string;
  display_order: number;
  is_active: boolean;
};

export type TrackerFieldDefinitionDTO = {
  id: number;
  key: string;
  label: string;
  scope: TrackerFieldScope;
  field_type: TrackerFieldType;
  is_required: boolean;
  is_active: boolean;
  display_order: number;
  options: TrackerSelectOptionDTO[];
};

export type TrackerConfigResponse = {
  fields: TrackerFieldDefinitionDTO[];
};
