import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { fetchUsers } from "./api";
import ThemeToggle from "./components/ThemeToggle";
import UserSwitcher from "./components/UserSwitcher";
import AdminTrackerPage from "./pages/AdminTrackerPage";
import InsightsPage from "./pages/InsightsPage";
import LaunchPage from "./pages/LaunchPage";
import LogsPage from "./pages/LogsPage";
import TodayPage from "./pages/TodayPage";
import type { User } from "./types";
import { getSelectedUserId, setSelectedUserId } from "./userSession";

export default function App() {
  const { pathname } = useLocation();
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
        } else if (list.length > 0) {
          applyUser(list[0].id);
        } else {
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

  const onSelectUser = (id: number) => {
    applyUser(id);
  };

  /** Positive id that exists in the current users list — avoids mounting scoped pages before session is coherent. */
  const userScopeReady =
    usersReady &&
    users.length > 0 &&
    userId != null &&
    Number.isInteger(userId) &&
    userId > 0 &&
    users.some((u) => u.id === userId);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="brand" to="/today" aria-label="EmotionGraph — log">
            <img className="brand-mark" src="/logo-mark.svg" alt="" width="28" height="28" />
            <span className="logo">EmotionGraph</span>
          </Link>
          <div className="app-header-right">
            <ThemeToggle />
            {usersReady && users.length > 0 && (
              <UserSwitcher users={users} userId={userId} onSelectUser={onSelectUser} />
            )}
            <nav className="app-header-nav" aria-label="App">
              {usersReady && userScopeReady && pathname !== "/today" && pathname !== "/" && (
                <Link className="header-link" to="/today">
                  Today
                </Link>
              )}
              {usersReady && userScopeReady && pathname !== "/entries" && (
                <Link className="header-link" to="/entries">
                  Entries
                </Link>
              )}
              {usersReady && userScopeReady && (
                <Link className="header-link" to="/insights">
                  Insights
                </Link>
              )}
            </nav>
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
              userScopeReady ? (
                <LaunchPage users={users} userId={userId} />
              ) : (
                <UsersGate usersReady={usersReady} users={users} />
              )
            }
          />
          <Route
            path="/today"
            element={
              userScopeReady ? <TodayPage key={userId} userId={userId} /> : <UsersGate usersReady={usersReady} users={users} />
            }
          />
          <Route
            path="/entries"
            element={
              userScopeReady ? <LogsPage key={userId} userId={userId} /> : <UsersGate usersReady={usersReady} users={users} />
            }
          />
          <Route
            path="/insights"
            element={
              userScopeReady ? <InsightsPage key={userId} userId={userId} /> : <UsersGate usersReady={usersReady} users={users} />
            }
          />
          <Route path="/admin" element={<AdminTrackerPage />} />
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
