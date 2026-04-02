import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiUnauthorizedError, fetchUsers } from "../api";
import { usePrivateAuthOptional } from "../auth/privateAuthContext";
import {
  allowLocalPrivateDev,
  DEMO_SANDBOX_EMAIL,
  getDemoUserIdFilter,
  googleAuthDevBypass,
  isGoogleAuthRequired,
} from "../config/realmConfig";
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
  const privateAuth = usePrivateAuthOptional();
  const accessToken = realm === "private" ? (privateAuth?.accessToken?.trim() ?? null) : null;
  const hasPrivateToken = Boolean(accessToken);

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
    realm === "private" &&
    isGoogleAuthRequired() &&
    !allowLocalPrivateDev() &&
    !googleAuthDevBypass() &&
    !hasPrivateToken;

  const authMode: AuthMode = useMemo(() => {
    if (realm === "demo") return "local_profile";
    if (!isGoogleAuthRequired()) return "local_profile";
    if (allowLocalPrivateDev() || googleAuthDevBypass()) return "local_profile";
    return hasPrivateToken ? "google_oauth" : "unauthenticated";
  }, [realm, hasPrivateToken]);

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
    void fetchUsers(realm === "demo")
      .then((list) => {
        if (cancelled) return;
        let next = list;
        if (realm === "demo") {
          const sand = list.filter((u) => u.email.toLowerCase() === DEMO_SANDBOX_EMAIL.toLowerCase());
          if (sand.length === 0 && list.length > 0) {
            setUsersError(
              "The public demo only uses the Test sandbox. Try again later or open the full app.",
            );
          }
          next = sand;
        }
        const demoFilter = getDemoUserIdFilter();
        if (realm === "demo" && demoFilter != null) {
          next = next.filter((u) => u.id === demoFilter);
          if (next.length === 0) {
            setUsersError(
              "The public demo uses the Test sample profile only. Remove VITE_DEMO_USER_ID or set it to Test’s numeric id from your server.",
            );
          }
        }
        setUsers(next);

        // Demo: API returns only Test — skip the chooser when there is a single sandbox user.
        if (realm === "demo" && next.length === 1) {
          const u = next[0];
          setSelectedUserId(String(u.id), realm);
          setUserId(u.id);
          setUsersReady(true);
          return;
        }
        if (realm === "demo" && next.length === 0) {
          setUserId(null);
          setUsersReady(true);
          return;
        }

        // Private Google session: API returns only the signed-in user — bind immediately (no local picker).
        if (authMode === "google_oauth") {
          if (next.length === 1) {
            const u = next[0];
            setSelectedUserId(String(u.id), realm);
            setUserId(u.id);
          } else if (next.length > 1) {
            const stored = getSelectedUserId(realm);
            const sid = stored ? Number.parseInt(stored, 10) : NaN;
            const pick = next.find((x) => x.id === sid) ?? next[0];
            setSelectedUserId(String(pick.id), realm);
            setUserId(pick.id);
          } else {
            setUserId(null);
          }
          setUsersReady(true);
          return;
        }

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
        if (e instanceof ApiUnauthorizedError) {
          privateAuth?.setAccessToken(null);
        }
        setUsersError(e instanceof Error ? e.message : "Could not load users");
        setUsersReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [realm, skipUserFetch, authMode, privateAuth]);

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
    !skipUserFetch &&
    authMode !== "unauthenticated" &&
    authMode !== "google_oauth" &&
    usersReady &&
    users.length > 0 &&
    userId == null;

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
