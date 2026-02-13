/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { OnboardingShell } from "@/shell/containers";
import { ChatBubble } from "@/features/chat";
import { usePlatform } from "@/hooks";
import { Message } from "@/features/chat/types";
import { useShellContext } from "@/shell/context";

import styles from "./Agreement.module.css";

import linux from "@/assets/instructions/linux.md?raw";
import macos from "@/assets/instructions/macos.md?raw";
import windows from "@/assets/instructions/windows.md?raw";

const INSTRUCTIONS: Record<string, string> = {
  linux,
  macos,
  windows,
};

export const Agreement: React.FC = () => {
  const { isMac, isWin } = usePlatform();
  const shell = useShellContext();

  const content = useMemo(() => {
    if (isMac) return INSTRUCTIONS.macos;
    if (isWin) return INSTRUCTIONS.windows;
    return INSTRUCTIONS.linux;
  }, [isMac, isWin]);

  const message: Message = {
    id: "welcome-intro",
    role: "system",
    text: content,
    timestamp: Date.now(),
    actions: [
      {
        type: "radio",
        id: "agree",
        label: "I have read and understand the instructions",
        group: "agreement",
      },
      {
        type: "radio",
        id: "disagree",
        label: "I do not understand",
        group: "agreement",
        selected: true,
      },
    ],
  };

  return (
    <OnboardingShell allowScroll contentClassName={styles.content}>
      <div className={styles.inner}>
        <ChatBubble message={message} onAction={shell.handleSystemAction} />
      </div>
    </OnboardingShell>
  );
};
