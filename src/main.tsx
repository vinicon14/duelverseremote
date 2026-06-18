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

console.log('Duelverse: initializing React root...');
const rootEl = document.getElementById("root");
if (!rootEl) {
  console.error('Duelverse: #root element not found');
} else {
  try {
    createRoot(rootEl).render(
      <HelmetProvider>
        <App />
      </HelmetProvider>
    );
    console.log('Duelverse: React root rendered');
  } catch (err) {
    console.error('Duelverse: failed to render React root', err);
    rootEl.innerHTML = '<div style="padding:20px;color:#fff;background:#000;min-height:100vh;font-family:sans-serif;"><h1>Erro crítico</h1><pre>' + (err && err.message ? err.message : String(err)) + '</pre></div>';
  }
}
