import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import { Send } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

const ExpandIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 10V4h6" />
    <path d="M20 14v6h-6" />
  </svg>
);

const CollapseIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 4v6H4" />
    <path d="M14 20v-6h6" />
  </svg>
);

type PromptBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isThinking?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxRows?: number;
  className?: string;
};

const PromptBox: React.FC<PromptBoxProps> = ({
  value,
  onChange,
  onSend,
  isThinking = false,
  disabled = false,
  placeholder = "Ask anything...",
  maxRows = 10,
  className = "",
}) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const codeTaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineHeightRef = useRef<number>(24);

  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);

  const [isCodeBlockActive, setIsCodeBlockActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("");
  const [originalCodeLanguage, setOriginalCodeLanguage] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [consecutiveEnters, setConsecutiveEnters] = useState(0);

  const isExpandedLayout = value.includes("\n") || isCodeBlockActive;

  useEffect(() => {
    if (isCodeBlockActive) {
      codeTaRef.current?.focus();
    }
  }, [isCodeBlockActive]);

  const adjustHeight = () => {
    const ta = taRef.current;
    if (!ta) return;

    ta.style.height = "auto";
    const scrollHeight = ta.scrollHeight;

    const standardMaxHeight = lineHeightRef.current * maxRows;
    const effectiveMaxHeight = isManualExpanded
      ? standardMaxHeight * 2
      : standardMaxHeight;

    if (scrollHeight > standardMaxHeight) {
      setShowExpandBtn(true);
    } else {
      setShowExpandBtn(false);
    }

    if (scrollHeight > effectiveMaxHeight) {
      ta.style.height = `${effectiveMaxHeight}px`;
      ta.style.overflowY = "auto";
    } else {
      ta.style.height = `${scrollHeight}px`;
      ta.style.overflowY = "hidden";
    }
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, maxRows, isManualExpanded, isExpandedLayout]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isThinking && value.trim().length > 0) onSend();
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsCodeBlockActive(false);
      onChange(`${value}\`\`\`${originalCodeLanguage}\n`);
      setCodeValue("");
      setCodeLanguage("");
      setOriginalCodeLanguage("");
      setConsecutiveEnters(0);
      setTimeout(() => {
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          const end = ta.value.length;
          ta.setSelectionRange(end, end);
        }
      }, 0);
    } else if (e.key === "Enter") {
      setConsecutiveEnters((prev) => prev + 1);
      if (consecutiveEnters >= 2) {
        // 3rd enter
        setIsCodeBlockActive(false);
        const newPrompt = `${value}\n\`\`\`${codeLanguage}\n${codeValue.trim()}\n\`\`\`\n`;
        onChange(newPrompt);
        setCodeValue("");
        setCodeLanguage("");
        setOriginalCodeLanguage("");
        setConsecutiveEnters(0);
        setTimeout(() => taRef.current?.focus(), 0);
      }
    } else {
      setConsecutiveEnters(0);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const match = newValue.match(/(^|\n)```(\w*)\n$/);

    if (match && !isCodeBlockActive) {
      const codeBlockCount = (newValue.match(/```/g) || []).length;
      if (codeBlockCount % 2 === 1) {
        setIsCodeBlockActive(true);
        setOriginalCodeLanguage(match[2]);
        setCodeLanguage(match[2] || "text");
        onChange(newValue.replace(/(^|\n)```(\w*)\n$/, "$1"));
      } else {
        onChange(newValue);
      }
    } else {
      onChange(newValue);
    }
  };

  const isButtonActive =
    !disabled &&
    !isThinking &&
    (value.trim().length > 0 || codeValue.trim().length > 0);

  return (
    <div className={`w-full max-w-4xl mx-auto px-4 ${className}`}>
      <div
        className={`
          relative flex w-full gap-2 p-2
          bg-transparent rounded-3xl border border-neutral-700
          transition-all duration-200
          
          focus-within:border-neutral-500/80
          focus-within:shadow-[0_0_15px]
          focus-within:shadow-effects-glow
          
          ${disabled ? "opacity-80" : ""}
          ${isExpandedLayout ? "flex-col" : "flex-row items-end"}
        `}
      >
        {/* Expand/Collapse Button */}
        {showExpandBtn && isExpandedLayout && !isCodeBlockActive && (
          <div className="absolute top-2 right-2 z-10">
            <button
              type="button"
              onClick={() => setIsManualExpanded(!isManualExpanded)}
              className="p-1.5 text-neutral-500 hover:text-neutral-300 bg-transparent rounded transition-colors"
              title={isManualExpanded ? "Collapse" : "Expand"}
            >
              {isManualExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          </div>
        )}

        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={`
            bg-transparent text-base text-neutral-100 
            placeholder:text-neutral-500 outline-none resize-none 
            leading-normal pl-4 py-3
            
            ${isExpandedLayout ? "w-[calc(100%-2rem)]" : "flex-1"}
            
            pr-4
            scrollbar-thin 
            scrollbar-thumb-neutral-800 
            hover:scrollbar-thumb-neutral-900 
            scrollbar-track-transparent
          `}
          style={{
            minHeight: "24px",
            caretColor: "neutral-550",
          }}
        />

        {isCodeBlockActive && (
          <CodeBlock
            ref={codeTaRef}
            language={codeLanguage}
            value={codeValue}
            isEditable={true}
            onChange={setCodeValue}
            onKeyDown={handleCodeKeyDown}
            placeholder={`Enter ${codeLanguage} code... (3 newlines to exit)`}
          />
        )}

        {/* Footer / Send Area */}
        <div
          className={`
            flex items-center pb-1 pr-2
            ${isExpandedLayout ? "self-end justify-end w-full" : ""}
          `}
        >
          <button
            type="button"
            onClick={() => {
              if (isButtonActive) onSend();
            }}
            disabled={
              disabled || isThinking || (!value.trim() && !codeValue.trim())
            }
            title={isThinking ? "Thinking..." : "Send"}
            className={`
              rounded-lg p-2 transition-colors 
              flex items-center justify-center
              ${
                isButtonActive
                  ? "hover:bg-neutral-800 text-neutral-200"
                  : "cursor-default opacity-50 text-neutral-500 hover:bg-transparent"
              }
            `}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptBox;
