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
import { AlertCircle } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import "katex/dist/katex.min.css";

import { Message } from "../types";
import { ChatBubble } from "./ChatBubble";
import { ContextMenu } from "./ContextMenu";
import { SettingsPanel } from "./SettingsPanel";
import { ModelSelector } from "./ModelSelector";
import LensButton from "./LensButton";
import PromptBox from "./PromptBox";
import './ChatLayout.css';

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
  onRetry: () => void;
  onSavePrompt: (prompt: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onInputChange: (value: string) => void;
  toggleSettingsPanel: () => void;
  isPanelActive: boolean;
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
  startupImage,
  prompt,
  userName,
  userEmail,
  avatarSrc,
  isDarkMode,
  onSend,
  onModelChange,
  onRetry,
  onSavePrompt,
  onLogout,
  onToggleTheme,
  onInputChange,
  toggleSettingsPanel,
  isPanelActive,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [isPanelActiveAndVisible, setIsPanelActiveAndVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const closeSettingsPanel = () => {
    if (isPanelActive) {
      toggleSettingsPanel();
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isPanelActive) {
          closeSettingsPanel();
        }
      }
    };
    document.addEventListener("keydown", handleEsc);

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        isPanelActive &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        closeSettingsPanel();
      }
    };
    document.addEventListener("click", handleOutsideClick);

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [isPanelActive]);

  return (
    <div
      onContextMenu={handleContextMenu}
      className="flex h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100"
    >
      <header className="flex items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <img src="assets/gem.svg" alt="Gem Icon" className="h-6 w-6" />
            <span className="text-lg font-semibold text-neutral-200">
              AI Overview
            </span>
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

            {isChatMode && (
              <div className="space-y-8 flex flex-col-reverse">
                {error && (
                  <div className="error-overlay">
                    <div className="error-container">
                      <div className="flex items-center gap-3 text-sm text-red-200">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={onRetry}
                          disabled={!startupImage || !prompt}
                          className="rounded-full border border-red-900-50 px-3 py-1 text-xs text-red-200 transition-colors hover:border-red-500-60 disabled:opacity-50"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  </div>
                )}

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
                if ("ipc" in window) {
                  (window as any).ipc.openExternalUrl(
                    "https://support.google.com/websearch?p=ai_overviews"
                  );
                }
              }}
              className="underline"
            >
              Learn more
            </button>
          </div>
        </footer>
      )}

      {isPanelVisible && (
        <>
          <div
            id="panel-overlay"
            className={`${isPanelActiveAndVisible ? "active" : ""} ${
              isPanelClosing ? "closing" : ""
            }`}
            onClick={closeSettingsPanel}
          />
          <div
            className={`panel ${isPanelActiveAndVisible ? "active" : ""} ${
              isPanelClosing ? "closing" : ""
            }`}
            id="panel"
            ref={panelRef}
          >
            <div className="panel-content" id="settings-content">
              <SettingsPanel
                currentPrompt={prompt}
                userName={userName}
                userEmail={userEmail}
                avatarSrc={avatarSrc}
                onSavePrompt={onSavePrompt}
                onLogout={onLogout}
                isDarkMode={isDarkMode}
                onToggleTheme={onToggleTheme}
              />
            </div>
            <div className="footer">
              <p>SpatialShot &copy; 2025</p>
            </div>
          </div>
        </>
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
