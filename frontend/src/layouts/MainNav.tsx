import { Link } from "react-router-dom";

const PRIMARY = [
  { to: "/", label: "Home" },
  { to: "/today", label: "Today" },
  { to: "/entries", label: "Entries" },
  { to: "/insights", label: "Insights" },
  { to: "/profile", label: "Profile" },
] as const;

type Props = { pathname: string };

/** Primary IA: Home, Today, Entries, Insights, Profile — hides link for current route. */
export default function MainNav({ pathname }: Props) {
  return (
    <div className="app-header-nav-primary">
      {PRIMARY.map(({ to, label }) =>
        pathname !== to ? (
          <Link key={to} className="header-link" to={to}>
            {label}
          </Link>
        ) : null,
      )}
    </div>
  );
}
