/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const BASE = (sub: string = "github") => `https://${sub}.com/a7mddra/snapllm`;

export const github = {
  repo: BASE(),
  latestRelease: `${BASE()}/releases/latest`,
  rawChangelog: `${BASE("raw.githubusercontent")}/main/CHANGELOG.md`,
  issues: {
    base: `${BASE()}/issues`,
    new: (template: string = "bug_report.md") =>
      `${BASE()}/issues/new?template=${template}`,
  },
  license: `${BASE()}/blob/main/LICENSE`,
  docs: (path: string = "") => `${BASE()}/blob/main/docs/${path}`,
  privacy: `${BASE()}/blob/main/docs/06-policies/BYOK.md`,
  security: `${BASE()}/blob/main/docs/06-policies/SECURITY.md`,

  blob: (branch: string, path: string) => `${BASE()}/blob/${branch}/${path}`,
};
