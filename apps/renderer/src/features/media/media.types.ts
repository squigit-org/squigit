/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export type MediaViewerKind = "image" | "pdf" | "text";

export interface MediaThreadReference {
  id: string;
  title: string;
  updatedAt: string;
}

export interface MediaGalleryItem {
  path: string;
  sourcePath?: string;
  name: string;
  extension: string;
  imageThreads?: MediaThreadReference[];
}

export interface MediaViewerItem {
  kind: MediaViewerKind;
  path: string;
  attachmentPath?: string;
  threadId?: string;
  sourcePath?: string;
  name: string;
  extension: string;
  textContent?: string;
  isGallery?: boolean;
  imageThreads?: MediaThreadReference[];
  galleryItems?: MediaGalleryItem[];
  galleryIndex?: number;
  openedFromThread?: boolean;
}
