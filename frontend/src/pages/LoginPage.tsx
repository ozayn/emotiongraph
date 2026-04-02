import { Link } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";

/**
 * Private app sign-in when Google auth is required (OAuth wired later).
 */
export default function LoginPage() {
  return (
    <div className="app-shell app-shell--login">
      <header className="app-header app-header--login-only">
        <div className="app-header-inner app-header-inner--login">
          <div className="login-header-brand">
            <img className="login-brand-icon" src="/logo-mark.svg" alt="" width="32" height="32" />
            <div className="login-header-brand-text">
              <span className="logo login-brand-mark">EmotionGraph</span>
              <span className="login-brand-tag muted small">Your private log</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <div className="login-page">
        <div className="login-card panel-elevated">
          <p className="login-kicker muted small">Sign in</p>
          <h1 className="login-title">Continue with Google</h1>
          <p className="login-lead muted small">
            We’ll use your Google account to keep your entries separate from everyone else’s. Sign-in isn’t available here yet —
            the button below is a preview of what you’ll tap when it’s on.
          </p>
          <button type="button" className="btn primary login-google-btn" disabled aria-disabled="true">
            Continue with Google
          </button>
          <p className="login-footnote muted small">You won’t be asked for a password here when this goes live — Google handles that step.</p>
          <div className="login-demo">
            <p className="login-demo-label muted small">New here?</p>
            <Link className="linkish login-demo-link" to="/demo/">
              Explore the sample demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
