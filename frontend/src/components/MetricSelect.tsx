type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
};

export default function MetricSelect({ label, value, onChange, options }: Props) {
  return (
    <label className="field field--stacked">
      <span>{label}</span>
      <select className="field-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value || "__empty"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
