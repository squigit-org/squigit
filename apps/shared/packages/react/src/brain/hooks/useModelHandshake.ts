/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { useEffect } from "react";
import {
  commitModelDiscovery,
  setActiveModelDiscoveryKey,
  type GoogleModelDescriptor,
} from "@squigit/core/config";

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;
const STEADY_RETRY_DELAY_MS = 60_000;

const waitForRetry = (delayMs: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });

const fetchAllGoogleModels = async (
  apiKey: string,
  signal: AbortSignal,
): Promise<GoogleModelDescriptor[]> => {
  const models: GoogleModelDescriptor[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Google model discovery failed (${response.status})`);
    }

    const page = (await response.json()) as {
      models?: GoogleModelDescriptor[];
      nextPageToken?: string;
    };
    if (Array.isArray(page.models)) models.push(...page.models);
    pageToken = page.nextPageToken?.trim() || undefined;
  } while (pageToken && !signal.aborted);

  return models;
};

export const useModelHandshake = (apiKey: string | null | undefined) => {
  useEffect(() => {
    const activeKey = apiKey?.trim() || null;
    setActiveModelDiscoveryKey(activeKey);
    if (!activeKey) return;

    const controller = new AbortController();

    const discover = async () => {
      let failureCount = 0;

      while (!controller.signal.aborted) {
        try {
          const models = await fetchAllGoogleModels(
            activeKey,
            controller.signal,
          );
          if (controller.signal.aborted) return;

          commitModelDiscovery(activeKey, models);
          console.log("[Models] Stable Flash queues updated");
          return;
        } catch (error) {
          if (controller.signal.aborted) return;

          console.warn("[Models] Discovery failed; retrying", error);
          const delayMs =
            RETRY_DELAYS_MS[failureCount] ?? STEADY_RETRY_DELAY_MS;
          failureCount += 1;
          await waitForRetry(delayMs, controller.signal);
        }
      }
    };

    void discover();
    return () => controller.abort();
  }, [apiKey]);
};
