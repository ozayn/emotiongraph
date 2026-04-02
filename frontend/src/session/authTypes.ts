import type { User } from "../types";

/**
 * How the app resolves “who is using this device”.
 *
 * - `local_profile`: current production mode — pick a seeded user, persist `X-User-Id` client-side.
 * - `google_oauth`: reserved for a future flow; Google identity would replace the picker and drive `userId`/token.
 */
export type AuthMode = "local_profile" | "google_oauth";

/**
 * Narrow view of the active person for UI (pages should prefer this over raw `User` when possible).
 * Today this mirrors `User`; later, Google-backed fields can extend without rewriting every page.
 */
export type ActivePerson = User;

/** Future: map Google JWT / backend session → ActivePerson. Not used until `google_oauth`. */
export type GoogleAuthPlaceholder = {
  enabled: false;
};

export const googleAuthPlaceholder: GoogleAuthPlaceholder = { enabled: false };
