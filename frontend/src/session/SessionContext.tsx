import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchUsers } from "../api";
import { effectiveUserTimeZone } from "../datesTz";
import type { User } from "../types";
import { clearSelectedUserId, getSelectedUserId, setSelectedUserId } from "../userSession";
import type { AuthMode } from "./authTypes";

export type SessionValue = {
  /** Always `local_profile` until Google login is implemented. */
  authMode: AuthMode;
  users: User[];
  usersReady: boolean;
  usersError: string | null;
  userId: number | null;
  /** True when a valid user id is selected and present in `users`. */
  userScopeReady: boolean;
  /** True when users exist but none selected (show picker). */
  needsProfileChoice: boolean;
  selectedUser: User | null;
  userTimeZone: string;
  applyUser: (id: number) => void;
  mergeUser: (u: User) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersReady, setUsersReady] = useState(false);

  const authMode: AuthMode = "local_profile";

  const applyUser = useCallback((id: number) => {
    setSelectedUserId(String(id));
    setUserId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUsersError(null);
    void fetchUsers()
      .then((list) => {
        if (cancelled) return;
        setUsers(list);
        const stored = getSelectedUserId();
        const sid = stored ? Number.parseInt(stored, 10) : NaN;
        const match = list.find((u) => u.id === sid);
        if (match) {
          setSelectedUserId(String(match.id));
          setUserId(match.id);
        } else {
          if (stored) clearSelectedUserId();
          setUserId(null);
        }
        setUsersReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setUsersError(e instanceof Error ? e.message : "Could not load users");
        setUsersReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mergeUser = useCallback((u: User) => {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
  }, []);

  const selectedUser = users.find((u) => u.id === userId) ?? null;
  const userTimeZone = effectiveUserTimeZone(selectedUser);

  const userScopeReady =
    usersReady &&
    users.length > 0 &&
    userId != null &&
    Number.isInteger(userId) &&
    userId > 0 &&
    users.some((u) => u.id === userId);

  const needsProfileChoice = usersReady && users.length > 0 && userId == null;

  const value = useMemo<SessionValue>(
    () => ({
      authMode,
      users,
      usersReady,
      usersError,
      userId,
      userScopeReady,
      needsProfileChoice,
      selectedUser,
      userTimeZone,
      applyUser,
      mergeUser,
    }),
    [
      users,
      usersReady,
      usersError,
      userId,
      userScopeReady,
      needsProfileChoice,
      selectedUser,
      userTimeZone,
      applyUser,
      mergeUser,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
