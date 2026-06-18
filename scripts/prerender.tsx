import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { HelmetProvider } from "react-helmet-async";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { Window } from "happy-dom";

import { resources } from "../src/i18n/resources";
import { SUPPORTED_LANGUAGES } from "../src/i18n/countries";

import Landing from "../src/pages/Landing";
import LandingSEO from "../src/pages/LandingSEO";
import HowToPlayYugiohOnline from "../src/pages/HowToPlayYugiohOnline";
import DeckBuilderYugioh from "../src/pages/DeckBuilderYugioh";
import YugiohTournaments from "../src/pages/YugiohTournaments";
import YugiohRemoteDuel from "../src/pages/YugiohRemoteDuel";
import DuelverseDiscord from "../src/pages/DuelverseDiscord";

// Provide minimal browser globals for i18n and any other browser-only code
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

const BASE_URL = "https://duelverse.site";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist");
const DEFAULT_LANG = "pt-BR";

interface PublicPage {
  route: string;
  component: React.ComponentType;
}

const PUBLIC_PAGES: PublicPage[] = [
  { route: "/", component: Landing },
  { route: "/duelverse-yugioh-duelos-online", component: LandingSEO },
  { route: "/como-jogar-yugioh-online", component: HowToPlayYugiohOnline },
  { route: "/deck-builder-yugioh", component: DeckBuilderYugioh },
  { route: "/torneios-yugioh-online", component: YugiohTournaments },
  { route: "/yugioh-remote-duel", component: YugiohRemoteDuel },
  { route: "/duelverse-discord", component: DuelverseDiscord },
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

async function renderPage(
  route: string,
  Component: React.ComponentType,
  lang: string,
  baseTemplate: string
) {
  const instance = await createI18nInstance(lang);
  const helmetContext: any = {};

  const appHtml = renderToString(
    <I18nextProvider i18n={instance}>
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={route}>
          <Component />
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

function buildSitemap(): string {
  const urls: string[] = [];
  for (const { route } of PUBLIC_PAGES) {
    for (const lang of LANGUAGES) {
      const prefix = lang === DEFAULT_LANG ? "" : `/${lang}`;
      const cleanRoute = route === "/" ? "" : route;
      urls.push(`${BASE_URL}${prefix}${cleanRoute}`);
    }
  }

  const urlEntries = urls
    .map(
      (url) => `  <url>\n    <loc>${url}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${url === BASE_URL + "/" ? "1.0" : "0.8"}</priority>\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
}

async function main() {
  const templatePath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(templatePath)) {
    console.error("dist/index.html not found. Run 'vite build' first.");
    process.exit(1);
  }

  // Read the clean Vite template once; reuse it for every route/lang so
  // writing dist/index.html for the first route does not pollute later pages.
  const baseTemplate = fs.readFileSync(templatePath, "utf8");

  console.log("Prerendering public pages...");
  for (const { route, component } of PUBLIC_PAGES) {
    for (const lang of LANGUAGES) {
      process.stdout.write(`  ${route} [${lang}] ... `);
      try {
        await renderPage(route, component, lang, baseTemplate);
        console.log("OK");
      } catch (err) {
        console.log("FAIL");
        console.error(`Failed to render ${route} [${lang}]:`, err);
        process.exitCode = 1;
      }
    }
  }

  const sitemap = buildSitemap();
  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), sitemap);
  console.log(`Wrote sitemap.xml with ${LANGUAGES.length * PUBLIC_PAGES.length} URLs`);
}

main();
