/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { google, github } from "@/lib/config";
import { GlowCard } from "@/widgets/glow-card";
import { TextContextMenu } from "@/widgets/menu";
import styles from "./APIKeysSection.module.css";
import { useTextEditor } from "@/hooks/useTextEditor";
import { useTextContextMenu } from "@/widgets/menu/hooks/useTextContextMenu";
interface APIKeysSectionProps {
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (
    provider: "google ai studio" | "imgbb" | "gemini",
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
  onSave: (key: string) => Promise<boolean>;
}) => {
  const [inputValue, setInputValue] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sync input with external currentKey (e.g., on mount or prop change)
  useEffect(() => {
    setInputValue(currentKey);
    setIsValid(true);
  }, [currentKey]);
  // Validation Logic
  const validate = (key: string): boolean => {
    if (!key) return true; // Empty is valid (clearing key)
    if (providerKeyName === "Google AI Studio") {
      // Gemini: Starts with "AIzaS", length 39
      return key.startsWith("AIzaS") && key.length === 39;
    }
    if (providerKeyName === "ImgBB") {
      // ImgBB: Length 32
      return key.length === 32;
    }
    return true;
  };
  // Handle input change with debounced validation and save
  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    // Start a new 1s timer
    timerRef.current = setTimeout(() => {
      const valid = validate(newValue);
      setIsValid(valid);
      if (valid && newValue !== currentKey) {
        // Only save if valid AND different from current
        onSave(newValue);
      }
      // If not valid, red border is shown via isValid state
    }, 1000);
  };
  // On blur: if invalid, reset to last saved key
  const handleBlur = () => {
    // Clear pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const valid = validate(inputValue);
    if (!valid) {
      // Reset to last saved key
      setInputValue(currentKey);
      setIsValid(true);
    } else if (inputValue !== currentKey) {
      // Save if valid and changed
      onSave(inputValue);
    }
  };
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
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
    onChange: handleInputChange,
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
    <div className={styles.providerWrapper}>
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
            <div
              className={`${styles.inputWrapper} ${!isValid ? styles.error : ""}`}
            >
              <input
                ref={inputRef}
                type={showKey ? "text" : "password"}
                className={styles.modernInput}
                placeholder={`Enter your ${providerKeyName} API Key`}
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown as any}
                autoComplete="off"
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
export const APIKeysSection: React.FC<APIKeysSectionProps> = ({
  geminiKey,
  imgbbKey,
  onSetAPIKey,
}) => {
  const handleOpenUrl = (url: string) =>
    invoke("open_external_url", { url: url });
  return (
    <section className={styles.container} aria-labelledby="apikeys-heading">
      <header className={styles.sectionHeader}>
        <h2 id="apikeys-heading" className={styles.sectionTitle}>
          API Keys
        </h2>
      </header>
      <div className={styles.group}>
        <ProviderRow
          title="Gemini"
          providerKeyName="Google AI Studio"
          description="Required for AI features"
          currentKey={geminiKey}
          dashboardUrl={google.aiStudio.key}
          onSave={(key) => onSetAPIKey("gemini", key)}
        />
        <ProviderRow
          title="ImgBB"
          providerKeyName="ImgBB"
          description="Reverse Image Search"
          currentKey={imgbbKey}
          dashboardUrl={"https://api.imgbb.com/"}
          onSave={(key) => onSetAPIKey("imgbb", key)}
        />
        <div className={styles.legalNote}>
          <span className={styles.legalNoteStar}>*</span>
          <p className={styles.legalNoteText}>
            ImgBB is a free image hosting service that generates public URLs via
            API to enable reverse image search. We strongly recommend against
            using this option for sensitive data.{" "}
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
    </section>
  );
};
