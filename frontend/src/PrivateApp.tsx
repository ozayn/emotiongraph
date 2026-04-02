import { PrivateAuthProvider } from "./auth/privateAuthContext";
import GoogleAuthGate from "./components/GoogleAuthGate";
import AppLayout from "./layouts/AppLayout";
import FeatureRoutes from "./routes/FeatureRoutes";
import { SessionProvider } from "./session/SessionContext";

export default function PrivateApp() {
  return (
    <PrivateAuthProvider>
      <SessionProvider realm="private">
        <GoogleAuthGate>
          <AppLayout>
            <FeatureRoutes />
          </AppLayout>
        </GoogleAuthGate>
      </SessionProvider>
    </PrivateAuthProvider>
  );
}
