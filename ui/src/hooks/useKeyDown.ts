import { useCallback } from "react";

type KeyHandler = (e: React.KeyboardEvent) => void;
type KeyMap = Record<string, KeyHandler>;

export function useKeyDown(keyMap: KeyMap) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const handler = keyMap[e.key];
      if (handler) {
        handler(e);
      }
    },
    [keyMap],
  );

  return handleKeyDown;
}
