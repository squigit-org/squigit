/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const BASE = (sub: string) => `https://${sub}.google.com`;

export const google = {
  base: BASE("www"),
  lens: BASE("lens"),
  search: BASE("www"),
  translate: BASE("translate"),
  aiStudio: {
    dashboard: BASE("aistudio"),
    key: `${BASE("aistudio")}/app/apikey`,
  },
  support: BASE("support"),
};
