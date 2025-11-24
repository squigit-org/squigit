import React, { useEffect, useState, memo, forwardRef } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighterInstance = async () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["dracula", "github-light"],
      langs: [
        "javascript",
        "typescript",
        "tsx",
        "jsx",
        "json",
        "python",
        "rust",
        "cpp",
        "bash",
        "html",
        "css",
      ],
    });
  }
  return highlighterPromise;
};

interface CodeBlockProps {
  language: string;
  value: string;
  isEditable?: boolean;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}

const CodeBlockComponent = forwardRef<HTMLTextAreaElement, CodeBlockProps>(
  (
    { language, value, isEditable = false, onChange, onKeyDown, placeholder },
    ref
  ) => {
    const [isCopied, setIsCopied] = useState(false);
    const [highlightedCode, setHighlightedCode] = useState<string>("");
    const [isLoading, setIsLoading] = useState(
      !isEditable && language !== "text"
    );

    useEffect(() => {
      if (isEditable || language === "text") {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      let isMounted = true;

      const highlight = async () => {
        try {
          const highlighter = await getHighlighterInstance();
          const lang = highlighter.getLoadedLanguages().includes(language)
            ? language
            : "bash";

          const html = highlighter.codeToHtml(value, {
            lang,
            themes: {
              light: "github-light",
              dark: "dracula",
            },
            defaultColor: false,
          });

          if (isMounted) {
            setHighlightedCode(html);
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Shiki error:", error);
          if (isMounted) setIsLoading(false);
        }
      };

      highlight();

      return () => {
        isMounted = false;
      };
    }, [value, language, isEditable]);

    const handleCopy = () => {
      navigator.clipboard.writeText(value).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
      });
    };

    if (isEditable) {
      return (
        <div className="code-block my-4 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-850 font-mono text-sm shadow-sm">
          <div className="flex items-center justify-between bg-neutral-800/80 px-4 py-2 text-neutral-400">
            <div className="flex items-center gap-2">
              <Terminal size={14} />
              <span className="text-xs font-medium lowercase">
                {language || "text"}
              </span>
            </div>
          </div>
          <textarea
            ref={ref}
            className="w-full h-full bg-transparent p-4 text-neutral-300 font-mono text-sm leading-relaxed resize-none outline-none"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={5}
          />
        </div>
      );
    }

    return (
      <div className="code-block my-4 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-850 font-mono text-sm shadow-sm">
        {/* Header - Adapts to Light/Dark automatically via Tailwind classes */}
        <div className="flex items-center justify-between bg-neutral-800/80 px-4 py-2 text-neutral-400">
          <div className="flex items-center gap-2">
            <Terminal size={14} />
            <span className="text-xs font-medium lowercase">
              {language || "text"}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs transition-colors duration-200 hover:text-black dark:hover:text-white"
            disabled={isCopied}
          >
            {isCopied ? (
              <>
                <Check
                  size={14}
                  className="text-green-500 dark:text-green-400"
                />{" "}
                Copied
              </>
            ) : (
              <>
                <Copy size={14} /> Copy
              </>
            )}
          </button>
        </div>

        <div className="relative w-full overflow-x-auto p-4">
          {isLoading ? (
            <pre className="text-neutral-900 dark:text-neutral-300 font-mono text-sm leading-relaxed">
              {value}
            </pre>
          ) : language === "text" ? (
            <pre className="text-neutral-900 dark:text-neutral-300 font-mono text-sm leading-relaxed">
              {value}
            </pre>
          ) : (
            <div
              className="shiki-dual-theme text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          )}
        </div>
      </div>
    );
  }
);

CodeBlockComponent.displayName = "CodeBlock";

export const CodeBlock = memo(CodeBlockComponent);
