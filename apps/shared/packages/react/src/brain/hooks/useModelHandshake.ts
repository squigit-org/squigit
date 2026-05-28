/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { useEffect, useRef } from "react";
import { setFallbackQueues, parseFallbackModels } from "@squigit/core/config/models-cache";

export const useModelHandshake = (apiKey: string | null | undefined) => {
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!apiKey) return;

    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchModels = async () => {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (!response.ok) {
          console.warn("[Models] Failed to fetch models list from Google", response.status);
          return;
        }

        const data = await response.json();
        if (data && data.models && Array.isArray(data.models)) {
          const queues = parseFallbackModels(data.models);
          setFallbackQueues(queues);
          console.log("[Models] list updated");
        }
      } catch (e) {
        console.warn("[Models] Failed to parse models list", e);
      }
    };

    fetchModels();
  }, [apiKey]);
};
