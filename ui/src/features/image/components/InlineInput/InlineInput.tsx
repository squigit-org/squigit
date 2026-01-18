/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from "react";
import { ChevronUp, Loader2 } from "lucide-react";
import styles from "./InlineInput.module.css";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onLensClick: (query: string) => void;
  onTranslateClick: () => void;
  onCollapse?: () => void;
  isLensLoading: boolean;
  isTranslateDisabled: boolean;
  isOCRLoading: boolean;
  isExpanded?: boolean;
  placeholder?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onLensClick,
  onTranslateClick,
  onCollapse,
  isLensLoading,
  isTranslateDisabled,
  isOCRLoading,
  isExpanded = false,
  placeholder = "Add to your search",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent new lines
    if (e.key === "Enter") {
      e.preventDefault();
      // Trigger lens search on Enter
      if (!isLensLoading && !isOCRLoading) {
        onLensClick(value);
      }
    }
  };

  return (
    <div className={styles.searchContainer}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isOCRLoading}
        className={styles.searchInput}
      />

      <div className={styles.searchActions}>
        {/* Only show action buttons when not expanded */}
        {!isExpanded && (
          <>
            {/* Google Lens button */}
            <button
              className={styles.actionBtn}
              onClick={() => onLensClick(value)}
              disabled={isLensLoading || isOCRLoading}
              title="Search with Google Lens"
            >
              {isLensLoading ? (
                <Loader2 size={20} className={styles.spinning} />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              )}
            </button>

            {/* Translate button */}
            <button
              className={styles.actionBtn}
              onClick={onTranslateClick}
              disabled={isTranslateDisabled || isOCRLoading}
              title="Translate all text"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 8 6 6" />
                <path d="m4 14 6-6 2-3" />
                <path d="M2 5h12" />
                <path d="M7 2h1" />
                <path d="m22 22-5-10-5 10" />
                <path d="M14 18h6" />
              </svg>
            </button>
          </>
        )}

        {/* Collapse button when expanded */}
        {isExpanded && onCollapse && (
          <button
            className={styles.actionBtn}
            onClick={onCollapse}
            title="Collapse"
          >
            <ChevronUp size={22} />
          </button>
        )}
      </div>
    </div>
  );
};

// Keep ChatInput as an alias for backward compatibility, but it just returns null now
// TODO: Remove this after cleaning up all usages
export const ChatInput: React.FC<{
  startupImage: any;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
  variant?: string;
}> = () => null;

export default SearchInput;
