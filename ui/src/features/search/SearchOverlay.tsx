/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { WidgetOverlay } from "@/components";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <WidgetOverlay isOpen={isOpen} onClose={onClose}>
      hi i'm future search engine
    </WidgetOverlay>
  );
};
