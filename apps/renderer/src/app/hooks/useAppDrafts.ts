/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import {
  DEFAULT_MODEL_EFFORT,
  DEFAULT_MODEL_ID,
  type ModelEffort,
  type ModelId,
} from "@squigit/core/config";

export const useAppDrafts = () => {
  const [input, setInput] = useState("");
  const [imageInput, setImageInput] = useState("");
  const [inputModel, setInputModel] = useState<ModelId>(DEFAULT_MODEL_ID);
  const [inputEffort, setInputEffort] =
    useState<ModelEffort>(DEFAULT_MODEL_EFFORT);

  return {
    input,
    setInput,
    imageInput,
    setImageInput,
    inputModel,
    setInputModel,
    inputEffort,
    setInputEffort,
  };
};
