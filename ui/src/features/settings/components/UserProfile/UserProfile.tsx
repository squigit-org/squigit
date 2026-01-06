/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import styles from "./UserProfile.module.css";

interface UserInfoProps {
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onLogout: () => void;
}

export const UserInfo: React.FC<UserInfoProps> = ({
  userName,
  userEmail,
  avatarSrc,
  onLogout,
}) => {
  const [isEmailOverflowing, setIsEmailOverflowing] = useState(false);
  const emailRef = useRef<HTMLParagraphElement>(null);

  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [avatarSrc]);

  useEffect(() => {
    const checkOverflow = () => {
      if (emailRef.current) {
        const isOverflowing =
          emailRef.current.scrollWidth > emailRef.current.clientWidth;
        setIsEmailOverflowing(isOverflowing);
      }
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [userEmail]);

  const renderAvatar = () => {
    const isValidSource =
      avatarSrc &&
      !imageError &&
      !avatarSrc.includes("googleusercontent.com/profile/picture/0");

    if (isValidSource) {
      return (
        <img
          key={avatarSrc}
          className={styles["avatar"]}
          src={avatarSrc}
          alt={userName}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={() => setImageError(true)}
        />
      );
    }

    const initial = userName
      ? userName.charAt(0).toUpperCase()
      : userEmail
      ? userEmail.charAt(0).toUpperCase()
      : "?";

    return (
      <div
        className={styles["avatar"]}
        style={{
          backgroundColor: "#4285F4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "20px",
          color: "white",
          fontWeight: "600",
          userSelect: "none",
        }}
      >
        {initial}
      </div>
    );
  };

  return (
    <div className={styles["user-info"]}>
      <div className={styles["user-info-main"]}>
        {renderAvatar()}
        <div className={styles["user-details-wrapper"]}>
          <div className={styles["user-details"]}>
            <h3>{userName}</h3>
            <p
              ref={emailRef}
              className={isEmailOverflowing ? styles["marquee"] : ""}
            >
              {isEmailOverflowing ? (
                <span>
                  {new Array(200).fill(userEmail).join("\u00A0\u00A0\u00A0")}
                </span>
              ) : (
                userEmail
              )}
            </p>
          </div>
        </div>
      </div>
      <button
        className={styles["logout-btn"]}
        title="Log Out"
        aria-label="Log out"
        onClick={onLogout}
      >
        <i className="fas fa-sign-out-alt" />
      </button>
    </div>
  );
};
