/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo, forwardRef } from "react";
import { CodeBlockEditable } from "./CodeBlockEditable";
import { CodeBlockViewer } from "./CodeBlockViewer";
import type { CodeBlockProps } from "../../types";

/**
 * CodeBlock component for displaying and editing code.
 *
 * Renders as either:
 * - **Editable**: A textarea for code input (when `isEditable` is true)
 * - **Viewer**: Syntax-highlighted read-only code (default)
 *
 * Features:
 * - Dual-theme syntax highlighting (Shiki)
 * - Copy to clipboard with visual feedback
 * - Language detection and fallback
 *
 * @example
 * ```tsx
 * // Read-only code display
 * <CodeBlock language="typescript" value={code} />
 *
 * // Editable code input
 * <CodeBlock
 *   language="javascript"
 *   value={code}
 *   isEditable
 *   onChange={setCode}
 * />
 * ```
 */
const CodeBlockComponent = forwardRef<HTMLTextAreaElement, CodeBlockProps>(
  (
    { language, value, isEditable = false, onChange, onKeyDown, placeholder },
    ref
  ) => {
    if (isEditable) {
      return (
        <CodeBlockEditable
          ref={ref}
          language={language}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
      );
    }

    return <CodeBlockViewer language={language} value={value} />;
  }
);

CodeBlockComponent.displayName = "CodeBlock";

/**
 * Memoized CodeBlock component to prevent unnecessary re-renders.
 */
export const CodeBlock = memo(CodeBlockComponent);
