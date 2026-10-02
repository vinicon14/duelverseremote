import { defineConfig } from "vitest/config";
import path from "path";

// Separate from vite.config.ts so unit tests do not load the PWA/tagger plugins.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "jsdom",
  },
});
