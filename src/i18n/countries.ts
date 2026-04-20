/**
 * Country list (ISO-3166-1 alpha-2) with flag emoji and the language code each country maps to.
 * Used in the signup form and profile region selector.
 */
export interface Country {
  code: string;       // ISO-3166 (BR, US, JP...)
  name: string;       // English name (we localize via i18n if needed)
  flag: string;       // emoji flag
  language: string;   // default app language for this country
}

export const COUNTRIES: Country[] = [
  { code: "BR", name: "Brazil",            flag: "🇧🇷", language: "pt-BR" },
  { code: "PT", name: "Portugal",          flag: "🇵🇹", language: "pt-PT" },
  { code: "US", name: "United States",     flag: "🇺🇸", language: "en" },
  { code: "GB", name: "United Kingdom",    flag: "🇬🇧", language: "en" },
  { code: "CA", name: "Canada",            flag: "🇨🇦", language: "en" },
  { code: "AU", name: "Australia",         flag: "🇦🇺", language: "en" },
  { code: "IE", name: "Ireland",           flag: "🇮🇪", language: "en" },
  { code: "NZ", name: "New Zealand",       flag: "🇳🇿", language: "en" },
  { code: "ES", name: "Spain",             flag: "🇪🇸", language: "es" },
  { code: "MX", name: "Mexico",            flag: "🇲🇽", language: "es" },
  { code: "AR", name: "Argentina",         flag: "🇦🇷", language: "es" },
  { code: "CL", name: "Chile",             flag: "🇨🇱", language: "es" },
  { code: "CO", name: "Colombia",          flag: "🇨🇴", language: "es" },
  { code: "PE", name: "Peru",              flag: "🇵🇪", language: "es" },
  { code: "UY", name: "Uruguay",           flag: "🇺🇾", language: "es" },
  { code: "VE", name: "Venezuela",         flag: "🇻🇪", language: "es" },
  { code: "FR", name: "France",            flag: "🇫🇷", language: "fr" },
  { code: "BE", name: "Belgium",           flag: "🇧🇪", language: "fr" },
  { code: "CH", name: "Switzerland",       flag: "🇨🇭", language: "fr" },
  { code: "LU", name: "Luxembourg",        flag: "🇱🇺", language: "fr" },
  { code: "DE", name: "Germany",           flag: "🇩🇪", language: "de" },
  { code: "AT", name: "Austria",           flag: "🇦🇹", language: "de" },
  { code: "IT", name: "Italy",             flag: "🇮🇹", language: "it" },
  { code: "JP", name: "Japan",             flag: "🇯🇵", language: "ja" },
  { code: "KR", name: "South Korea",       flag: "🇰🇷", language: "ko" },
  { code: "CN", name: "China",             flag: "🇨🇳", language: "zh" },
  { code: "TW", name: "Taiwan",            flag: "🇹🇼", language: "zh" },
  { code: "HK", name: "Hong Kong",         flag: "🇭🇰", language: "zh" },
  { code: "SG", name: "Singapore",         flag: "🇸🇬", language: "en" },
  { code: "RU", name: "Russia",            flag: "🇷🇺", language: "ru" },
  { code: "UA", name: "Ukraine",           flag: "🇺🇦", language: "ru" },
  { code: "BY", name: "Belarus",           flag: "🇧🇾", language: "ru" },
  { code: "KZ", name: "Kazakhstan",        flag: "🇰🇿", language: "ru" },
  { code: "NL", name: "Netherlands",       flag: "🇳🇱", language: "nl" },
  { code: "PL", name: "Poland",            flag: "🇵🇱", language: "pl" },
  { code: "TR", name: "Turkey",            flag: "🇹🇷", language: "tr" },
  { code: "SA", name: "Saudi Arabia",      flag: "🇸🇦", language: "ar" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", language: "ar" },
  { code: "EG", name: "Egypt",             flag: "🇪🇬", language: "ar" },
  { code: "MA", name: "Morocco",           flag: "🇲🇦", language: "ar" },
  { code: "ID", name: "Indonesia",         flag: "🇮🇩", language: "id" },
  { code: "MY", name: "Malaysia",          flag: "🇲🇾", language: "id" },
  { code: "PH", name: "Philippines",       flag: "🇵🇭", language: "en" },
  { code: "IN", name: "India",             flag: "🇮🇳", language: "en" },
  { code: "ZA", name: "South Africa",      flag: "🇿🇦", language: "en" },
];

export const SUPPORTED_LANGUAGES = [
  { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
  { code: "pt-PT", name: "Português (Portugal)", flag: "🇵🇹" },
  { code: "en",    name: "English",              flag: "🇺🇸" },
  { code: "es",    name: "Español",              flag: "🇪🇸" },
  { code: "fr",    name: "Français",             flag: "🇫🇷" },
  { code: "de",    name: "Deutsch",              flag: "🇩🇪" },
  { code: "it",    name: "Italiano",             flag: "🇮🇹" },
  { code: "ja",    name: "日本語",                flag: "🇯🇵" },
  { code: "ko",    name: "한국어",                flag: "🇰🇷" },
  { code: "zh",    name: "中文",                  flag: "🇨🇳" },
  { code: "ru",    name: "Русский",              flag: "🇷🇺" },
  { code: "nl",    name: "Nederlands",           flag: "🇳🇱" },
  { code: "pl",    name: "Polski",               flag: "🇵🇱" },
  { code: "tr",    name: "Türkçe",               flag: "🇹🇷" },
  { code: "ar",    name: "العربية",              flag: "🇸🇦" },
  { code: "id",    name: "Bahasa Indonesia",     flag: "🇮🇩" },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];

export const RTL_LANGUAGES = new Set<string>(["ar"]);

export const getLanguageForCountry = (countryCode: string | null | undefined): string => {
  if (!countryCode) return "en";
  const c = COUNTRIES.find((x) => x.code === countryCode.toUpperCase());
  return c?.language ?? "en";
};

export const normalizeBrowserLanguage = (raw: string | undefined | null): LanguageCode => {
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  if (lower.startsWith("pt-br") || lower === "pt-br") return "pt-BR";
  if (lower.startsWith("pt")) return "pt-PT";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("it")) return "it";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("ru") || lower.startsWith("uk") || lower.startsWith("be")) return "ru";
  if (lower.startsWith("nl")) return "nl";
  if (lower.startsWith("pl")) return "pl";
  if (lower.startsWith("tr")) return "tr";
  if (lower.startsWith("ar")) return "ar";
  if (lower.startsWith("id") || lower.startsWith("ms")) return "id";
  return "en";
};
