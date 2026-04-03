import { useEffect, useState } from "react";

/**
 * Returns `text` as a themed hover hint only when the primary pointer is fine (e.g. mouse).
 * Omits hints on coarse pointers (typical touch) to reduce long-press clutter.
 */
export function useFinePointerTitle(text: string | null | undefined): string | undefined {
  const [coarse, setCoarse] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(pointer: coarse)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const t = text?.trim();
  if (!t) return undefined;
  return coarse ? undefined : t;
}
