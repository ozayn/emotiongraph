import { Navigate } from "react-router-dom";
import { useSession } from "../session/SessionContext";
import AdminTrackerPage from "../pages/AdminTrackerPage";

/**
 * Private app only: /admin requires an authenticated user whose email is on the server allowlist.
 */
export default function AdminPrivateRoute() {
  const { usersReady, userScopeReady, selectedUser, userId } = useSession();

  if (!usersReady) {
    return <p className="muted gate-message">Loading…</p>;
  }
  if (!userScopeReady || userId == null) {
    return <Navigate to="/" replace />;
  }
  if (!selectedUser?.is_admin) {
    return <Navigate to="/" replace />;
  }
  return <AdminTrackerPage />;
}
