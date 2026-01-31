/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo, forwardRef } from "react";
import { CodeBlockEditable } from "./CodeBlockEditable";
import { CodeBlockViewer } from "./CodeBlockViewer";
import type { CodeBlockProps } from "../../types";

const CodeBlockComponent = forwardRef<HTMLTextAreaElement, CodeBlockProps>(
  (
    {
      language,
      value,
      isEditable = false,
      onChange,
      onKeyDown,
      placeholder,
      stickyHeader,
    },
    ref,
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

    return (
      <CodeBlockViewer
        language={language}
        value={value}
        stickyHeader={stickyHeader}
      />
    );
  },
);

CodeBlockComponent.displayName = "CodeBlock";

export const CodeBlock = memo(CodeBlockComponent);
