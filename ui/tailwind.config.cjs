/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        neutral: {
          100: "var(--c-raw-000)",
          150: "var(--c-raw-001)",
          200: "var(--c-raw-002)",
          300: "var(--c-raw-003)",
          400: "var(--c-raw-004)",
          500: "var(--c-raw-005)",
          550: "var(--c-raw-006)",
          800: "var(--c-raw-010)",
          850: "var(--c-raw-011)",
          "800-60": "rgba(51, 51, 51, 0.6)",
          "800-80": "rgba(51, 51, 51, 0.8)",
          900: "var(--c-raw-012)",
          "900-70": "rgba(26, 26, 26, 0.7)",
          "900-80": "rgba(26, 26, 26, 0.8)",
          950: "var(--c-raw-013)",
          "950-95": "rgba(10, 10, 10, 0.95)",
        },
        black: {
          "500-30": "var(--c-raw-037)",
          "500-60": "var(--c-raw-038)",
          "500-20": "var(--c-raw-039)",
        },
        red: {
          200: "var(--c-raw-024)",
          "900-50": "var(--c-raw-025)",
          "500-60": "var(--c-raw-026)",
        },
        dialogWarning: "var(--c-raw-027)",
        brand: {
          primary: "var(--c-raw-030)",
        },
        effects: {
          glow: "var(--c-raw-023)",
          overlay: "var(--c-raw-022)",
        },
        lens: {
          svg: "var(--c-raw-031)",
          hover: "var(--c-raw-032)",
          "border-c1": "var(--c-raw-033)",
          "border-c2": "var(--c-raw-034)",
          "border-c3": "var(--c-raw-035)",
        },
      },
    },
  },
  plugins: [],
};
