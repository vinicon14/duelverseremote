# SSG + Multilingual SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Duelverse public pages crawlable as static HTML under language subpaths, optimize their SEO content for Yu-Gi-Oh keywords, and make them discoverable by Google via an auto-generated sitemap.

**Architecture:** Add a post-build `scripts/prerender.ts` that SSR-renders each public page for each language using `react-dom/server`, `StaticRouter`, `HelmetProvider`, and a clean i18n instance. Inject the rendered body and extracted head tags into `dist/index.html` templates with SEO placeholders. Update React Router to serve the same components under `/:lang/<route>`, and filter the public navigation to only public pages.

**Tech Stack:** React, Vite, TypeScript, react-router-dom, react-helmet-async, react-i18next, i18next, happy-dom.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/i18n/resources.ts` | Centralized translation resources, imported by both runtime i18n and SSR prerenderer without browser-detector side effects. |
| `src/components/LocalizedRoute.tsx` | Reads `lang` URL param and switches i18n language before rendering the wrapped page. |
| `src/components/SEOHead.tsx` | Updates `hreflang` to point to language subpaths instead of `?lang=`. |
| `src/components/SEOLinksSection.tsx` | Shows only public pages. |
| `src/App.tsx` | Adds `/:lang/<public-route>` routes using `LocalizedRoute`. |
| `index.html` | Adds SEO placeholders so prerender can inject per-page tags. |
| `scripts/prerender.ts` | Renders every public route × language and writes static HTML + sitemap. |
| `package.json` | Adds `tsx` and `happy-dom` dev deps; runs prerender after `vite build`. |
| `public/robots.txt` | Confirms sitemap URL. |
| `src/pages/Landing.tsx`, `LandingSEO.tsx`, etc. | Expanded SEO content and keywords. |

---

## Task 1: Extract translation resources to a side-effect-free module

**Files:**
- Create: `src/i18n/resources.ts`
- Modify: `src/i18n/index.ts`

**Why:** The prerender script needs the translations without triggering the browser language detector / localStorage code in `src/i18n/index.ts`.

- [ ] **Step 1: Create `src/i18n/resources.ts`**

```ts
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

export const resources = {
  en: { translation: en },
  "pt-BR": { translation: ptBR },
  "pt-PT": { translation: ptPT },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
  ja: { translation: ja },
  ko: { translation: ko },
  zh: { translation: zh },
  ru: { translation: ru },
  nl: { translation: nl },
  pl: { translation: pl },
  tr: { translation: tr },
  ar: { translation: ar },
  id: { translation: id },
} as const;
```

- [ ] **Step 2: Refactor `src/i18n/index.ts` to import from `resources.ts`**

Replace the 16 JSON imports at the top of `src/i18n/index.ts` with:

```ts
import { resources } from "./resources";
```

Remove the inline `resources` object that used to be exported. Keep `export { resources };` re-exported from `resources.ts` for backwards compatibility by adding:

```ts
export { resources } from "./resources";
```

- [ ] **Step 3: Verify build still works**

Run:

```bash
npm run build
```

Expected: build succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/resources.ts src/i18n/index.ts
git commit -m "refactor(i18n): extract resources to side-effect-free module for SSR"
```

---

## Task 2: Add `LocalizedRoute` wrapper for language subpaths

**Files:**
- Create: `src/components/LocalizedRoute.tsx`

- [ ] **Step 1: Create `src/components/LocalizedRoute.tsx`**

```tsx
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "@/i18n/countries";

interface LocalizedRouteProps {
  component: React.ComponentType;
}

const supported = new Set<LanguageCode>(SUPPORTED_LANGUAGES.map((l) => l.code));

export const LocalizedRoute = ({ component: Component }: LocalizedRouteProps) => {
  const { lang } = useParams<{ lang: string }>();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (lang && supported.has(lang) && i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  return <Component />;
};

export default LocalizedRoute;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LocalizedRoute.tsx
git commit -m "feat(i18n): add LocalizedRoute wrapper for language subpaths"
```

---

## Task 3: Add localized routes to `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import `LocalizedRoute`**

Add near the other imports in `src/App.tsx`:

```tsx
import { LocalizedRoute } from "./components/LocalizedRoute";
```

- [ ] **Step 2: Add `/:lang/...` routes for every public page**

Inside `<Routes>`, after the existing public routes, add:

```tsx
{/* Localized public SEO routes */}
<Route path="/:lang/duelverse-yugioh-duelos-online" element={<LocalizedRoute component={LandingSEO} />} />
<Route path="/:lang/como-jogar-yugioh-online" element={<LocalizedRoute component={HowToPlayYugiohOnline} />} />
<Route path="/:lang/deck-builder-yugioh" element={<LocalizedRoute component={DeckBuilderYugioh} />} />
<Route path="/:lang/torneios-yugioh-online" element={<LocalizedRoute component={YugiohTournaments} />} />
<Route path="/:lang/yugioh-remote-duel" element={<LocalizedRoute component={YugiohRemoteDuel} />} />
<Route path="/:lang/duelverse-discord" element={<LocalizedRoute component={DuelverseDiscord} />} />
```

Keep the existing non-localized routes (they remain the default, usually pt-BR).

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(routing): add localized routes for public SEO pages"
```

---

## Task 4: Update `SEOHead` `hreflang` to use language subpaths

**Files:**
- Modify: `src/components/SEOHead.tsx`

- [ ] **Step 1: Replace query-string hreflang with subpaths**

In `src/components/SEOHead.tsx`, replace the `hreflang` alternate mapping from:

```tsx
href={`${BASE_URL}${path}?lang=${l.code}`}
```

to:

```tsx
href={`${BASE_URL}/${l.code}${path}`}
```

For the default/fallback language (`pt-BR`), keep the canonical root path without `/pt-BR` prefix:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SEOHead.tsx
git commit -m "feat(seo): use language subpaths in hreflang alternates"
```

---

## Task 5: Filter `SEOLinksSection` to only public pages

**Files:**
- Modify: `src/components/SEOLinksSection.tsx`

- [ ] **Step 1: Replace the link list with only public pages**

Edit `src/components/SEOLinksSection.tsx` so the links array contains only:

```tsx
const links = [
  { label: "Duelverse — Início", href: "/" },
  { label: "Yu-Gi-Oh Online no Duelverse", href: "/duelverse-yugioh-duelos-online" },
  { label: "Como Jogar Yu-Gi-Oh Online", href: "/como-jogar-yugioh-online" },
  { label: "Deck Builder Yu-Gi-Oh", href: "/deck-builder-yugioh" },
  { label: "Torneios Yu-Gi-Oh Online", href: "/torneios-yugioh-online" },
  { label: "Yu-Gi-Oh Remote Duel", href: "/yugioh-remote-duel" },
  { label: "Discord Duelverse", href: "/duelverse-discord" },
];
```

Remove any links that require authentication (`/duels`, `/matchmaking`, `/tournaments`, `/ranking`, `/deck-builder`, `/news`).

- [ ] **Step 2: Commit**

```bash
git add src/components/SEOLinksSection.tsx
git commit -m "fix(nav): show only public pages in SEO links section"
```

---

## Task 6: Prepare `index.html` for per-page SEO injection

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Wrap page-specific SEO tags in placeholders**

In `index.html`, replace the static block from `<title>` through the `FAQPage` schema with placeholder comments. Keep non-SEO tags (charset, viewport, favicon, PWA, GSC verification, gtag, base Organization/SoftwareApplication schema) intact.

Replace lines 35-192 (from `<!-- Primary SEO Meta Tags -->` through the FAQ schema) with:

```html
<!-- SEO_INJECTION -->
<!-- Default SEO; prerender replaces this block per route -->
<title>Duelverse - Yu-Gi-Oh Remote Duels Live</title>
<meta name="title" content="Duelverse - Yu-Gi-Oh Remote Duels Live" />
<meta name="description" content="Duelverse is the global platform for live Yu-Gi-Oh remote duels with video call. Play YGO Advanced, Rush Duel and Genesis online.">
<meta name="keywords" content="Yu-Gi-Oh, YGO, YGO Pro, YGOPro, YGO Omega, Omega Yugioh, Dueling Book, DB Dueling Book, db.duelingbook, Yu-Gi-Oh simulator, Yu-Gi-Oh online simulator, free Yu-Gi-Oh online, play Yu-Gi-Oh online free, YGO Advanced, Master Duel, Edison format, Goat format, Rush Duel, Speed Duel, Genesis, duelverse, remote duel, online duel, live duel, Yu-Gi-Oh tournament online, Yu-Gi-Oh ranking, duelist, Yu-Gi-Oh deck builder, deck tester, video call duel, webcam duel, Yu-Gi-Oh streaming, anime card game, TCG online, OCG online, Konami Yu-Gi-Oh" />
<link rel="alternate" hreflang="x-default" href="https://duelverse.site/" />
<link rel="alternate" hreflang="en" href="https://duelverse.site/en/" />
<link rel="alternate" hreflang="pt-BR" href="https://duelverse.site/" />
<link rel="alternate" hreflang="pt-PT" href="https://duelverse.site/pt-PT/" />
<link rel="alternate" hreflang="es" href="https://duelverse.site/es/" />
<link rel="alternate" hreflang="fr" href="https://duelverse.site/fr/" />
<link rel="alternate" hreflang="de" href="https://duelverse.site/de/" />
<link rel="alternate" hreflang="it" href="https://duelverse.site/it/" />
<link rel="alternate" hreflang="ja" href="https://duelverse.site/ja/" />
<link rel="alternate" hreflang="ko" href="https://duelverse.site/ko/" />
<link rel="alternate" hreflang="zh" href="https://duelverse.site/zh/" />
<link rel="alternate" hreflang="ru" href="https://duelverse.site/ru/" />
<link rel="alternate" hreflang="nl" href="https://duelverse.site/nl/" />
<link rel="alternate" hreflang="pl" href="https://duelverse.site/pl/" />
<link rel="alternate" hreflang="tr" href="https://duelverse.site/tr/" />
<link rel="alternate" hreflang="ar" href="https://duelverse.site/ar/" />
<link rel="alternate" hreflang="id" href="https://duelverse.site/id/" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://duelverse.site/" />
<meta property="og:title" content="Duelverse - Yu-Gi-Oh Remote Duels Live" />
<meta property="og:description" content="Duelverse is the global platform for live Yu-Gi-Oh remote duels with video call. Play YGO Advanced, Rush Duel and Genesis online." />
<meta property="og:image" content="https://duelverse.site/og-image.png" />
<meta property="og:site_name" content="Duelverse" />
<meta property="og:locale" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Duelverse - Yu-Gi-Oh Remote Duels Live" />
<meta name="twitter:description" content="Duelverse is the global platform for live Yu-Gi-Oh remote duels with video call. Play YGO Advanced, Rush Duel and Genesis online." />
<meta name="twitter:image" content="https://duelverse.site/og-image.png" />
<!-- /SEO_INJECTION -->
```

Remove any duplicate `<meta property="og:title" ...>` / `<meta name="twitter:title" ...>` that currently appear near the bottom of `<head>` (lines 207-211 in the original file).

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds and `dist/index.html` contains the placeholder block.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore(html): add SEO placeholder block for prerender injection"
```

---

## Task 7: Install SSR dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D tsx happy-dom
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add tsx and happy-dom for SSR prerender"
```

---

## Task 8: Create the prerender script

**Files:**
- Create: `scripts/prerender.ts`

- [ ] **Step 1: Create `scripts/prerender.ts`**

```ts
import fs from "fs";
import path from "path";
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
(globalThis as any).window = win;
(globalThis as any).document = win.document;
(globalThis as any).navigator = win.navigator;
(globalThis as any).localStorage = win.localStorage;
(globalThis as any).sessionStorage = win.sessionStorage;

const BASE_URL = "https://duelverse.site";
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

async function renderPage(route: string, Component: React.ComponentType, lang: string) {
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

  const templatePath = path.join(DIST_DIR, "index.html");
  let template = fs.readFileSync(templatePath, "utf8");

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
  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    console.error("dist/index.html not found. Run 'vite build' first.");
    process.exit(1);
  }

  console.log("Prerendering public pages...");
  for (const { route, component } of PUBLIC_PAGES) {
    for (const lang of LANGUAGES) {
      process.stdout.write(`  ${route} [${lang}] ... `);
      try {
        await renderPage(route, component, lang);
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
```

- [ ] **Step 2: Ensure public pages are SSR-safe**

Quickly scan the seven public page components for direct `window`/`document`/`localStorage` usage at the top level (outside `useEffect`). If any exist, move them into `useEffect` or guard with `typeof window !== "undefined"`.

- [ ] **Step 3: Update `package.json` build script**

Change the `build` script from:

```json
"build": "vite build"
```

to:

```json
"build": "vite build && tsx scripts/prerender.ts"
```

- [ ] **Step 4: Run the full build**

```bash
npm run build
```

Expected output ends with lines like:

```
Prerendering public pages...
  / [pt-BR] ... OK
  / [en] ... OK
  ...
Wrote sitemap.xml with 112 URLs
```

- [ ] **Step 5: Verify static files exist**

```bash
Get-ChildItem -Recurse dist/duelverse-yugioh-duelos-online | Select-Object FullName
Get-ChildItem -Recurse dist/en/duelverse-yugioh-duelos-online | Select-Object FullName
```

Expected: `dist/duelverse-yugioh-duelos-online/index.html` and `dist/en/duelverse-yugioh-duelos-online/index.html` exist.

- [ ] **Step 6: Inspect prerendered HTML**

```bash
Get-Content dist/en/duelverse-yugioh-duelos-online/index.html | Select-String -Pattern "<title>|<h1|hreflang|lang="
```

Expected: title and h1 are in English, html lang is `en`, and `hreflang` tags point to subpaths.

- [ ] **Step 7: Commit**

```bash
git add scripts/prerender.ts package.json
git commit -m "feat(build): add SSR prerender for public SEO pages and sitemap"
```

---

## Task 9: Update `robots.txt`

**Files:**
- Modify: `public/robots.txt`

- [ ] **Step 1: Ensure sitemap URL is present**

`public/robots.txt` should contain:

```txt
User-agent: *
Allow: /
Disallow: /admin

Sitemap: https://duelverse.site/sitemap.xml
```

If it already contains this, no change is needed.

- [ ] **Step 2: Commit**

```bash
git add public/robots.txt
git commit -m "chore(seo): ensure robots.txt references sitemap"
```

---

## Task 10: Expand SEO content on public pages

**Files:**
- Modify: `src/pages/Landing.tsx`, `src/pages/LandingSEO.tsx`, `src/pages/HowToPlayYugiohOnline.tsx`, `src/pages/DeckBuilderYugioh.tsx`, `src/pages/YugiohTournaments.tsx`, `src/pages/YugiohRemoteDuel.tsx`, `src/pages/DuelverseDiscord.tsx`

- [ ] **Step 1: Update `<SEOHead>` props per page**

For each page, ensure `SEOHead` receives optimized title/description/keywords. Example for `LandingSEO.tsx`:

```tsx
<SEOHead
  title="Yu-Gi-Oh Online — Duelos ao Vivo no Duelverse | Dueling Book Alternative"
  description="Jogue Yu-Gi-Oh online no Duelverse. Duelos remotos ao vivo com videochamada, matchmaking, torneios e ranking. Alternativa ao Dueling Book e Yu-Gi-Oh Omega."
  keywords="yugioh online, yu-gi-oh online, dueling book, yugioh omega, remote duel, yugioh remote duel, rush duel, ygo advanced, genesis, duelos yugioh, tcg online"
  path="/duelverse-yugioh-duelos-online"
  gameSchema
  breadcrumbs={[...]}
/>
```

Do the same for the other pages with relevant keywords.

- [ ] **Step 2: Expand page content**

For each page, add sections that naturally include target keywords. Suggested additions:

- **LandingSEO**: compare Duelverse vs Dueling Book vs Yu-Gi-Oh Omega; explain remote duel; list supported formats.
- **HowToPlayYugiohOnline**: step-by-step guide, equipment needed, rules overview, formats.
- **DeckBuilderYugioh**: how to build competitive decks, card ratios, extra deck tips, format-specific advice.
- **YugiohTournaments**: tournament types, prizes, schedule, how to register, bracket explanation.
- **YugiohRemoteDuel**: what is remote duel, camera setup, etiquette, Konami remote duel rules.
- **DuelverseDiscord**: community benefits, how to join, rules, language channels.

Keep each page between 800 and 2000 words. Use `<h2>` and `<h3>` with keywords. Add 2-4 internal links to other public pages per page.

- [ ] **Step 3: Commit content updates**

Commit each page separately or together:

```bash
git add src/pages/Landing.tsx src/pages/LandingSEO.tsx src/pages/HowToPlayYugiohOnline.tsx src/pages/DeckBuilderYugioh.tsx src/pages/YugiohTournaments.tsx src/pages/YugiohRemoteDuel.tsx src/pages/DuelverseDiscord.tsx
git commit -m "content(seo): expand public pages with yugioh keywords and internal links"
```

---

## Task 11: Verify full build and output

- [ ] **Step 1: Clean and rebuild**

```bash
Remove-Item -Recurse -Force dist
npm run build
```

Expected: build completes, prerender runs, `dist/sitemap.xml` is created.

- [ ] **Step 2: Check file counts**

```bash
(Get-ChildItem -Recurse dist -Filter index.html).Count
```

Expected: at least `7 public pages × 16 languages = 112` index.html files (plus the root SPA fallback).

- [ ] **Step 3: Validate sitemap**

```bash
Get-Content dist/sitemap.xml | Select-Object -First 20
```

Expected: XML with `<loc>` entries for all language subpaths.

- [ ] **Step 4: Run preview server**

```bash
npm run preview
```

In another terminal, fetch:

```bash
curl http://localhost:4173/en/duelverse-yugioh-duelos-online | grep -o "<title>.*</title>"
```

Expected: English title.

- [ ] **Step 5: Commit final verification fixes**

```bash
git add .
git commit -m "chore: verify SSG build and sitemap generation"
```

---

## Task 12: Update SPA fallback configs for language subpaths

**Files:**
- Modify: `vercel.json`, `public/_redirects`, `public/.htaccess`

- [ ] **Step 1: Confirm existing fallbacks already cover subpaths**

Existing configs likely rewrite `/*` to `index.html`. This also covers `/en/*`, `/es/*`, etc. No change needed if they are broad enough.

If any config explicitly lists routes, update it to include `/:lang/*` patterns.

- [ ] **Step 2: Commit if changed**

```bash
git add vercel.json public/_redirects public/.htaccess
git commit -m "chore(config): ensure SPA fallback covers language subpaths"
```

---

## Self-review checklist

- [ ] **Spec coverage:** every requirement from the design doc maps to a task.
  - Public pages only in navigation → Task 5
  - Language subpaths → Tasks 2, 3, 4
  - Static HTML generation → Tasks 6, 7, 8
  - SEO content → Task 10
  - Sitemap/indexing → Tasks 8, 9
- [ ] **Placeholder scan:** no TODO/TBD/fill-in details remain.
- [ ] **Type consistency:** `LocalizedRoute` props, `PublicPage` interface, and i18n resource types align across tasks.
- [ ] **No heavy browser deps in SSR:** public pages use `useEffect` for `window`/`document` access.

## Notes

- Ranking among the first results for generic terms like "yugioh" requires significant off-page SEO (backlinks, authority, time). This plan covers on-page and technical SEO; continue acquiring backlinks and social signals after deploy.
- After deploy, submit `https://duelverse.site/sitemap.xml` to Google Search Console and request indexing of the root domain.
