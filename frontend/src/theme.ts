export const THEME_STORAGE_KEY = "emotiongraph-theme";

export type ThemePreference = "light" | "dark" | "system";

export type EffectiveTheme = "light" | "dark";

export function getStoredThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveEffectiveTheme(pref: ThemePreference): EffectiveTheme {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
}

const THEME_COLOR_LIGHT = "#ebe8e0";
const THEME_COLOR_DARK = "#1e1d21";

export function applyEffectiveThemeToDom(theme: EffectiveTheme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
}
