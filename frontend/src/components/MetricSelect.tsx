import { useId } from "react";
import CalmSelect from "./CalmSelect";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Tighter trigger for day-context and similar panels */
  density?: "default" | "dense";
};

export default function MetricSelect({ label, value, onChange, options, density = "default" }: Props) {
  const labelId = useId();
  return (
    <label className="field field--stacked">
      <span id={labelId}>{label}</span>
      <CalmSelect
        variant={density === "dense" ? "dense" : "field"}
        value={value}
        onChange={onChange}
        options={options}
        aria-labelledby={labelId}
      />
    </label>
  );
}
