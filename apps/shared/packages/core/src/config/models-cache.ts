/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

const BOOTSTRAP_LITE_MODEL = "models/gemini-flash-lite-latest";

export interface GoogleModelDescriptor {
  name?: string;
  supportedGenerationMethods?: string[];
}

export interface ModelDiscoveryQueues {
  flash: readonly string[];
  lite: readonly string[];
}

interface RegistryEntry {
  apiKey: string;
  successful: boolean;
  queues: ModelDiscoveryQueues;
}

let activeEntry: RegistryEntry | null = null;

export const setActiveModelDiscoveryKey = (apiKey: string | null) => {
  const nextApiKey = apiKey?.trim() || null;
  if (!nextApiKey) {
    activeEntry = null;
    return;
  }
  if (activeEntry?.apiKey === nextApiKey) return;
  activeEntry = {
    apiKey: nextApiKey,
    successful: false,
    queues: { flash: [], lite: [] },
  };
};

export const commitModelDiscovery = (
  apiKey: string,
  models: readonly GoogleModelDescriptor[],
) => {
  if (activeEntry?.apiKey !== apiKey) return;
  activeEntry = {
    apiKey,
    successful: true,
    queues: parseDiscoveredModels(models),
  };
};

export const getModelDiscoverySnapshot = (): ModelDiscoveryQueues => {
  if (!activeEntry?.successful) {
    return { flash: [], lite: [BOOTSTRAP_LITE_MODEL] };
  }

  return {
    flash: [...activeEntry.queues.flash],
    lite:
      activeEntry.queues.lite.length > 0
        ? [...activeEntry.queues.lite]
        : [BOOTSTRAP_LITE_MODEL],
  };
};

type StableModel = {
  name: string;
  family: number[];
  kind: "flash" | "lite";
  canonical: boolean;
};

const STABLE_FLASH_MODEL =
  /^models\/gemini-(\d+(?:\.\d+)+)-flash(-lite)?(?:-(\d{3}))?$/u;

const parseStableModel = (
  model: GoogleModelDescriptor,
): StableModel | null => {
  if (!model.supportedGenerationMethods?.includes("generateContent")) {
    return null;
  }

  const name = model.name?.toLowerCase() ?? "";
  if (
    !name ||
    /(?:latest|preview|experimental|\bexp\b|image|live|audio|tts)/u.test(name)
  ) {
    return null;
  }

  const match = STABLE_FLASH_MODEL.exec(name);
  if (!match) return null;

  return {
    name,
    family: match[1].split(".").map(Number),
    kind: match[2] ? "lite" : "flash",
    canonical: !match[3],
  };
};

const compareFamilies = (left: number[], right: number[]) => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

export const parseDiscoveredModels = (
  models: readonly GoogleModelDescriptor[],
): ModelDiscoveryQueues => {
  const equivalentFamilies = new Map<string, StableModel>();

  for (const descriptor of models) {
    const candidate = parseStableModel(descriptor);
    if (!candidate) continue;

    const familyKey = `${candidate.kind}:${candidate.family.join(".")}`;
    const existing = equivalentFamilies.get(familyKey);
    if (!existing || (candidate.canonical && !existing.canonical)) {
      equivalentFamilies.set(familyKey, candidate);
    }
  }

  const sorted = [...equivalentFamilies.values()].sort((left, right) => {
    const familyOrder = compareFamilies(left.family, right.family);
    return familyOrder !== 0 ? familyOrder : left.name.localeCompare(right.name);
  });

  return {
    flash: sorted.filter(({ kind }) => kind === "flash").map(({ name }) => name),
    lite: sorted.filter(({ kind }) => kind === "lite").map(({ name }) => name),
  };
};
