import DetailSheet from "./DetailSheet";

export type MetricDetailModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Main stat, e.g. "Average · 2.1" */
  valueLine: string;
  /** Short scale reminder */
  scaleLine: string;
  /** What the metric means */
  blurb: string;
  /** Date / range + counts */
  contextLine: string;
  /** Newest check-ins that included this metric */
  samples?: { timeLabel: string; value: string }[];
};

export default function MetricDetailModal({
  open,
  onClose,
  title,
  valueLine,
  scaleLine,
  blurb,
  contextLine,
  samples,
}: MetricDetailModalProps) {
  return (
    <DetailSheet open={open} onClose={onClose} title={title}>
      <p className="metric-detail-modal-value">{valueLine}</p>
      <p className="metric-detail-modal-scale muted small">{scaleLine}</p>
      <p className="metric-detail-modal-context muted small">{contextLine}</p>
      <p className="metric-detail-modal-blurb">{blurb}</p>
      {samples && samples.length > 0 ? (
        <div className="metric-detail-modal-samples">
          <p className="metric-detail-modal-samples-label muted small">Recent check-ins</p>
          <ul className="metric-detail-modal-samples-list">
            {samples.map((s, i) => (
              <li key={`${s.timeLabel}-${i}`} className="metric-detail-modal-sample">
                <span className="metric-detail-modal-sample-time mono">{s.timeLabel}</span>
                <span className="metric-detail-modal-sample-val">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </DetailSheet>
  );
}
