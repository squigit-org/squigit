/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

export interface FallbackQueues {
  flash: string[];
  pro: string[];
  lite: string[];
}

let fallbackQueues: FallbackQueues = {
  flash: [],
  pro: [],
  lite: [],
};

export const setFallbackQueues = (queues: FallbackQueues) => {
  fallbackQueues = queues;
};

export const getFallbackQueues = (): FallbackQueues => fallbackQueues;

export const parseFallbackModels = (apiModels: any[]): FallbackQueues => {
  // 1. Filter out all the noise (previews, embeddings, vision-only, etc.)
  // We only want stable standard generation models.
  const stableChatModels = apiModels.filter(
    (m) =>
      m.supportedGenerationMethods?.includes("generateContent") &&
      !m.name.includes("preview") &&
      !m.name.includes("latest") && // Strict exclusion of latest so we don't retry 503s on latest
      !m.name.includes("embedding") &&
      m.name.startsWith("models/gemini-")
  );

  // 2. Separate into Lite, Flash, and Pro buckets
  const liteModels = stableChatModels.filter((m) => m.name.includes("-lite"));
  const flashModels = stableChatModels.filter(
    (m) => m.name.includes("-flash") && !m.name.includes("-lite")
  );
  const proModels = stableChatModels.filter((m) => m.name.includes("-pro"));

  // 3. Sort them descending by version number extracted from the name
  // This ensures the newest model is always at index 0
  const sortByVersionDesc = (a: any, b: any) => {
    const getVer = (name: string) => parseFloat(name.match(/[\d.]+/)?.[0] || "0");
    return getVer(b.name) - getVer(a.name);
  };

  flashModels.sort(sortByVersionDesc);
  proModels.sort(sortByVersionDesc);
  liteModels.sort(sortByVersionDesc);

  return {
    flash: flashModels.map((m) => m.name),
    pro: proModels.map((m) => m.name),
    lite: liteModels.map((m) => m.name),
  };
};
