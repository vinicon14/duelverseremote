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
import { resources } from "./resources";
import { RTL_LANGUAGES, normalizeBrowserLanguage, getLanguageForCountry, type LanguageCode } from "./countries";

export { resources } from "./resources";

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
    supportedLngs: SUPPORTED,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      // 1) preferência explícita do usuário, 2) idioma do navegador,
      // 3) tag <html lang>. O geo (ipapi) é resolvido depois via setLanguageFromGeo.
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: "userLanguage",
      caches: ["localStorage"],
    },
  });

// Normaliza o idioma detectado para um dos suportados (ex.: en-GB -> en, pt -> pt-PT).
const stored = typeof localStorage !== "undefined" ? localStorage.getItem("userLanguage") : null;
const initial = normalizeBrowserLanguage(stored || i18n.language);
if (initial !== i18n.language) {
  i18n.changeLanguage(initial);
}
applyDirection(initial);

i18n.on("languageChanged", (lng) => applyDirection(lng));

/**
 * Best-effort geo detection via ipapi.co. Só aplica se o usuário ainda não
 * tem preferência salva — assim respeitamos a escolha manual em Perfil.
 */
export const setLanguageFromGeo = async (): Promise<void> => {
  try {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("userLanguage")) return; // já tem preferência
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const country: string | undefined = data?.country_code || data?.country;
    if (!country) return;
    const lng = getLanguageForCountry(country) as LanguageCode;
    localStorage.setItem("userCountry", country);
    localStorage.setItem("userLanguage", lng);
    await i18n.changeLanguage(lng);
  } catch {
    /* offline ou bloqueado — ignora silenciosamente */
  }
};

export const setAppLanguage = async (lng: LanguageCode): Promise<void> => {
  localStorage.setItem("userLanguage", lng);
  await i18n.changeLanguage(lng);
};

export default i18n;
