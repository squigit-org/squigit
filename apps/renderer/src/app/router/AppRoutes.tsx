/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  ThreadRoute,
  GalleryRoute,
  HomeRoute,
  UpdateNotesRoute,
  WizardRoute,
} from "./routes";
import { useAppContext } from "../providers/AppProvider";

const isOnboardingId = (id: string) => id.startsWith("__system_");

interface AppRoutesProps {
  shouldRenderThreadShell: boolean;
}

export const AppRoutes: React.FC<AppRoutesProps> = ({
  shouldRenderThreadShell,
}) => {
  const app = useAppContext();

  const activeId = app.threadHistory.activeSessionId;

  if (activeId && isOnboardingId(activeId)) {
    if (activeId === "__system_wizard") {
      return (
        <WizardRoute
          onSystemAction={app.handleSystemAction}
          onOpenSettings={app.system.openSettings}
        />
      );
    }
    if (activeId.startsWith("__system_update")) {
      return (
        <UpdateNotesRoute
          appName={app.system.appName}
          onSystemAction={app.handleSystemAction}
        />
      );
    }
    if (activeId === "__system_gallery") {
      return (
        <GalleryRoute
          threads={app.threadHistory.threads}
          activeSessionId={app.threadHistory.activeSessionId}
          refreshThreads={app.threadHistory.refreshThreads}
        />
      );
    }
  }

  if (!shouldRenderThreadShell) {
    return (
      <HomeRoute
        appName={app.system.appName}
        onImageReady={app.handleImageReady}
        isGuest={!app.system.activeProfile}
        onLoginRequired={() => app.setShowLoginRequiredDialog(true)}
      />
    );
  }

  return <ThreadRoute />;
};
