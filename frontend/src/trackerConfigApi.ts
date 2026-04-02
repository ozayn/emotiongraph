import type { TrackerConfigResponse } from "./trackerConfigTypes";

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

export async function fetchTrackerConfig(): Promise<TrackerConfigResponse> {
  const res = await fetch(`${base()}/tracker-config`);
  return parseJson(res);
}

export async function patchTrackerField(
  id: number,
  body: { label?: string; is_required?: boolean; is_active?: boolean; display_order?: number },
): Promise<void> {
  const res = await fetch(`${base()}/tracker-config/fields/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await parseJson(res);
}

export async function patchTrackerOption(
  id: number,
  body: { label?: string; display_order?: number; is_active?: boolean },
): Promise<void> {
  const res = await fetch(`${base()}/tracker-config/options/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await parseJson(res);
}
