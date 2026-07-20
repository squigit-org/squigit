/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";
import { commands } from "@/platform";
import {
  type Attachment,
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
  attachments,
  activeThreadId,
}: {
  attachments: Attachment[];
  activeThreadId: string | null;
}) => {
  const registryThreadId =
    activeThreadId && !activeThreadId.startsWith("__system_")
      ? activeThreadId
      : undefined;
  const [attachmentSources, setAttachmentSources] = useState<
    Record<string, string>
  >({});
  const [mediaViewer, setMediaViewer] = useState<{
    isOpen: boolean;
    item: MediaViewerItem | null;
  }>({
    isOpen: false,
    item: null,
  });

  useEffect(() => {
    let cancelled = false;
    setAttachmentSources({});

    void commands
      .listAttachmentSources(registryThreadId)
      .then((sources) => {
        if (!cancelled) {
          setAttachmentSources((current) => ({ ...sources, ...current }));
        }
      })
      .catch((error) => {
        console.warn("[media] Could not load attachment sources:", error);
        if (!cancelled) setAttachmentSources({});
      });

    return () => {
      cancelled = true;
    };
  }, [registryThreadId]);

  const rememberAttachmentSourcePath = useCallback(
    async (casPath: string, sourcePath: string) => {
      if (!casPath || !sourcePath) return;

      if (registryThreadId) {
        try {
          await commands.registerAttachmentSource(
            registryThreadId,
            casPath,
            sourcePath,
          );
        } catch (error) {
          console.warn("[media] Could not register attachment source:", error);
        }
      }

      setAttachmentSources((current) => ({
        ...current,
        [casPath]: sourcePath,
      }));
    },
    [registryThreadId],
  );

  useEffect(() => {
    attachments.forEach((attachment) => {
      if (attachment.sourcePath) {
        void rememberAttachmentSourcePath(
          attachment.path,
          attachment.sourcePath,
        ).catch((error) => {
          console.warn("[media] Could not register attachment source:", error);
        });
      }
    });
  }, [attachments, rememberAttachmentSourcePath]);

  const getAttachmentSourcePath = useCallback((path: string) => {
    const directMatch = attachmentSources[path];
    if (directMatch) return directMatch;

    const fileName = path.split(/[/\\]/).pop();
    if (!fileName) return null;

    for (const [casPath, sourcePath] of Object.entries(attachmentSources)) {
      if (
        casPath.endsWith(`/${fileName}`) ||
        casPath.endsWith(`\\${fileName}`)
      ) {
        return sourcePath;
      }
    }

    return null;
  }, [attachmentSources]);

  const resolveAttachmentSourcePath = useCallback(
    async (path: string, fallback?: string) => {
      try {
        return (
          (await commands.resolveAttachmentSourcePath(path, registryThreadId)) ||
          fallback ||
          getAttachmentSourcePath(path) ||
          undefined
        );
      } catch (error) {
        console.warn("[media] Could not resolve attachment source:", error);
        return fallback || getAttachmentSourcePath(path) || undefined;
      }
    },
    [getAttachmentSourcePath, registryThreadId],
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
      const sourcePath = await resolveAttachmentSourcePath(
        normalizedAttachmentPath,
        attachment.sourcePath,
      );

      let resolvedPath = normalizedAttachmentPath;
      try {
        resolvedPath = await commands.resolveAttachmentPath(
          normalizedAttachmentPath,
        );
      } catch (error) {
        console.warn("[media] Could not resolve attachment path:", error);
      }

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
                  galleryAttachment.sourcePath,
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
            threadId: registryThreadId,
            sourcePath,
            name: attachment.name,
            extension,
            textContent,
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
    [registryThreadId, resolveAttachmentSourcePath, revealInFileManager],
  );

  return {
    mediaViewer,
    rememberAttachmentSourcePath,
    getAttachmentSourcePath,
    openMediaViewer,
    closeMediaViewer,
  };
};
