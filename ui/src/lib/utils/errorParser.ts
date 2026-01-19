/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ParsedError {
  title: string;
  message: string;
  code?: string;
  actionType:
    | "RETRY_ONLY"
    | "RETRY_OR_SETTINGS"
    | "RETRY_OR_LINK"
    | "DISMISS_ONLY";
  meta?: {
    link?: string;
    linkLabel?: string;
  };
}

export const parseGeminiError = (error: any): ParsedError => {
  // Normalize error input
  const errString = typeof error === "string" ? error : JSON.stringify(error);
  const errObj = typeof error === "object" && error !== null ? error : {};
  const message =
    errObj.message ||
    errObj.statusText ||
    (typeof error === "string" ? error : "An unknown error occurred.");

  // Combine message and error string for broader search
  const searchStr = (errString + " " + message).toLowerCase();

  // Check for 503 / Overloaded
  if (
    searchStr.includes("503") ||
    searchStr.includes("overloaded") ||
    searchStr.includes("unavailable")
  ) {
    return {
      title: "Model Busy",
      message:
        "The AI model is currently overloaded with requests. Please try again in a few moments.",
      code: "503",
      actionType: "RETRY_ONLY",
    };
  }

  // Check for 429 / Quota / Exhausted
  if (
    searchStr.includes("429") ||
    searchStr.includes("quota") ||
    searchStr.includes("limit") ||
    searchStr.includes("resource_exhausted")
  ) {
    return {
      title: "Usage Limit Reached",
      message:
        "You've reached your API usage limit. Please check your Google AI Studio quota or switch API keys.",
      code: "429",
      actionType: "RETRY_OR_SETTINGS",
    };
  }

  // Check for Account Suspended / Permission Denied
  if (
    searchStr.includes("suspended") ||
    searchStr.includes("permission denied") ||
    searchStr.includes("permission_denied")
  ) {
    return {
      title: "Account Issue",
      message:
        "There is an issue with your Google AI Studio account (e.g., suspended or permission denied). Please check your account status.",
      code: "403",
      actionType: "RETRY_OR_LINK",
      meta: {
        link: "https://aistudio.google.com/",
        linkLabel: "Check Account",
      },
    };
  }

  // Check for Network / Internet issues
  if (
    searchStr.includes("network") ||
    searchStr.includes("internet") ||
    searchStr.includes("fetch") ||
    searchStr.includes("failed to fetch") ||
    searchStr.includes("load failed")
  ) {
    return {
      title: "Connection Error",
      message:
        "Unable to reach the AI service. Please check your internet connection.",
      actionType: "RETRY_ONLY",
    };
  }

  // Check for Invalid API Key
  if (
    searchStr.includes("api key") ||
    searchStr.includes("unauthenticated") ||
    searchStr.includes("401")
  ) {
    return {
      title: "Authentication Error",
      message: "Your API key appears to be invalid or expired.",
      code: "401",
      actionType: "RETRY_OR_SETTINGS",
    };
  }

  // Default / Unknown Error
  return {
    title: "Error",
    message: message,
    actionType: "DISMISS_ONLY",
  };
};
