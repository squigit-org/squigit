/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelAttemptPlan } from "../../../config/models-config";
import { generateGeminiThreadTitle } from "./commands";

export async function generateProviderTitle(
  apiKey: string,
  text: string,
  modelCandidates: ModelAttemptPlan,
): Promise<string> {
  if (!apiKey || !text || modelCandidates.length === 0) return "New thread";

  try {
    return (
      (await generateGeminiThreadTitle(apiKey, modelCandidates, text)) ||
      "New thread"
    );
  } catch (error) {
    console.warn("[BrainTitle] Title generation failed:", error);
    return "New thread";
  }
}
