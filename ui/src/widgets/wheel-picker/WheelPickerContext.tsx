/**
 * @license
 * Copyright (c) ncdai
 * SPDX-License-Identifier: MIT
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type WheelPickerGroupContextValue = {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  register: (existingIndex: number | null, ref: HTMLDivElement) => number;
  getPickerRef: (index: number) => HTMLDivElement | null;
  getPickerIndices: () => number[];
};

const WheelPickerGroupContext =
  createContext<WheelPickerGroupContextValue | null>(null);

export function useWheelPickerGroup() {
  return useContext(WheelPickerGroupContext);
}

export function WheelPickerGroupProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const counterRef = useRef(0);
  const pickerRefsRef = useRef(new Map<number, HTMLDivElement>());

  const register = useCallback(
    (existingIndex: number | null, ref: HTMLDivElement) => {
      const index =
        existingIndex !== null ? existingIndex : counterRef.current++;
      pickerRefsRef.current.set(index, ref);

      // First picker becomes active by default
      setActiveIndex((current) => (current === -1 ? index : current));

      return index;
    },
    [],
  );

  const getPickerRef = useCallback(
    (index: number) => pickerRefsRef.current.get(index) ?? null,
    [],
  );

  const getPickerIndices = useCallback(
    () => Array.from(pickerRefsRef.current.keys()).sort((a, b) => a - b),
    [],
  );

  const value = useMemo<WheelPickerGroupContextValue>(
    () => ({
      activeIndex,
      setActiveIndex,
      register,
      getPickerRef,
      getPickerIndices,
    }),
    [activeIndex, setActiveIndex, register, getPickerRef, getPickerIndices],
  );

  return (
    <WheelPickerGroupContext.Provider value={value}>
      {children}
    </WheelPickerGroupContext.Provider>
  );
}
