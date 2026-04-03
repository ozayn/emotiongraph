import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Same-origin API path collides with a React route — HTML navigations get the SPA; fetch/XHR hit the backend. */
function bypassSpaNavigationWhenHtml(req: { headers: { accept?: string | string[] } }) {
  const raw = req.headers.accept;
  const accept = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  if (accept.includes("text/html")) {
    return "/index.html";
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/transcribe": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/extract-logs": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/logs": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/tracker-day": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/users": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/user": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/auth": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/debug": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/tracker-config": { target: "http://127.0.0.1:8100", changeOrigin: true },
      "/insights": {
        target: "http://127.0.0.1:8100",
        changeOrigin: true,
        bypass: bypassSpaNavigationWhenHtml,
      },
      "/owner": {
        target: "http://127.0.0.1:8100",
        changeOrigin: true,
        bypass: bypassSpaNavigationWhenHtml,
      },
      "/export": { target: "http://127.0.0.1:8100", changeOrigin: true },
    },
  },
});
