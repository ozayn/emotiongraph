import { Link } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";

/**
 * Google sign-in entry for the private app. OAuth provider + token exchange are not wired yet;
 * this page defines the intended default entry when `VITE_USE_GOOGLE_AUTH=true`.
 */
export default function LoginPage() {
  return (
    <div className="app-shell app-shell--login">
      <header className="app-header app-header--login-only">
        <div className="app-header-inner app-header-inner--login">
          <span className="logo login-brand-mark">EmotionGraph</span>
          <ThemeToggle />
        </div>
      </header>
      <div className="login-page">
        <div className="login-card panel-elevated">
          <h1 className="login-title">Sign in</h1>
          <p className="login-lead muted small">
            Private EmotionGraph uses Google for real accounts. Hook up your OAuth client and backend session, then replace this
            placeholder with the real sign-in button.
          </p>
          <button type="button" className="btn primary login-google-btn" disabled aria-disabled="true">
            Continue with Google
          </button>
          <p className="login-dev-hint muted small">
            For development: set <span className="mono">VITE_ALLOW_LOCAL_PRIVATE_DEV=true</span> or{" "}
            <span className="mono">VITE_GOOGLE_AUTH_DEV_BYPASS=true</span> in <span className="mono">.env</span> to use the local profile
            flow until OAuth is ready.
          </p>
          <p className="login-demo muted small">
            <Link className="linkish" to="/demo/">
              Open public demo (sample data, no login)
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
