import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import * as HelmetAsync from "react-helmet-async";
const { HelmetProvider } = HelmetAsync;
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { Window } from "happy-dom";

import { resources } from "../src/i18n/resources";
import { SUPPORTED_LANGUAGES } from "../src/i18n/countries";
import { TcgProvider } from "../src/contexts/TcgContext";

// Provide minimal browser globals BEFORE any page-component imports so that
// code evaluated at module scope (i18n detection, supabase init) can run safely.
const win = new Window({ url: "https://duelverse.site" });

function setGlobal(name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (!descriptor || descriptor.writable) {
    (globalThis as any)[name] = value;
  } else {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

setGlobal("window", win);
setGlobal("document", win.document);
setGlobal("navigator", win.navigator);
setGlobal("localStorage", win.localStorage);
setGlobal("sessionStorage", win.sessionStorage);
(win as any).__DUELVERSE_PRERENDER__ = true;

const BASE_URL = "https://duelverse.site";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist");
const DEFAULT_LANG = "pt-BR";

interface PublicPage {
  route: string;
  component: React.ComponentType;
  localized: boolean;
  changefreq: string;
  priority: string;
}

const PUBLIC_ROUTE_CONFIG: Omit<PublicPage, "component">[] = [
  { route: "/", localized: true, changefreq: "daily", priority: "1.0" },
  { route: "/duels", localized: false, changefreq: "daily", priority: "0.9" },
  { route: "/tournaments", localized: false, changefreq: "daily", priority: "0.9" },
  { route: "/duelverse-yugioh-duelos-online", localized: true, changefreq: "weekly", priority: "0.9" },
  { route: "/como-jogar-yugioh-online", localized: true, changefreq: "weekly", priority: "0.9" },
  { route: "/deck-builder-yugioh", localized: true, changefreq: "weekly", priority: "0.9" },
  { route: "/torneios-yugioh-online", localized: true, changefreq: "weekly", priority: "0.9" },
  { route: "/yugioh-remote-duel", localized: true, changefreq: "weekly", priority: "0.9" },
  { route: "/dueling-book-alternativa", localized: true, changefreq: "weekly", priority: "0.9" },
  { route: "/yugioh-omega-alternativa", localized: true, changefreq: "weekly", priority: "0.9" },
  { route: "/duelverse-discord", localized: true, changefreq: "weekly", priority: "0.9" },
];

const LANGUAGES = SUPPORTED_LANGUAGES.map((l) => l.code);

async function createI18nInstance(lng: string) {
  const instance = i18n.createInstance();
  await instance.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: LANGUAGES,
    interpolation: { escapeValue: false },
  });
  return instance;
}

function outputPathFor(route: string, lang: string): string {
  const prefix = lang === DEFAULT_LANG ? "" : `/${lang}`;
  const cleanRoute = route === "/" ? "" : route;
  return path.join(DIST_DIR, prefix, cleanRoute, "index.html");
}

function localizedRoute(route: string, lang: string, localized: boolean): string {
  if (!localized || lang === DEFAULT_LANG) return route;
  const cleanRoute = route === "/" ? "" : route;
  return `/${lang}${cleanRoute}`;
}

async function renderPage(
  route: string,
  Component: React.ComponentType,
  lang: string,
  localized: boolean,
  baseTemplate: string
) {
  const instance = await createI18nInstance(lang);
  const helmetContext: any = {};

  const appHtml = renderToString(
    <I18nextProvider i18n={instance}>
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={localizedRoute(route, lang, localized)}>
          <TcgProvider>
            <Component />
          </TcgProvider>
        </StaticRouter>
      </HelmetProvider>
    </I18nextProvider>
  );

  const helmet = helmetContext.helmet;
  const headInjection = [
    helmet.title.toString(),
    helmet.meta.toString(),
    helmet.link.toString(),
    helmet.script.toString(),
  ]
    .filter(Boolean)
    .join("\n");

  // Start from a clean Vite template every time so injections always match
  let template = baseTemplate;

  // Replace the SEO placeholder block with the per-page helmet output
  template = template.replace(
    /<!-- SEO_INJECTION -->[\s\S]*?<!-- \/SEO_INJECTION -->/,
    headInjection
  );

  // Inject rendered body
  template = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

  // Ensure lang attribute matches current language
  template = template.replace(/<html lang="[^"]*"/i, `<html lang="${lang}"`);

  const outputPath = outputPathFor(route, lang);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, template);
}

function localizedHref(route: string, lang: string): string {
  const prefix = lang === DEFAULT_LANG ? "" : `/${lang}`;
  const cleanRoute = route === "/" ? "" : route;
  return `${BASE_URL}${prefix}${cleanRoute || "/"}`.replace(/\/$/, route === "/" ? "/" : "");
}

function buildSitemap(pages: PublicPage[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const urlEntries = pages
    .map((page) => {
      const loc = `${BASE_URL}${page.route === "/" ? "/" : page.route}`;
      const lines = [
        `  <url>`,
        `    <loc>${loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${page.changefreq}</changefreq>`,
        `    <priority>${page.priority}</priority>`,
      ];
      if (page.localized) {
        lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>`);
        for (const lang of LANGUAGES) {
          lines.push(`    <xhtml:link rel="alternate" hreflang="${lang}" href="${localizedHref(page.route, lang)}"/>`);
        }
      }
      lines.push(`  </url>`);
      return lines.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urlEntries}\n</urlset>\n`;
}

async function main() {
  // Dynamically import page modules AFTER happy-dom globals are set,
  // so any module-level browser-API access in app code runs safely.
  const [Landing, Duels, Tournaments, LandingSEO, HowToPlayYugiohOnline, DeckBuilderYugioh, YugiohTournaments, YugiohRemoteDuel, DuelingBookAlternativa, YugiohOmegaAlternativa, DuelverseDiscord] =
    await Promise.all([
      import("../src/pages/Landing").then(m => m.default),
      import("../src/pages/Duels").then(m => m.default),
      import("../src/pages/Tournaments").then(m => m.default),
      import("../src/pages/LandingSEO").then(m => m.default),
      import("../src/pages/HowToPlayYugiohOnline").then(m => m.default),
      import("../src/pages/DeckBuilderYugioh").then(m => m.default),
      import("../src/pages/YugiohTournaments").then(m => m.default),
      import("../src/pages/YugiohRemoteDuel").then(m => m.default),
      import("../src/pages/DuelingBookAlternativa").then(m => m.default),
      import("../src/pages/YugiohOmegaAlternativa").then(m => m.default),
      import("../src/pages/DuelverseDiscord").then(m => m.default),
    ]) as React.ComponentType[];

  const pages: PublicPage[] = [
    { ...PUBLIC_ROUTE_CONFIG[0], component: Landing },
    { ...PUBLIC_ROUTE_CONFIG[1], component: Duels },
    { ...PUBLIC_ROUTE_CONFIG[2], component: Tournaments },
    { ...PUBLIC_ROUTE_CONFIG[3], component: LandingSEO },
    { ...PUBLIC_ROUTE_CONFIG[4], component: HowToPlayYugiohOnline },
    { ...PUBLIC_ROUTE_CONFIG[5], component: DeckBuilderYugioh },
    { ...PUBLIC_ROUTE_CONFIG[6], component: YugiohTournaments },
    { ...PUBLIC_ROUTE_CONFIG[7], component: YugiohRemoteDuel },
    { ...PUBLIC_ROUTE_CONFIG[8], component: DuelingBookAlternativa },
    { ...PUBLIC_ROUTE_CONFIG[9], component: YugiohOmegaAlternativa },
    { ...PUBLIC_ROUTE_CONFIG[10], component: DuelverseDiscord },
  ];

  const templatePath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(templatePath)) {
    console.error("dist/index.html not found. Run 'vite build' first.");
    process.exit(1);
  }

  // Read the clean Vite template once; reuse it for every route/lang so
  // writing dist/index.html for the first route does not pollute later pages.
  const baseTemplate = fs.readFileSync(templatePath, "utf8");

  console.log("Prerendering public pages...");
  let renderedCount = 0;
  for (const { route, component, localized } of pages) {
    const routeLanguages = localized ? LANGUAGES : [DEFAULT_LANG];
    for (const lang of routeLanguages) {
      process.stdout.write(`  ${route} [${lang}] ... `);
      try {
        await renderPage(route, component, lang, localized, baseTemplate);
        renderedCount += 1;
        console.log("OK");
      } catch (err) {
        console.log("FAIL");
        console.error(`Failed to render ${route} [${lang}]:`, err);
        process.exitCode = 1;
      }
    }
  }

  const sitemap = buildSitemap(pages);
  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), sitemap);
  console.log(`Wrote sitemap.xml and prerendered ${renderedCount} indexable pages`);
}

main();
