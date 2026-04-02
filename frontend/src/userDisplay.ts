import type { User } from "./types";

/**
 * How the app should address this person in greetings and profile headers.
 * Falls back to the account `name` when Display name is unset or blank.
 */
export function displayNameForUser(user: Pick<User, "display_name" | "name">): string {
  const d = user.display_name?.trim();
  if (d) return d;
  const n = user.name?.trim();
  return n || "there";
}
