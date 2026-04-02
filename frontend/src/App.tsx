import { Route, Routes } from "react-router-dom";
import DemoApp from "./DemoApp";
import PrivateApp from "./PrivateApp";

/**
 * Top-level split: private app at `/` (Google login when enabled) vs public demo at `/demo/*`.
 * Each branch mounts its own `SessionProvider` so demo and private never share `userId` storage.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/demo/*" element={<DemoApp />} />
      <Route path="*" element={<PrivateApp />} />
    </Routes>
  );
}
