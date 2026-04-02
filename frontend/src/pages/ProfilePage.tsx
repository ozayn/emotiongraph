import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { downloadLogsCsvExport } from "../api";
import AddPastEntryFlow from "../components/AddPastEntryFlow";
import ProfileCsvImport from "../components/ProfileCsvImport";
import UserTimezonePreferences from "../components/UserTimezonePreferences";
import { addCalendarDaysToIso, todayIsoInTimeZone } from "../datesTz";
import type { User } from "../types";

type Props = {
  user: User;
  userId: number;
  timeZone: string;
  onUserUpdated: (u: User) => void;
};

export default function ProfilePage({ user, userId, timeZone, onUserUpdated }: Props) {
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
    <div className="profile-page">
      <nav className="entries-nav">
        <Link className="linkish entries-back" to="/">
          ← Home
        </Link>
      </nav>

      <header className="profile-page-header">
        <h1 className="profile-page-title">Profile</h1>
        <p className="profile-page-tagline muted small">Account, preferences, and data for this device.</p>
      </header>

      <section id="profile-identity" className="profile-section profile-section--account" aria-labelledby="profile-account-heading">
        <h2 id="profile-account-heading" className="sr-only">
          Account
        </h2>
        <div className="profile-account-card">
          <div className="profile-account-head">
            <p className="profile-account-name">{user.name}</p>
            <p className="profile-account-meta mono muted small">
              #{user.id}
              <span className="profile-account-meta-sep" aria-hidden="true">
                {" "}
                ·{" "}
              </span>
              <span>local session</span>
            </p>
          </div>

          <p className="profile-signin-future muted small">
            Google sign-in will connect this screen to your account — not available in this build.
          </p>

          <p className="profile-account-hint muted small">
            Voice and daily review live in the app bar. Text and structured rows:{" "}
            <Link className="linkish profile-account-hint-link" to="/add-entry">
              Add entry
            </Link>
          </p>

          <div className="profile-account-footer">
            <Link className="profile-account-secondary" to="/switch-profile">
              Use a different profile
            </Link>
          </div>
        </div>
      </section>

      <section id="profile-preferences" className="profile-section" aria-labelledby="profile-preferences-kicker">
        <h2 id="profile-preferences-kicker" className="profile-section-kicker">
          Preferences
        </h2>
        <div className="profile-panel panel-elevated">
          <UserTimezonePreferences user={user} onUpdated={onUserUpdated} />
        </div>
      </section>

      <section id="profile-data" className="profile-section" aria-labelledby="profile-data-kicker">
        <h2 id="profile-data-kicker" className="profile-section-kicker">
          Data
        </h2>
        <div className="profile-data-panel panel-elevated">
          <ProfileCsvImport userId={userId} />

          <div className="profile-data-divider" aria-hidden="true" />

          <div className="profile-data-group">
            <h3 className="profile-data-kicker">Export</h3>
            <p className="muted small profile-data-microcopy">Your rows only, same shape as import.</p>
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
              className="btn primary small profile-export-btn"
              disabled={exportBusy || exportStart > exportEnd}
              onClick={() => void handleExportCsv()}
            >
              {exportBusy ? "Preparing…" : "Download CSV"}
            </button>
            {exportError && (
              <p className="error-inline" role="alert">
                {exportError}
              </p>
            )}
          </div>

          <div className="profile-data-divider" aria-hidden="true" />

          <AddPastEntryFlow userId={userId} timeZone={timeZone} />
        </div>
      </section>
    </div>
  );
}
