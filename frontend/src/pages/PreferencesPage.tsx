import { Link } from "react-router-dom";
import UserTimezonePreferences from "../components/UserTimezonePreferences";
import type { User } from "../types";

type Props = {
  user: User;
  onUserUpdated: (u: User) => void;
};

export default function PreferencesPage({ user, onUserUpdated }: Props) {
  return (
    <div className="preferences-page">
      <header className="preferences-page-header">
        <h1 className="preferences-page-title">Preferences</h1>
        <p className="muted small">
          Secondary settings for <strong>{user.name}</strong> —{" "}
          <Link className="header-link" to="/">
            back to Today
          </Link>
        </p>
      </header>
      <div className="preferences-page-card panel-elevated">
        <UserTimezonePreferences user={user} onUpdated={onUserUpdated} />
      </div>
    </div>
  );
}
