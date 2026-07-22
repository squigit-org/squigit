/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { generateBrainTitle } from "@squigit/core/brain/provider";
import type { ModelAttemptPlan } from "@squigit/core/config";

interface UseBrainTitleProps {
  apiKey: string;
}

export const useBrainTitle = ({ apiKey }: UseBrainTitleProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateTitleForText = useCallback(
    async (
      text: string,
      modelCandidates: ModelAttemptPlan,
    ): Promise<string> => {
      if (!apiKey || !text) return "New thread";

      setIsGenerating(true);

      try {
        return await generateBrainTitle(apiKey, text, modelCandidates);
      } catch (error) {
        console.error("Failed to generate title:", error);
        return "New thread";
      } finally {
        setIsGenerating(false);
      }
    },
    [apiKey],
  );

  return {
    isGeneratingTitle: isGenerating,
    generateTitleForText,
  };
};
