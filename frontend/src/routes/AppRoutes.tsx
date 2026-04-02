import { Route, Routes, useNavigate } from "react-router-dom";
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
 * All authenticated-area routes. Gates use the same session rules:
 * - needsProfileChoice → picker
 * - userScopeReady → feature page
 * - else → UsersGate
 */
export default function AppRoutes() {
  const navigate = useNavigate();
  const {
    users,
    userId,
    usersReady,
    userScopeReady,
    needsProfileChoice,
    selectedUser,
    userTimeZone,
    applyUser,
    mergeUser,
  } = useSession();

  const onProfileChosen = (id: number, mode: "first" | "switch") => {
    applyUser(id);
    navigate("/", { replace: mode === "first" });
  };

  const chooseFirst = (
    <ChooseProfilePage users={users} onChoose={(id) => onProfileChosen(id, "first")} />
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          needsProfileChoice ? chooseFirst : userScopeReady && userId != null ? (
            <HomePage key={userId} userId={userId} timeZone={userTimeZone} users={users} />
          ) : (
            <UsersGate usersReady={usersReady} users={users} />
          )
        }
      />
      <Route
        path="/switch-profile"
        element={
          needsProfileChoice ? chooseFirst : usersReady && users.length > 0 ? (
            <ChooseProfilePage users={users} switching onChoose={(id) => onProfileChosen(id, "switch")} />
          ) : (
            <UsersGate usersReady={usersReady} users={users} />
          )
        }
      />
      <Route
        path="/today"
        element={
          needsProfileChoice ? chooseFirst : userScopeReady && userId != null ? (
            <LogsPage key={userId} userId={userId} timeZone={userTimeZone} variant="today" />
          ) : (
            <UsersGate usersReady={usersReady} users={users} />
          )
        }
      />
      <Route
        path="/add-entry"
        element={
          needsProfileChoice ? chooseFirst : userScopeReady && userId != null ? (
            <AddEntryPage key={userId} userId={userId} timeZone={userTimeZone} />
          ) : (
            <UsersGate usersReady={usersReady} users={users} />
          )
        }
      />
      <Route
        path="/entries"
        element={
          needsProfileChoice ? chooseFirst : userScopeReady && userId != null ? (
            <LogsPage key={userId} userId={userId} timeZone={userTimeZone} />
          ) : (
            <UsersGate usersReady={usersReady} users={users} />
          )
        }
      />
      <Route
        path="/insights"
        element={
          needsProfileChoice ? chooseFirst : userScopeReady && userId != null ? (
            <InsightsPage key={userId} userId={userId} timeZone={userTimeZone} />
          ) : (
            <UsersGate usersReady={usersReady} users={users} />
          )
        }
      />
      <Route path="/admin" element={<AdminTrackerPage />} />
      <Route path="/preferences" element={<PreferencesPage />} />
      <Route
        path="/profile"
        element={
          needsProfileChoice ? chooseFirst : userScopeReady && selectedUser && userId != null ? (
            <ProfilePage
              key={userId}
              user={selectedUser}
              userId={userId}
              timeZone={userTimeZone}
              onUserUpdated={mergeUser}
            />
          ) : (
            <UsersGate usersReady={usersReady} users={users} />
          )
        }
      />
    </Routes>
  );
}
