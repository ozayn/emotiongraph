import { SessionProvider } from "./session/SessionContext";
import AppLayout from "./layouts/AppLayout";
import AppRoutes from "./routes/AppRoutes";

/**
 * Root: session (future auth boundary) + chrome + routes.
 * Google OAuth can swap `SessionProvider` internals while keeping `useSession()` + route shape stable.
 */
export default function App() {
  return (
    <SessionProvider>
      <AppLayout>
        <AppRoutes />
      </AppLayout>
    </SessionProvider>
  );
}
