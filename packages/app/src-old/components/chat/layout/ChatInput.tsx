/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { invoke } from "@tauri-apps/api/core";
import PromptBox from "../PromptBox";

interface ChatInputProps {
  startupImage: { base64: string; mimeType: string } | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  startupImage,
  input,
  onInputChange,
  onSend,
  isLoading,
}) => {
  if (!startupImage) return null;

  return (
    <footer className="border-t border-neutral-900 bg-neutral-950 py-2 backdrop-blur-xl z-10">
      <PromptBox
        value={input}
        onChange={onInputChange}
        onSend={onSend}
        disabled={isLoading || !startupImage}
        isThinking={isLoading}
        placeholder={
          isLoading
            ? "thinking..."
            : "Ask anything..."
        }
        maxRows={7}
      />
      <div className="text-center text-xs text-neutral-400 mt-2">
        <span>AI responses may include mistakes. </span>
        <button
          onClick={() => {
            invoke("open_external_url", {
              url: "https://support.google.com/websearch?p=ai_overviews",
            });
          }}
          className="underline"
        >
          Learn more
        </button>
      </div>
    </footer>
  );
};