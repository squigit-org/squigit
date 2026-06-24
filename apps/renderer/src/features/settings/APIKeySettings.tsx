/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import { commands } from "@/platform";
import { github } from "@squigit/core/services/github";
import { google } from "@squigit/core/services/google";
import { GlowCard } from "@/components/ui";
import { TextContextMenu } from "@/app/layout/menus/TextContextMenu";
import { useTextContextMenu, useTextEditor } from "@/hooks/editor";
import styles from "./APIKeySettings.module.css";

interface APIKeySettingsProps {
  providerApiKey: string;
  imgbbKey: string;
  isGuest?: boolean;
  isWizard?: boolean;
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
  isGuest = false,
  isWizard = false,
}: {
  title: string;
  providerKeyName: string;
  description: string;
  currentKey: string;
  dashboardUrl: string;
  onSave: (key: string) => Promise<boolean>;
  isGuest?: boolean;
  isWizard?: boolean;
}) => {
  const [inputValue, setInputValue] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const isFocusedRef = useRef(false);

  const isMountedRef = useRef(true);
  const saveIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setInputValue(currentKey);
      setIsValid(true);
    }
  }, [currentKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const validate = (key: string): boolean => {
    if (!key) return true;
    if (providerKeyName === "Google AI Studio") {
      const isLegacy = key.startsWith("AIzaSy");
      const isNew = key.startsWith("AQ.");
      if (isLegacy && key.length === 39) return true;
      if (isNew && key.length >= 50 && key.length <= 60) return true;
      return false;
    }
    if (providerKeyName === "ImgBB") {
      return key.length === 32;
    }
    return true;
  };

  const debouncedSave = useCallback(
    (trimmed: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (isGuest || trimmed === currentKey) return;
        const id = ++saveIdRef.current;
        onSave(trimmed).then((success) => {
          if (!isMountedRef.current || saveIdRef.current !== id) return;
          if (!success) {
            setIsValid(false);
          }
        });
      }, 300);
    },
    [isGuest, currentKey, onSave],
  );

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    const trimmed = newValue.trim();
    const valid = validate(trimmed);
    setIsValid(valid);

    if (!isWizard || isGuest) return;

    if (valid && trimmed && trimmed !== currentKey) {
      debouncedSave(trimmed);
    } else if ((!valid || !trimmed) && currentKey) {
      debouncedSave("");
    }
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = inputValue.trim();
    const valid = validate(trimmed);

    if (!valid) {
      setInputValue(currentKey);
      setIsValid(true);
      return;
    }

    if (trimmed === currentKey) return;

    if (isGuest) {
      setIsValid(false);
      setTimeout(() => setIsValid(true), 1000);
      return;
    }

    const id = ++saveIdRef.current;
    setTimeout(() => {
      onSave(trimmed).then((success) => {
        if (!isMountedRef.current || saveIdRef.current !== id) return;
        if (!success) {
          setIsValid(false);
          alert(
            "Failed to save API key. Please ensure you are logged in to a profile.",
          );
        }
      });
    }, 500);
  };
  const {
    ref,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleKeyDown: editorKeyDown,
  } = useTextEditor({
    value: inputValue,
    onChange: handleInputChange,
    preventNewLine: true,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === "c") {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (isMod && e.key === "x") {
        e.preventDefault();
        handleCut();
        return;
      }
      editorKeyDown(e as any);
    },
    [editorKeyDown, handleCopy, handleCut],
  );

  const {
    data: contextMenu,
    handleContextMenu,
    handleClose: handleCloseContextMenu,
  } = useTextContextMenu({
    hasSelection,
  });
  const handleOpenUrl = (url: string) => {
    commands.openExternalUrl(url);
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
          <div
            className={`${styles.inputGroup} ${isGuest ? styles.disabled : ""}`}
          >
            <div
              className={`${styles.inputWrapper} ${!isValid ? styles.error : ""}`}
            >
              <input
                ref={inputRef}
                type={showKey ? "text" : "password"}
                className={styles.modernInput}
                placeholder={`Enter your ${providerKeyName} API Key`}
                value={inputValue}
                disabled={isGuest}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => {
                  isFocusedRef.current = true;
                }}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              <button
                type="button"
                className={styles.iconBtn}
                disabled={isGuest}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowKey(!showKey);
                  // Push caret to the end after React updates the DOM
                  requestAnimationFrame(() => {
                    if (inputRef.current) {
                      const len = inputRef.current.value.length;
                      inputRef.current.setSelectionRange(len, len);
                    }
                  });
                }}
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <Eye size={14} /> : <EyeOff size={14} />}
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
export const APIKeySettings: React.FC<APIKeySettingsProps> = ({
  providerApiKey,
  imgbbKey,
  onSetAPIKey,
  isGuest,
  isWizard,
}) => {
  const handleOpenUrl = (url: string) => commands.openExternalUrl(url);
  return (
    <section
      className={`${styles.container} ${isWizard ? styles.wizardContainer : ""}`}
      aria-labelledby="apikeys-heading"
    >
      {!isWizard && (
        <header className={styles.sectionHeader}>
          <h2 id="apikeys-heading" className={styles.sectionTitle}>
            API Keys
          </h2>
        </header>
      )}
      <div className={`${styles.group} ${isWizard ? styles.wizardGroup : ""}`}>
        <ProviderRow
          title="Gemini"
          providerKeyName="Google AI Studio"
          description="Required for AI features"
          currentKey={providerApiKey}
          dashboardUrl={google.aiStudio.key}
          onSave={(key) => onSetAPIKey("google ai studio", key)}
          isGuest={isGuest}
          isWizard={isWizard}
        />
        {!isWizard && (
          <>
            <ProviderRow
              title="ImgBB"
              providerKeyName="ImgBB"
              description="Reverse Image Search"
              currentKey={imgbbKey}
              dashboardUrl={"https://api.imgbb.com/"}
              onSave={(key) => onSetAPIKey("imgbb", key)}
              isGuest={isGuest}
            />
            <div className={styles.legalNote}>
              <span className={styles.legalNoteStar}>*</span>
              <p className={styles.legalNoteText}>
                ImgBB is a free image hosting service that generates public URLs
                via API to enable reverse image search. We strongly recommend
                against using this option for sensitive data.{" "}
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
          </>
        )}
      </div>
      <div
        className={`${styles.aboutSection} ${isWizard ? styles.wizardAboutSection : ""}`}
      >
        {!isWizard && <div className={styles.divider} />}
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
