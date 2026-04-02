import type { ReactNode } from "react";
import { usePrivateAuth } from "../auth/privateAuthContext";
import { allowLocalPrivateDev, googleAuthDevBypass, isGoogleAuthRequired } from "../config/realmConfig";
import LoginPage from "../pages/LoginPage";

type Props = { children: ReactNode };

/**
 * Private app only: when Google auth is required and no dev bypass, show login until a JWT is stored.
 */
export default function GoogleAuthGate({ children }: Props) {
  const { accessToken } = usePrivateAuth();
  const needLogin = isGoogleAuthRequired() && !allowLocalPrivateDev() && !googleAuthDevBypass();
  if (needLogin && !accessToken) {
    return <LoginPage />;
  }
  return <>{children}</>;
}
