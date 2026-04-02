import type { ReactNode } from "react";
import { allowLocalPrivateDev, googleAuthDevBypass, isGoogleAuthRequired } from "../config/realmConfig";
import LoginPage from "../pages/LoginPage";

type Props = { children: ReactNode };

/**
 * Private app only: when Google auth is required and no dev bypass, show the login shell
 * until real OAuth is wired (then this gate keys off session tokens instead).
 */
export default function GoogleAuthGate({ children }: Props) {
  const needLogin = isGoogleAuthRequired() && !allowLocalPrivateDev() && !googleAuthDevBypass();
  if (needLogin) {
    return <LoginPage />;
  }
  return <>{children}</>;
}
