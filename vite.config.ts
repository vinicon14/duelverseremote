import { defineConfig, loadEnv, type Plugin } from "vite";
import fs from "fs";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
/**
 * public/push-sw.js é copiado como arquivo estático; este plugin troca a URL e a
 * chave pública do Supabase pelos valores de VITE_SUPABASE_URL /
 * VITE_SUPABASE_PUBLISHABLE_KEY do ambiente do build (Vercel), para o service
 * worker de push sempre apontar para o mesmo projeto do app.
 */
function pushSwEnvPlugin(env: Record<string, string>): Plugin {
  return {
    name: "duelverse-push-sw-env",
    apply: "build",
    closeBundle() {
      const file = path.resolve(__dirname, "dist/push-sw.js");
      if (!fs.existsSync(file)) return;
      const url = env.VITE_SUPABASE_URL;
      const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) return;
      let src = fs.readFileSync(file, "utf8");
      src = src
        .replace(/const SUPABASE_URL = '[^']*';/, `const SUPABASE_URL = ${JSON.stringify(url)};`)
        .replace(/const SUPABASE_ANON_KEY = '[^']*';/, `const SUPABASE_ANON_KEY = ${JSON.stringify(key)};`);
      fs.writeFileSync(file, src);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  plugins: [
    react(),
    pushSwEnvPlugin(env),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "robots.txt"],
      devOptions: {
        enabled: true,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        globIgnores: ["**/push-sw.js"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/],
        importScripts: ['/push-sw.js'],
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
        ],
      },
      manifest: {
        id: "/",
        name: "Duelverse - Duelos de Yu-Gi-Oh ao Vivo",
        short_name: "Duelverse",
        description: "Plataforma de duelos de Yu-Gi-Oh ao vivo com chamadas de vídeo. YGO Advanced, Rush Duel e Genesis.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["games", "entertainment"],
        icons: [
          { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
          { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
          { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
          { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
          { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [
          {
            src: "/screenshot-narrow.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow",
            label: "Duelverse - Tela inicial",
          },
          {
            src: "/screenshot-wide.png",
            sizes: "1920x1080",
            type: "image/png",
            form_factor: "wide",
            label: "Duelverse - Tela inicial Desktop",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
