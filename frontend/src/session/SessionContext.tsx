import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchUsers } from "../api";
import { allowLocalPrivateDev, getDemoUserIdFilter, googleAuthDevBypass, isGoogleAuthRequired } from "../config/realmConfig";
import { effectiveUserTimeZone } from "../datesTz";
import type { User } from "../types";
import { clearSelectedUserId, getSelectedUserId, setSelectedUserId } from "../userSession";
import type { AppRealm, AuthMode } from "./authTypes";
import { joinAppPath, routeBaseForRealm } from "./paths";

export type SessionValue = {
  realm: AppRealm;
  /** URL prefix for links: `""` (private) or `"/demo"` (demo). */
  routeBase: "" | "/demo";
  /** Home URL for this realm (`/` or `/demo`). */
  homePath: string;
  pathFor: (absoluteAppPath: string) => string;
  authMode: AuthMode;
  users: User[];
  usersReady: boolean;
  usersError: string | null;
  userId: number | null;
  userScopeReady: boolean;
  needsProfileChoice: boolean;
  selectedUser: User | null;
  userTimeZone: string;
  applyUser: (id: number) => void;
  mergeUser: (u: User) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

type ProviderProps = {
  realm: AppRealm;
  children: ReactNode;
};

export function SessionProvider({ realm, children }: ProviderProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersReady, setUsersReady] = useState(false);

  const routeBase = routeBaseForRealm(realm);
  const homePath = joinAppPath(routeBase, "/");

  const pathFor = useCallback(
    (absoluteAppPath: string) => {
      return joinAppPath(routeBase, absoluteAppPath);
    },
    [routeBase],
  );

  const skipUserFetch =
    realm === "private" && isGoogleAuthRequired() && !allowLocalPrivateDev() && !googleAuthDevBypass();

  const authMode: AuthMode = useMemo(() => {
    if (realm === "demo") return "local_profile";
    if (!isGoogleAuthRequired()) return "local_profile";
    if (allowLocalPrivateDev() || googleAuthDevBypass()) return "local_profile";
    return "unauthenticated";
  }, [realm]);

  const applyUser = useCallback(
    (id: number) => {
      if (skipUserFetch || authMode === "unauthenticated") return;
      setSelectedUserId(String(id), realm);
      setUserId(id);
    },
    [realm, skipUserFetch, authMode],
  );

  useEffect(() => {
    if (skipUserFetch || authMode === "unauthenticated") {
      setUsers([]);
      setUserId(null);
      setUsersError(null);
      setUsersReady(true);
      return;
    }

    let cancelled = false;
    setUsersError(null);
    setUsersReady(false);
    void fetchUsers()
      .then((list) => {
        if (cancelled) return;
        let next = list;
        const demoFilter = getDemoUserIdFilter();
        if (realm === "demo" && demoFilter != null) {
          next = list.filter((u) => u.id === demoFilter);
          if (next.length === 0) {
            setUsersError(
              "This preview isn’t available right now. Try again later, or open the full app if you already use it.",
            );
          }
        }
        setUsers(next);
        const stored = getSelectedUserId(realm);
        const sid = stored ? Number.parseInt(stored, 10) : NaN;
        const match = next.find((u) => u.id === sid);
        if (match) {
          setSelectedUserId(String(match.id), realm);
          setUserId(match.id);
        } else {
          if (stored) clearSelectedUserId(realm);
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
  }, [realm, skipUserFetch, authMode]);

  const mergeUser = useCallback((u: User) => {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
  }, []);

  const selectedUser = users.find((u) => u.id === userId) ?? null;
  const userTimeZone = effectiveUserTimeZone(selectedUser);

  const userScopeReady =
    !skipUserFetch &&
    authMode !== "unauthenticated" &&
    usersReady &&
    users.length > 0 &&
    userId != null &&
    Number.isInteger(userId) &&
    userId > 0 &&
    users.some((u) => u.id === userId);

  const needsProfileChoice =
    !skipUserFetch && authMode !== "unauthenticated" && usersReady && users.length > 0 && userId == null;

  const value = useMemo<SessionValue>(
    () => ({
      realm,
      routeBase,
      homePath,
      pathFor,
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
      realm,
      routeBase,
      homePath,
      pathFor,
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
