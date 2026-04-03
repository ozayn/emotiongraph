import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchInsights } from "../api";
import { useSession } from "../session/SessionContext";
import { addCalendarDaysToIso, todayIsoInTimeZone } from "../datesTz";
import type { InsightsPayload, InsightsRecentEntry } from "../types";
import {
  formatAnxiety,
  formatContentment,
  formatEnergy,
  formatFocus,
  formatSleepQuality,
} from "../trackerOptions";

type Props = { userId: number; timeZone: string };

/** Set to `true` to show range equality debug under the date picker. */
const INSIGHTS_RANGE_DEBUG = false;

function shortDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function snapshotHeadingDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatAvg(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatTimeShort(iso: string, timeOnly?: boolean): string {
  try {
    const d = new Date(iso);
    if (timeOnly) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

type TooltipProps = {
  active?: boolean;
  payload?: { name?: string; value?: number | null; color?: string; payload?: Record<string, unknown> }[];
};

function InsightTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as { log_date?: string } | undefined;
  const title = row?.log_date ? shortDate(row.log_date) : "";
  return (
    <div className="insights-tooltip">
      {title && <p className="insights-tooltip-date">{title}</p>}
      <ul className="insights-tooltip-list">
        {payload.map((p) => (
          <li key={String(p.name)} style={{ color: p.color }}>
            <span>{p.name}</span>
            <span className="insights-tooltip-val">{p.value != null ? p.value : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function isReadyUserId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

/** Fractional hour 0–24 for local wall time, with small index-based jitter for overlapping times. */
function hourOfDayWithJitter(iso: string, jitterIndex: number): number {
  const d = new Date(iso);
  const base = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return Math.min(23.98, base + jitterIndex * 0.06);
}

type DayScatterPoint = {
  x: number;
  y: number;
  timeLabel: string;
  eventLabel: string;
};

function buildSingleDayScatterSeries(entries: InsightsRecentEntry[]): {
  energy: DayScatterPoint[];
  anxiety: DayScatterPoint[];
  contentment: DayScatterPoint[];
  focus: DayScatterPoint[];
} {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const energy: DayScatterPoint[] = [];
  const anxiety: DayScatterPoint[] = [];
  const contentment: DayScatterPoint[] = [];
  const focus: DayScatterPoint[] = [];
  sorted.forEach((e, i) => {
    const x = hourOfDayWithJitter(e.created_at, i);
    const timeLabel = formatTimeShort(e.created_at, true);
    const eventLabel = (e.event ?? "").trim() || "—";
    if (e.energy_level != null) {
      energy.push({ x, y: e.energy_level, timeLabel, eventLabel });
    }
    if (e.anxiety != null) {
      anxiety.push({ x, y: e.anxiety, timeLabel, eventLabel });
    }
    if (e.contentment != null) {
      contentment.push({ x, y: e.contentment, timeLabel, eventLabel });
    }
    if (e.focus != null) {
      focus.push({ x, y: e.focus, timeLabel, eventLabel });
    }
  });
  return { energy, anxiety, contentment, focus };
}

function SingleDayScatterTooltip({
  active,
  payload,
  metric,
  formatVal,
}: {
  active?: boolean;
  payload?: { payload: DayScatterPoint }[];
  metric: string;
  formatVal: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="insights-tooltip">
      <p className="insights-tooltip-date">{p.timeLabel}</p>
      <p className="insights-tooltip-line">
        <span style={{ color: "var(--text)" }}>{metric}</span>{" "}
        <span className="insights-tooltip-val">{formatVal(p.y)}</span>
      </p>
      <p className="muted small" style={{ margin: "0.35rem 0 0", lineHeight: 1.35 }}>
        {p.eventLabel.length > 72 ? `${p.eventLabel.slice(0, 71)}…` : p.eventLabel}
      </p>
    </div>
  );
}

function SingleDayCheckinsChart({ entries }: { entries: InsightsRecentEntry[] }) {
  const series = useMemo(() => buildSingleDayScatterSeries(entries), [entries]);
  const hasAny =
    series.energy.length +
      series.anxiety.length +
      series.contentment.length +
      series.focus.length >
    0;

  if (entries.length === 0) {
    return (
      <div className="insights-chart-card">
        <p className="insights-chart-title">By time</p>
        <p className="muted small insights-single-chart-empty">No entries.</p>
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="insights-chart-card">
        <p className="insights-chart-title">By time</p>
        <p className="muted small insights-single-chart-empty">No numeric metrics on these entries.</p>
      </div>
    );
  }

  return (
    <div className="insights-chart-card">
      <p className="insights-chart-title">By time</p>
      <div className="insights-chart-wrap insights-chart-wrap--single-scatter">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
            <CartesianGrid stroke="var(--border-line)" vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              name="Time"
              domain={[0, 24]}
              ticks={[0, 6, 12, 18, 24]}
              tickFormatter={(v) => (v === 24 ? "24h" : `${v}h`)}
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 5.5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              width={26}
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const m = payload?.[0]?.name as string | undefined;
                if (m === "Energy")
                  return (
                    <SingleDayScatterTooltip
                      active={active}
                      payload={payload as { payload: DayScatterPoint }[]}
                      metric="Energy"
                      formatVal={(n) => formatEnergy(n)}
                    />
                  );
                if (m === "Anxiety")
                  return (
                    <SingleDayScatterTooltip
                      active={active}
                      payload={payload as { payload: DayScatterPoint }[]}
                      metric="Anxiety"
                      formatVal={(n) => formatAnxiety(n)}
                    />
                  );
                if (m === "Contentment")
                  return (
                    <SingleDayScatterTooltip
                      active={active}
                      payload={payload as { payload: DayScatterPoint }[]}
                      metric="Contentment"
                      formatVal={(n) => formatContentment(n)}
                    />
                  );
                if (m === "Focus")
                  return (
                    <SingleDayScatterTooltip
                      active={active}
                      payload={payload as { payload: DayScatterPoint }[]}
                      metric="Focus"
                      formatVal={(n) => formatFocus(n)}
                    />
                  );
                return null;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: 4 }}
              formatter={(value) => <span style={{ color: "var(--muted)" }}>{value}</span>}
            />
            {series.energy.length > 0 ? (
              <Scatter
                name="Energy"
                data={series.energy}
                fill="var(--chart-energy)"
                shape="circle"
                legendType="circle"
                isAnimationActive={false}
                line={false}
              />
            ) : null}
            {series.anxiety.length > 0 ? (
              <Scatter
                name="Anxiety"
                data={series.anxiety}
                fill="var(--chart-anxiety)"
                shape="circle"
                legendType="circle"
                isAnimationActive={false}
                line={false}
              />
            ) : null}
            {series.contentment.length > 0 ? (
              <Scatter
                name="Contentment"
                data={series.contentment}
                fill="var(--chart-contentment)"
                shape="circle"
                legendType="circle"
                isAnimationActive={false}
                line={false}
              />
            ) : null}
            {series.focus.length > 0 ? (
              <Scatter
                name="Focus"
                data={series.focus}
                fill="var(--chart-focus)"
                shape="circle"
                legendType="circle"
                isAnimationActive={false}
                line={false}
              />
            ) : null}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function InsightsEntriesSection({
  id,
  title,
  lead,
  entries,
  hideLogDate,
}: {
  id: string;
  title: string;
  lead?: string;
  entries: InsightsRecentEntry[];
  hideLogDate?: boolean;
}) {
  const timeOnly = Boolean(hideLogDate);
  const list = (
    <ul className="insights-recent-list">
      {entries.length === 0 && <li className="muted">No entries in this range.</li>}
      {entries.map((e) => (
        <li key={e.id} className="insights-recent-item">
          <div className="insights-recent-top">
            <span className="insights-recent-time">{formatTimeShort(e.created_at, timeOnly)}</span>
            {!hideLogDate ? <span className="insights-recent-date muted small">{e.log_date}</span> : null}
          </div>
          <p className="insights-recent-event">{e.event?.trim() || "—"}</p>
          <div className="insights-recent-metrics muted small">
            {e.energy_level != null && <span>E · {formatEnergy(e.energy_level)}</span>}
            {e.anxiety != null && <span>A · {formatAnxiety(e.anxiety)}</span>}
            {e.contentment != null && <span>C · {formatContentment(e.contentment)}</span>}
            {e.focus != null && <span>F · {formatFocus(e.focus)}</span>}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <details className="insights-list-disclosure">
      <summary className="insights-list-disclosure-summary">
        <span className="insights-list-disclosure-chevron" aria-hidden>
          ▸
        </span>
        <h2 id={id} className="insights-section-title insights-list-disclosure-title">
          {title}
        </h2>
        <span className="insights-list-disclosure-meta muted small">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </summary>
      <div className="insights-list-disclosure-body">
        {lead ? <p className="insights-section-lead muted small">{lead}</p> : null}
        {list}
      </div>
    </details>
  );
}

function InsightsEventsDisclosure({
  id,
  title,
  lead,
  emptyMessage,
  patterns,
  labelMeta,
}: {
  id: string;
  title: string;
  lead: string;
  emptyMessage: string;
  patterns: InsightsPayload["event_patterns"];
  labelMeta: string;
}) {
  return (
    <details className="insights-list-disclosure">
      <summary className="insights-list-disclosure-summary">
        <span className="insights-list-disclosure-chevron" aria-hidden>
          ▸
        </span>
        <h2 id={id} className="insights-section-title insights-list-disclosure-title">
          {title}
        </h2>
        <span className="insights-list-disclosure-meta muted small">{labelMeta}</span>
      </summary>
      <div className="insights-list-disclosure-body">
        <p className="insights-section-lead muted small">{lead}</p>
        <ul className="insights-events-list">
          {patterns.length === 0 && <li className="muted">{emptyMessage}</li>}
          {patterns.map((row) => (
            <li key={row.event_label} className="insights-event-row">
              <div className="insights-event-main">
                <p className="insights-event-label">{row.event_label}</p>
                <span className="insights-event-count">{row.count}×</span>
              </div>
              <div className="insights-event-avgs muted small">
                {row.avg_energy != null && <span>E {formatAvg(row.avg_energy)}</span>}
                {row.avg_anxiety != null && <span>A {formatAvg(row.avg_anxiety)}</span>}
                {row.avg_contentment != null && <span>C {formatAvg(row.avg_contentment)}</span>}
                {row.avg_focus != null && <span>F {formatAvg(row.avg_focus)}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export default function InsightsPage({ userId, timeZone }: Props) {
  const { pathFor } = useSession();
  const [endDate, setEndDate] = useState(() => todayIsoInTimeZone(timeZone));
  const [startDate, setStartDate] = useState(() => addCalendarDaysToIso(todayIsoInTimeZone(timeZone), -29));

  // Reset range when switching profiles only. Including `timeZone` here overwrote user-picked
  // From/To whenever the effective zone changed after load (e.g. preferences hydration).
  useEffect(() => {
    const end = todayIsoInTimeZone(timeZone);
    setEndDate(end);
    setStartDate(addCalendarDaysToIso(end, -29));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: do not re-run on timeZone alone
  }, [userId]);
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isReadyUserId(userId)) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const payload = await fetchInsights(userId, startDate, endDate, { signal: ac.signal });
        setData(payload);
      } catch (e) {
        if (ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "Could not load insights");
        setData(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [userId, startDate, endDate]);

  const chartDaily = useMemo(() => {
    if (!data?.daily.length) return [];
    return data.daily.map((d) => ({
      ...d,
      label: shortDate(d.log_date),
    }));
  }, [data]);

  const applyPreset = (days: number) => {
    const end = todayIsoInTimeZone(timeZone);
    setEndDate(end);
    setStartDate(addCalendarDaysToIso(end, -(days - 1)));
  };

  const s = data?.summary;
  /** Inclusive range is exactly one calendar day (date inputs). */
  const singleDay = startDate === endDate;
  const todayIso = todayIsoInTimeZone(timeZone);
  const singleDayIsToday = singleDay && startDate === todayIso;

  if (!isReadyUserId(userId)) {
    return (
      <div className="insights-page">
        <p className="muted insights-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="insights-page">
      <header className="insights-header">
        <div className="insights-header-top">
          <Link to={pathFor("/today")} className="insights-back muted small">
            ← Today
          </Link>
        </div>
        <h1 className="insights-title">Insights</h1>
        <p className="insights-lead muted small">
          {singleDay ? snapshotHeadingDate(startDate) : "Summaries and charts for the range below."}
        </p>
        {singleDay ? (
          <p className="insights-snapshot-actions muted small">
            {singleDayIsToday ? (
              <Link className="linkish" to={pathFor("/today")}>
                Edit in Today
              </Link>
            ) : (
              <Link className="linkish" to={`${pathFor("/entries")}?day=${encodeURIComponent(startDate)}`}>
                Edit in Entries
              </Link>
            )}
          </p>
        ) : null}
      </header>

      <section className="insights-card insights-range-card" aria-label="Date range">
        <div className="insights-presets">
          {[
            { label: "1d", days: 1 },
            { label: "7d", days: 7 },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              className="insights-preset"
              onClick={() => applyPreset(days)}
              title={days === 1 ? "Today only (this profile’s timezone)" : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="insights-date-row">
          <label className="insights-date-field">
            <span className="insights-date-label">From</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="insights-date-input" />
          </label>
          <label className="insights-date-field">
            <span className="insights-date-label">To</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="insights-date-input" />
          </label>
        </div>
      </section>

      {INSIGHTS_RANGE_DEBUG ? (
        <div className="insights-debug-strip" role="status" aria-label="Insights range debug">
          <p className="insights-debug-strip-line mono muted small">
            Debug: From <span className="insights-debug-strip-val">{startDate}</span> · To{" "}
            <span className="insights-debug-strip-val">{endDate}</span> · singleDay condition (strict string equality):{" "}
            <span className="insights-debug-strip-val">{String(startDate === endDate)}</span>
          </p>
        </div>
      ) : null}

      {INSIGHTS_RANGE_DEBUG && singleDay ? (
        <p className="insights-single-day-marker" role="status">
          Single-day mode active
        </p>
      ) : null}

      {error && <p className="error-inline insights-error">{error}</p>}

      {loading && !data && <p className="muted insights-loading">Loading…</p>}

      {data && (
        <>
          <section className="insights-section" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="insights-section-title">
              {singleDay ? "This day" : "Averages"}
            </h2>
            <div className="insights-summary-grid">
              <div className="insights-metric-card">
                <p className="insights-metric-label">Energy</p>
                <p className="insights-metric-value">{formatAvg(s?.avg_energy ?? null)}</p>
                <p className="insights-metric-hint muted small">1–3 scale</p>
              </div>
              <div className="insights-metric-card">
                <p className="insights-metric-label">Anxiety</p>
                <p className="insights-metric-value">{formatAvg(s?.avg_anxiety ?? null)}</p>
                <p className="insights-metric-hint muted small">0–3 scale</p>
              </div>
              <div className="insights-metric-card">
                <p className="insights-metric-label">Contentment</p>
                <p className="insights-metric-value">{formatAvg(s?.avg_contentment ?? null)}</p>
                <p className="insights-metric-hint muted small">1–3 scale</p>
              </div>
              <div className="insights-metric-card">
                <p className="insights-metric-label">Focus</p>
                <p className="insights-metric-value">{formatAvg(s?.avg_focus ?? null)}</p>
                <p className="insights-metric-hint muted small">1–5 scale</p>
              </div>
            </div>
            <p className="insights-range-meta muted small">
              {s?.entry_count ?? 0} entries · {s?.days_with_entries ?? 0} active days
            </p>
          </section>

          {singleDay ? (
            <section className="insights-section insights-section--tight" aria-label="Check-ins by time of day">
              <SingleDayCheckinsChart entries={data.recent_entries} />
            </section>
          ) : (
            <section className="insights-section" aria-labelledby="trends-heading">
              <h2 id="trends-heading" className="insights-section-title">
                Trends
              </h2>
              <div className="insights-trends-stack">
                <div className="insights-chart-card">
                  <p className="insights-chart-title">Energy &amp; contentment</p>
                  <div className="insights-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartDaily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border-line)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={[0.5, 3.5]} ticks={[1, 2, 3]} width={28} tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                        <Tooltip content={<InsightTooltip />} />
                        <Line type="monotone" dataKey="avg_energy" name="Energy" stroke="var(--chart-energy)" strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="avg_contentment" name="Contentment" stroke="var(--chart-contentment)" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="insights-chart-card">
                  <p className="insights-chart-title">Anxiety &amp; focus</p>
                  <div className="insights-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartDaily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border-line)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} width={28} tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                        <Tooltip content={<InsightTooltip />} />
                        <Line type="monotone" dataKey="avg_anxiety" name="Anxiety" stroke="var(--chart-anxiety)" strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="avg_focus" name="Focus" stroke="var(--chart-focus)" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>
          )}

          {singleDay ? (
            <InsightsEntriesSection
              id="entries-heading"
              title="Timeline"
              lead="Newest first — your check-ins for this day."
              entries={data.recent_entries}
              hideLogDate
            />
          ) : null}

          {data.tracker_summary.has_data && (
            <section className="insights-section" aria-labelledby="day-heading">
              <h2 id="day-heading" className="insights-section-title">
                {singleDay ? "Day context" : "Day notes"}
              </h2>
              <p className="insights-section-lead muted small">
                {singleDay
                  ? "Cycle & sleep fields for this date (if you logged them)."
                  : "From your cycle & sleep fields."}
              </p>
              <div className="insights-summary-grid insights-summary-grid--3">
                <div className="insights-metric-card">
                  <p className="insights-metric-label">Sleep quality</p>
                  <p className="insights-metric-value">{formatAvg(data.tracker_summary.avg_sleep_quality)}</p>
                  <p className="insights-metric-hint muted small">1–5 avg</p>
                </div>
                <div className="insights-metric-card">
                  <p className="insights-metric-label">Cycle day</p>
                  <p className="insights-metric-value">{formatAvg(data.tracker_summary.avg_cycle_day)}</p>
                  <p className="insights-metric-hint muted small">
                    {singleDay ? "This day" : "Across logged days"}
                  </p>
                </div>
                <div className="insights-metric-card">
                  <p className="insights-metric-label">Sleep hours</p>
                  <p className="insights-metric-value">{formatAvg(data.tracker_summary.avg_sleep_hours)}</p>
                  <p className="insights-metric-hint muted small">
                    {singleDay && data.tracker_summary.days_with_tracker <= 1
                      ? "Logged for this day"
                      : `${data.tracker_summary.days_with_tracker} days`}
                  </p>
                </div>
              </div>
              {data.tracker_daily.length >= 2 && (
                <div className="insights-chart-card insights-chart-card--spaced">
                  <p className="insights-chart-title">Sleep quality over time</p>
                  <div className="insights-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={data.tracker_daily.map((t) => ({ ...t, label: shortDate(t.log_date) }))}
                        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid stroke="var(--border-line)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} width={28} tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const pl = payload[0]?.payload as { log_date?: string; sleep_quality?: number | null };
                            const title = pl?.log_date ? shortDate(pl.log_date) : "";
                            const v = pl?.sleep_quality;
                            return (
                              <div className="insights-tooltip">
                                {title && <p className="insights-tooltip-date">{title}</p>}
                                <p className="insights-tooltip-sleep">{v != null ? formatSleepQuality(v) : "—"}</p>
                              </div>
                            );
                          }}
                        />
                        <Line type="monotone" dataKey="sleep_quality" name="Sleep" stroke="var(--chart-sleep)" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {data.tracker_daily.length >= 2 && data.tracker_daily.some((t) => t.cycle_day != null) && (
                <div className="insights-chart-card">
                  <p className="insights-chart-title">Cycle day</p>
                  <div className="insights-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={data.tracker_daily.map((t) => ({ ...t, label: shortDate(t.log_date) }))}
                        margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid stroke="var(--border-line)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={["auto", "auto"]} width={32} tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                        <Tooltip content={<InsightTooltip />} />
                        <Line type="monotone" dataKey="cycle_day" name="Cycle" stroke="var(--chart-cycle)" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </section>
          )}

          {!singleDay ? (
            <InsightsEntriesSection
              id="recent-heading"
              title="Recent history"
              lead="Newest first — up to 25 entries in this range."
              entries={data.recent_entries}
            />
          ) : null}

          <InsightsEventsDisclosure
            id="events-heading"
            title={singleDay ? "Events this day" : "By event"}
            lead={
              singleDay
                ? "Grouped by event label — counts and averages for this date."
                : "Averages for repeated descriptions in this range."
            }
            emptyMessage={
              singleDay
                ? "No labeled events this day — event text comes from your log entries."
                : "No patterns yet — add a few entries with similar wording."
            }
            patterns={data.event_patterns}
            labelMeta={`${data.event_patterns.length} ${data.event_patterns.length === 1 ? "label" : "labels"}`}
          />
        </>
      )}
    </div>
  );
}
