import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// DV_SRC lets the same harness run against another checkout (baseline A/B).
const src = process.env.DV_SRC ? path.resolve(process.env.DV_SRC) : path.resolve(__dirname, "../../src");

export default defineConfig({
  root: path.resolve(__dirname, "harness"),
  plugins: [react()],
  resolve: {
    // Single React copy even when DV_SRC points at another checkout.
    dedupe: ["react", "react-dom", "@radix-ui/react-popover", "@radix-ui/react-select"],
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.resolve(__dirname, "harness/fakeSupabase.ts") },
      { find: /^@\//, replacement: src + "/" },
    ],
  },
  build: { outDir: process.env.DV_OUT ?? path.resolve(__dirname, ".harness-dist"), emptyOutDir: true, target: "esnext" },
  logLevel: "warn",
});
