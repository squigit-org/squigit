/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { MODELS } from "../../../../types";

interface ModelSelectorProps {
  currentModel: string;
  onModelChange: (modelId: string) => void;
  isLoading: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  onModelChange,
  isLoading,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const orderedModels = [
    MODELS.find((m) => m.id === "gemini-2.5-pro"),
    MODELS.find((m) => m.id === "gemini-2.5-flash"),
    MODELS.find((m) => m.id === "gemini-flash-lite-latest"),
  ].filter((m): m is (typeof MODELS)[number] => !!m);
  const selectedModel = MODELS.find((m) => m.id === currentModel);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
  };

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!next && buttonRef.current) {
        buttonRef.current.blur();
      }
      return next;
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        disabled={isLoading}
        className="flex items-center justify-between min-w-[92px] px-2 py-2 text-sm font-medium text-neutral-100 bg-transparent rounded-md transition-colors focus:outline-none disabled:opacity-50 hover:bg-neutral-900 focus:bg-neutral-900"
      >
        <span>
          {selectedModel?.id === "gemini-2.5-pro"
            ? "2.5 pro"
            : selectedModel?.id === "gemini-2.5-flash"
            ? "2.5 flash"
            : selectedModel?.id === "gemini-flash-lite-latest"
            ? "2.5 lite"
            : "Select Model"}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-44 mt-2 bg-neutral-950 border border-neutral-800 rounded-md shadow-lg">
          <ul className="py-2">
            {orderedModels.map((model) => (
              <li
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                className={`flex items-center justify-between px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-900 cursor-pointer rounded mx-1 ${
                  model.id === currentModel ? "font-semibold" : ""
                }`}
              >
                <span>{model.name}</span>
                {model.id === currentModel && (
                  <Check size={16} style={{ color: "var(--brand-primary)" }} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
