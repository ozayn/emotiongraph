import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { downloadLogsCsvExport } from "../api";
import InlineHelp from "../components/InlineHelp";
import ProfileCsvImport from "../components/ProfileCsvImport";
import UserDisplayNamePreferences from "../components/UserDisplayNamePreferences";
import UserTimezonePreferences from "../components/UserTimezonePreferences";
import { addCalendarDaysToIso, todayIsoInTimeZone } from "../datesTz";
import { usePrivateAuthOptional } from "../auth/privateAuthContext";
import { useSession } from "../session/SessionContext";
import type { User } from "../types";
import { displayNameForUser } from "../userDisplay";

function profileMonogramLetter(user: User): string {
  const d = user.display_name?.trim();
  if (d) return d.charAt(0).toUpperCase();
  const n = user.name?.trim();
  if (n) return n.charAt(0).toUpperCase();
  return "?";
}

function profileContextLine(realm: string, authMode: string): string | null {
  if (realm === "demo") return "Demo profile — avoid sensitive data.";
  if (realm === "private" && authMode === "google_oauth") return "Same Google account as sign-in.";
  if (realm === "private") return "Stored on this device until you switch profiles.";
  return null;
}

type Props = {
  user: User;
  userId: number;
  timeZone: string;
  onUserUpdated: (u: User) => void;
};

export default function ProfilePage({ user, userId, timeZone, onUserUpdated }: Props) {
  const { pathFor, realm, authMode } = useSession();
  const privateAuth = usePrivateAuthOptional();
  const { hash } = useLocation();
  const [exportStart, setExportStart] = useState(() => addCalendarDaysToIso(todayIsoInTimeZone(timeZone), -60));
  const [exportEnd, setExportEnd] = useState(() => todayIsoInTimeZone(timeZone));
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const end = todayIsoInTimeZone(timeZone);
    setExportEnd(end);
    setExportStart(addCalendarDaysToIso(end, -60));
  }, [userId, timeZone]);

  useEffect(() => {
    if (!hash) return;
    const scrollId =
      hash === "#preferences"
        ? "profile-preferences"
        : hash === "#data"
          ? "profile-data"
          : hash === "#profile" || hash === "#identity"
            ? "profile-identity"
            : null;
    if (!scrollId) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById(scrollId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [hash]);

  const accountContext = profileContextLine(realm, authMode);

  const handleExportCsv = () => {
    setExportError(null);
    if (exportStart > exportEnd) {
      setExportError("End date must be on or after start date.");
      return;
    }
    setExportBusy(true);
    void downloadLogsCsvExport(userId, exportStart, exportEnd)
      .catch((e) => {
        setExportError(e instanceof Error ? e.message : "Export failed");
      })
      .finally(() => setExportBusy(false));
  };

  return (
    <div className="profile-page profile-page--premium">
      <nav className="entries-nav">
        <Link className="linkish entries-back" to={pathFor("/")}>
          ← Home
        </Link>
      </nav>

      <header className="profile-page-header">
        <h1 className="profile-page-title">Profile</h1>
        <p className="profile-page-subtitle muted small">Your account and data</p>
      </header>

      <section
        id="profile-identity"
        className="profile-section profile-section--settings profile-section--account-primary"
        aria-labelledby="profile-account-heading"
      >
        <h2 id="profile-account-heading" className="profile-section-heading profile-section-heading--primary">
          Account
        </h2>
        <div className="profile-settings-group profile-settings-group--primary">
          <div className="profile-account-hero">
            <div className="profile-account-hero-main">
              <span className="profile-account-monogram" aria-hidden="true">
                {profileMonogramLetter(user)}
              </span>
              <div className="profile-account-identity">
                <p className="profile-account-name">{displayNameForUser(user)}</p>
                <p className="profile-account-legal muted small">{user.name}</p>
                <p className="profile-account-meta mono muted small">
                  #{user.id}
                  <span className="profile-account-meta-sep" aria-hidden="true">
                    {" "}
                    ·{" "}
                  </span>
                  <span>{authMode === "google_oauth" ? "Google" : "Local"}</span>
                </p>
                {accountContext ? <p className="profile-account-context muted small">{accountContext}</p> : null}
              </div>
            </div>
          </div>

          <UserDisplayNamePreferences user={user} onUpdated={onUserUpdated} compact />

          <div className="profile-settings-field profile-account-actions" aria-label="Account actions">
            <div className="profile-account-actions-inner">
              <Link className="profile-account-action-primary" to={pathFor("/add-entry")}>
                Add entry
              </Link>
              <div className="profile-account-actions-secondary">
                {authMode !== "google_oauth" ? (
                  <Link className="profile-account-action-secondary" to={pathFor("/switch-profile")}>
                    Switch profile
                  </Link>
                ) : null}
                {realm === "private" && authMode === "google_oauth" && privateAuth ? (
                  <button
                    type="button"
                    className="profile-account-action-signout"
                    onClick={() => {
                      privateAuth.setAccessToken(null);
                      window.location.assign("/");
                    }}
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
              {realm === "private" && user.is_admin ? (
                <div className="profile-account-actions-admin">
                  <Link className="profile-account-config-link" to={pathFor("/admin")} title="Tracker fields and labels">
                    Config
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section id="profile-preferences" className="profile-section profile-section--settings profile-section--utility" aria-labelledby="profile-preferences-heading">
        <h2 id="profile-preferences-heading" className="profile-section-heading profile-section-heading--utility">
          Preferences
        </h2>
        <div className="profile-settings-group profile-settings-group--utility">
          <UserTimezonePreferences user={user} onUpdated={onUserUpdated} />
        </div>
      </section>

      <section id="profile-data" className="profile-section profile-section--settings profile-section--utility" aria-labelledby="profile-data-heading">
        <div className="profile-data-section-head">
          <h2 id="profile-data-heading" className="profile-section-heading profile-section-heading--utility">
            Data
          </h2>
          <InlineHelp label="Data tools">
            <p>Import and export your log rows as CSV from this section.</p>
            <p>
              For one hand-typed row for a specific day, use{" "}
              <Link className="profile-settings-link" to={pathFor("/add-entry")}>
                Add entry
              </Link>{" "}
              and set the date there.
            </p>
          </InlineHelp>
        </div>
        <div className="profile-settings-group profile-settings-group--utility profile-data-tools-group profile-settings-group--data-card">
          <ProfileCsvImport userId={userId} />

          <div className="profile-settings-field profile-data-tool profile-export-tool">
            <div className="profile-data-kicker-row">
              <h3 className="profile-data-kicker">Export</h3>
              <InlineHelp label="CSV export">
                <p>Downloads UTF-8 CSV for the date range you choose. Columns match CSV import.</p>
              </InlineHelp>
            </div>
            <div className="profile-data-tool-body">
              <div className="profile-export-row">
                <div className="profile-export-range">
                  <label className="profile-export-field">
                    <span className="profile-export-label">From</span>
                    <input type="date" className="date-input date-input--compact" value={exportStart} onChange={(e) => setExportStart(e.target.value)} />
                  </label>
                  <label className="profile-export-field">
                    <span className="profile-export-label">To</span>
                    <input type="date" className="date-input date-input--compact" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn small profile-export-download-btn"
                  disabled={exportBusy || exportStart > exportEnd}
                  onClick={() => void handleExportCsv()}
                >
                  {exportBusy ? "Preparing…" : "Download CSV"}
                </button>
              </div>
              {exportError && (
                <p className="error-inline" role="alert">
                  {exportError}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
