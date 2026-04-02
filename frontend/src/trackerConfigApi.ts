import { headersForAuthenticatedUser } from "./api";
import type { TrackerConfigResponse, TrackerFieldDefinitionDTO, TrackerFieldScope } from "./trackerConfigTypes";

const base = () => import.meta.env.VITE_API_BASE ?? "";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* keep text */
    }
    throw new Error(detail || res.statusText);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function fetchTrackerConfig(userId: number): Promise<TrackerConfigResponse> {
  const res = await fetch(`${base()}/tracker-config`, {
    headers: { ...headersForAuthenticatedUser(userId) },
  });
  return parseJson(res);
}

export async function patchTrackerField(
  userId: number,
  id: number,
  body: { label?: string; is_required?: boolean; is_active?: boolean; display_order?: number },
): Promise<void> {
  const res = await fetch(`${base()}/tracker-config/fields/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headersForAuthenticatedUser(userId) },
    body: JSON.stringify(body),
  });
  await parseJson(res);
}

export async function patchTrackerOption(
  userId: number,
  id: number,
  body: { label?: string; display_order?: number; is_active?: boolean },
): Promise<void> {
  const res = await fetch(`${base()}/tracker-config/options/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headersForAuthenticatedUser(userId) },
    body: JSON.stringify(body),
  });
  await parseJson(res);
}

export type CreateCustomFieldBody = {
  scope: TrackerFieldScope;
  field_type: "text" | "number" | "select";
  label: string;
  is_required?: boolean;
  is_active?: boolean;
  display_order?: number | null;
  initial_options?: { value: string; label: string; display_order?: number }[];
};

export async function createTrackerField(userId: number, body: CreateCustomFieldBody): Promise<TrackerFieldDefinitionDTO> {
  const res = await fetch(`${base()}/tracker-config/fields`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersForAuthenticatedUser(userId) },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function createTrackerSelectOption(
  userId: number,
  fieldId: number,
  body: { value: string; label: string; display_order?: number; is_active?: boolean },
): Promise<void> {
  const res = await fetch(`${base()}/tracker-config/fields/${fieldId}/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersForAuthenticatedUser(userId) },
    body: JSON.stringify(body),
  });
  await parseJson(res);
}
