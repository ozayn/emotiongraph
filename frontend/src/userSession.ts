const USER_KEY = "emotiongraph_user_id";

export function getSelectedUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

export function setSelectedUserId(id: string): void {
  localStorage.setItem(USER_KEY, id);
}

export function clearSelectedUserId(): void {
  localStorage.removeItem(USER_KEY);
}
