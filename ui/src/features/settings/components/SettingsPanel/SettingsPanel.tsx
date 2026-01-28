/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Settings,
  HardDrive,
  Sparkles,
  Lock,
  BookOpen,
  Code2,
  Bug,
  Activity,
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
        </div>
      </div>

      <div className={styles.topicsList}>
        <div className={styles.topicGroup}>
          <button
            className={`${styles.topicItem} ${activeTopic === "General" ? styles.active : ""}`}
            onClick={() => setActiveTopic("General")}
          >
            <Settings size={18} className={styles.topicIcon} /> General
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "Personal Context" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Personal Context")}
          >
            <Sparkles size={18} className={styles.topicIcon} /> Personal Context
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "Models" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Models")}
          >
            <HardDrive size={18} className={styles.topicIcon} /> Models
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "API & BYOK" ? styles.active : ""}`}
            onClick={() => setActiveTopic("API & BYOK")}
          >
            <Lock size={18} className={styles.topicIcon} /> API & BYOK
          </button>
        </div>

        <div className={styles.topicGroup}>
          <button
            className={`${styles.topicItem} ${activeTopic === "Report Bug" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Report Bug")}
          >
            <Bug size={18} className={styles.topicIcon} /> Report Bug
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "App Version" ? styles.active : ""}`}
            onClick={() => setActiveTopic("App Version")}
          >
            <Activity size={18} className={styles.topicIcon} /> App Version
          </button>
        </div>

        <div className={styles.topicGroup}>
          <button
            className={`${styles.topicItem} ${activeTopic === "Docs" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Docs")}
          >
            <BookOpen size={18} className={styles.topicIcon} /> Docs
          </button>
          <button
            className={`${styles.topicItem} ${activeTopic === "Github" ? styles.active : ""}`}
            onClick={() => setActiveTopic("Github")}
          >
            <Code2 size={18} className={styles.topicIcon} /> Github
          </button>
        </div>
      </div>
    </div>
  );
};
