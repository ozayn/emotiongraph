import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { postGoogleAuth } from "../api";
import { usePrivateAuth } from "../auth/privateAuthContext";
import ThemeToggle from "../components/ThemeToggle";
import { clearSelectedUserId } from "../userSession";

const GIS_SCRIPT = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              width?: string | number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

/**
 * Private app: Google Identity Services sign-in; backend exchanges ID token for an API JWT.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { setAccessToken } = usePrivateAuth();
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? "";

  const onCredential = useCallback(
    async (credential: string | undefined) => {
      if (!credential) {
        setError("Sign-in did not return a credential. Try again.");
        return;
      }
      setError(null);
      setBusy(true);
      try {
        const data = await postGoogleAuth(credential);
        clearSelectedUserId("private");
        setAccessToken(data.access_token);
        navigate("/", { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      } finally {
        setBusy(false);
      }
    },
    [navigate, setAccessToken],
  );

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;

    const init = () => {
      if (cancelled || !btnRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => void onCredential(response.credential),
      });
      btnRef.current.replaceChildren();
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: "100%",
        locale: "en",
      });
    };

    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT}"]`);
    if (script) {
      if (window.google?.accounts?.id) {
        init();
      } else {
        script.addEventListener("load", init, { once: true });
      }
    } else {
      script = document.createElement("script");
      script.src = GIS_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => init();
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);

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
          {!clientId ? (
            <p className="login-lead muted small">
              Google sign-in needs a web client id in the frontend environment (VITE_GOOGLE_CLIENT_ID) and matching server
              configuration. Ask your administrator, or use local dev flags to skip this screen.
            </p>
          ) : (
            <p className="login-lead muted small">
              We use your Google account only to recognize you and keep your entries separate. Password entry stays on
              Google&apos;s side.
            </p>
          )}
          {clientId ? (
            <div className={`login-google-host${busy ? " login-google-host--busy" : ""}`}>
              <div ref={btnRef} className="login-google-btn-mount" />
              {busy ? <p className="login-google-busy muted small">Signing you in…</p> : null}
            </div>
          ) : null}
          {error ? (
            <p className="error-inline" role="alert">
              {error}
            </p>
          ) : null}
          <p className="login-footnote muted small">
            By continuing you agree that Google may share your name and email with this app as described in their sign-in
            prompt.
          </p>
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
