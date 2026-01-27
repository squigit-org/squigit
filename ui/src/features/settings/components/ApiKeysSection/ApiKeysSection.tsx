/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, forwardRef } from "react";
import { Key, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ApiKeysSection.module.css";

interface ApiKeysSectionProps {
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (provider: "gemini" | "imgbb", key: string) => Promise<boolean>;
  onResetAPIKey: () => void;
}

export const ApiKeysSection = forwardRef<HTMLDivElement, ApiKeysSectionProps>(
  ({ geminiKey, imgbbKey, onSetAPIKey, onResetAPIKey }, ref) => {
    const [isChangingGeminiKey, setIsChangingGeminiKey] = useState(false);
    const [isChangingImgbbKey, setIsChangingImgbbKey] = useState(false);

    const maskKey = (key: string) => {
      if (!key || key.length < 8) return "********";
      return key.slice(0, 4) + "..." + key.slice(-4);
    };

    const handleChangeGeminiKey = async () => {
      setIsChangingGeminiKey(true);
      try {
        const text = await invoke<string>("read_clipboard_text").catch(
          () => "",
        );
        if (text && text.length > 20 && !text.includes(" ")) {
          await onSetAPIKey("gemini", text);
        } else if (text) {
          await onSetAPIKey("gemini", text);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsChangingGeminiKey(false);
      }
    };

    const handleChangeImgbbKey = async () => {
      setIsChangingImgbbKey(true);
      try {
        const text = await invoke<string>("read_clipboard_text").catch(
          () => "",
        );
        if (text && text.length > 10) {
          await onSetAPIKey("imgbb", text);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsChangingImgbbKey(false);
      }
    };

    return (
      <div ref={ref} className={styles.sectionBlock}>
        <div className={styles.sectionHeader}>
          <Key size={22} className={styles.sectionIcon} />
          <h2 className={styles.sectionTitle}>API Keys</h2>
        </div>

        {/* Gemini API Key */}
        <div className={styles.section}>
          <label className={styles.label}>Gemini API Key</label>
          <div className={styles.keyInputRow}>
            <span className={styles.keyLabel}>Key:</span>
            <span className={styles.keyValue}>
              {geminiKey ? (
                maskKey(geminiKey)
              ) : (
                <span className={styles.keyNotSet}>Not set</span>
              )}
            </span>
            <button
              className={styles.keyBtn}
              onClick={handleChangeGeminiKey}
              disabled={isChangingGeminiKey}
            >
              <ExternalLink size={14} />
              {isChangingGeminiKey ? "Waiting..." : "Change"}
            </button>
          </div>
          <p className={styles.keyInstructions}>
            Required for AI features. Copy a new key from Google AI Studio and
            it will be detected automatically.
          </p>

          <button
            className={`${styles.keyBtn} ${styles.resetBtn}`}
            onClick={onResetAPIKey}
          >
            Reset All Keys
          </button>
        </div>

        {/* ImgBB API Key */}
        <div className={styles.section}>
          <label className={styles.label}>ImgBB API Key (Optional)</label>
          <div className={styles.keyInputRow}>
            <span className={styles.keyLabel}>Key:</span>
            <span className={styles.keyValue}>
              {imgbbKey ? (
                maskKey(imgbbKey)
              ) : (
                <span className={styles.keyNotSet}>Not set</span>
              )}
            </span>
            <button
              className={styles.keyBtn}
              onClick={handleChangeImgbbKey}
              disabled={isChangingImgbbKey}
            >
              <ExternalLink size={14} />
              {imgbbKey
                ? isChangingImgbbKey
                  ? "Waiting..."
                  : "Change"
                : isChangingImgbbKey
                  ? "Waiting..."
                  : "Set up"}
            </button>
          </div>
          <p className={styles.keyInstructions}>
            Enables Google Lens integration for reverse image search. Copy your
            key from ImgBB and it will be detected automatically.
          </p>
        </div>
      </div>
    );
  },
);
