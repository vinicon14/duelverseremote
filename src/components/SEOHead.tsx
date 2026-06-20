/**
 * SEOHead — keeps <title>, <meta description>, og:locale, hreflang
 * alternates and structured data localized for the current language.
 *
 * Pass `tKey` (e.g. "home", "tournaments", "ranking", "news", "auth")
 * to pull the right translated title/description/keywords from the
 * `seo` namespace in each locale.
 */
import * as HelmetAsync from "react-helmet-async";
const Helmet = HelmetAsync.Helmet;
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
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
  /** Enable Yu-Gi-Oh! VideoGame schema markup */
  gameSchema?: boolean;
  /** Prevent indexing of utility/authenticated app routes. */
  noindex?: boolean;
  /** Optional breadcrumb schema */
  breadcrumbs?: { name: string; path: string }[];
}

export const SEOHead = ({
  tKey = "home",
  title,
  description,
  keywords,
  path = "/",
  image,
  gameSchema = false,
  noindex = false,
  breadcrumbs,
}: SEOHeadProps) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const lng = i18n.language;
  const ogLocale = OG_LOCALE_MAP[lng] ?? "en_US";

  const finalTitle = title ?? t(`seo.${tKey}Title`);
  const finalDescription = description ?? t(`seo.${tKey}Description`);
  const finalKeywords = keywords ?? t(`seo.${tKey}Keywords`, { defaultValue: "" });
  const localizedPrefix = SUPPORTED_LANGUAGES
    .filter((l) => l.code !== "pt-BR")
    .find((l) => location.pathname === `/${l.code}` || location.pathname.startsWith(`/${l.code}/`))?.code;
  const canonicalPath = localizedPrefix
    ? location.pathname.replace(/\/$/, "") || "/"
    : path;
  const canonical = `${BASE_URL}${canonicalPath}`;
  const ogImage = image ?? "https://duelverse.site/og-image.png";

  return (
    <Helmet>
      <html lang={lng} />
      <title>{finalTitle}</title>
      <meta name="title" content={finalTitle} />
      <meta name="description" content={finalDescription} />
      {finalKeywords && <meta name="keywords" content={finalKeywords} />}
      <meta
        name="robots"
        content={noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}
      />
      <meta
        name="googlebot"
        content={noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}
      />
      <link rel="canonical" href={canonical} />

      {/* hreflang alternates so Google serves the right language per region */}
      {SUPPORTED_LANGUAGES.map((l) => {
        const isDefault = l.code === "pt-BR";
        const href = isDefault
          ? `${BASE_URL}${path}`
          : `${BASE_URL}/${l.code}${path}`;
        return (
          <link
            key={l.code}
            rel="alternate"
            hrefLang={l.code.toLowerCase()}
            href={href}
          />
        );
      })}
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

      {gameSchema && (
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "VideoGame",
          name: "Duelverse - Yu-Gi-Oh! Duels Online",
          description: finalDescription,
          url: canonical,
          image: ogImage,
          genre: ["Card Game", "Strategy", "Yu-Gi-Oh!"],
          gamePlatform: ["Web Browser", "Windows", "Android", "iOS"],
          applicationCategory: "GameApplication",
          operatingSystem: ["Windows", "Android", "iOS", "Linux", "macOS"],
          author: {
            "@type": "Organization",
            name: "Duelverse",
            url: BASE_URL,
          },
          publisher: {
            "@type": "Organization",
            name: "Duelverse",
          },
          isPartOf: {
            "@type": "Game",
            name: "Yu-Gi-Oh! Trading Card Game",
          },
        })}</script>
      )}

      {breadcrumbs && breadcrumbs.length > 0 && (
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((crumb, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: crumb.name,
            item: `${BASE_URL}${crumb.path}`,
          })),
        })}</script>
      )}
    </Helmet>
  );
};

export default SEOHead;
