/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CodeBlockProps {
  /** Programming language for syntax highlighting */
  language: string;
  /** The code content to display */
  value: string;
  /** Enable textarea editing mode */
  isEditable?: boolean;
  /** Callback when content changes (editable mode only) */
  onChange?: (value: string) => void;
  /** Keyboard event handler for textarea */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Placeholder text for empty editable blocks */
  placeholder?: string;
  /** Enable/Disable sticky header (Default: true) */
  stickyHeader?: boolean;
  /** Indicates code is being streamed (shows cursor, skips highlighting) */
  isStreaming?: boolean;
}
