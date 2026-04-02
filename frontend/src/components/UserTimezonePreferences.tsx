import { useState } from "react";
import { patchUserTimezone } from "../api";
import { effectiveUserTimeZone, getBrowserIanaTimeZone } from "../datesTz";
import { PRESET_TIMEZONES } from "../timezoneOptions";
import type { User } from "../types";
import InlineHelp from "./InlineHelp";

const DEVICE_VALUE = "__device__";

type Props = {
  user: User;
  onUpdated: (u: User) => void;
};

export default function UserTimezonePreferences({ user, onUpdated }: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deviceTz = getBrowserIanaTimeZone();
  const effective = effectiveUserTimeZone(user);
  const saved = user.timezone != null && user.timezone.trim() !== "" ? user.timezone.trim() : null;

  const presetSet = new Set(PRESET_TIMEZONES.map((p) => p.value));
  const showSavedCustom = saved != null && !presetSet.has(saved);

  const selectValue = saved ?? DEVICE_VALUE;

  const onChange = (raw: string) => {
    setErr(null);
    const tz: string | null = raw === DEVICE_VALUE ? null : raw;
    setBusy(true);
    void patchUserTimezone(user.id, tz)
      .then((u) => onUpdated(u))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Could not save time zone"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="preferences-tz" aria-labelledby="prefs-tz-heading">
      <div className="profile-heading-with-help">
        <h2 id="prefs-tz-heading" className="preferences-tz-title">
          Time zone
        </h2>
        <InlineHelp label="Time zone">
          <p>Calendar days and voice or text capture share one IANA time zone.</p>
          <p>
            Default follows <strong>this device</strong> ({deviceTz}). Pick a fixed region only if you want calendar days to stay aligned to that place when you travel.
          </p>
        </InlineHelp>
      </div>
      <p className="preferences-tz-effective small">
        <span className="muted">Effective:</span> <code className="preferences-tz-code">{effective}</code>
        <span className="muted">{saved == null ? " · device" : " · saved"}</span>
      </p>
      <div className="preferences-tz-control">
        <label className="preferences-tz-label" htmlFor={`prefs-tz-select-${user.id}`}>
          Preference
        </label>
        <select
          id={`prefs-tz-select-${user.id}`}
          className="user-tz-select preferences-tz-select"
          value={selectValue}
          disabled={busy}
          aria-busy={busy}
          aria-describedby={err ? `prefs-tz-err-${user.id}` : "prefs-tz-hint"}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value={DEVICE_VALUE}>Use this device’s time zone ({deviceTz})</option>
          {PRESET_TIMEZONES.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
          {showSavedCustom && <option value={saved}>{saved}</option>}
        </select>
        <p id="prefs-tz-hint" className="sr-only">
          Optional. Sets which IANA zone defines calendar days for this profile.
        </p>
      </div>
      {err && (
        <p id={`prefs-tz-err-${user.id}`} className="user-tz-err" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
