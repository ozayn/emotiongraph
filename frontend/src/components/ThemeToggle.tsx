import { useTheme } from "../ThemeContext";

function IconSun() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3a8.5 8.5 0 1 0 11.5 11.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ThemeToggle() {
  const { effective, setPreference } = useTheme();
  const isDark = effective === "dark";

  return (
    <div className="theme-toggle-wrap">
      <button
        type="button"
        className="theme-toggle-btn"
        onClick={() => setPreference(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={isDark}
      >
        {isDark ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  );
}
