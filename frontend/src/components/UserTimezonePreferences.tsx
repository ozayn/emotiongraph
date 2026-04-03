import { useEffect, useId, useMemo, useRef, useState } from "react";
import { patchUserTimezone } from "../api";
import { effectiveUserTimeZone, getBrowserIanaTimeZone } from "../datesTz";
import { PRESET_TIMEZONES } from "../timezoneOptions";
import type { User } from "../types";
import CalmSelect, { type CalmSelectOption } from "./CalmSelect";
import InlineHelp from "./InlineHelp";

const DEVICE_VALUE = "__device__";

type Props = {
  user: User;
  onUpdated: (u: User) => void;
};

export default function UserTimezonePreferences({ user, onUpdated }: Props) {
  const panelId = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deviceTz = getBrowserIanaTimeZone();
  const effective = effectiveUserTimeZone(user);
  const saved = user.timezone != null && user.timezone.trim() !== "" ? user.timezone.trim() : null;

  const presetSet = new Set(PRESET_TIMEZONES.map((p) => p.value));
  const showSavedCustom = saved != null && !presetSet.has(saved);

  const selectValue = saved ?? DEVICE_VALUE;

  const calmOptions: CalmSelectOption[] = useMemo(() => {
    const list: CalmSelectOption[] = [
      { value: DEVICE_VALUE, label: "This device", hint: deviceTz },
      ...PRESET_TIMEZONES.map((z) => ({ value: z.value, label: z.label, hint: z.value })),
    ];
    if (showSavedCustom && saved) {
      const tail = saved.includes("/") ? saved.split("/").pop() ?? saved : saved;
      list.push({
        value: saved,
        label: tail === saved ? saved : tail,
        hint: tail === saved ? undefined : saved,
      });
    }
    return list;
  }, [deviceTz, saved, showSavedCustom]);

  useEffect(() => {
    if (err && detailsRef.current) detailsRef.current.open = true;
  }, [err]);

  useEffect(() => {
    if (busy && detailsRef.current) detailsRef.current.open = true;
  }, [busy]);

  const onChange = (raw: string) => {
    setErr(null);
    const tz: string | null = raw === DEVICE_VALUE ? null : raw;
    setBusy(true);
    void patchUserTimezone(user.id, tz)
      .then((u) => onUpdated(u))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Could not save time zone"))
      .finally(() => setBusy(false));
  };

  const labelId = `prefs-tz-label-${user.id}`;

  return (
    <details
      ref={detailsRef}
      id="profile-preferences-tz"
      className="preferences-tz preferences-tz--expandable preferences-tz--profile-block"
    >
      <summary className="preferences-tz-summary">
        <div className="preferences-tz-summary-main">
          <span className="preferences-tz-summary-eyebrow">Time zone</span>
          <span className="preferences-tz-summary-value">
            <code className="preferences-tz-code preferences-tz-code--summary" title={effective}>
              {effective}
            </code>
            <span className="preferences-tz-pill">{saved == null ? "Device" : "Saved"}</span>
          </span>
        </div>
        <span className="preferences-tz-chevron" aria-hidden="true" />
        <span className="sr-only">
          {`Effective zone ${effective}. ${saved == null ? "Following this device." : "Using a saved zone."} Expand to change.`}
        </span>
      </summary>
      <div id={panelId} className="preferences-tz-panel">
        <div className="preferences-tz-panel-lead">
          <InlineHelp label="Time zone">
            <p>
              Defines calendar days for this profile. Default is this device ({deviceTz}); choose a fixed region if you want
              dates to stay put when you travel.
            </p>
          </InlineHelp>
        </div>
        <div className="preferences-tz-control">
          <label className="preferences-tz-label" id={labelId} htmlFor={`prefs-tz-select-${user.id}`}>
            Zone
          </label>
          <CalmSelect
            id={`prefs-tz-select-${user.id}`}
            variant="timezone"
            value={selectValue}
            onChange={onChange}
            options={calmOptions}
            dividerAfterIndices={[0]}
            disabled={busy}
            aria-labelledby={labelId}
            aria-busy={busy}
            aria-describedby={err ? `prefs-tz-err-${user.id}` : "prefs-tz-hint"}
          />
          <p id="prefs-tz-hint" className="sr-only">
            Optional. Sets which IANA zone defines calendar days for this profile.
          </p>
        </div>
        {err && (
          <p id={`prefs-tz-err-${user.id}`} className="user-tz-err preferences-tz-err" role="alert">
            {err}
          </p>
        )}
      </div>
    </details>
  );
}
