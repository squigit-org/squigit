/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, forwardRef } from "react";
import {
  ExternalLink,
  Check,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Search,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ApiKeysSection.module.css";
import { GITHUB } from "../../types/settings.types";

interface ApiKeysSectionProps {
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (provider: "gemini" | "imgbb", key: string) => Promise<boolean>;
}

type ViewState = "main" | "gemini" | "imgbb";

const PRIVACY_URL = `${GITHUB}/blob/main/docs/06-policies/SECURITY.md`;

export const ApiKeysSection = forwardRef<HTMLDivElement, ApiKeysSectionProps>(
  ({ geminiKey, imgbbKey, onSetAPIKey }, ref) => {
    const [view, setView] = useState<ViewState>("main");
    const [isDetecting, setIsDetecting] = useState(false);

    const handleOpenUrl = async (url: string) => {
      await invoke("open_external_url", { url });
    };

    const handleDetectKey = async (provider: "gemini" | "imgbb") => {
      setIsDetecting(true);
      try {
        const text = await invoke<string>("read_clipboard_text").catch(
          () => "",
        );
        if (provider === "gemini") {
          if (text && text.length > 20 && !text.includes(" ")) {
            await onSetAPIKey("gemini", text);
            setView("main");
          } else if (text) {
            // Fallback attempt
            await onSetAPIKey("gemini", text);
            setView("main");
          }
        } else {
          if (text && text.length > 10) {
            await onSetAPIKey("imgbb", text);
            setView("main");
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsDetecting(false);
      }
    };

    const renderMainView = () => (
      <>
        <div className={styles.providersList}>
          {/* Gemini Row */}
          <div
            className={styles.providerRow}
            role="button"
            onClick={() => setView("gemini")}
          >
            <div className={styles.providerInfo}>
              <div className={styles.providerName}>Google Gemini</div>
              <div className={styles.providerMeta}>
                Required for AI features
              </div>
            </div>
            <div className={styles.rowActions}>
              <div
                className={`${styles.statusTag} ${
                  geminiKey ? styles.active : ""
                }`}
              >
                {geminiKey ? (
                  <>
                    <Check size={12} /> Configured
                  </>
                ) : (
                  <>Not configured</>
                )}
              </div>
              <ChevronRight size={16} className="text-neutral-500" />
            </div>
          </div>

          {/* ImgBB Row */}
          <div
            className={styles.providerRow}
            role="button"
            onClick={() => setView("imgbb")}
          >
            <div className={styles.providerInfo}>
              <div className={styles.providerName}>ImgBB</div>
              <div className={styles.providerMeta}>Reverse Image Search</div>
            </div>
            <div className={styles.rowActions}>
              <div
                className={`${styles.statusTag} ${
                  imgbbKey ? styles.active : ""
                }`}
              >
                {imgbbKey ? (
                  <>
                    <Check size={12} /> Configured
                  </>
                ) : (
                  <>Not configured</>
                )}
              </div>
              <ChevronRight size={16} className="text-neutral-500" />
            </div>
          </div>
        </div>
      </>
    );

    const renderDetailView = (provider: "gemini" | "imgbb") => {
      const isGemini = provider === "gemini";
      const title = isGemini ? "Google Gemini" : "ImgBB";
      const url = isGemini
        ? "https://aistudio.google.com/app/apikey"
        : "https://api.imgbb.com/";

      return (
        <div className={styles.detailView}>
          <div className={styles.sectionHeader}>
            <button
              className={styles.backBtn}
              onClick={() => setView("main")}
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className={styles.sectionTitle}>{title} Setup</h2>
          </div>

          <div className={styles.detailContent}>
            <div className={styles.instructionCard}>
              <div className={styles.instructionTitle}>Step-by-step Guide</div>
              <ol className={styles.stepList}>
                <li>
                  Click <strong>Get API Key</strong> below to open the
                  provider's dashboard.
                </li>
                <li>
                  {isGemini
                    ? "Locate or create your Default Gemini API Key."
                    : "Locate ImgBB API v1 or add a new key."}
                </li>
                <li>Copy the key to your clipboard.</li>
                <li>
                  Click <strong>Detect Key from Clipboard</strong>.
                </li>
              </ol>
            </div>

            <div className={styles.detailActions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => handleOpenUrl(url)}
              >
                <ExternalLink size={16} />
                Get API Key
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => handleDetectKey(provider)}
                disabled={isDetecting}
              >
                {isDetecting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Search size={16} />
                )}
                {isDetecting ? "Detecting..." : "Detect Key from Clipboard"}
              </button>
            </div>
          </div>
        </div>
      );
    };

    const handleOpen = (url: string) => invoke("open_external_url", { url });

    return (
      <div ref={ref} className={styles.container}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>API Keys</h2>
        </div>
        <div className={styles.scrollContent}>
          <div className={styles.section}>
            {view === "main" && renderMainView()}
            {view === "gemini" && renderDetailView("gemini")}
            {view === "imgbb" && renderDetailView("imgbb")}
          </div>
        </div>

        {/* FOOTER: PRIVACY */}
        <div className={styles.aboutSection}>
          <div className={styles.divider} />
          <div className={styles.legalRow}>
            <span>Your keys are stored locally on your device — </span>
            <span>
              <button
                className={styles.privacyLink}
                onClick={() => handleOpen(PRIVACY_URL)}
              >
                We never see them.
              </button>
            </span>
          </div>
        </div>
      </div>
    );
  },
);
