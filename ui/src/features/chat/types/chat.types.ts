/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MessageAction {
  type: "button" | "radio" | "link";
  id: string;
  label: string;
  /** For radio groups — actions with the same group are mutually exclusive */
  group?: string;
  variant?: "primary" | "secondary";
  /** For link actions */
  href?: string;
  /** Whether this action is initially disabled */
  disabled?: boolean;
  /** Whether this action is initially selected (for radio groups) */
  selected?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  image?: string;
  timestamp: number;
  /** Interactive actions rendered after the message text */
  actions?: MessageAction[];
}

export interface AppConfig {
  google_gemini: {
    api_key: string;
    api_endpoint: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  streamingText: string;
  firstResponseId: string | null;
  createdAt: number;
  type: "default" | "edit";
}
