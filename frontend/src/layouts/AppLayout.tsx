import { Link, useLocation } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { useSession } from "../session/SessionContext";
import MainNav from "./MainNav";

type Props = { children: React.ReactNode };

/**
 * Shell: brand, theme, main nav (when scoped), error banner, main content.
 * Scoped routes render inside `children`; profile picker renders without main nav.
 */
export default function AppLayout({ children }: Props) {
  const { pathname } = useLocation();
  const { usersReady, userScopeReady, usersError, realm, pathFor, homePath } = useSession();
  const switchProfilePath = pathFor("/switch-profile");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="brand" to={homePath} aria-label="EmotionGraph — home">
            <img className="brand-mark" src="/logo-mark.svg" alt="" width="28" height="28" />
            <span className="logo">EmotionGraph</span>
          </Link>
          <div className="app-header-right">
            <div className="app-header-chrome">
              <ThemeToggle />
            </div>
            {realm === "private" && (
              <Link className="app-header-secondary-link app-header-demo-link" to="/demo/">
                Demo
              </Link>
            )}
            {usersReady && userScopeReady && (
              <nav className="app-header-nav" aria-label="Main">
                <MainNav />
                {pathname !== switchProfilePath && (
                  <>
                    <span className="app-header-nav-rule" aria-hidden="true" />
                    <Link className="app-header-secondary-link" to={switchProfilePath}>
                      Switch profile
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>
        </div>
      </header>
      {realm === "demo" && (
        <div className="app-banner app-banner--demo" role="status">
          <span className="app-banner-demo-lead">Demo mode — sample data only.</span>{" "}
          <Link className="app-banner-demo-private linkish" to="/">
            Sign in for your data
          </Link>
        </div>
      )}
      {usersError && (
        <div className="app-banner error-inline" role="alert">
          {usersError}
        </div>
      )}
      <main className="app-main">{children}</main>
    </div>
  );
}
