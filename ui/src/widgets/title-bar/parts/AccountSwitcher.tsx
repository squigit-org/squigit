/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Profile } from "@/lib/api/tauri/commands";
import { ChevronDown, UserPlus, LogOut, Check } from "lucide-react";
import styles from "./AccountSwitcher.module.css";

interface AccountSwitcherProps {
  activeProfile: Profile | null;
  profiles: Profile[];
  onSwitchProfile: (profileId: string) => void;
  onAddAccount: () => void;
  onLogout: () => void;
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  activeProfile,
  profiles,
  onSwitchProfile,
  onAddAccount,
  onLogout,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const getInitials = (name: string) => {
    const names = name.trim().split(" ");
    if (names.length === 0) return "";
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[1].charAt(0)).toUpperCase();
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#84cc16",
      "#10b981",
      "#06b6d4",
      "#6366f1",
      "#8b5cf6",
      "#ec4899",
      "#f43f5e",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getAvatarSrc = (avatar: string | null) => {
    if (!avatar) return null;
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
      return avatar;
    }
    return convertFileSrc(avatar);
  };

  const activeAvatarSrc = getAvatarSrc(activeProfile?.avatar ?? null);

  return (
    <div className={styles.accountSwitcher} ref={containerRef}>
      <button
        className={`${styles.trigger} ${isOpen ? styles.active : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div
          className={styles.avatar}
          style={{
            backgroundColor: activeAvatarSrc
              ? "transparent"
              : getAvatarColor(activeProfile?.name ?? "User"),
          }}
        >
          {activeAvatarSrc ? (
            <img
              src={activeAvatarSrc}
              alt={activeProfile?.name ?? "User"}
              className={styles.avatarImage}
            />
          ) : (
            <span className={styles.avatarInitials}>
              {getInitials(activeProfile?.name ?? "User")}
            </span>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`${styles.chevron} ${isOpen ? styles.rotate : ""}`}
        />
      </button>

      {/* Dropdown - always mounted */}
      <div className={`${styles.dropdown} ${isOpen ? styles.open : ""}`}>
        <div className={styles.sectionTitle}>Switch Account</div>
        <div className={styles.accountList}>
          {profiles.map((profile) => {
            const profileAvatarSrc = getAvatarSrc(profile.avatar);
            return (
              <button
                key={profile.id}
                className={`${styles.accountItem} ${
                  activeProfile?.id === profile.id ? styles.activeAccount : ""
                }`}
                onClick={() => {
                  if (activeProfile?.id !== profile.id) {
                    onSwitchProfile(profile.id);
                  }
                  setIsOpen(false);
                }}
              >
                <div
                  className={styles.itemAvatar}
                  style={{
                    backgroundColor: profileAvatarSrc
                      ? "transparent"
                      : getAvatarColor(profile.name),
                  }}
                >
                  {profileAvatarSrc ? (
                    <img
                      src={profileAvatarSrc}
                      alt={profile.name}
                      className={styles.itemAvatarImage}
                    />
                  ) : (
                    <span className={styles.itemAvatarInitials}>
                      {getInitials(profile.name)}
                    </span>
                  )}
                </div>
                <div className={styles.accountInfo}>
                  <span className={styles.accountName}>{profile.name}</span>
                  <span className={styles.accountEmail}>{profile.email}</span>
                </div>
                {activeProfile?.id === profile.id && (
                  <Check size={14} className={styles.checkIcon} />
                )}
              </button>
            );
          })}
        </div>

        <div className={styles.divider} />

        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={() => {
              onAddAccount();
              setIsOpen(false);
            }}
          >
            <UserPlus size={16} />
            <span>Add another account</span>
          </button>

          <button
            className={styles.actionButton}
            onClick={() => {
              onLogout();
              setIsOpen(false);
            }}
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
