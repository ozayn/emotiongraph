import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyEffectiveThemeToDom,
  getStoredThemePreference,
  resolveEffectiveTheme,
  type EffectiveTheme,
  type ThemePreference,
  THEME_STORAGE_KEY,
} from "./theme";

type Ctx = {
  preference: ThemePreference;
  effective: EffectiveTheme;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredThemePreference());
  const [effective, setEffective] = useState<EffectiveTheme>(() => resolveEffectiveTheme(getStoredThemePreference()));

  useEffect(() => {
    const sync = () => {
      const e = resolveEffectiveTheme(preference);
      setEffective(e);
      applyEffectiveThemeToDom(e);
    };
    sync();
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      /* ignore */
    }
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
  }, []);

  const value = useMemo(
    () => ({ preference, effective, setPreference }),
    [preference, effective, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
