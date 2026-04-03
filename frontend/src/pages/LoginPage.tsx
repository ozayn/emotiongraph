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
              shape?: string;
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
      const mount = btnRef.current;
      const host = mount.parentElement;
      const measured = host?.clientWidth ?? mount.clientWidth;
      const widthPx = Math.max(260, Math.min(420, Math.floor(measured) || 304));

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => void onCredential(response.credential),
      });
      mount.replaceChildren();
      window.google.accounts.id.renderButton(mount, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: widthPx,
        locale: "en",
      });
    };

    const initAfterLayout = () => {
      requestAnimationFrame(() => {
        if (!cancelled) init();
      });
    };

    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT}"]`);
    if (script) {
      if (window.google?.accounts?.id) {
        initAfterLayout();
      } else {
        script.addEventListener("load", initAfterLayout, { once: true });
      }
    } else {
      script = document.createElement("script");
      script.src = GIS_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => initAfterLayout();
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
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="login-main">
        <div className="login-backdrop" aria-hidden="true" />
        <div className="login-stage">
          <div className="login-cluster">
            <h1 className="login-welcome">Welcome — a calm place for voice check-ins.</h1>
            <div className="login-ambient" aria-hidden="true">
              <svg className="login-ambient__svg" viewBox="0 0 480 160" preserveAspectRatio="xMidYMid meet">
                <g className="login-ambient__layer login-ambient__layer--lines">
                  <g className="login-ambient__wave login-ambient__wave--a">
                    <path d="M-60 102 C 60 78, 180 118, 300 100 S 480 82, 560 98" />
                  </g>
                  <g className="login-ambient__wave login-ambient__wave--b">
                    <path d="M-60 64 C 100 88, 220 44, 340 62 S 500 52, 560 70" />
                  </g>
                  <g className="login-ambient__wave login-ambient__wave--c">
                    <path d="M-60 134 C 140 122, 260 150, 380 132 S 520 140, 560 126" />
                  </g>
                </g>
                <g className="login-ambient__layer login-ambient__layer--nodes">
                  <circle className="login-ambient__node" cx="108" cy="94" r="1.4" />
                  <circle className="login-ambient__node" cx="252" cy="58" r="1.1" />
                  <circle className="login-ambient__node" cx="364" cy="112" r="1.2" />
                </g>
              </svg>
            </div>
            <div className="login-panel">
              {!clientId ? (
                <p className="login-config-hint muted small" role="status">
                  Google sign-in isn&apos;t configured for this build.
                </p>
              ) : null}
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
              <Link className="login-demo-link" to="/demo/">
                Open demo
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
