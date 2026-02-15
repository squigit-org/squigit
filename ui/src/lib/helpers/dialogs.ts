/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { DialogVariant } from "@/primitives/dialog/Dialog";

export interface DialogContent {
  title?: string;
  message: string;
  variant: DialogVariant;
  actions: {
    label: string;
    variant?: "primary" | "secondary" | "danger";
    actionKey: string;
    disabled?: boolean;
  }[];
}

export const DIALOGS: Record<string, DialogContent> = {
  GEMINI_AUTH: {
    title: "Gemini API Key Required",
    message: "To begin using the chat, please configure your Gemini API key.",
    variant: "info",
    actions: [
      { label: "Cancel", variant: "secondary", actionKey: "cancel" },
      { label: "Configure API Key", variant: "primary", actionKey: "confirm" },
    ],
  },
  IMGBB_AUTH: {
    title: "ImgBB API Key Required",
    message:
      "To use Google Lens features, please configure your ImgBB API key.",
    variant: "info",
    actions: [
      { label: "Cancel", variant: "secondary", actionKey: "cancel" },
      { label: "Configure API Key", variant: "primary", actionKey: "confirm" },
    ],
  },
  EXISTING_PROFILE: {
    title: "Account Already Signed In",
    message: "This account is already signed in.",
    variant: "info",
    actions: [{ label: "Close", variant: "primary", actionKey: "close" }],
  },
  REMOVE_ACCOUNT: {
    title: "Confirm Account Removal",
    message:
      "Are you sure you want to remove this account?\nThis action is irreversible.",
    variant: "warning",
    actions: [
      { label: "Cancel", variant: "secondary", actionKey: "cancel" },
      { label: "Remove Account", variant: "danger", actionKey: "confirm" },
    ],
  },
  DELETE_CHAT: {
    title: "Delete Conversation",
    message:
      "Are you sure you want to delete this conversation?\nThis action is irreversible.",
    variant: "error",
    actions: [
      { label: "Cancel", variant: "secondary", actionKey: "cancel" },
      { label: "Delete Conversation", variant: "danger", actionKey: "confirm" },
    ],
  },
  LOGIN_REQUIRED: {
    title: "Login Required",
    message: "You need to sign in first to use SnapLLM.",
    variant: "info",
    actions: [
      { label: "Cancel", variant: "secondary", actionKey: "cancel" },
      { label: "Sign In", variant: "primary", actionKey: "confirm" },
    ],
  },
};

// Helper for dynamic messages
export const getDeleteMultipleChatsDialog = (count: number): DialogContent => ({
  title: "Delete Multiple Conversations",
  message: `Are you sure you want to delete ${count} conversations?\nThis action is irreversible.`,
  variant: "error",
  actions: [
    { label: "Cancel", variant: "secondary", actionKey: "cancel" },
    { label: "Delete All", variant: "danger", actionKey: "confirm" },
  ],
});

import { parseGeminiError } from "./error-parser";

export const getErrorDialog = (error: any): DialogContent => {
  const parsed = parseGeminiError(error);

  return {
    title: parsed.title,
    message: parsed.message,
    variant: "error",
    actions: [{ label: "Close", variant: "primary", actionKey: "close" }],
  };
};
