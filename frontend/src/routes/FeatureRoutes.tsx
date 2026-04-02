import type { ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import UsersGate from "../components/UsersGate";
import { useSession } from "../session/SessionContext";
import AddEntryPage from "../pages/AddEntryPage";
import AdminTrackerPage from "../pages/AdminTrackerPage";
import ChooseProfilePage from "../pages/ChooseProfilePage";
import HomePage from "../pages/HomePage";
import InsightsPage from "../pages/InsightsPage";
import LogsPage from "../pages/LogsPage";
import PreferencesPage from "../pages/PreferencesPage";
import ProfilePage from "../pages/ProfilePage";

/**
 * Shared IA for private (`/…`) and demo (`/demo/…`) realms. Admin and legacy preferences stay private-only.
 */
export default function FeatureRoutes() {
  const navigate = useNavigate();
  const {
    realm,
    homePath,
    users,
    userId,
    usersReady,
    userScopeReady,
    needsProfileChoice,
    selectedUser,
    userTimeZone,
    applyUser,
    mergeUser,
    authMode,
  } = useSession();

  const isDemo = realm === "demo";
  const demoSingleSandbox = isDemo && users.length === 1;

  const onProfileChosen = (id: number, mode: "first" | "switch") => {
    applyUser(id);
    navigate(homePath, { replace: mode === "first" });
  };

  const chooseFirst = (
    <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
  );

  const gate = (fn: (uid: number) => ReactNode): ReactNode => {
    if (needsProfileChoice) return chooseFirst;
    if (userScopeReady && userId != null) return fn(userId);
    return <UsersGate usersReady={usersReady} users={users} />;
  };

  const homeEl =
    needsProfileChoice ? chooseFirst : userScopeReady && userId != null ? (
      <HomePage key={userId} userId={userId} timeZone={userTimeZone} users={users} />
    ) : (
      <UsersGate usersReady={usersReady} users={users} />
    );

  const switchProfileEl =
    authMode === "google_oauth" || demoSingleSandbox ? (
      <Navigate to={homePath} replace />
    ) : needsProfileChoice ? (
      chooseFirst
    ) : usersReady && users.length > 0 ? (
      <ChooseProfilePage users={users} switching onChoose={(id) => onProfileChosen(id, "switch")} />
    ) : (
      <UsersGate usersReady={usersReady} users={users} />
    );

  const profileEl =
    needsProfileChoice ? chooseFirst : userScopeReady && selectedUser && userId != null ? (
      <ProfilePage key={userId} user={selectedUser} userId={userId} timeZone={userTimeZone} onUserUpdated={mergeUser} />
    ) : (
      <UsersGate usersReady={usersReady} users={users} />
    );

  if (isDemo) {
    return (
      <Routes>
        <Route index element={homeEl} />
        <Route path="switch-profile" element={switchProfileEl} />
        <Route
          path="today"
          element={gate((uid) => (
            <LogsPage key={uid} userId={uid} timeZone={userTimeZone} variant="today" />
          ))}
        />
        <Route path="add-entry" element={gate((uid) => <AddEntryPage key={uid} userId={uid} timeZone={userTimeZone} />)} />
        <Route path="entries" element={gate((uid) => <LogsPage key={uid} userId={uid} timeZone={userTimeZone} />)} />
        <Route path="insights" element={gate((uid) => <InsightsPage key={uid} userId={uid} timeZone={userTimeZone} />)} />
        <Route path="profile" element={profileEl} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={homeEl} />
      <Route path="/switch-profile" element={switchProfileEl} />
      <Route
        path="/today"
        element={gate((uid) => (
          <LogsPage key={uid} userId={uid} timeZone={userTimeZone} variant="today" />
        ))}
      />
      <Route path="/add-entry" element={gate((uid) => <AddEntryPage key={uid} userId={uid} timeZone={userTimeZone} />)} />
      <Route path="/entries" element={gate((uid) => <LogsPage key={uid} userId={uid} timeZone={userTimeZone} />)} />
      <Route path="/insights" element={gate((uid) => <InsightsPage key={uid} userId={uid} timeZone={userTimeZone} />)} />
      <Route path="/admin" element={<AdminTrackerPage />} />
      <Route path="/preferences" element={<PreferencesPage />} />
      <Route path="/profile" element={profileEl} />
    </Routes>
  );
}
