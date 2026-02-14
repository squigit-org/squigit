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
    text: update.notes,
    timestamp: Date.now(),
  };

  return (
    <OnboardingShell allowScroll contentClassName={styles.content}>
      <div>{`What's New in ${update.version}\n\n`}</div>
      <div className={styles.inner}>
        <ChatBubble message={message} />
        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={() => shell.handleSystemAction("update_now")}
          >
            Update Now
          </button>
        </div>
      </div>
    </OnboardingShell>
  );
};
