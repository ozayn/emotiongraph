import { Link, useLocation } from "react-router-dom";
import { useSession } from "../session/SessionContext";

const PRIMARY = [
  { to: "/", label: "Home" },
  { to: "/today", label: "Today" },
  { to: "/entries", label: "Entries" },
  { to: "/insights", label: "Insights" },
  { to: "/profile", label: "Profile" },
] as const;

/** Primary IA — hides link for current route (realm-aware paths). */
export default function MainNav() {
  const { pathname } = useLocation();
  const { pathFor } = useSession();

  return (
    <div className="app-header-nav-primary">
      {PRIMARY.map(({ to, label }) =>
        pathname !== pathFor(to) ? (
          <Link key={to} className="header-link" to={pathFor(to)}>
            {label}
          </Link>
        ) : null,
      )}
    </div>
  );
}
