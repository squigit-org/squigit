/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useTextEditor, useTextContextMenu } from "@/hooks/editor";
import { TextContextMenu } from "@/app/layout/menus/TextContextMenu";
import { platform } from "@/platform";
import { useIdentityConfig } from "@/hooks/system/useIdentityConfig";
import styles from "./IdentitySettings.module.css";

interface IdentitySettingsProps {
  isWizard?: boolean;
}

export const IdentitySettings: React.FC<IdentitySettingsProps> = ({
  isWizard,
}) => {
  const { config, loading, updatePrompt, attachSoul, detachSoul } = useIdentityConfig();
  const [localPrompt, setLocalPrompt] = useState("");

  useEffect(() => {
    if (config?.prompt !== undefined) {
      setLocalPrompt(config.prompt);
    }
  }, [config?.prompt]);

  useEffect(() => {
    if (config === null) return;
    if (localPrompt === config?.prompt) return;
    const handler = setTimeout(() => {
      updatePrompt(localPrompt);
    }, 1000);
    return () => clearTimeout(handler);
  }, [localPrompt, config?.prompt, updatePrompt]);

  const handleAttachSoulMd = async () => {
    try {
      const selected = await platform.dialog.open({
        filters: [{ name: "Markdown", extensions: ["md"] }],
        defaultPath: "Documents",
      });
      if (!selected || Array.isArray(selected)) return;

      const content = await platform.fs.readTextFile(selected);
      const originalName = selected.split(/[/\\]/).pop() || "soul.md";
      await attachSoul(originalName, content);
    } catch (err) {
      console.error("[IdentitySettings] Failed to attach soul.md:", err);
    }
  };

  const handleDetachSoulMd = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    await detachSoul();
  };

  const {
    ref,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleKeyDown,
  } = useTextEditor({
    value: localPrompt,
    onChange: setLocalPrompt,
  });

  const {
    data: contextMenu,
    handleContextMenu,
    handleClose: handleCloseContextMenu,
  } = useTextContextMenu({
    hasSelection,
  });

  if (loading) {
    return <div className={styles.container}>Loading personalization settings...</div>;
  }

  const soulMdName = config?.soul?.name;

  return (
    <section
      className={`${styles.container} ${isWizard ? styles.wizardContainer : ""}`}
      aria-labelledby="personalization-heading"
    >
      {!isWizard && (
        <header className={styles.sectionHeader}>
          <h2 id="personalization-heading" className={styles.sectionTitle}>
            Personalization
          </h2>
        </header>
      )}
      <div className={styles.group}>
        {!isWizard && (
          <div className={styles.controlsRow}>
            <span className={styles.description}>
              Customize how the AI responds to you
            </span>
          </div>
        )}
        <div
          className={`${styles.textareaWrapper} ${isWizard ? styles.wizardTextareaWrapper : ""}`}
        >
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            className={styles.textarea}
            placeholder="Add context about yourself, your preferences, or specific instructions for the AI."
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onContextMenu={handleContextMenu}
            onKeyDown={(e) => {
              if (e.key === "Enter") return;
              handleKeyDown(e as any);
            }}
          />
        </div>
        <div className={styles.soulMdRow}>
          <div
            className={styles.soulMdPicker}
            onClick={handleAttachSoulMd}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleAttachSoulMd();
            }}
          >
            <span className={styles.soulMdIcon}>
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </span>
            <span className={styles.soulMdLabel}>
              {soulMdName ? (
                soulMdName.length > 20 ? (
                  `${soulMdName.substring(0, soulMdName.lastIndexOf(".")).substring(0, 15)}...${soulMdName.substring(soulMdName.lastIndexOf("."))}`
                ) : (
                  soulMdName
                )
              ) : "Attach Soul.md"}
            </span>
          </div>
          {soulMdName && (
            <span
              className={styles.soulMdRemove}
              onClick={handleDetachSoulMd}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleDetachSoulMd(e);
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          )}
        </div>
      </div>
      {contextMenu.isOpen && (
        <TextContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          hasSelection={hasSelection}
        />
      )}
    </section>
  );
};
