# Design: SSG + Multilingual SEO for Duelverse Public Pages

## Goal
Make Duelverse public landing/SEO pages crawlable as static HTML, serve them under language subpaths, improve on-page SEO for Yu-Gi-Oh-related keywords, and ensure Google discovers/indexes all public pages automatically once the domain is submitted.

## Scope
### Public pages (no login required)
- `/` (landing)
- `/duelverse-yugioh-duelos-online`
- `/como-jogar-yugioh-online`
- `/deck-builder-yugioh`
- `/torneios-yugioh-online`
- `/yugioh-remote-duel`
- `/duelverse-discord`

These are the only pages shown in the public "Navegue pelo Duelverse" navigation section.

### Out of scope
- Routes that require authentication (`/duels`, `/matchmaking`, `/ranking`, `/friends`, `/store`, `/deck-builder`, etc.) remain inside the authenticated app and are not prerendered.

## URL Structure
- Default (pt-BR): `/duelverse-yugioh-duelos-online/`
- Localized: `/en/duelverse-yugioh-duelos-online/`, `/es/...`, `/fr/...`, `/ja/...`
- `hreflang` alternates point to the language subpaths.
- `x-default` points to the default URL.

## Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   vite build    │────▶│ scripts/prerender.ts │────▶│ dist/           │
│  (bundle SPA)   │     │  SSR render of     │     │  static HTML    │
└─────────────────┘     │  public routes ×   │     │  per route/lang │
                        │  languages         │     └─────────────────┘
                        └──────────────────┘
```

1. `vite build` produces the SPA bundle.
2. `scripts/prerender.ts` runs in Node with `tsx` and a `happy-dom` environment.
3. For each public route and supported language, the script:
   - Creates an isolated i18n instance set to the target language.
   - Renders the page component with `StaticRouter`, `I18nextProvider`, and `HelmetProvider`.
   - Extracts rendered body HTML and `<head>` tags from Helmet context.
   - Injects both into a copy of `dist/index.html`.
   - Writes `dist/<route>/index.html` for the default language and `dist/<lang>/<route>/index.html` for localized versions.
4. React Router serves the same components on both default and `/:lang/<route>` client routes.

## Components & Files

### New files
- `scripts/prerender.ts` — SSG build step.
- `src/components/LocalizedRoute.tsx` — wrapper that reads `lang` param and calls `i18n.changeLanguage`.

### Modified files
- `package.json` — adds `tsx` and `happy-dom` dev dependencies; updates `build` script to run prerender.
- `src/components/SEOLinksSection.tsx` — filters links to only public pages.
- `src/components/SEOHead.tsx` — updates `hreflang` to use language subpaths.
- `src/App.tsx` — adds `/:lang/<public-route>` routes for every public page.
- `src/pages/Landing.tsx` and SEO pages — expands content and keyword coverage.
- `public/sitemap.xml` — lists every public URL × language.
- `public/robots.txt` — references sitemap.

## Data Flow / Build Flow
1. Developer runs `npm run build`.
2. Vite emits `dist/index.html` and bundled assets.
3. Prerender script reads `dist/index.html` as template.
4. For each `(route, language)` pair:
   - Render page to string.
   - Extract helmet data.
   - Replace `<title>` and meta tags in template.
   - Inject rendered body into `<div id="root">`.
   - Write output file.
5. `dist/` now contains both SPA entry and static route HTML files.

## Error Handling
- If a page component throws during SSR, the script logs the route/language and skips it; build fails with non-zero exit code.
- `happy-dom` provides browser globals so existing i18n/browser code does not crash in Node.
- Public pages must not reference `window`/`document` during initial render. Any such code is guarded or moved into `useEffect`.

## Testing
- `npm run build` completes without errors.
- `dist/<route>/index.html` contains the expected `<h1>`, meta description, and canonical link.
- `dist/en/<route>/index.html` differs from `dist/<route>/index.html` in language and `hreflang` tags.
- `npm run preview` serves static files; visiting `/en/duelverse-yugioh-duelos-online` renders the correct language.
- `SEOLinksSection` no longer contains authenticated routes.

## SEO Strategy
### Keyword targets per page
- Landing SEO: "yugioh online", "duelos yugioh", "dueling book", "yugioh omega", "remote duel"
- HowToPlay: "como jogar yugioh online", "yugioh remote duel", "tutorial yugioh"
- DeckBuilder: "deck builder yugioh", "montar deck yugioh", "ygo advanced", "rush duel deck"
- Tournaments: "torneios yugioh online", "campeonatos yugioh", "yugioh ao vivo"
- RemoteDuel: "yugioh remote duel", "remote duel", "duelos remotos yugioh"
- Discord: "discord yugioh", "yugioh discord", "comunidade yugioh"

### Tactics
- Unique `<title>` and `<meta name="description">` per page/language.
- Single `<h1>` with primary keyword per page.
- 800-2000 words of semantically related content per page.
- Internal links between public pages with descriptive anchor text.
- Schema.org `VideoGame`, `WebSite`, and `BreadcrumbList` JSON-LD.
- Sitemap with alternates/locales submitted to Google Search Console.

## Deployment Notes
- The host must serve `index.html` for unknown paths (existing SPA fallback already configured in `vercel.json`, `_redirects`, `.htaccess`).
- New language subpaths (`/en/...`, `/es/...`) must also fallback to `index.html` so React Router hydrates correctly.
- After deploy, submit `https://duelverse.site/sitemap.xml` to Google Search Console.
