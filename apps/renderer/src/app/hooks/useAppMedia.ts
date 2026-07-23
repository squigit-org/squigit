/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from "react";
import { commands } from "@/platform";
import {
  type Attachment,
  getAttachmentHash,
  getExtension,
  isImageExtension,
  unwrapMarkdownLinkDestination,
} from "@squigit/core/brain/attachments";
import {
  type MediaGalleryItem,
  type MediaThreadReference,
  type MediaViewerItem,
} from "@/features/media";

export type MediaViewerOpenOptions = {
  isGallery?: boolean;
  imageThreads?: MediaThreadReference[];
  galleryEntries?: Array<{
    attachment: Attachment;
    imageThreads?: MediaThreadReference[];
  }>;
  initialIndex?: number;
  openedFromThread?: boolean;
};

const UNSUPPORTED_PREVIEW_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "rtf",
  "odt",
  "ods",
  "odp",
  "pages",
  "numbers",
  "key",
]);

function normalizeAttachmentPath(path: string): string {
  const unwrapped = unwrapMarkdownLinkDestination(path);

  try {
    return decodeURI(unwrapped);
  } catch {
    return unwrapped;
  }
}

export const useAppMedia = ({
  activeThreadId,
}: {
  activeThreadId: string | null;
}) => {
  const threadId =
    activeThreadId && !activeThreadId.startsWith("__system_")
      ? activeThreadId
      : undefined;
  const [mediaViewer, setMediaViewer] = useState<{
    isOpen: boolean;
    item: MediaViewerItem | null;
  }>({
    isOpen: false,
    item: null,
  });

  const resolveAttachmentSourcePath = useCallback(
    async (path: string) => {
      const attachmentHash = getAttachmentHash(path);
      if (!attachmentHash) return undefined;
      try {
        return (
          (await commands.resolveAttachmentSourcePath(attachmentHash, threadId)) ||
          undefined
        );
      } catch (error) {
        console.warn("[media] Could not resolve attachment source:", error);
        return undefined;
      }
    },
    [threadId],
  );

  const closeMediaViewer = useCallback(() => {
    setMediaViewer((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const revealInFileManager = useCallback(async (path: string) => {
    try {
      await commands.revealInFileManager(path);
    } catch (error) {
      console.error("[media] Failed to reveal in file manager:", error);
      throw error;
    }
  }, []);

  const openMediaViewer = useCallback(
    async (attachment: Attachment, options?: MediaViewerOpenOptions) => {
      const normalizedAttachmentPath = normalizeAttachmentPath(attachment.path);
      const pathExtension = getExtension(
        normalizedAttachmentPath,
      ).toLowerCase();
      const extension =
        pathExtension && pathExtension !== "file"
          ? pathExtension
          : attachment.extension.toLowerCase();
      const currentCasPath = normalizedAttachmentPath;

      let resolvedPath = currentCasPath;
      try {
        resolvedPath = await commands.resolveAttachmentPath(currentCasPath);
      } catch (error) {
        console.warn("[media] Could not resolve attachment path:", error);
      }

      const sourcePath =
        currentCasPath !== normalizedAttachmentPath
          ? undefined
          : await resolveAttachmentSourcePath(normalizedAttachmentPath);

      const revealPath = sourcePath || resolvedPath;

      if (UNSUPPORTED_PREVIEW_EXTENSIONS.has(extension)) {
        try {
          await revealInFileManager(revealPath);
        } catch {
          if (revealPath !== resolvedPath) {
            await revealInFileManager(resolvedPath);
          }
        }
        return;
      }

      if (attachment.type === "image" || isImageExtension(extension)) {
        const galleryEntries =
          options?.galleryEntries?.filter(
            ({ attachment: entry }) =>
              entry.type === "image" || isImageExtension(entry.extension),
          ) ?? [];
        let galleryItems: MediaGalleryItem[] | undefined;
        let galleryIndex: number | undefined;

        if (galleryEntries.length > 0) {
          const resolvedGallery = await Promise.all(
            galleryEntries.map(
              async ({ attachment: galleryAttachment, imageThreads }) => {
                const gallerySourcePath = await resolveAttachmentSourcePath(
                  galleryAttachment.path,
                );

                let galleryResolvedPath = galleryAttachment.path;
                try {
                  galleryResolvedPath = await commands.resolveAttachmentPath(
                    galleryAttachment.path,
                  );
                } catch (error) {
                  console.warn(
                    "[media] Could not resolve gallery path:",
                    error,
                  );
                }

                return {
                  path: galleryResolvedPath,
                  sourcePath: gallerySourcePath,
                  name: galleryAttachment.name,
                  extension: galleryAttachment.extension.toLowerCase(),
                  imageThreads,
                };
              },
            ),
          );

          if (resolvedGallery.length > 0) {
            galleryItems = resolvedGallery;
            const fallbackIndex = galleryEntries.findIndex(
              ({ attachment: entry }) =>
                entry.id === attachment.id || entry.path === attachment.path,
            );
            const initialIndex =
              typeof options?.initialIndex === "number"
                ? options.initialIndex
                : fallbackIndex >= 0
                  ? fallbackIndex
                  : 0;
            galleryIndex = Math.max(
              0,
              Math.min(initialIndex, resolvedGallery.length - 1),
            );
          }
        }

        const activeGalleryItem =
          galleryItems && typeof galleryIndex === "number"
            ? galleryItems[galleryIndex]
            : undefined;

        setMediaViewer({
          isOpen: true,
          item: {
            kind: "image",
            path: activeGalleryItem?.path || resolvedPath,
            sourcePath: activeGalleryItem?.sourcePath || sourcePath,
            name: activeGalleryItem?.name || attachment.name,
            extension: activeGalleryItem?.extension || extension,
            isGallery:
              options?.isGallery === true || (galleryItems?.length ?? 0) > 1,
            imageThreads:
              activeGalleryItem?.imageThreads || options?.imageThreads,
            galleryItems,
            galleryIndex,
            openedFromThread: options?.openedFromThread === true,
          },
        });
        return;
      }

      if (extension === "pdf") {
        setMediaViewer({
          isOpen: true,
          item: {
            kind: "pdf",
            path: resolvedPath,
            sourcePath,
            name: attachment.name,
            extension,
          },
        });
        return;
      }

      try {
        const textContent = await commands.readAttachmentText(resolvedPath);

        setMediaViewer({
          isOpen: true,
          item: {
            kind: "text",
            path: resolvedPath,
            sourcePath,
            name: attachment.name,
            extension,
            textContent,
            openedFromThread: options?.openedFromThread === true,
          },
        });
      } catch (error) {
        console.warn("[media] Falling back to file-manager reveal:", error);
        try {
          await revealInFileManager(revealPath);
        } catch {
          if (revealPath !== resolvedPath) {
            await revealInFileManager(resolvedPath);
          }
        }
      }
    },
    [threadId, resolveAttachmentSourcePath, revealInFileManager],
  );

  return {
    mediaViewer,
    openMediaViewer,
    closeMediaViewer,
  };
};
