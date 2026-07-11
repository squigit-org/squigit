/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { commands, type Profile } from "@/platform";

export const useSystemProfile = () => {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showExistingProfileDialog, setShowExistingProfileDialog] =
    useState(false);
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(
    null,
  );

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const updateUserData = (data: {
    name: string;
    email: string;
    avatar_base64?: string | null;
    avatar_url?: string | null;
  }) => {
    setUserName(data.name);
    setUserEmail(data.email);
    setAvatarSrc(data.avatar_base64 || data.avatar_url || "");
    setAvatarUrl(data.avatar_url ?? null);
  };

  const deleteProfile = async (profileId: string) => {
    await commands.deleteProfile(profileId);
  };

  return {
    activeProfile,
    setActiveProfile,
    profiles,
    setProfiles,
    profileLoaded,
    setProfileLoaded,
    showExistingProfileDialog,
    setShowExistingProfileDialog,
    switchingProfileId,
    setSwitchingProfileId,

    userName,
    setUserName,
    userEmail,
    setUserEmail,
    avatarSrc,
    setAvatarSrc,
    avatarUrl,
    setAvatarUrl,
    updateUserData,

    deleteProfile,
  };
};
