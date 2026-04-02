import { Navigate } from "react-router-dom";
import { useSession } from "../session/SessionContext";

/** Bookmarks to /preferences land on Profile → Preferences. */
export default function PreferencesPage() {
  const { pathFor } = useSession();
  return <Navigate to={pathFor("/profile#preferences")} replace />;
}
