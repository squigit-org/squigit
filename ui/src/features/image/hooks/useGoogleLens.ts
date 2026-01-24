/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { uploadToImgBB, generateLensUrl } from "..";

export const useGoogleLens = (
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null,
  cachedUrl: string | null,
  setCachedUrl: (url: string) => void,
) => {
  const [isLensLoading, setIsLensLoading] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);

  const imageRef = useRef(startupImage);
  useEffect(() => {
    imageRef.current = startupImage;
  }, [startupImage]);

  const getRealBase64 = async (img: {
    base64: string;
    isFilePath?: boolean;
  }) => {
    if (img.isFilePath) {
      try {
        const response = await fetch(img.base64);
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error("Failed to fetch local asset:", e);
        throw e;
      }
    }
    return img.base64;
  };

  const runLensSearch = async (imgData: string, key: string) => {
    try {
      setIsLensLoading(true);
      if (cachedUrl) {
        await invoke("open_external_url", { url: cachedUrl });
        setIsLensLoading(false);
        return;
      }

      const publicUrl = await uploadToImgBB(imgData, key);
      const lensUrl = generateLensUrl(publicUrl);

      setCachedUrl(lensUrl);
      await invoke("open_external_url", { url: lensUrl });
    } finally {
      setIsLensLoading(false);
    }
  };

  useEffect(() => {
    if (!waitingForKey) return;

    const unlistenKeyPromise = listen<{ provider: string; key: string }>(
      "clipboard-text",
      async (event) => {
        const { provider, key } = event.payload;
        if (provider === "imgbb") {
          setWaitingForKey(false);
          invoke("close_imgbb_window");
          if (imageRef.current) {
            const realBase64 = await getRealBase64(imageRef.current);
            await runLensSearch(realBase64, key);
          }
        }
      },
    );

    const unlistenClosePromise = listen<void>("imgbb-popup-closed", () => {
      console.log("Setup window closed without key");
      setWaitingForKey(false);
    });

    return () => {
      unlistenKeyPromise.then((f) => f());
      unlistenClosePromise.then((f) => f());
    };
  }, [waitingForKey]);

  const triggerLens = async (searchQuery?: string) => {
    if (!startupImage) return;
    if (isLensLoading || waitingForKey) return;

    // Helper to append query to URL
    const appendQuery = (url: string, query?: string) => {
      if (!query || !query.trim()) return url;
      const encodedQuery = encodeURIComponent(query.trim());
      return `${url}&q=${encodedQuery}`;
    };

    if (cachedUrl) {
      const finalUrl = appendQuery(cachedUrl, searchQuery);
      await invoke("open_external_url", { url: finalUrl });
      return;
    }

    try {
      setIsLensLoading(true);
      const apiKey = await invoke<string>("get_api_key", { provider: "imgbb" });

      if (apiKey) {
        const realBase64 = await getRealBase64(startupImage);
        setIsLensLoading(true);

        const publicUrl = await uploadToImgBB(realBase64, apiKey);
        const lensUrl = generateLensUrl(publicUrl);

        setCachedUrl(lensUrl);
        const finalUrl = appendQuery(lensUrl, searchQuery);
        await invoke("open_external_url", { url: finalUrl });
        setIsLensLoading(false);
      } else {
        await invoke("open_imgbb_window");
        setWaitingForKey(true);
        setIsLensLoading(false);
      }
    } catch (error) {
      console.error("Lens Trigger Error:", error);
      setIsLensLoading(false);
      setWaitingForKey(false);
    }
  };

  return {
    isLensLoading: isLensLoading || waitingForKey,
    triggerLens,
  };
};
