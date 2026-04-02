import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadLogsCsvExport, fetchInsights } from "../api";
import type { InsightsPayload } from "../types";
import {
  formatAnxiety,
  formatContentment,
  formatEnergy,
  formatFocus,
  formatSleepQuality,
} from "../trackerOptions";

type Props = { userId: number };

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatAvg(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const CHART_COLORS = {
  energy: "#5a7a68",
  contentment: "#5a6f8a",
  anxiety: "#9a7568",
  focus: "#7a6b8f",
  sleepQ: "#4a6f7d",
  cycle: "#8a7a5a",
} as const;

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

export default function InsightsPage({ userId }: Props) {
  const [endDate, setEndDate] = useState(isoToday);
  const [startDate, setStartDate] = useState(() => isoDaysAgo(29));
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    setEndDate(isoToday());
    setStartDate(isoDaysAgo(days - 1));
  };

  const handleExportCsv = () => {
    setExportError(null);
    if (startDate > endDate) {
      setExportError("End date must be on or after start date.");
      return;
    }
    setExportBusy(true);
    void downloadLogsCsvExport(userId, startDate, endDate)
      .catch((e) => {
        setExportError(e instanceof Error ? e.message : "Export failed");
      })
      .finally(() => setExportBusy(false));
  };

  const s = data?.summary;

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
          <Link to="/today" className="insights-back muted small">
            ← Today
          </Link>
        </div>
        <h1 className="insights-title">Insights</h1>
        <p className="insights-lead muted small">A calm read on your logged patterns in this range.</p>
      </header>

      <section className="insights-card insights-range-card" aria-label="Date range">
        <div className="insights-presets">
          {[
            { label: "7d", days: 7 },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              className="insights-preset"
              onClick={() => applyPreset(days)}
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

      <section className="insights-card insights-export-card" aria-label="Export data">
        <h2 className="insights-export-title">Export</h2>
        <p className="insights-export-lead muted small">
          Download log rows for <strong>you</strong> only, using the date range above. Day fields (cycle, sleep) repeat on each row for that date.
        </p>
        <button
          type="button"
          className="btn primary insights-export-btn"
          disabled={exportBusy || startDate > endDate}
          onClick={() => void handleExportCsv()}
        >
          {exportBusy ? "Preparing…" : "Download CSV"}
        </button>
        {exportError && (
          <p className="error-inline insights-export-error" role="alert">
            {exportError}
          </p>
        )}
      </section>

      {error && <p className="error-inline insights-error">{error}</p>}

      {loading && !data && <p className="muted insights-loading">Gathering your data…</p>}

      {data && (
        <>
          <section className="insights-section" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="insights-section-title">
              Averages
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
                      <Line type="monotone" dataKey="avg_energy" name="Energy" stroke={CHART_COLORS.energy} strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="avg_contentment" name="Contentment" stroke={CHART_COLORS.contentment} strokeWidth={2} dot={false} connectNulls />
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
                      <Line type="monotone" dataKey="avg_anxiety" name="Anxiety" stroke={CHART_COLORS.anxiety} strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="avg_focus" name="Focus" stroke={CHART_COLORS.focus} strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {data.tracker_summary.has_data && (
            <section className="insights-section" aria-labelledby="day-heading">
              <h2 id="day-heading" className="insights-section-title">
                Day notes
              </h2>
              <p className="insights-section-lead muted small">From your cycle &amp; sleep fields.</p>
              <div className="insights-summary-grid insights-summary-grid--3">
                <div className="insights-metric-card">
                  <p className="insights-metric-label">Sleep quality</p>
                  <p className="insights-metric-value">{formatAvg(data.tracker_summary.avg_sleep_quality)}</p>
                  <p className="insights-metric-hint muted small">1–5 avg</p>
                </div>
                <div className="insights-metric-card">
                  <p className="insights-metric-label">Cycle day</p>
                  <p className="insights-metric-value">{formatAvg(data.tracker_summary.avg_cycle_day)}</p>
                  <p className="insights-metric-hint muted small">Across logged days</p>
                </div>
                <div className="insights-metric-card">
                  <p className="insights-metric-label">Sleep hours</p>
                  <p className="insights-metric-value">{formatAvg(data.tracker_summary.avg_sleep_hours)}</p>
                  <p className="insights-metric-hint muted small">{data.tracker_summary.days_with_tracker} days</p>
                </div>
              </div>
              {data.tracker_daily.length > 0 && (
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
                        <Line type="monotone" dataKey="sleep_quality" name="Sleep" stroke={CHART_COLORS.sleepQ} strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {data.tracker_daily.some((t) => t.cycle_day != null) && (
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
                        <Line type="monotone" dataKey="cycle_day" name="Cycle" stroke={CHART_COLORS.cycle} strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="insights-section" aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="insights-section-title">
              Recent history
            </h2>
            <ul className="insights-recent-list">
              {data.recent_entries.length === 0 && <li className="muted">No entries in this range.</li>}
              {data.recent_entries.map((e) => (
                <li key={e.id} className="insights-recent-item">
                  <div className="insights-recent-top">
                    <span className="insights-recent-time">{formatTimeShort(e.created_at)}</span>
                    <span className="insights-recent-date muted small">{e.log_date}</span>
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
          </section>

          <section className="insights-section" aria-labelledby="events-heading">
            <h2 id="events-heading" className="insights-section-title">
              By event
            </h2>
            <p className="insights-section-lead muted small">Averages for repeated descriptions in this range.</p>
            <ul className="insights-events-list">
              {data.event_patterns.length === 0 && <li className="muted">No patterns yet — add a few entries with similar wording.</li>}
              {data.event_patterns.map((row) => (
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
          </section>
        </>
      )}
    </div>
  );
}
