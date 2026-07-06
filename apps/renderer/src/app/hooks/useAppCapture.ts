/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "@/platform";
import { commands } from "@/platform";
import { resolveOcrModelId } from "@squigit/core/config";
import {
  AUTO_OCR_DISABLED_MODEL_ID,
  cancelOcrJob,
  createThread,
  getImagePath,
  saveOcrData,
} from "@squigit/core/config";

export const useAppCapture = ({
  system,
  auth,
  threadHistory,
  ocr,
  dialogs,
  activeProfileRef,
  systemRef,
  threadHistoryRef,
  performSelectThread,
  performNewSession,
  closeMediaViewer,
  runWithBusyGuardRef,
  agreedToTermsRef,
  hasShownCaptureTerminalHintRef,
}: {
  system: any;
  auth: any;
  threadHistory: any;
  ocr: any;
  dialogs: any;
  activeProfileRef: React.MutableRefObject<any>;
  systemRef: React.MutableRefObject<any>;
  threadHistoryRef: React.MutableRefObject<any>;
  performSelectThread: (id: string) => Promise<void>;
  performNewSession: () => Promise<void>;
  closeMediaViewer: () => void;
  runWithBusyGuardRef: React.MutableRefObject<
    (action: () => void | Promise<void>) => void
  >;
  agreedToTermsRef: React.MutableRefObject<boolean>;
  hasShownCaptureTerminalHintRef: React.MutableRefObject<boolean>;
}) => {
  const [isCheckingImage, setIsCheckingImage] = useState(true);
  const [hasCheckedStartupImage, setHasCheckedStartupImage] = useState(false);

  const handleImageReady = useCallback(
    async (imageData: { imageId: string; path: string }) => {
      if (!activeProfileRef.current) {
        console.log("Image upload attempted in guest mode - requiring login");
        dialogs.setShowLoginRequiredDialog(true);
        return;
      }

      console.log("Raw image path:", imageData.path);
      closeMediaViewer();

      threadHistory.setActiveSessionId(null);
      threadHistory.setActiveSessionId(null);
      ocr.setOcrData({});
      ocr.setSessionLensUrl(null);

      systemRef.current.setSessionOcrLanguage(
        systemRef.current.ocrEnabled
          ? resolveOcrModelId(systemRef.current.startupOcrLanguage)
          : "",
      );
      ocr.setIsOcrScanning(false);
      cancelOcrJob();

      system.setStartupImage({
        path: imageData.path,
        mimeType: "image/png",
        imageId: imageData.imageId,
      });

      try {
        const newThread = await createThread(
          "New thread",
          imageData.imageId,
          systemRef.current.ocrEnabled
            ? resolveOcrModelId(systemRef.current.startupOcrLanguage)
            : null,
        );
        if (!systemRef.current.ocrEnabled) {
          await saveOcrData(newThread.id, AUTO_OCR_DISABLED_MODEL_ID, []);
        }
        threadHistory.setActiveSessionId(newThread.id);
        threadHistory.refreshThreads();
        console.log("Created new thread:", newThread.id);
      } catch (e) {
        console.error("Failed to create thread:", e);
      }
    },
    [
      activeProfileRef,
      threadHistory,
      closeMediaViewer,
      dialogs,
      ocr,
      system,
      systemRef,
    ],
  );

  const handleImageReadyRef = useRef(handleImageReady);
  const handleSelectThreadRef = useRef(performSelectThread);

  useEffect(() => {
    handleImageReadyRef.current = handleImageReady;
    handleSelectThreadRef.current = performSelectThread;
  }, [handleImageReady, performSelectThread]);

  useEffect(() => {
    if (
      !system.profileLoaded ||
      !system.prefsLoaded ||
      hasCheckedStartupImage
    ) {
      return;
    }

    const initStartupImage = async () => {
      try {
        const initialImage = await commands.getInitialImage();
        if (initialImage) {
          console.log("Found CLI image in state, loading...");
          handleImageReady({
            imageId: initialImage.hash,
            path: initialImage.path,
          });
        }
      } catch (e) {
        console.error("Failed to check initial image:", e);
      } finally {
        setIsCheckingImage(false);
        setHasCheckedStartupImage(true);
      }
    };

    initStartupImage();
  }, [
    handleImageReady,
    hasCheckedStartupImage,
    system.prefsLoaded,
    system.profileLoaded,
  ]);

  useEffect(() => {
    const unlisten = platform.listen<string>("image-path", async (payload) => {
      const imagePath = payload;
      if (!imagePath) return;

      if (!activeProfileRef.current) {
        console.log(
          "CLI/External image drop attempted in guest mode - requiring login",
        );
        dialogs.setShowLoginRequiredDialog(true);
        return;
      }

      try {
        console.log("Event received for image:", imagePath);
        const result = await commands.processImagePath(imagePath);
        handleImageReadyRef.current({
          imageId: result.hash,
          path: result.path,
        });
      } catch (error) {
        console.error("Failed to process CLI image event:", error);
      }
    });

    const unlistenLoadThread = platform.listen<string>(
      "load-thread",
      async (payload) => {
        const threadId = payload;
        if (!threadId) return;

        console.log("Triggering frontend transition to new capture:", threadId);
        await handleSelectThreadRef.current(threadId);
      },
    );

    const unlistenCaptureRequested = platform.listen(
      "capture-requested",
      () => {
        runWithBusyGuardRef.current(() => platform.invoke("spawn_capture"));
      },
    );

    const unlistenCapture = platform.listen<{
      threadId: string;
      imageHash: string;
    }>("capture-complete", async (payload) => {
      const { threadId, imageHash } = payload;
      console.log(
        "[capture-complete] threadId:",
        threadId,
        "imageHash:",
        imageHash,
      );

      try {
        if (!activeProfileRef.current) {
          console.log(
            "Capture upload attempted in guest mode - requiring login",
          );
          dialogs.setShowLoginRequiredDialog(true);
          return;
        }

        const imagePath = await getImagePath(imageHash);

        systemRef.current.setSessionThreadTitle(null);
        systemRef.current.setSessionOcrLanguage(
          systemRef.current.ocrEnabled
            ? resolveOcrModelId(systemRef.current.startupOcrLanguage)
            : "",
        );
        ocr.setOcrData({});
        ocr.setSessionLensUrl(null);
        ocr.setIsOcrScanning(false);
        cancelOcrJob();

        systemRef.current.setStartupImage({
          path: imagePath,
          mimeType: "image/png",
          imageId: imageHash,
        });

        threadHistoryRef.current.setActiveSessionId(null);

        await new Promise((resolve) => setTimeout(resolve, 10));

        threadHistoryRef.current.setActiveSessionId(threadId);
        if (!systemRef.current.ocrEnabled) {
          await saveOcrData(threadId, AUTO_OCR_DISABLED_MODEL_ID, []);
        }
        threadHistoryRef.current.refreshThreads();
      } catch (error) {
        console.error("[capture-complete] Failed:", error);
      }
    });

    const unlistenCaptureFailed = platform.listen<{ reason: string }>(
      "capture-failed",
      (payload) => {
        const { reason } = payload;
        if (reason === "User denied screen capture permission.") {
          dialogs.setShowCaptureDeniedDialog(true);
        } else {
          console.error("[capture-failed]", reason);
          if (!hasShownCaptureTerminalHintRef.current) {
            hasShownCaptureTerminalHintRef.current = true;
            console.warn(
              "[capture-failed] See VS Code terminal for detailed backend capture logs.",
            );
          }
        }
      },
    );

    const unlistenAuthSuccess = platform.listen<any>(
      "auth-success",
      async (payload) => {
        if (
          activeProfileRef.current &&
          payload &&
          activeProfileRef.current.id === payload.id
        ) {
          return;
        }

        await performNewSession();
        auth.login();
      },
    );

    return () => {
      unlisten.then((f) => f());
      unlistenLoadThread.then((f) => f());
      unlistenCaptureRequested.then((f) => f());
      unlistenCapture.then((f) => f());
      unlistenCaptureFailed.then((f) => f());
      unlistenAuthSuccess.then((f) => f());
    };
  }, [
    activeProfileRef,
    agreedToTermsRef,
    auth,
    threadHistoryRef,
    dialogs,
    hasShownCaptureTerminalHintRef,
    ocr,
    performNewSession,
    runWithBusyGuardRef,
    system,
    systemRef,
  ]);

  return {
    handleImageReady,
    isCheckingImage,
    hasCheckedStartupImage,
  };
};
