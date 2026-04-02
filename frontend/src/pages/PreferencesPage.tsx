import { Navigate } from "react-router-dom";

/** Bookmarks to /preferences land on Profile → Preferences. */
export default function PreferencesPage() {
  return <Navigate to="/profile#preferences" replace />;
}
