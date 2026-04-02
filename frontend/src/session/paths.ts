import type { AppRealm } from "./authTypes";

/** URL prefix for the public demo app (`/demo`, no trailing slash). Empty for private app. */
export function routeBaseForRealm(realm: AppRealm): "" | "/demo" {
  return realm === "demo" ? "/demo" : "";
}

/**
 * Prefix an app-internal path (always starting with `/`) for the current realm.
 * Preserves `#hash` if present.
 */
export function joinAppPath(routeBase: "" | "/demo", pathWithOptionalHash: string): string {
  const hashIdx = pathWithOptionalHash.indexOf("#");
  const pathPart = hashIdx >= 0 ? pathWithOptionalHash.slice(0, hashIdx) : pathWithOptionalHash;
  const hash = hashIdx >= 0 ? pathWithOptionalHash.slice(hashIdx) : "";

  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  if (!routeBase) {
    return `${path}${hash}`;
  }
  const base = routeBase.endsWith("/") ? routeBase.slice(0, -1) : routeBase;
  return `${base}${path}${hash}`;
}
