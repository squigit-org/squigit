/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

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
  originalPicture: string | null;
  onLogout: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  activeTopic,
  setActiveTopic,
  userName,
  userEmail,
  avatarSrc,
  originalPicture,
  onLogout,
}) => {
  const [imgSrc, setImgSrc] = React.useState<string>("");
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    if (avatarSrc) {
      setImgSrc(convertFileSrc(avatarSrc));
      setImgError(false);
    } else if (originalPicture) {
      setImgSrc(originalPicture);
      setImgError(false);
    } else {
      setImgError(true);
    }
  }, [avatarSrc, originalPicture]);

  const handleImgError = () => {
    if (imgSrc === originalPicture) {
      setImgError(true);
    } else if (originalPicture) {
      setImgSrc(originalPicture);
    } else {
      setImgError(true);
    }
  };

  const getInitials = (name: string) => {
    const names = name.trim().split(" ");
    if (names.length === 0) return "";
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[1].charAt(0)).toUpperCase();
  };

  // Generate a consistent color based on the name
  const getAvatarColor = (name: string) => {
    const colors = [
      "#F87171",
      "#FB923C",
      "#FBBF24",
      "#A3E635",
      "#34D399",
      "#22D3EE",
      "#818CF8",
      "#A78BFA",
      "#F472B6",
      "#FB7185",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.userProfile}>
          {!imgError ? (
            <img
              src={imgSrc}
              alt="User"
              className={styles.avatar}
              onError={handleImgError}
            />
          ) : (
            <div
              className={styles.avatar}
              style={{
                backgroundColor: getAvatarColor(userName),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#1f2937",
                fontWeight: "bold",
                fontSize: "1.2rem",
              }}
            >
              {getInitials(userName)}
            </div>
          )}
          <div className={styles.userInfo}>
            <div className={styles.userName}>{userName}</div>
            <div className={styles.userEmail}>{userEmail}</div>
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
                url: "https://github.com/a7mddra/snapllm/tree/main/docs",
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
