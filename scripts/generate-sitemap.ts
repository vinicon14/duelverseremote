/**
 * Auto-generates public/sitemap.xml from the crawlable "Navegue pelo Duelverse"
 * routes, pings IndexNow (Bing/Yandex) and submits the sitemap ping signal.
 * Runs before `vite dev` and `vite build` via the predev/prebuild hooks.
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://duelverse.site";
const INDEXNOW_KEY = "becfa544f02e61df6836f95b0d2bb222";

const LOCALES = [
  "en", "pt-BR", "pt-PT", "es", "fr", "de", "it", "ja", "ko",
  "zh", "ru", "nl", "pl", "tr", "ar", "id",
];

const DEFAULT_LANG = "pt-BR";
const EXTRA_PUBLIC_LOCALES = ["pt", "en", "es", "fr", "de", "it", "nl", "pl", "tr", "ar", "id"];
const EXTRA_PUBLIC_PAGES = [
  "/sobre-nos",
  "/termos-de-uso",
  "/politica-de-privacidade",
  "/faq",
  "/contato",
  "/blog",
  "/embaixadores",
];

interface Entry { path: string; changefreq: string; priority: string; localized?: boolean }

// Keep this list aligned with src/components/SEOLinksSection.tsx.
// Private app routes stay out of the sitemap so Google does not waste crawl
// budget on login-only pages or report them as "Descoberta/Rastreada, não indexada".
const ENTRIES: Entry[] = [
  { path: "/", changefreq: "daily", priority: "1.0", localized: true },
  { path: "/duels", changefreq: "daily", priority: "0.9" },
  { path: "/tournaments", changefreq: "daily", priority: "0.9" },
  { path: "/duelverse-yugioh-duelos-online", changefreq: "weekly", priority: "0.9", localized: true },
  { path: "/como-jogar-yugioh-online", changefreq: "weekly", priority: "0.9", localized: true },
  { path: "/deck-builder-yugioh", changefreq: "weekly", priority: "0.9", localized: true },
  { path: "/torneios-yugioh-online", changefreq: "weekly", priority: "0.9", localized: true },
  { path: "/yugioh-remote-duel", changefreq: "weekly", priority: "0.9", localized: true },
  { path: "/dueling-book-alternativa", changefreq: "weekly", priority: "0.9", localized: true },
  { path: "/yugioh-omega-alternativa", changefreq: "weekly", priority: "0.9", localized: true },
  { path: "/duelverse-discord", changefreq: "weekly", priority: "0.9", localized: true },
];

function localizedHref(path: string, lang: string): string {
  // Default lang lives at root; other langs live under /{lang}/...
  const prefix = lang === DEFAULT_LANG ? "" : `/${lang}`;
  const cleanPath = path === "/" ? "" : path;
  return `${BASE_URL}${prefix}${cleanPath || "/"}`.replace(/\/$/, path === "/" ? "/" : "");
}

function urlXml(e: Entry, today: string): string {
  const loc = `${BASE_URL}${e.path === "/" ? "/" : e.path}`;
  const lines: string[] = [
    `  <url>`,
    `    <loc>${loc}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${e.changefreq}</changefreq>`,
    `    <priority>${e.priority}</priority>`,
  ];
  if (e.localized) {
    lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>`);
    for (const l of LOCALES) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${l}" href="${localizedHref(e.path, l)}"/>`);
    }
  }
  lines.push(`  </url>`);
  return lines.join("\n");
}

function extraPublicUrlXml(locale: string, path: string, today: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const loc = `${BASE_URL}/${locale}/${cleanPath}`;
  return [
    `  <url>`,
    `    <loc>${loc}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>weekly</changefreq>`,
    `    <priority>0.7</priority>`,
    `  </url>`,
  ].join("\n");
}

async function ping(urls: string[]) {
  // Google sitemap ping (still supported via re-crawl signal)
  const sitemapUrl = `${BASE_URL}/sitemap.xml`;
  const pings = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];
  await Promise.allSettled(pings.map((u) => fetch(u).catch(() => null)));

  // IndexNow (Bing, Yandex, Seznam, Naver) — instant indexing.
  try {
    await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "duelverse.site",
        key: INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    });
  } catch { /* offline build */ }
}

function main() {
  const entries = ENTRIES;
  const today = new Date().toISOString().slice(0, 10);
  const extraPages = EXTRA_PUBLIC_LOCALES.flatMap((locale) => [
    `  <url>\n    <loc>${BASE_URL}/${locale}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ...EXTRA_PUBLIC_PAGES.map((path) => extraPublicUrlXml(locale, path, today)),
  ]);

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...entries.map((e) => urlXml(e, today)),
    ...extraPages,
    `</urlset>`,
  ].join("\n");
  writeFileSync(resolve("public/sitemap.xml"), xml);
  console.log(`✓ sitemap.xml written — ${entries.length + extraPages.length} routes`);

  // Only ping on production build (avoid dev spam).
  if (process.env.NODE_ENV === "production" || process.argv.includes("--ping")) {
    const urls = [
      ...entries.map((e) => `${BASE_URL}${e.path}`),
      ...EXTRA_PUBLIC_LOCALES.map((locale) => `${BASE_URL}/${locale}/`),
      ...EXTRA_PUBLIC_LOCALES.flatMap((locale) => EXTRA_PUBLIC_PAGES.map((path) => `${BASE_URL}/${locale}${path}`)),
    ];
    ping(urls).then(() => console.log(`✓ Pinged Google, Bing, IndexNow (${urls.length} urls)`));
  }
}

main();
