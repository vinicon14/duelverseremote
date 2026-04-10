

## Plan: Ranking shows only user's TCG + platform consistency audit

### 1. Ranking page — remove TCG tabs, use only `activeTcg`

The Ranking page currently has tabs (YGO/MTG/PKM) allowing users to browse other TCGs' rankings. Since each account now has only one TCG, this switcher is unnecessary.

**Changes to `src/pages/Ranking.tsx`:**
- Remove the `selectedTcg` state and `Tabs` component
- Use `activeTcg` from `useTcg()` directly to fetch rankings
- Remove unused imports (`Tabs`, `TabsList`, `TabsTrigger`, `useState` for selectedTcg)
- Title and subtitle use `activeTcg` instead of `selectedTcg`

### 2. Platform consistency audit

Since the app is a single React codebase served via:
- **Web (mobile/desktop)** — same bundle via Vite
- **PWA (installed)** — same bundle, cached via service worker
- **Capacitor native (Android)** — loads from `https://duelverse.site` (same deployed bundle)
- **Electron desktop** — loads the same web app

All platforms render the exact same React code. The recent changes (single profile per account, TcgSwitcher as static badge, profile-select cleanup) apply uniformly because they are all client-side React changes. No platform-specific code paths bypass these changes.

**Verification points — no issues found:**
- `TcgSwitcher.tsx` — already converted to static badge (no switching)
- `TcgContext.tsx` — `setActiveTcg` still exposed but only used internally during login/profile-select; no UI allows switching
- `Navbar.tsx` — imports `TcgSwitcher` which is now static
- `capacitor.config.json` — points to `duelverse.site`, will get updates when deployed
- `electron/main.cjs` — loads the web app, gets same code
- No platform-specific conditional rendering that would show old switcher behavior

**Conclusion:** All platforms are consistent. Only the Ranking page needs updating.

### Technical details

Single file change in `src/pages/Ranking.tsx`:
- Remove `useState` for `selectedTcg`, remove `Tabs` imports
- Replace all `selectedTcg` references with `activeTcg`
- Remove the `<Tabs>` block entirely

