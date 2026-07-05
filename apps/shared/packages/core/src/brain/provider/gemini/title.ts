/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateGeminiThreadTitle } from "./commands";
import { GEMINI_TITLE_MODEL_PRIMARY, GEMINI_TITLE_MODEL_RETRY } from "./models";

export async function generateProviderTitle(
  apiKey: string,
  text: string,
): Promise<string> {
  if (!apiKey || !text) return "New thread";

  try {
    const title = await generateGeminiThreadTitle(
      apiKey,
      GEMINI_TITLE_MODEL_PRIMARY,
      text,
    );

    console.log(`[BrainTitle] Selected Model: ${GEMINI_TITLE_MODEL_PRIMARY}`);
    console.log(
      `[BrainTitle] Generated Thread Title: "${title || "New thread"}"`,
    );
    return title || "New thread";
  } catch (primaryError: any) {
    console.warn(
      `[BrainTitle] Failed with primary model: ${
        primaryError?.message || primaryError
      }`,
    );

    try {
      const fallbackTitle = await generateGeminiThreadTitle(
        apiKey,
        GEMINI_TITLE_MODEL_RETRY,
        text,
      );

      console.log(
        `[BrainTitle] Selected Model: ${GEMINI_TITLE_MODEL_RETRY} (Retry)`,
      );
      console.log(
        `[BrainTitle] Generated Thread Title: "${fallbackTitle || "New thread"}"`,
      );
      return fallbackTitle || "New thread";
    } catch (fallbackError: any) {
      console.warn(
        `[BrainTitle] Failed with fallback model: ${
          fallbackError?.message || fallbackError
        }`,
      );
      return "New thread";
    }
  }
}
