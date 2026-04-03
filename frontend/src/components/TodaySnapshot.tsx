import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchTrackerDay } from "../api";
import type { SavedLogEntry, TrackerDay } from "../types";
import {
  formatAnxiety,
  formatContentment,
  formatEnergy,
  formatFocus,
  formatSleepQuality,
} from "../trackerOptions";

type Props = {
  userId: number;
  logDate: string;
  entries: SavedLogEntry[];
  entriesLoading: boolean;
};

function isReadyUserId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
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

function formatAvg(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Prefer HH:MM start_time when present; else created_at (local wall). */
function entryTimeX(e: SavedLogEntry, jitterIndex: number): number {
  const st = e.start_time?.trim();
  const m = st?.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (Number.isFinite(h) && Number.isFinite(mm)) {
      return Math.min(23.98, h + mm / 60 + jitterIndex * 0.06);
    }
  }
  const d = new Date(e.created_at);
  const base = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return Math.min(23.98, base + jitterIndex * 0.06);
}

type DayPoint = { x: number; y: number; timeLabel: string; eventLabel: string };

function buildTodayScatterSeries(entries: SavedLogEntry[]): {
  energy: DayPoint[];
  anxiety: DayPoint[];
  contentment: DayPoint[];
  focus: DayPoint[];
} {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const energy: DayPoint[] = [];
  const anxiety: DayPoint[] = [];
  const contentment: DayPoint[] = [];
  const focus: DayPoint[] = [];
  sorted.forEach((e, i) => {
    const x = entryTimeX(e, i);
    const timeLabel = e.start_time?.trim()
      ? e.start_time.trim()
      : formatTimeShort(e.created_at, true);
    const eventLabel = (e.event ?? "").trim() || "—";
    if (e.energy_level != null) energy.push({ x, y: e.energy_level, timeLabel, eventLabel });
    if (e.anxiety != null) anxiety.push({ x, y: e.anxiety, timeLabel, eventLabel });
    if (e.contentment != null) contentment.push({ x, y: e.contentment, timeLabel, eventLabel });
    if (e.focus != null) focus.push({ x, y: e.focus, timeLabel, eventLabel });
  });
  return { energy, anxiety, contentment, focus };
}

function ScatterTip({
  active,
  payload,
  metric,
  formatVal,
}: {
  active?: boolean;
  payload?: { payload: DayPoint }[];
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

type MetricKey = "energy" | "anxiety" | "contentment" | "focus";

const SNAPSHOT_METRICS: {
  key: MetricKey;
  label: string;
  colorVar: string;
}[] = [
  { key: "energy", label: "Energy", colorVar: "var(--chart-energy)" },
  { key: "anxiety", label: "Anxiety", colorVar: "var(--chart-anxiety)" },
  { key: "contentment", label: "Contentment", colorVar: "var(--chart-contentment)" },
  { key: "focus", label: "Focus", colorVar: "var(--chart-focus)" },
];

const defaultMetricVisibility: Record<MetricKey, boolean> = {
  energy: true,
  anxiety: true,
  contentment: true,
  focus: true,
};

export default function TodaySnapshot({ userId, logDate, entries, entriesLoading }: Props) {
  const [trackerDay, setTrackerDay] = useState<TrackerDay | null>(null);
  const [metricVisible, setMetricVisible] = useState<Record<MetricKey, boolean>>(defaultMetricVisibility);

  useEffect(() => {
    if (!isReadyUserId(userId) || !logDate.trim()) return;
    let cancelled = false;
    void fetchTrackerDay(userId, logDate).then((d) => {
      if (!cancelled) setTrackerDay(d);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, logDate]);

  const series = useMemo(() => buildTodayScatterSeries(entries), [entries]);
  const hasScatter =
    series.energy.length + series.anxiety.length + series.contentment.length + series.focus.length > 0;

  const dayContextLine = useMemo(() => {
    if (!trackerDay) return null;
    const bits: string[] = [];
    if (trackerDay.cycle_day != null) bits.push(`Cycle day ${trackerDay.cycle_day}`);
    if (trackerDay.sleep_hours != null) bits.push(`${formatAvg(trackerDay.sleep_hours)}h sleep`);
    if (trackerDay.sleep_quality != null) bits.push(formatSleepQuality(trackerDay.sleep_quality));
    if (bits.length === 0) return null;
    return bits.join(" · ");
  }, [trackerDay]);

  /** Count only — page title is “Today”; avoids repeating “today”. */
  const checkInsCountLine = useMemo(() => {
    if (entries.length === 0) return "None yet";
    const n = entries.length;
    return n === 1 ? "1 check-in" : `${n} check-ins`;
  }, [entries.length]);

  if (entriesLoading) {
    return (
      <section className="today-snapshot" aria-label="Today snapshot">
        <p className="muted small today-snapshot-loading">Loading…</p>
      </section>
    );
  }

  return (
    <section className="today-snapshot" aria-labelledby="today-snapshot-title">
      <div className="today-snapshot-surface">
        <div className="today-snapshot-body">
          <header className="today-snapshot-topline">
            <h2 id="today-snapshot-title" className="today-snapshot-head-title">
              By time
            </h2>
            <p className="today-snapshot-head-meta muted small">{checkInsCountLine}</p>
          </header>

          {dayContextLine ? (
            <details className="today-snapshot-dayctx-details">
              <summary className="today-snapshot-dayctx-summary">Sleep &amp; cycle</summary>
              <p className="today-snapshot-dayctx-body muted small">{dayContextLine}</p>
            </details>
          ) : null}

          <div className="today-snapshot-chart-panel">
            {entries.length === 0 ? (
              <p className="muted small today-snapshot-chart-empty">No entries to plot.</p>
            ) : !hasScatter ? (
              <p className="muted small today-snapshot-chart-empty">
                Log numeric metrics on entries to see points here.
              </p>
            ) : (
              <>
                <div
                  className="today-snapshot-metric-toggles"
                  role="group"
                  aria-label="Series"
                >
                  {SNAPSHOT_METRICS.map(({ key, label, colorVar }) => {
                    const hasData = series[key].length > 0;
                    const on = metricVisible[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        className={
                          "today-snapshot-metric-toggle" +
                          (on && hasData ? " today-snapshot-metric-toggle--on" : "") +
                          (!hasData ? " today-snapshot-metric-toggle--no-data" : "")
                        }
                        aria-pressed={hasData ? on : undefined}
                        disabled={!hasData}
                        title={!hasData ? `No ${label.toLowerCase()} values logged today` : undefined}
                        onClick={() => {
                          if (!hasData) return;
                          setMetricVisible((v) => ({ ...v, [key]: !v[key] }));
                        }}
                        style={{ "--today-metric-color": colorVar } as CSSProperties}
                      >
                        <span className="today-snapshot-metric-toggle-dot" aria-hidden />
                        {label}
                      </button>
                    );
                  })}
                </div>
                {SNAPSHOT_METRICS.some((m) => metricVisible[m.key] && series[m.key].length > 0) ? (
                  <div className="today-snapshot-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 6, right: 6, left: 6, bottom: 10 }}>
                        <CartesianGrid stroke="var(--border-line)" vertical={false} />
                        <XAxis
                          type="number"
                          dataKey="x"
                          domain={[0, 24]}
                          ticks={[0, 6, 12, 18, 24]}
                          tickFormatter={(v) => (v === 24 ? "24h" : `${v}h`)}
                          tick={{
                            fontSize: 10,
                            fill: "var(--text)",
                            fillOpacity: 0.55,
                          }}
                          tickLine={false}
                          axisLine={{ stroke: "var(--border-line)" }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          domain={[0, 5.5]}
                          ticks={[0, 1, 2, 3, 4, 5]}
                          width={40}
                          tick={{
                            fontSize: 11,
                            fill: "var(--text)",
                            fillOpacity: 0.62,
                          }}
                          tickLine={false}
                          tickMargin={8}
                          axisLine={{ stroke: "var(--border-line)" }}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          content={({ active, payload }) => {
                            const name = payload?.[0]?.name as string | undefined;
                            if (name === "Energy")
                              return (
                                <ScatterTip
                                  active={active}
                                  payload={payload as { payload: DayPoint }[]}
                                  metric="Energy"
                                  formatVal={formatEnergy}
                                />
                              );
                            if (name === "Anxiety")
                              return (
                                <ScatterTip
                                  active={active}
                                  payload={payload as { payload: DayPoint }[]}
                                  metric="Anxiety"
                                  formatVal={formatAnxiety}
                                />
                              );
                            if (name === "Contentment")
                              return (
                                <ScatterTip
                                  active={active}
                                  payload={payload as { payload: DayPoint }[]}
                                  metric="Contentment"
                                  formatVal={formatContentment}
                                />
                              );
                            if (name === "Focus")
                              return (
                                <ScatterTip
                                  active={active}
                                  payload={payload as { payload: DayPoint }[]}
                                  metric="Focus"
                                  formatVal={formatFocus}
                                />
                              );
                            return null;
                          }}
                        />
                        {metricVisible.energy && series.energy.length > 0 ? (
                          <Scatter
                            name="Energy"
                            data={series.energy}
                            fill="var(--chart-energy)"
                            shape="circle"
                            legendType="none"
                            isAnimationActive={false}
                          />
                        ) : null}
                        {metricVisible.anxiety && series.anxiety.length > 0 ? (
                          <Scatter
                            name="Anxiety"
                            data={series.anxiety}
                            fill="var(--chart-anxiety)"
                            shape="circle"
                            legendType="none"
                            isAnimationActive={false}
                          />
                        ) : null}
                        {metricVisible.contentment && series.contentment.length > 0 ? (
                          <Scatter
                            name="Contentment"
                            data={series.contentment}
                            fill="var(--chart-contentment)"
                            shape="circle"
                            legendType="none"
                            isAnimationActive={false}
                          />
                        ) : null}
                        {metricVisible.focus && series.focus.length > 0 ? (
                          <Scatter
                            name="Focus"
                            data={series.focus}
                            fill="var(--chart-focus)"
                            shape="circle"
                            legendType="none"
                            isAnimationActive={false}
                          />
                        ) : null}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="muted small today-snapshot-chart-empty today-snapshot-chart-empty--toggle-hint">
                    Turn on a series above.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
