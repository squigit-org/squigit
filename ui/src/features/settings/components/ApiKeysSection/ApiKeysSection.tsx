/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, forwardRef, useEffect } from "react";
import { ChevronRight, Eye, EyeOff, Save, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ApiKeysSection.module.css";
import { GITHUB } from "../../types/settings.types";
import { GlowCard } from "../../../../widgets/glow-card";
import { TextContextMenu } from "../../../../widgets/menu";

interface ApiKeysSectionProps {
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (
    provider: "google ai studio" | "imgbb",
    key: string,
  ) => Promise<boolean>;
}

const PRIVACY_URL = `${GITHUB}/blob/main/docs/06-policies/BYOK.md`;
const SECURITY_URL = `${GITHUB}/blob/main/docs/06-policies/SECURITY.md`;

/**
 * Modern row component with inline input
 */
const ProviderRow = ({
  title,
  providerKeyName,
  description,
  dashboardUrl,
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
  const [history, setHistory] = useState<string[]>([""]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleOpenUrl = (url: string) => {
    invoke("open_external_url", { url });
  };

  const addToHistory = (newValue: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newValue);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setInputValue(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setInputValue(history[nextIndex]);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const hasSelection =
      !!inputRef.current &&
      (inputRef.current.selectionEnd || 0) -
        (inputRef.current.selectionStart || 0) >
        0;
    setContextMenu({ x: e.clientX, y: e.clientY, hasSelection });
  };

  const handleCopy = () => {
    const selection = inputRef.current?.value.substring(
      inputRef.current.selectionStart || 0,
      inputRef.current.selectionEnd || 0,
    );
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  };

  const handleCut = () => {
    if (!inputRef.current) return;
    const start = inputRef.current.selectionStart || 0;
    const end = inputRef.current.selectionEnd || 0;
    const value = inputRef.current.value;
    const selection = value.substring(start, end);
    if (selection) {
      navigator.clipboard.writeText(selection);
      const newValue = value.substring(0, start) + value.substring(end);
      setInputValue(newValue);
      addToHistory(newValue);
      setTimeout(() => {
        inputRef.current?.setSelectionRange(start, start);
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handlePaste = async () => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (!inputRef.current) return;
      const start = inputRef.current.selectionStart || 0;
      const end = inputRef.current.selectionEnd || 0;
      const value = inputRef.current.value;
      const newValue = value.substring(0, start) + text + value.substring(end);
      setInputValue(newValue);
      addToHistory(newValue);
      const newCursorPos = start + text.length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current?.focus();
      }, 0);
    } catch (err) {
      console.error("Failed to read clipboard contents: ", err);
    }
  };

  const handleSelectAll = () => {
    inputRef.current?.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === "y") {
        e.preventDefault();
        handleRedo();
      } else if (key === "a") {
        e.preventDefault();
        handleSelectAll();
      } else if (key === "c") {
        e.preventDefault();
        handleCopy();
      } else if (key === "x") {
        e.preventDefault();
        handleCut();
      } else if (key === "v") {
        e.preventDefault();
        handlePaste();
      }
    }
  };

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
                onChange={(e) => {
                  const val = e.target.value;
                  setInputValue(val);
                  addToHistory(val);
                }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown}
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
      {contextMenu && (
        <TextContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          hasSelection={contextMenu.hasSelection}
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

    const handleOpenPrivacy = () =>
      invoke("open_external_url", { url: PRIVACY_URL });
    const handleOpenSecurity = () =>
      invoke("open_external_url", { url: SECURITY_URL });

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
              dashboardUrl="https://aistudio.google.com/app/apikey"
              isExpanded={expandedProviders.has("gemini")}
              onToggle={() => toggleProvider("gemini")}
              onSave={(key) => onSetAPIKey("google ai studio", key)}
            />

            <ProviderRow
              title="ImgBB"
              providerKeyName="ImgBB"
              description="Reverse Image Search"
              currentKey={imgbbKey}
              dashboardUrl="https://api.imgbb.com/"
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
                  onClick={handleOpenSecurity}
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
            <button className={styles.privacyLink} onClick={handleOpenPrivacy}>
              We never see them.
            </button>
          </div>
        </div>
      </div>
    );
  },
);
