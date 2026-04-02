import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "emotiongraph_private_access_token";

type Value = {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
};

const PrivateAuthContext = createContext<Value | null>(null);

function readStoredToken(): string | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function PrivateAuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(readStoredToken);

  const setAccessToken = useCallback((token: string | null) => {
    try {
      if (token && token.trim()) {
        localStorage.setItem(STORAGE_KEY, token.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore quota / private mode */
    }
    setAccessTokenState(token && token.trim() ? token.trim() : null);
  }, []);

  const value = useMemo(() => ({ accessToken, setAccessToken }), [accessToken, setAccessToken]);

  return <PrivateAuthContext.Provider value={value}>{children}</PrivateAuthContext.Provider>;
}

export function usePrivateAuth(): Value {
  const v = useContext(PrivateAuthContext);
  if (!v) {
    throw new Error("usePrivateAuth must be used within PrivateAuthProvider");
  }
  return v;
}

export function usePrivateAuthOptional(): Value | null {
  return useContext(PrivateAuthContext);
}
