import React, { useRef, useState, useEffect, useCallback } from "react";
import { useHistoryState } from "./useHistoryState";
import { useClipboard } from "../widgets"; // Assuming this is where it is, based on previous file reads

interface UseTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  preventNewLine?: boolean; // For single-line inputs like search bars
}

export function useTextEditor({
  value,
  onChange,
  onSubmit,
  preventNewLine = false,
}: UseTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  const { undo, redo } = useHistoryState({
    value,
    onChange,
  });

  const { readText } = useClipboard();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleSelectionChange = () => {
      if (document.activeElement === el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        setHasSelection(start !== end);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  const handleSelectAll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.select();
    setHasSelection(true);
  }, []);

  const handleCopy = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const selectedText = el.value.substring(
      el.selectionStart || 0,
      el.selectionEnd || 0,
    );
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
    }
  }, []);

  const handleCut = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selectedText = el.value.substring(start, end);

    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      const newValue = el.value.substring(0, start) + el.value.substring(end);
      onChange(newValue);

      // We need to restore cursor position after render
      setTimeout(() => {
        if (ref.current) {
          ref.current.setSelectionRange(start, start);
          ref.current.focus();
        }
      }, 0);
    }
  }, [onChange]);

  const handlePaste = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    // Ensure focus
    el.focus();

    try {
      const text = await readText();
      if (!text) return;

      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const newValue =
        el.value.substring(0, start) + text + el.value.substring(end);

      onChange(newValue);
      const newCursorPos = start + text.length;

      setTimeout(() => {
        if (ref.current) {
          ref.current.setSelectionRange(newCursorPos, newCursorPos);
          ref.current.focus();
        }
      }, 0);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  }, [onChange, readText]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        switch (key) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            return;
          case "y":
            e.preventDefault();
            redo();
            return;
          case "a":
            e.preventDefault();
            handleSelectAll();
            return;
          // Native copy/cut/paste often work better, but for custom inputs we might need them?
          // The previous code kept custom handlers mostly for context menu consistency,
          // but for keydown, native behavior is usually preferred unless we are overriding history.
          // However, to match previous behavior explicitly:
          /* case 'c': 
              // Native copy is usually fine
              break;
           */
        }
      }

      if (e.key === "Enter") {
        if (preventNewLine) {
          e.preventDefault();
          if (onSubmit) onSubmit();
        } else if (!e.shiftKey && onSubmit) {
          // For multiline textareas, Enter sends, Shift+Enter newlines
          e.preventDefault();
          if (value.trim().length > 0) onSubmit();
        }
      }
    },
    [redo, undo, handleSelectAll, onSubmit, preventNewLine, value],
  );

  return {
    ref,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleKeyDown,
    undo,
    redo,
  };
}
