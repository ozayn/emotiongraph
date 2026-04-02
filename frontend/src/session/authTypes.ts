import type { User } from "../types";

/**
 * Product surface: real accounts vs public demo (isolated test data, no login).
 * - `private`: Home / Today / Entries / Insights / Profile — real user data; Google login when enabled.
 * - `demo`: same IA under `/demo/*`, local demo user only, for demos and extraction tuning.
 */
export type AppRealm = "private" | "demo";

/**
 * How the app resolves “who is using this device”.
 *
 * - `local_profile`: pick a user (demo realm or dev); persist `X-User-Id` client-side.
 * - `google_oauth`: private realm with Google session + backend user binding (wired when backend is ready).
 * - `unauthenticated`: private realm, Google required, no session yet (login screen).
 */
export type AuthMode = "local_profile" | "google_oauth" | "unauthenticated";

/**
 * Narrow view of the active person for UI (pages should prefer this over raw `User` when possible).
 * Today this mirrors `User`; later, Google-backed fields can extend without rewriting every page.
 */
export type ActivePerson = User;

/** Client-side Google session shape once OAuth is implemented (tokens from backend / Google). */
export type GoogleAuthSession = {
  /** Access or session token sent to the API (e.g. Authorization header). */
  accessToken: string | null;
  /** When false, private app shows login until OAuth completes. */
  isAuthenticated: boolean;
};

export const defaultGoogleAuthSession: GoogleAuthSession = {
  accessToken: null,
  isAuthenticated: false,
};
