import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./ThemeContext";
import { applyEffectiveThemeToDom, getStoredThemePreference, resolveEffectiveTheme } from "./theme";
import "./styles.css";

applyEffectiveThemeToDom(resolveEffectiveTheme(getStoredThemePreference()));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
