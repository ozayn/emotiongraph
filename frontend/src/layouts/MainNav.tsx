import { Link, useLocation } from "react-router-dom";
import { useSession } from "../session/SessionContext";

const PRIMARY = [
  { to: "/", label: "Home" },
  { to: "/today", label: "Today" },
  { to: "/entries", label: "Entries" },
  { to: "/insights", label: "Insights" },
  { to: "/profile", label: "Profile" },
] as const;

function ProfileAccountIcon() {
  return (
    <svg
      className="header-link-profile-icon-svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="8.5" r="3.25" stroke="currentColor" strokeWidth="1.65" />
      <path
        d="M5.5 20.25c.85-3.1 3.55-5 6.5-5s5.65 1.9 6.5 5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Primary IA — hides link for current route (realm-aware paths). */
export default function MainNav() {
  const { pathname } = useLocation();
  const { pathFor } = useSession();

  return (
    <div className="app-header-nav-primary">
      {PRIMARY.map(({ to, label }) =>
        pathname !== pathFor(to) ? (
          <Link
            key={to}
            className={to === "/profile" ? "header-link header-link--profile-icon" : "header-link"}
            to={pathFor(to)}
            aria-label={to === "/profile" ? "Profile — account and settings" : undefined}
          >
            {to === "/profile" ? <ProfileAccountIcon /> : label}
          </Link>
        ) : null,
      )}
    </div>
  );
}
