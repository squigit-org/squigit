/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { uploadToImgBB, generateLensUrl } from "../services/lens.google";

export const useLens = (
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null,
  cachedUrl: string | null,
  setCachedUrl: (url: string) => void
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

  useEffect(() => {
    if (!startupImage || cachedUrl) return;

    const prefetchLensUrl = async () => {
      try {
        const apiKey = await invoke<string>("get_api_key", {
          provider: "imgbb",
        });
        if (apiKey) {
          console.log("Background: Uploading to ImgBB...");
          const realBase64 = await getRealBase64(startupImage);
          const publicUrl = await uploadToImgBB(realBase64, apiKey);
          const url = generateLensUrl(publicUrl);
          setCachedUrl(url);
        }
      } catch (e) {}
    };
    prefetchLensUrl();
  }, [startupImage, cachedUrl]);

  const runLensSearch = async (imgData: string, key: string) => {
    try {
      setIsLensLoading(true);
      if (cachedUrl) {
        await invoke("open_external_url", { url: cachedUrl });
        setIsLensLoading(false);
        return;
      }

      // Check if imgData looks like a URL (asset://) and fetch if needed,
      // but simpler to rely on caller passing real base64.
      // However, triggerLens calls this with startupImage.base64 which might be asset URL.
      // So we should handle it here or ensure caller does.
      // Let's rely on caller (triggerLens and listener).

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
      }
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

  const triggerLens = async () => {
    if (!startupImage) return;
    if (isLensLoading || waitingForKey) return;

    if (cachedUrl) {
      await invoke("open_external_url", { url: cachedUrl });
      return;
    }

    try {
      setIsLensLoading(true);
      const apiKey = await invoke<string>("get_api_key", { provider: "imgbb" });

      if (apiKey) {
        const realBase64 = await getRealBase64(startupImage);
        await runLensSearch(realBase64, apiKey);
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
