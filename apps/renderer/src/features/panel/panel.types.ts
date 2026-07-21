/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ThreadMetadata,
  WorkspaceMetadata,
} from "@squigit/core/config";

export type PanelVariant = "panel" | "flat";
export type WorkspaceOrdering = "created" | "updated";

export interface PanelPoint {
  x: number;
  y: number;
}

export interface PanelThreadMenuState extends PanelPoint {
  id: string;
}

export interface PanelWorkspace
  extends Omit<WorkspaceMetadata, "threads"> {
  threads: ThreadMetadata[];
}

export interface PanelMoveWorkspace {
  id: string;
  name: string;
}

export interface PanelThreadMoveAnimation {
  threadId: string;
  origin: PanelPoint;
  token: number;
}

export interface SidePanelProps {
  variant?: PanelVariant;
  onNavigate?: () => void;
}
