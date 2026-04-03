import { Navigate } from "react-router-dom";
import { useSession } from "../session/SessionContext";
import OwnerToolsPage from "../pages/OwnerToolsPage";

/**
 * Private app only: /owner requires an authenticated user on the server owner allowlist.
 * Separate from /admin (product configuration).
 */
export default function OwnerPrivateRoute() {
  const { usersReady, userScopeReady, selectedUser, userId } = useSession();

  if (!usersReady) {
    return <p className="muted gate-message">Loading…</p>;
  }
  if (!userScopeReady || userId == null) {
    return <Navigate to="/" replace />;
  }
  if (!selectedUser?.is_owner) {
    return <Navigate to="/" replace />;
  }
  return <OwnerToolsPage />;
}
