import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
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

function collectNums(entries: SavedLogEntry[], key: keyof SavedLogEntry): number[] {
  return entries.map((e) => e[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export default function TodaySnapshot({ userId, logDate, entries, entriesLoading }: Props) {
  const [trackerDay, setTrackerDay] = useState<TrackerDay | null>(null);

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

  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    const ae = average(collectNums(entries, "energy_level"));
    const aa = average(collectNums(entries, "anxiety"));
    const ac = average(collectNums(entries, "contentment"));
    const af = average(collectNums(entries, "focus"));
    if (ae != null) parts.push(`Energy ~${formatEnergy(Math.round(ae))}`);
    if (aa != null) parts.push(`Anxiety ~${formatAnxiety(Math.round(aa))}`);
    if (ac != null) parts.push(`Contentment ~${formatContentment(Math.round(ac))}`);
    if (af != null) parts.push(`Focus ~${formatFocus(Math.round(af))}`);
    return parts;
  }, [entries]);

  const dayContextLine = useMemo(() => {
    if (!trackerDay) return null;
    const bits: string[] = [];
    if (trackerDay.cycle_day != null) bits.push(`Cycle day ${trackerDay.cycle_day}`);
    if (trackerDay.sleep_hours != null) bits.push(`${formatAvg(trackerDay.sleep_hours)}h sleep`);
    if (trackerDay.sleep_quality != null) bits.push(formatSleepQuality(trackerDay.sleep_quality));
    if (bits.length === 0) return null;
    return bits.join(" · ");
  }, [trackerDay]);

  const snapshotSummaryPreview = useMemo(() => {
    if (entries.length === 0) return "No check-ins yet";
    const n = `${entries.length} check-in${entries.length === 1 ? "" : "s"}`;
    if (summaryParts.length > 0) return `${n} · ${summaryParts.join(" · ")}`;
    return n;
  }, [entries.length, summaryParts]);

  if (entriesLoading) {
    return (
      <section className="today-snapshot" aria-label="Today snapshot">
        <p className="muted small today-snapshot-loading">Loading snapshot…</p>
      </section>
    );
  }

  return (
    <section className="today-snapshot" aria-label="Today snapshot">
      <details className="today-snapshot-details">
        <summary className="today-snapshot-summary">
          <span className="today-snapshot-summary-label">Snapshot</span>
          <span className="today-snapshot-summary-meta muted small">{snapshotSummaryPreview}</span>
        </summary>
        <div className="today-snapshot-details-body">
          {dayContextLine ? (
            <p className="today-snapshot-dayctx muted small">
              <span className="today-snapshot-dayctx-label">Day</span> {dayContextLine}
            </p>
          ) : null}

          <div className="today-snapshot-chart-panel">
            <p className="today-snapshot-chart-heading">Check-ins by time</p>
            {entries.length === 0 ? (
              <p className="muted small today-snapshot-chart-empty">Nothing logged yet.</p>
            ) : !hasScatter ? (
              <p className="muted small today-snapshot-chart-empty">
                Add energy, anxiety, contentment, or focus on entries to plot by time of day.
              </p>
            ) : (
              <div className="today-snapshot-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 6, right: 6, left: -14, bottom: 2 }}>
                    <CartesianGrid stroke="var(--border-line)" vertical={false} />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[0, 24]}
                      ticks={[0, 6, 12, 18, 24]}
                      tickFormatter={(v) => (v === 24 ? "24h" : `${v}h`)}
                      tick={{ fontSize: 9, fill: "var(--muted)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      domain={[0, 5.5]}
                      ticks={[0, 1, 2, 3, 4, 5]}
                      width={24}
                      tick={{ fontSize: 9, fill: "var(--muted)" }}
                      tickLine={false}
                      axisLine={false}
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
                    <Legend
                      wrapperStyle={{ fontSize: "10px", paddingTop: 2 }}
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
                      />
                    ) : null}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
