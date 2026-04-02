/**
 * Build-time config for realms and Google auth (Vite env).
 * See `frontend/.env.example`.
 */

/** Must match backend `DEMO_SANDBOX_EMAIL` / seeded Test row. Public demo never uses other profiles. */
export const DEMO_SANDBOX_EMAIL = "test@emotiongraph.local";

/** Optional pin for `/demo` when the Test user’s id is known; must match the seeded Test row or the list is empty. */
export function getDemoUserIdFilter(): number | null {
  const raw = import.meta.env.VITE_DEMO_USER_ID as string | undefined;
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** When true, private app shows the Google login gate until a real session exists. */
export function isGoogleAuthRequired(): boolean {
  return import.meta.env.VITE_USE_GOOGLE_AUTH === "true";
}

/**
 * When Google is required, allow skipping the gate (local profile) for development.
 * Set to "false" in env to force login UI even in dev.
 */
export function allowLocalPrivateDev(): boolean {
  return import.meta.env.VITE_ALLOW_LOCAL_PRIVATE_DEV === "true";
}

/** Optional: treat as signed-in for private app without OAuth (team dev only). */
export function googleAuthDevBypass(): boolean {
  return import.meta.env.VITE_GOOGLE_AUTH_DEV_BYPASS === "true";
}
