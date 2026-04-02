/** IANA zone from the browser (e.g. America/Los_Angeles), or UTC if unavailable. */
export function getBrowserIanaTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Effective zone for calendar dates and extraction context:
 * saved server override if set, otherwise the device/browser zone.
 */
export function effectiveUserTimeZone(user: { timezone?: string | null } | null | undefined): string {
  const t = user?.timezone;
  if (typeof t === "string" && t.trim() !== "") {
    return t.trim();
  }
  return getBrowserIanaTimeZone();
}

/** Shift a YYYY-MM-DD anchor by whole days using UTC calendar math (stable for range defaults). */
export function addCalendarDaysToIso(anchorYmd: string, deltaDays: number): string {
  const [y, m, d] = anchorYmd.split("-").map(Number);
  if (!y || !m || !d) return anchorYmd;
  const u = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
  const x = new Date(u);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/** Calendar YYYY-MM-DD in a specific IANA timezone (user’s “today”). */
export function todayIsoInTimeZone(timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* invalid TZ */
  }
  return todayIsoLocal();
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 24h HH:MM wall clock in a specific IANA timezone (for extraction capture hint). */
export function wallClockHHMMInTimeZone(timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(new Date());
    const h = parts.find((p) => p.type === "hour")?.value;
    const m = parts.find((p) => p.type === "minute")?.value;
    if (h != null && m != null) return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  } catch {
    /* invalid TZ */
  }
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
