/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { AlertCircle, Settings, RotateCw } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import "katex/dist/katex.min.css";

import { Message } from "../../types";
import { ChatBubble } from "./ChatBubble";
import { ContextMenu } from "./ContextMenu";
import { SettingsPanel } from "./SettingsPanel";
import { ModelSelector } from "./ModelSelector";
import LensButton from "./LensButton";
import PromptBox from "./PromptBox";
import { MsgBox } from "./MsgBox";
import { invoke } from "@tauri-apps/api/core";
import "./ChatLayout.css";

const StreamingResponse: React.FC<{ text: string }> = ({ text }) => {
  const markdownComponents = useMemo(
    () => ({
      code({ node, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const isInline = !match && !String(children).includes("\n");

        if (!isInline) {
          return (
            <CodeBlock
              language={match ? match[1] : ""}
              value={String(children).replace(/\n$/, "")}
            />
          );
        }
        return (
          <code
            className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200"
            {...props}
          >
            {children}
          </code>
        );
      },

      a: ({ node, ...props }: any) => (
        <a
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
        />
      ),
    }),
    []
  );
  if (!text) return null;
  return (
    <div className="text-neutral-300 leading-relaxed space-y-4 mt-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export interface ChatLayoutProps {
  // States from engine
  messages: Message[];
  streamingText: string;
  isChatMode: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  lastSentMessage: Message | null;

  // States from App
  input: string;
  currentModel: string;
  editingModel: string;

  // System-related states
  startupImage: { base64: string; mimeType: string } | null;
  prompt: string;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  isDarkMode: boolean;

  // Handlers
  onSend: () => void;
  onModelChange: (model: string) => void;
  onEditingModelChange: (model: string) => void;
  onRetry: () => void;
  onSave: (prompt: string, model: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onInputChange: (value: string) => void;
  setPrompt: (prompt: string) => void;
  toggleSettingsPanel: () => void;
  isPanelActive: boolean;
  onResetAPIKey: () => void;
  onReload?: () => void;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  messages,
  streamingText,
  isChatMode,
  isLoading,
  isStreaming,
  error,
  lastSentMessage,
  input,
  currentModel,
  editingModel,
  startupImage,
  prompt,
  userName,
  userEmail,
  avatarSrc,
  isDarkMode,
  onSend,
  onModelChange,
  onEditingModelChange,
  onRetry,
  onSave,
  onLogout,
  onToggleTheme,
  onInputChange,
  setPrompt,
  toggleSettingsPanel,
  onCheckSettings,
  isPanelActive,
  onResetAPIKey,
  onReload,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<{ handleClose: () => Promise<boolean> }>(
    null
  );
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [isSubviewActive, setIsSubviewActive] = useState(false);

  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [isPanelActiveAndVisible, setIsPanelActiveAndVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [isRotating, setIsRotating] = useState(false);

  useEffect(() => {
    // Stop rotating when loading is finished
    if (!isLoading) {
      setIsRotating(false);
    }
  }, [isLoading]);

  const handleReload = () => {
    if (onReload) {
      setIsRotating(true);
      onReload();
    }
  };

  const handleToggleSubview = (isActive: boolean) => {
    setIsSubviewActive(isActive);
  };

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selectedText = window.getSelection()?.toString() || "";
    if (selectedText) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText,
      });
    }
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleCopy = () => {
    if (contextMenu?.selectedText) {
      navigator.clipboard.writeText(contextMenu.selectedText);
    }
  };

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) {
        handleCloseContextMenu();
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useLayoutEffect(() => {
    if (isStreaming) return;

    if (messages.length > 0) {
      scrollToBottom("smooth");
    }
  }, [messages.length]);

  useEffect(() => {
    if (isPanelActive) {
      setIsPanelVisible(true);
      const timer = setTimeout(() => {
        setIsPanelActiveAndVisible(true);
      }, 10); // small delay
      return () => clearTimeout(timer);
    } else {
      setIsPanelActiveAndVisible(false);
      setIsPanelClosing(true);
      const timer = setTimeout(() => {
        setIsPanelVisible(false);
        setIsPanelClosing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPanelActive]);

  const closeSettingsPanel = async () => {
    if (isPanelActive) {
      if (settingsPanelRef.current) {
        const canClose = await settingsPanelRef.current.handleClose();
        if (canClose) {
          toggleSettingsPanel();
        }
      } else {
        toggleSettingsPanel();
      }
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isPanelActive) closeSettingsPanel();
      }
    };
    document.addEventListener("keydown", handleEsc);

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // FIX: Check if click is inside the MsgBox portal
      const isMsgBoxClick =
        target.closest(".error-overlay") || target.closest(".error-container");

      if (
        isPanelActive &&
        panelRef.current &&
        !panelRef.current.contains(target as Node) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(target as Node) &&
        !isMsgBoxClick // <--- Crucial Fix: Don't close panel if clicking the Alert
      ) {
        closeSettingsPanel();
      }
    };
    document.addEventListener("click", handleOutsideClick);

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [isPanelActive, isSubviewActive]);

  const [showUpdate, setShowUpdate] = useState(false);

  return (
    <div
      onContextMenu={handleContextMenu}
      className="flex h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100"
    >
      <header className="flex items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-2">
          <div className="relative z-50">
            <button
              ref={settingsButtonRef}
              onClick={toggleSettingsPanel}
              className={`p-2 transition-colors rounded-lg ${
                isPanelActive
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
              }`}
              title="Settings"
            >
              <Settings size={20} />
            </button>
            <button
              onClick={handleReload}
              className={`p-2 transition-colors rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 ${
                isRotating ? "rotating" : ""
              }`}
              title="Reload chat"
              disabled={isRotating}
            >
              <RotateCw size={20} />
            </button>
            {isPanelVisible && (
              <div
                className={`panel ${isPanelActiveAndVisible ? "active" : ""} ${
                  isPanelClosing ? "closing" : ""
                }`}
                id="panel"
                ref={panelRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "0",
                  right: "auto",
                  marginTop: "0.5rem",
                }}
              >
                <div className="panel-content" id="settings-content">
                  <SettingsPanel
                    ref={settingsPanelRef}
                    currentPrompt={prompt}
                    currentModel={editingModel}
                    onPromptChange={setPrompt}
                    onModelChange={onEditingModelChange}
                    userName={userName}
                    userEmail={userEmail}
                    avatarSrc={avatarSrc}
                    onSave={onSave}
                    onLogout={onLogout}
                    isDarkMode={isDarkMode}
                    onToggleTheme={onToggleTheme}
                    onResetAPIKey={onResetAPIKey}
                    toggleSubview={handleToggleSubview}
                    toggleSettingsPanel={toggleSettingsPanel}
                  />
                </div>
                <div className="footer">
                  <p>Spatialshot &copy; 2025</p>
                </div>
              </div>
            )}
          </div>
          <div>
            <ModelSelector
              currentModel={currentModel}
              onModelChange={onModelChange}
              isLoading={isLoading}
            />
          </div>
        </div>
        <LensButton isChatMode={isChatMode} />
      </header>

      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
        <main>
          <div className="mx-auto w-full max-w-4xl px-4 md:px-8">
            {startupImage && !isChatMode && (
              <div className="min-h-[60vh]">
                {isLoading && !streamingText ? (
                  <div className="space-y-4 pt-8" aria-hidden="true">
                    <div className="shimmer-line shimmer-line-1 w-3/4" />
                    <div className="shimmer-line shimmer-line-2 w-full" />
                    <div className="shimmer-line shimmer-line-3 w-full" />
                    <div className="shimmer-line shimmer-line-4 w-5/6" />
                    <div className="shimmer-line shimmer-line-5 w-1/2" />
                    <div className="shimmer-line shimmer-line-6 w-3/4" />
                    <div className="shimmer-line shimmer-line-7 w-4/5" />
                    <div className="shimmer-line shimmer-line-8 w-2/3" />
                  </div>
                ) : (
                  <StreamingResponse text={streamingText} />
                )}
              </div>
            )}

            <MsgBox
              isOpen={!!error}
              variant="error"
              title="Connection Error"
              message={error || ""}
              actions={[
                {
                  label: "Check Settings",
                  onClick: onCheckSettings,
                  variant: "secondary",
                },
                {
                  label: "Retry",
                  onClick: onRetry,
                  variant: "danger",
                  disabled: !startupImage || !prompt,
                },
              ]}
            />

            <MsgBox
              isOpen={showUpdate}
              variant="update"
              title="New Update Available"
              message="Version 1.2.0 is available with better caching."
              actions={[
                {
                  label: "Maybe Later",
                  onClick: () => setShowUpdate(false),
                  variant: "secondary",
                },
                {
                  label: "Update Now",
                  onClick: () => {
                    alert("Backend not connected yet!");
                    setShowUpdate(false);
                  },
                  variant: "primary",
                },
              ]}
            />

            {isChatMode && (
              <div className="space-y-8 flex flex-col-reverse">
                {isLoading && (
                  <div className="space-y-4 pt-8 pb-4" aria-hidden="true">
                    <div className="shimmer-line shimmer-line-1 w-3/4" />
                    <div className="shimmer-line shimmer-line-2 w-full" />
                  </div>
                )}

                {messages
                  .slice()
                  .reverse()
                  .map((msg) => (
                    <div key={msg.id} className="mb-8">
                      <ChatBubble message={msg} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {startupImage && (
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
                : startupImage
                ? "Ask anything..."
                : "Waiting for image..."
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
      )}

      <div id="feedbackMessage" className="feedback-message"></div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedText={contextMenu.selectedText}
          onCopy={handleCopy}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};
