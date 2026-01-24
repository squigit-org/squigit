/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const SIZES = {
  ONBOARDING: { w: 800, h: 600 },
  CHAT: { w: 1020, h: 670 },
};

export const useWindowManager = (
  isChatActive: boolean,
  isAuthPending: boolean,
  isAgreementPending: boolean,
  isUpdatePending: boolean,
  isLoading: boolean,
  isImageMissing: boolean,
) => {
  const prevModeRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const adjustWindow = async () => {
      const isOnboardingPage =
        !isChatActive || isAuthPending || isAgreementPending || isUpdatePending;

      const isWelcomeScreen =
        isImageMissing && !isAgreementPending && !isUpdatePending;

      const targetMode =
        isOnboardingPage && !isWelcomeScreen ? "ONBOARDING" : "CHAT";

      // If mode hasn't changed, don't resize (prevents resetting user resizing/movement)
      if (prevModeRef.current === targetMode) {
        return;
      }

      const target =
        targetMode === "ONBOARDING" ? SIZES.ONBOARDING : SIZES.CHAT;

      try {
        console.log(`Resizing window to ${targetMode} mode:`, target);
        await invoke("resize_window", {
          width: target.w,
          height: target.h,
          show: true,
        });
        prevModeRef.current = targetMode;
      } catch (e) {
        console.error("Failed to resize window:", e);
      }
    };

    adjustWindow();
  }, [
    isChatActive,
    isAuthPending,
    isAgreementPending,
    isUpdatePending,
    isLoading,
    isImageMissing,
  ]);
};
