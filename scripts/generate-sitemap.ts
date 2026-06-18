/**
 * Auto-generates public/sitemap.xml from src/App.tsx routes,
 * pings IndexNow (Bing/Yandex) and submits to Google via sitemap ping.
 * Runs before `vite dev` and `vite build` via the predev/prebuild hooks.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://duelverse.site";
const INDEXNOW_KEY = "becfa544f02e61df6836f95b0d2bb222";

const LOCALES = [
  "en", "pt-BR", "pt-PT", "es", "fr", "de", "it", "ja", "ko",
  "zh", "ru", "nl", "pl", "tr", "ar", "id",
];

// Routes that should NEVER be indexed (private/dynamic/auth-only).
const EXCLUDE = new Set<string>([
  "/admin", "/auth", "/profile", "/profile-select", "/judge-panel",
  "/create-tournament", "/create-weekly-tournament", "/my-tournaments",
  "/tournament-manager", "/transfer-history", "/my-items",
  "/discord-activity", "/friends", "/duelcoins", "/buy-duelcoins",
]);

// Localized SEO landing pages: emit hreflang alternates for each.
const LOCALIZED_PUBLIC = new Set<string>([
  "/duelverse-yugioh-duelos-online",
  "/como-jogar-yugioh-online",
  "/deck-builder-yugioh",
  "/torneios-yugioh-online",
  "/yugioh-remote-duel",
  "/duelverse-discord",
]);

interface Entry { path: string; changefreq: string; priority: string; localized?: boolean }

function extractRoutes(): Entry[] {
  const src = readFileSync(resolve("src/App.tsx"), "utf-8");
  const re = /<Route\s+path="([^"]+)"/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const p = m[1];
    // Skip dynamic, catchall, pro, lang-prefixed, etc.
    if (p === "*" || p.includes(":") || p.startsWith("/pro/")) continue;
    if (EXCLUDE.has(p)) continue;
    found.add(p);
  }
  return Array.from(found).sort().map((path) => ({
    path,
    changefreq: path === "/" ? "daily" : LOCALIZED_PUBLIC.has(path) ? "weekly" : "weekly",
    priority: path === "/" ? "1.0" : LOCALIZED_PUBLIC.has(path) ? "0.9" : "0.7",
    localized: path === "/" || LOCALIZED_PUBLIC.has(path),
  }));
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
      const href = e.path === "/" ? `${BASE_URL}/?lang=${l}` : `${loc}?lang=${l}`;
      lines.push(`    <xhtml:link rel="alternate" hreflang="${l}" href="${href}"/>`);
    }
  }
  lines.push(`  </url>`);
  return lines.join("\n");
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
  const entries = extractRoutes();
  const today = new Date().toISOString().slice(0, 10);
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...entries.map((e) => urlXml(e, today)),
    `</urlset>`,
  ].join("\n");
  writeFileSync(resolve("public/sitemap.xml"), xml);
  console.log(`✓ sitemap.xml written — ${entries.length} routes`);

  // Only ping on production build (avoid dev spam).
  if (process.env.NODE_ENV === "production" || process.argv.includes("--ping")) {
    const urls = entries.map((e) => `${BASE_URL}${e.path}`);
    ping(urls).then(() => console.log(`✓ Pinged Google, Bing, IndexNow (${urls.length} urls)`));
  }
}

main();
