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
  const [selected, setSelected] = React.useState("disagree");

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
  };

  const handleSelection = (value: string) => {
    setSelected(value);
    shell.handleSystemAction(value, value);
  };

  return (
    <OnboardingShell allowScroll contentClassName={styles.content}>
      <div className={styles.inner}>
        <ChatBubble message={message} />
        <div className={styles.actions}>
          <label
            className={`${styles.radioAction} ${
              selected === "agree" ? styles.radioSelected : ""
            }`}
          >
            <input
              type="radio"
              name="agreement"
              checked={selected === "agree"}
              onChange={() => handleSelection("agree")}
              className={styles.radioInput}
            />
            <span>I have read and understand the instructions</span>
          </label>
          <label
            className={`${styles.radioAction} ${
              selected === "disagree" ? styles.radioSelected : ""
            }`}
          >
            <input
              type="radio"
              name="agreement"
              checked={selected === "disagree"}
              onChange={() => handleSelection("disagree")}
              className={styles.radioInput}
            />
            <span>I do not understand</span>
          </label>
        </div>
      </div>
    </OnboardingShell>
  );
};
