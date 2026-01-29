/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  Settings,
  HardDrive,
  Sparkles,
  Lock,
  BookOpen,
  ExternalLink,
  HelpCircle,
  LogOut,
} from "lucide-react";
import styles from "./SettingsPanel.module.css";
import { Topic } from "../SettingsTab/SettingsTab";

interface SettingsPanelProps {
  activeTopic: Topic;
  setActiveTopic: (topic: Topic) => void;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onLogout: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  activeTopic,
  setActiveTopic,
  userName,
  userEmail,
  avatarSrc,
  onLogout,
}) => {
  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.userProfile}>
          <img
            src={
              avatarSrc ||
              "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
            }
            alt="User"
            className={styles.avatar}
          />
          <div className={styles.userInfo}>
            <div className={styles.userName}>{userName || "Guest User"}</div>
            <div className={styles.userEmail}>
              {userEmail || "Sign in to sync"}
            </div>
          </div>
          <button
            className={styles.logoutButton}
            onClick={onLogout}
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className={styles.topicsList}>
        <div className={styles.topicGroup}>
          <button
            className={`${styles.topicItem} ${activeTopic === "General" ? styles.active : ""}`}
            onClick={() => setActiveTopic("General")}
          >
            <Settings size={20} className={styles.topicIcon} /> General
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "Models" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Models")}
          >
            <HardDrive size={20} className={styles.topicIcon} /> Models
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "Personal Context" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Personal Context")}
          >
            <Sparkles size={20} className={styles.topicIcon} /> Personal Context
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "Providers & Keys" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Providers & Keys")}
          >
            <Lock size={20} className={styles.topicIcon} /> Providers & Keys
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "Help & Support" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Help & Support")}
          >
            <HelpCircle size={20} className={styles.topicIcon} /> Help & Support
          </button>
        </div>

        <div className={styles.topicGroup}>
          <button
            className={`${styles.topicItem} ${activeTopic === "Docs" ? styles.active : ""}`}
            onClick={() =>
              invoke("open_external_url", {
                url: "https://github.com/a7mddra/spatialshot/tree/main/docs",
              })
            }
          >
            <BookOpen size={20} className={styles.topicIcon} /> Docs
            <ExternalLink size={16} className={styles.topicIcon} />
          </button>
        </div>
      </div>
    </div>
  );
};
