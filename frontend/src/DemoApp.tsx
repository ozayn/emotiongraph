import AppLayout from "./layouts/AppLayout";
import FeatureRoutes from "./routes/FeatureRoutes";
import { SessionProvider } from "./session/SessionContext";

export default function DemoApp() {
  return (
    <SessionProvider realm="demo">
      <AppLayout>
        <FeatureRoutes />
      </AppLayout>
    </SessionProvider>
  );
}
