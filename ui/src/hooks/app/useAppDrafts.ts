/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { ModelType } from "@/lib";

export const useAppDrafts = (activeSessionId: string | null) => {
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});
  const [imageDrafts, setImageDrafts] = useState<Record<string, string>>({});
  const [inputModel, setInputModel] = useState<string>(
    ModelType.GEMINI_2_5_FLASH,
  );

  const activeDraftId = activeSessionId || "new_session";

  const input = chatDrafts[activeDraftId] || "";
  const setInput = (val: string) => {
    setChatDrafts((prev) => ({ ...prev, [activeDraftId]: val }));
  };

  const imageInput = imageDrafts[activeDraftId] || "";
  const setImageInput = (val: string) => {
    setImageDrafts((prev) => ({ ...prev, [activeDraftId]: val }));
  };

  return {
    input,
    setInput,
    imageInput,
    setImageInput,
    inputModel,
    setInputModel,
  };
};
