/**
 * DuelVerse - Plataforma de Duelos Online TCG
 * Desenvolvido por Vinícius
 */
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import i18n, { setLanguageFromGeo } from "./i18n";
import { installGoogleTranslateCompat } from "./utils/googleTranslateCompat";

// Tolerar manipulação do DOM pelo Google Translate / Chrome Mobile Translate
installGoogleTranslateCompat();

// Kick off best-effort geo detection (no-op if user already has a saved language)
setLanguageFromGeo();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
