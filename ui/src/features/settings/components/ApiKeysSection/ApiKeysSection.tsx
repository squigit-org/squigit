/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, forwardRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { google, github } from "@/lib/config";
import { GlowCard } from "@/widgets/glow-card";
import { TextContextMenu } from "@/widgets/menu";
import styles from "./ApiKeysSection.module.css";
import { useTextEditor } from "@/hooks/useTextEditor";
import { useTextContextMenu } from "@/widgets/menu/hooks/useTextContextMenu";

interface ApiKeysSectionProps {
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (
    provider: "google ai studio" | "imgbb",
    key: string,
  ) => Promise<boolean>;
}

const ProviderRow = ({
  title,
  providerKeyName,
  description,
  dashboardUrl,
  currentKey,
  onSave,
}: {
  title: string;
  providerKeyName: string;
  description: string;
  currentKey: string;
  dashboardUrl: string;
  isExpanded: boolean;
  onToggle: () => void;
  onSave: (key: string) => Promise<boolean>;
}) => {
  const [inputValue, setInputValue] = useState("");
  const [showKey, setShowKey] = useState(false);

  const {
    ref,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleKeyDown,
  } = useTextEditor({
    value: inputValue,
    onChange: setInputValue,
    preventNewLine: true,
  });

  const {
    data: contextMenu,
    handleContextMenu,
    handleClose: handleCloseContextMenu,
  } = useTextContextMenu({
    hasSelection,
  });

  const handleOpenUrl = (url: string) => {
    invoke("open_external_url", { url });
  };

  const inputRef = ref as React.RefObject<HTMLInputElement>;

  return (
    <div className={`${styles.providerWrapper} ${styles.expanded}`}>
      <GlowCard className={styles.glowProviderRow}>
        <div className={styles.providerRowInternal}>
          <div className={styles.providerInfo}>
            <div className={styles.providerName}>
              {title}
              {title.toLowerCase() === "imgbb" ? "*" : ""}
            </div>
            <div className={styles.providerMeta}>{description}</div>
          </div>
        </div>
      </GlowCard>

      <div className={styles.accordionContent}>
        <div className={styles.innerPadding}>
          <p className={styles.helperText}>
            You can put in{" "}
            <button
              className={styles.providerLink}
              onClick={() => handleOpenUrl(dashboardUrl)}
            >
              your {providerKeyName} key
            </button>{" "}
            {title.toLowerCase() === "imgbb"
              ? "to get a free public image link."
              : `to use ${title} models at cost.`}
          </p>

          <div className={styles.inputGroup}>
            <div className={styles.inputWrapper}>
              <input
                ref={inputRef}
                type={showKey ? "text" : "password"}
                className={styles.modernInput}
                placeholder={`Enter your ${providerKeyName} API Key`}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown as any}
                autoComplete="off"
                onBlur={() => {
                  if (inputValue.trim()) {
                    onSave(inputValue);
                  }
                }}
              />
              <button
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowKey(!showKey);
                }}
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
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
    </div>
  );
};

export const ApiKeysSection = forwardRef<HTMLDivElement, ApiKeysSectionProps>(
  ({ geminiKey, imgbbKey, onSetAPIKey }, ref) => {
    const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
      new Set(),
    );

    const toggleProvider = (provider: string) => {
      setExpandedProviders((prev) => {
        const next = new Set(prev);
        if (next.has(provider)) {
          next.delete(provider);
        } else {
          next.add(provider);
        }
        return next;
      });
    };

    const handleOpenUrl = (url: string) =>
      invoke("open_external_url", { url: url });

    return (
      <div ref={ref} className={styles.container}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>API Keys</h2>
        </div>

        <div className={styles.scrollContent}>
          <div className={styles.section}>
            <ProviderRow
              title="Gemini"
              providerKeyName="Google AI Studio"
              description="Required for AI features"
              currentKey={geminiKey}
              dashboardUrl={google.aiStudio.key}
              isExpanded={expandedProviders.has("gemini")}
              onToggle={() => toggleProvider("gemini")}
              onSave={(key) => onSetAPIKey("google ai studio", key)}
            />

            <ProviderRow
              title="ImgBB"
              providerKeyName="ImgBB"
              description="Reverse Image Search"
              currentKey={imgbbKey}
              dashboardUrl={"https://api.imgbb.com/"}
              isExpanded={expandedProviders.has("imgbb")}
              onToggle={() => toggleProvider("imgbb")}
              onSave={(key) => onSetAPIKey("imgbb", key)}
            />

            <div className={styles.legalNote}>
              <span className={styles.legalNoteStar}>*</span>
              <p className={styles.legalNoteText}>
                ImgBB is a free image hosting service that generates public URLs
                via API to enable reverse image search. We strongly recommend
                against using this option for sensitive data, as it is a free
                and public service.{" "}
                <button
                  className={styles.privacyLink}
                  onClick={() =>
                    handleOpenUrl(github.docs("06-policies/SECURITY.md"))
                  }
                >
                  Learn more.
                </button>
              </p>
            </div>
          </div>
        </div>

        <div className={styles.aboutSection}>
          <div className={styles.divider} />
          <div className={styles.legalRow}>
            <span>Your keys are stored locally — </span>
            <button
              className={styles.privacyLink}
              onClick={() => handleOpenUrl(github.docs("06-policies/BYOK.md"))}
            >
              We never see them.
            </button>
          </div>
        </div>
      </div>
    );
  },
);
