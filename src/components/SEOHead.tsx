/**
 * SEOHead — keeps <title>, <meta description>, og:locale, hreflang
 * alternates and structured data localized for the current language.
 *
 * Pass `tKey` (e.g. "home", "tournaments", "ranking", "news", "auth")
 * to pull the right translated title/description/keywords from the
 * `seo` namespace in each locale.
 */
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "@/i18n/countries";

const BASE_URL = "https://duelverse.site";

const OG_LOCALE_MAP: Record<string, string> = {
  "pt-BR": "pt_BR",
  "pt-PT": "pt_PT",
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
  it: "it_IT",
  ja: "ja_JP",
  ko: "ko_KR",
  zh: "zh_CN",
  ru: "ru_RU",
  nl: "nl_NL",
  pl: "pl_PL",
  tr: "tr_TR",
  ar: "ar_SA",
  id: "id_ID",
};

interface SEOHeadProps {
  /** Localized SEO key — looks up `seo.<tKey>Title` / `seo.<tKey>Description` / `seo.<tKey>Keywords`. */
  tKey?: "home" | "tournaments" | "ranking" | "news" | "auth";
  /** Manual override (skips translation lookup). */
  title?: string;
  description?: string;
  keywords?: string;
  /** Current path (defaults to "/"). */
  path?: string;
  image?: string;
}

export const SEOHead = ({
  tKey = "home",
  title,
  description,
  keywords,
  path = "/",
  image,
}: SEOHeadProps) => {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const ogLocale = OG_LOCALE_MAP[lng] ?? "en_US";

  const finalTitle = title ?? t(`seo.${tKey}Title`);
  const finalDescription = description ?? t(`seo.${tKey}Description`);
  const finalKeywords = keywords ?? t(`seo.${tKey}Keywords`, { defaultValue: "" });
  const canonical = `${BASE_URL}${path}`;
  const ogImage = image ?? "https://duelverse.site/favicon.png";

  return (
    <Helmet>
      <html lang={lng} />
      <title>{finalTitle}</title>
      <meta name="title" content={finalTitle} />
      <meta name="description" content={finalDescription} />
      {finalKeywords && <meta name="keywords" content={finalKeywords} />}
      <link rel="canonical" href={canonical} />

      {/* hreflang alternates so Google serves the right language per region */}
      {SUPPORTED_LANGUAGES.map((l) => (
        <link
          key={l.code}
          rel="alternate"
          hrefLang={l.code.toLowerCase()}
          href={`${BASE_URL}${path}?lang=${l.code}`}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}${path}`} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={finalDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:site_name" content="Duelverse" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={finalTitle} />
      <meta name="twitter:description" content={finalDescription} />
      <meta name="twitter:image" content={ogImage} />

      {/* Structured data localized */}
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Duelverse",
        url: BASE_URL,
        inLanguage: lng,
        description: finalDescription,
      })}</script>
    </Helmet>
  );
};

export default SEOHead;
