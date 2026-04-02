import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { fetchUsers } from "./api";
import ThemeToggle from "./components/ThemeToggle";
import AdminTrackerPage from "./pages/AdminTrackerPage";
import ChooseProfilePage from "./pages/ChooseProfilePage";
import InsightsPage from "./pages/InsightsPage";
import LaunchPage from "./pages/LaunchPage";
import LogsPage from "./pages/LogsPage";
import PreferencesPage from "./pages/PreferencesPage";
import TodayPage from "./pages/TodayPage";
import { effectiveUserTimeZone } from "./datesTz";
import type { User } from "./types";
import { clearSelectedUserId, getSelectedUserId, setSelectedUserId } from "./userSession";

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersReady, setUsersReady] = useState(false);

  const applyUser = useCallback((id: number) => {
    setSelectedUserId(String(id));
    setUserId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUsersError(null);
    void fetchUsers()
      .then((list) => {
        if (cancelled) return;
        setUsers(list);
        const stored = getSelectedUserId();
        const sid = stored ? Number.parseInt(stored, 10) : NaN;
        const match = list.find((u) => u.id === sid);
        if (match) {
          setSelectedUserId(String(match.id));
          setUserId(match.id);
        } else {
          if (stored) {
            clearSelectedUserId();
          }
          setUserId(null);
        }
        setUsersReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setUsersError(e instanceof Error ? e.message : "Could not load users");
        setUsersReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyUser]);

  const mergeUser = useCallback((u: User) => {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
  }, []);

  const selectedUser = users.find((u) => u.id === userId) ?? null;
  const userTimeZone = effectiveUserTimeZone(selectedUser);

  /** Positive id that exists in the current users list — avoids mounting scoped pages before session is coherent. */
  const userScopeReady =
    usersReady &&
    users.length > 0 &&
    userId != null &&
    Number.isInteger(userId) &&
    userId > 0 &&
    users.some((u) => u.id === userId);

  const needsProfileChoice = usersReady && users.length > 0 && userId == null;

  const onProfileChosen = (id: number, mode: "first" | "switch") => {
    applyUser(id);
    navigate(mode === "first" ? "/" : "/today", { replace: mode === "first" });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link
            className="brand"
            to={userScopeReady ? "/today" : "/"}
            aria-label={userScopeReady ? "EmotionGraph — open Today" : "EmotionGraph — home"}
          >
            <img className="brand-mark" src="/logo-mark.svg" alt="" width="28" height="28" />
            <span className="logo">EmotionGraph</span>
          </Link>
          <div className="app-header-right">
            <div className="app-header-chrome">
              <ThemeToggle />
            </div>
            {usersReady && userScopeReady && (
              <nav className="app-header-nav" aria-label="Main">
                <div className="app-header-nav-primary">
                  {pathname !== "/today" && pathname !== "/" && (
                    <Link className="header-link" to="/today">
                      Today
                    </Link>
                  )}
                  {pathname !== "/entries" && (
                    <Link className="header-link" to="/entries">
                      Entries
                    </Link>
                  )}
                  {pathname !== "/insights" && (
                    <Link className="header-link" to="/insights">
                      Insights
                    </Link>
                  )}
                </div>
                {pathname !== "/switch-profile" && (
                  <>
                    <span className="app-header-nav-rule" aria-hidden="true" />
                    <Link className="app-header-secondary-link" to="/switch-profile">
                      Switch profile
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>
        </div>
      </header>
      {usersError && (
        <div className="app-banner error-inline" role="alert">
          {usersError}
        </div>
      )}
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              needsProfileChoice ? (
                <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
              ) : userScopeReady ? (
                <LaunchPage users={users} userId={userId as number} />
              ) : (
                <UsersGate usersReady={usersReady} users={users} />
              )
            }
          />
          <Route
            path="/switch-profile"
            element={
              needsProfileChoice ? (
                <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
              ) : usersReady && users.length > 0 ? (
                <ChooseProfilePage
                  users={users}
                  switching
                  onChoose={(id) => onProfileChosen(id, "switch")}
                />
              ) : (
                <UsersGate usersReady={usersReady} users={users} />
              )
            }
          />
          <Route
            path="/today"
            element={
              needsProfileChoice ? (
                <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
              ) : userScopeReady ? (
                <TodayPage key={userId} userId={userId} timeZone={userTimeZone} />
              ) : (
                <UsersGate usersReady={usersReady} users={users} />
              )
            }
          />
          <Route
            path="/entries"
            element={
              needsProfileChoice ? (
                <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
              ) : userScopeReady ? (
                <LogsPage key={userId} userId={userId} timeZone={userTimeZone} />
              ) : (
                <UsersGate usersReady={usersReady} users={users} />
              )
            }
          />
          <Route
            path="/insights"
            element={
              needsProfileChoice ? (
                <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
              ) : userScopeReady ? (
                <InsightsPage key={userId} userId={userId} timeZone={userTimeZone} />
              ) : (
                <UsersGate usersReady={usersReady} users={users} />
              )
            }
          />
          <Route path="/admin" element={<AdminTrackerPage />} />
          <Route
            path="/preferences"
            element={
              needsProfileChoice ? (
                <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
              ) : userScopeReady && selectedUser ? (
                <PreferencesPage user={selectedUser} onUserUpdated={mergeUser} />
              ) : (
                <UsersGate usersReady={usersReady} users={users} />
              )
            }
          />
        </Routes>
      </main>
      {pathname !== "/today" && (
        <footer className="app-footer">
          <nav className="app-footer-nav" aria-label="Secondary">
            <Link className="app-footer-link muted small" to="/">
              Start
            </Link>
            <span className="app-footer-sep muted small" aria-hidden="true">
              ·
            </span>
            {userScopeReady && (
              <>
                <span className="app-footer-sep muted small" aria-hidden="true">
                  ·
                </span>
                <Link className="app-footer-link muted small" to="/preferences">
                  Preferences
                </Link>
              </>
            )}
            <span className="app-footer-sep muted small" aria-hidden="true">
              ·
            </span>
            <Link className="app-footer-link muted small" to="/admin">
              Config
            </Link>
          </nav>
        </footer>
      )}
    </div>
  );
}

function UsersGate({ usersReady, users }: { usersReady: boolean; users: User[] }) {
  if (!usersReady) {
    return <p className="muted gate-message">Loading…</p>;
  }
  if (users.length === 0) {
    return <p className="muted gate-message">No users found. Seed the database (Azin &amp; Zahra) and refresh.</p>;
  }
  /* Users exist but scoped id not resolved yet (e.g. refresh while /insights loads). */
  return <p className="muted gate-message">Loading…</p>;
}
