/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { OnboardingShell } from "@/shell/containers";
import { ChatBubble } from "@/features/chat";
import { useShellContext } from "@/shell/context";
import { getPendingUpdate } from "@/hooks/useUpdateCheck";
import { Message } from "@/features/chat/types";
import styles from "./UpdateNotes.module.css";

export const UpdateNotes: React.FC = () => {
  const shell = useShellContext();
  const update = useMemo(() => getPendingUpdate(), []);

  if (!update) {
    return (
      <OnboardingShell>
        <div style={{ color: "#71717a" }}>You are up to date</div>
      </OnboardingShell>
    );
  }

  const message: Message = {
    id: `update-notes-${update.version}`,
    role: "system",
    text: `## What's New in ${update.version}\n\n${update.notes}`,
    timestamp: Date.now(),
    actions: [
      {
        type: "button",
        id: "update_now",
        label: "Update Now",
        variant: "primary",
      },
      {
        type: "button",
        id: "update_later",
        label: "Maybe Later",
        variant: "secondary",
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
