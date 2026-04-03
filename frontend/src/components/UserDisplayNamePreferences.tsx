import { useEffect, useState } from "react";
import { patchUserDisplayName } from "../api";
import type { User } from "../types";
import InlineHelp from "./InlineHelp";

type Props = {
  user: User;
  onUpdated: (u: User) => void;
  /** Tighter layout for Profile account card (no help popover). */
  compact?: boolean;
};

export default function UserDisplayNamePreferences({ user, onUpdated, compact = false }: Props) {
  const [draft, setDraft] = useState(() => user.display_name ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(user.display_name ?? "");
  }, [user.id, user.display_name]);

  const save = () => {
    setErr(null);
    const trimmed = draft.trim();
    const value = trimmed === "" ? null : trimmed;
    setBusy(true);
    void patchUserDisplayName(user.id, value)
      .then((u) => onUpdated(u))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Could not save"))
      .finally(() => setBusy(false));
  };

  if (compact) {
    return (
      <div
        className="profile-settings-field profile-display-name profile-display-name--account"
        role="group"
        aria-label="Display name"
      >
        <div className="profile-display-name-compact-row">
          <label className="profile-display-name-label-inline" htmlFor={`profile-display-name-${user.id}`}>
            Display name
          </label>
          <div className="profile-display-name-controls">
            <input
              id={`profile-display-name-${user.id}`}
              type="text"
              className="profile-display-name-input"
              maxLength={128}
              autoComplete="nickname"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={user.name}
            />
            <button
              type="button"
              className="btn secondary small profile-display-name-save"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <p id={`profile-display-name-hint-${user.id}`} className="profile-display-name-hint muted small">
          Uses your account name if left blank.
        </p>
        {err ? (
          <p id={`profile-display-name-err-${user.id}`} className="error-inline" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="profile-settings-field profile-display-name" aria-labelledby="profile-display-name-heading">
      <div className="profile-heading-with-help">
        <h3 id="profile-display-name-heading" className="profile-display-name-title">
          Display name
        </h3>
        <InlineHelp label="Display name">
          <p>How you’re greeted in the app. Does not change your account name.</p>
        </InlineHelp>
      </div>
      <p className="profile-display-name-hint muted small">Blank uses account name.</p>
      <div className="profile-display-name-row">
        <label className="sr-only" htmlFor={`profile-display-name-${user.id}`}>
          Display name
        </label>
        <input
          id={`profile-display-name-${user.id}`}
          type="text"
          className="profile-display-name-input"
          maxLength={128}
          autoComplete="nickname"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={user.name}
        />
        <button type="button" className="btn secondary small profile-display-name-save" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {err ? (
        <p id={`profile-display-name-err-${user.id}`} className="error-inline" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
