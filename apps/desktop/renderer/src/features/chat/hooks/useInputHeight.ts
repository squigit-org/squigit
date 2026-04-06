/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, RefObject } from "react";

const BOTTOM_THRESHOLD_PX = 48;

export function useInputHeight({
  scrollContainerRef,
  wasAtBottomRef,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  wasAtBottomRef: React.MutableRefObject<boolean>;
}) {
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState(0);

  useEffect(() => {
    const el = inputContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const scrollEl = scrollContainerRef.current;
      if (scrollEl) {
        const distanceFromBottom =
          scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
        wasAtBottomRef.current = distanceFromBottom < BOTTOM_THRESHOLD_PX;
      }

      for (const entry of entries) {
        setInputHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollContainerRef, wasAtBottomRef]);

  return { inputContainerRef, inputHeight };
}
