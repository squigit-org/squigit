import { useCallback } from "react";
import { usePlatform } from "./usePlatform";

type KeyHandler = (e: React.KeyboardEvent) => void;
type KeyMap = Record<string, KeyHandler>;

interface UseKeyDownOptions {
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export function useKeyDown(keyMap: KeyMap, options: UseKeyDownOptions = {}) {
  const { isMac } = usePlatform();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Create a list of pressed modifiers
      const modifiers: string[] = [];
      if (e.metaKey && isMac) modifiers.push("Mod");
      if (e.ctrlKey && !isMac) modifiers.push("Mod");
      if (e.ctrlKey && isMac) modifiers.push("Ctrl"); // Explicit Ctrl on Mac
      if (e.metaKey && !isMac) modifiers.push("Meta"); // Explicit Meta on Win/Linux
      if (e.altKey) modifiers.push("Alt");
      if (e.shiftKey) modifiers.push("Shift");

      // Normalize key (e.g. "Enter", "a", "Escape")
      const key = e.key;

      // Construct shortcut strings to check
      // 1. Full match: "Mod+Shift+Enter"
      const combo = [...modifiers, key].join("+");

      // Check for exact matches first
      if (keyMap[combo]) {
        if (options.preventDefault !== false) e.preventDefault();
        if (options.stopPropagation) e.stopPropagation();
        keyMap[combo](e);
        return;
      }

      // Check for key-only match if no modifiers, or if strict mode isn't enforced
      // For now, let's keep it simple: if you defined "Enter", it matches Enter with no modifiers
      // If you want "Shift+Enter", you must define it.
      if (modifiers.length === 0 && keyMap[key]) {
        if (options.preventDefault !== false) e.preventDefault();
        if (options.stopPropagation) e.stopPropagation();
        keyMap[key](e);
      }
    },
    [keyMap, isMac, options.preventDefault, options.stopPropagation],
  );

  return handleKeyDown;
}
