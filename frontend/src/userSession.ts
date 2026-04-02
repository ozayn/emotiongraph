import type { AppRealm } from "./session/authTypes";

const USER_KEY_PRIVATE = "emotiongraph_user_id";
const USER_KEY_DEMO = "emotiongraph_demo_user_id";

function storageKey(realm: AppRealm): string {
  return realm === "demo" ? USER_KEY_DEMO : USER_KEY_PRIVATE;
}

export function getSelectedUserId(realm: AppRealm = "private"): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(storageKey(realm));
}

export function setSelectedUserId(id: string, realm: AppRealm = "private"): void {
  localStorage.setItem(storageKey(realm), id);
}

export function clearSelectedUserId(realm: AppRealm = "private"): void {
  localStorage.removeItem(storageKey(realm));
}
