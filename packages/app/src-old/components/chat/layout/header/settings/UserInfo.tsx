/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";

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

  return (
    <div className="user-info">
      <div className="user-info-main">
        <img className="avatar" src={avatarSrc} alt="User avatar" />
        <div className="user-details-wrapper">
          <div className="user-details">
            <h3>{userName}</h3>
            <p ref={emailRef} className={isEmailOverflowing ? "marquee" : ""}>
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
        className="logout-btn"
        title="Log Out"
        aria-label="Log out"
        onClick={onLogout}
      >
        <i className="fas fa-sign-out-alt" />
      </button>
    </div>
  );
};
