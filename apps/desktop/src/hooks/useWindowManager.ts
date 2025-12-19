/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const SIZES = {
  ONBOARDING: { w: 800, h: 600 },
  CHAT: { w: 940, h: 680 },
};

export const useWindowManager = (
  isChatActive: boolean,
  isAuthPending: boolean,
  isAgreementPending: boolean,
  isUpdatePending: boolean,
  isLoading: boolean
) => {
  useEffect(() => {
    if (isLoading) return;

    const adjustWindow = async () => {
      const isOnboardingPage =
        !isChatActive || isAuthPending || isAgreementPending || isUpdatePending;

      const target = isOnboardingPage ? SIZES.ONBOARDING : SIZES.CHAT;

      try {
        console.log(
          `Resizing window to ${
            isOnboardingPage ? "Onboarding" : "Chat"
          } mode:`,
          target
        );
        await invoke("resize_window", {
          width: target.w,
          height: target.h,
          show: true,
        });
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
  ]);
};
