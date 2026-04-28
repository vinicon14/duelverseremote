/**
 * i18n configuration for Duelverse.
 *
 * Detection order:
 *   1. localStorage("userLanguage")
 *   2. navigator.language (normalized)
 *   3. ipapi geo (resolved later, async, via setLanguageFromGeo)
 *   4. fallback "en"
 */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";
import ptPT from "./locales/pt-PT.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";
import ru from "./locales/ru.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import tr from "./locales/tr.json";
import ar from "./locales/ar.json";
import id from "./locales/id.json";

import { RTL_LANGUAGES, normalizeBrowserLanguage, getLanguageForCountry, type LanguageCode } from "./countries";

export const resources = {
  en:      { translation: en },
  "pt-BR": { translation: ptBR },
  "pt-PT": { translation: ptPT },
  es:      { translation: es },
  fr:      { translation: fr },
  de:      { translation: de },
  it:      { translation: it },
  ja:      { translation: ja },
  ko:      { translation: ko },
  zh:      { translation: zh },
  ru:      { translation: ru },
  nl:      { translation: nl },
  pl:      { translation: pl },
  tr:      { translation: tr },
  ar:      { translation: ar },
  id:      { translation: id },
} as const;

const SUPPORTED = Object.keys(resources);

const applyDirection = (lng: string) => {
  if (typeof document === "undefined") return;
  const isRtl = RTL_LANGUAGES.has(lng);
  document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", lng);
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    lng: localStorage.getItem("userLanguage") || "en",
    supportedLngs: SUPPORTED,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      // Inglês é o padrão. Só usamos navigator/htmlTag se o usuário já tiver
      // salvo uma preferência explícita; caso contrário ficamos em "en".
      order: ["localStorage"],
      lookupLocalStorage: "userLanguage",
      caches: ["localStorage"],
    },
  });

// Normalize apenas se o usuário JÁ tinha uma preferência salva.
// Para novos usuários (sem localStorage), mantemos "en" como padrão.
const stored = typeof localStorage !== "undefined" ? localStorage.getItem("userLanguage") : null;
const initial = stored ? normalizeBrowserLanguage(i18n.language) : "en";
if (initial !== i18n.language) {
  i18n.changeLanguage(initial);
}
applyDirection(initial);

i18n.on("languageChanged", (lng) => applyDirection(lng));

/**
 * Geo detection DESATIVADA: o padrão é sempre inglês.
 * Mantemos a função exportada como no-op para preservar o contrato com main.tsx.
 */
export const setLanguageFromGeo = async (): Promise<void> => {
  /* intencionalmente vazio — inglês é o padrão global */
};

export const setAppLanguage = async (lng: LanguageCode): Promise<void> => {
  localStorage.setItem("userLanguage", lng);
  await i18n.changeLanguage(lng);
};

export default i18n;
