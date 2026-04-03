import MetricSelect from "./MetricSelect";
import { ANGER_OPTIONS } from "../trackerOptions";

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

/** Collapsed by default; secondary metric — extraction may pre-fill when clearly expressed; always editable. */
export default function OptionalAngerMetric({ value, onChange, disabled }: Props) {
  return (
    <details className="optional-emotion-disclosure" open={disabled ? true : undefined}>
      <summary className="optional-emotion-disclosure-summary muted small">Optional: anger level</summary>
      <p className="muted small optional-emotion-disclosure-hint">
        Secondary field (not shown in main summaries or default export). Voice/text extraction may suggest a
        value when anger is clearly stated — you can change it here. Uses 0–3 (not at all → very much), same
        labels as anxiety, and is separate from anxiety.
      </p>
      <MetricSelect label="Anger level" value={value} onChange={onChange} options={ANGER_OPTIONS} disabled={disabled} />
    </details>
  );
}
