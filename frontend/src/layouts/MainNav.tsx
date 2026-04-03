import { Link, useLocation } from "react-router-dom";
import { useSession } from "../session/SessionContext";

const PRIMARY = [
  { to: "/", label: "Home" },
  { to: "/today", label: "Today" },
  { to: "/entries", label: "Entries" },
  { to: "/insights", label: "Insights" },
  { to: "/profile", label: "Profile" },
] as const;

function normalizeNavPath(p: string): string {
  const q = p.split("?")[0] ?? p;
  if (q.length > 1 && q.endsWith("/")) return q.slice(0, -1);
  return q;
}

function isNavActive(pathname: string, to: string, pathFor: (p: string) => string): boolean {
  return normalizeNavPath(pathname) === normalizeNavPath(pathFor(to));
}

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

/** Primary IA — all items stay visible; current route gets active styling (realm-aware paths). */
export default function MainNav() {
  const { pathname } = useLocation();
  const { pathFor } = useSession();

  return (
    <div className="app-header-nav-primary">
      {PRIMARY.map(({ to, label }) => {
        const active = isNavActive(pathname, to, pathFor);
        const profile = to === "/profile";
        return (
          <Link
            key={to}
            className={[
              profile ? "header-link header-link--profile-icon" : "header-link",
              active && "header-link--active",
            ]
              .filter(Boolean)
              .join(" ")}
            to={pathFor(to)}
            aria-label={profile ? "Profile — account and settings" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {profile ? <ProfileAccountIcon /> : label}
          </Link>
        );
      })}
    </div>
  );
}
