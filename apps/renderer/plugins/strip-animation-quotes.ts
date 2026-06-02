/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Plugin } from "vite";

/**
 * A Vite plugin to resolve a discrepancy between WebKit (Tauri) and Chromium (Electron).
 * 
 * The project convention uses quoted animation names (e.g. `animation: "rotate"`) to
 * prevent CSS Modules from scoping global animations. WebKit (Safari/Tauri) allows
 * quotes in the animation property, but Chromium strictly enforces the CSS spec
 * and ignores quoted animations.
 * 
 * This plugin strips the quotes from the `animation` property *after* all CSS Modules
 * processing is complete, ensuring the browser receives valid CSS while preserving
 * the project's source code conventions.
 */
export function stripAnimationQuotesPlugin(): Plugin {
  return {
    name: "strip-animation-quotes",
    enforce: "post",
    transform(code, id) {
      // In dev mode, CSS is often served as a JS module wrapping the CSS string.
      // We catch both the raw CSS and the escaped JS string versions.
      if (
        id.endsWith(".css") ||
        id.includes("?vue&type=style") ||
        id.includes("?module")
      ) {
        return {
          code: code
            .replace(/animation:\s*\\"([^"\\]+)\\"/g, "animation: $1")
            .replace(/animation:\s*"([^"]+)"/g, "animation: $1"),
        };
      }
    },
    generateBundle(_, bundle) {
      // In production builds, we process the final extracted CSS assets
      for (const key in bundle) {
        const asset = bundle[key];
        if (asset.type === "asset" && asset.fileName.endsWith(".css")) {
          if (typeof asset.source === "string") {
            asset.source = asset.source.replace(
              /animation:\s*"([^"]+)"/g,
              "animation: $1"
            );
          } else if (asset.source instanceof Uint8Array) {
            const dec = new TextDecoder("utf-8");
            let str = dec.decode(asset.source);
            str = str.replace(/animation:\s*"([^"]+)"/g, "animation: $1");
            asset.source = new TextEncoder().encode(str);
          }
        }
      }
    },
  };
}
