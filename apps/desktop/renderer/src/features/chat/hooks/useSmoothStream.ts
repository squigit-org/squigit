import { useState, useEffect, useRef } from "react";

function hideIncompleteCodeBlocks(text: string): { text: string; isWritingCode: boolean } {
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockMarker = '';
  let startLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*(`{3,})/);
    
    if (!inCodeBlock) {
      if (match) {
        inCodeBlock = true;
        codeBlockMarker = match[1];
        startLineIndex = i;
      }
    } else {
      if (line.trim().startsWith(codeBlockMarker)) {
        inCodeBlock = false;
        codeBlockMarker = '';
      }
    }
  }

  if (inCodeBlock) {
    const beforeCode = lines.slice(0, startLineIndex).join('\n');
    return { text: beforeCode, isWritingCode: true };
  }
  
  return { text, isWritingCode: false };
}

export function useSmoothStream(rawText: string, isStreaming: boolean): { text: string; isWritingCode: boolean } {
  const [displayedText, setDisplayedText] = useState("");
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(rawText);
      return;
    }

    const drain = () => {
      setDisplayedText((current) => {
        if (current.length < rawText.length) {
          const diff = rawText.length - current.length;
          const charsToAdd = Math.max(8, Math.floor(diff / 4));
          return rawText.slice(0, current.length + charsToAdd);
        }
        return current;
      });
      rafRef.current = requestAnimationFrame(drain);
    };

    rafRef.current = requestAnimationFrame(drain);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rawText, isStreaming]);

  return isStreaming ? hideIncompleteCodeBlocks(displayedText) : { text: displayedText, isWritingCode: false };
}
