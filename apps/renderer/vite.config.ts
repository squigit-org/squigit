/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { stripAnimationQuotesPlugin } from "./plugins/strip-animation-quotes";

const platform = process.env.VITE_PLATFORM || "electron";

export default defineConfig({
  plugins: [react(), stripAnimationQuotesPlugin()],
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      allow: ["..", "../../shared"],
    },
  },
  envPrefix: ["VITE_", "ELECTRON_"],
  define: {
    __PLATFORM__: JSON.stringify(platform),
  },
  resolve: {
    alias: {
      "@squigit/core": path.resolve(__dirname, "../shared/packages/core/src"),
      "@squigit/react": path.resolve(
        __dirname,
        "../shared/packages/react/src",
      ),
      "@": path.resolve(__dirname, "./src"),
      "@platform": path.resolve(__dirname, `./src/platform/${platform}`),
    },
  },
  build: {
    minify: false,
    sourcemap: true,
  },
});
