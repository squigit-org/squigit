/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { platform } from "@/platform";
import { useMediaContext } from "@/app/context/AppMedia";
import type { Attachment } from "@squigit/core/brain/attachments";
import { getImagePath, type ThreadMetadata } from "@squigit/core/config";
import styles from "./GalleryRoute.module.css";

const SYSTEM_GALLERY_ID = "__system_gallery";

interface GalleryThread {
  threadId: string;
  title: string;
  updatedAt: string;
}

interface GalleryCandidate {
  hash: string;
  updatedAt: string;
  threads: GalleryThread[];
}

interface GalleryImage extends GalleryCandidate {
  path: string;
}

interface GalleryRouteProps {
  threads: ThreadMetadata[];
  activeSessionId: string | null;
  refreshThreads: () => Promise<void> | void;
}

interface GalleryThumbnailProps {
  imagePath: string;
  title: string;
  onClick: () => void;
}

const toTimestamp = (value: string) => new Date(value || 0).getTime();

const groupThreadsByHash = (threads: ThreadMetadata[]): GalleryCandidate[] => {
  const byHash = new Map<string, GalleryCandidate>();

  for (const thread of threads) {
    const hash = thread.image_hash?.trim();
    if (!hash) continue;

    const threadReference: GalleryThread = {
      threadId: thread.id,
      title: thread.title || "Untitled",
      updatedAt: thread.updated_at || thread.created_at,
    };

    const existing = byHash.get(hash);
    if (existing) {
      existing.threads.push(threadReference);
      if (
        toTimestamp(threadReference.updatedAt) >
        toTimestamp(existing.updatedAt)
      ) {
        existing.updatedAt = threadReference.updatedAt;
      }
    } else {
      byHash.set(hash, {
        hash,
        updatedAt: threadReference.updatedAt,
        threads: [threadReference],
      });
    }
  }

  return Array.from(byHash.values())
    .map((candidate) => ({
      ...candidate,
      threads: candidate.threads.sort(
        (a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt),
      ),
    }))
    .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
};

const GalleryThumbnail: React.FC<GalleryThumbnailProps> = ({
  imagePath,
  title,
  onClick,
}) => {
  const src = useMemo(() => platform.convertFileSrc(imagePath), [imagePath]);

  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <img src={src} alt={title} className={styles.preview} loading="lazy" />
      <div className={styles.cardMeta}>
        <span className={styles.cardTitle}>{title}</span>
      </div>
    </button>
  );
};

export const GalleryRoute: React.FC<GalleryRouteProps> = ({
  threads,
  activeSessionId,
  refreshThreads,
}) => {
  const { openMediaViewer } = useMediaContext();
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<GalleryImage[]>([]);

  const candidates = useMemo(() => groupThreadsByHash(threads), [threads]);

  useEffect(() => {
    if (activeSessionId !== SYSTEM_GALLERY_ID) return;
    void refreshThreads();
  }, [activeSessionId, refreshThreads]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);

      const resolved = await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const path = await getImagePath(candidate.hash);
            return { ...candidate, path };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      setItems(
        resolved.filter((entry): entry is GalleryImage => entry !== null),
      );
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  const handleOpenImage = useCallback(
    (item: GalleryImage, index: number) => {
      const extension = item.path.split(".").pop()?.toLowerCase() || "png";
      const viewerName = "Image";
      const attachment: Attachment = {
        id: `gallery-${item.hash}`,
        type: "image",
        name: viewerName,
        extension,
        path: item.path,
      };

      void openMediaViewer(attachment, {
        isGallery: true,
        galleryEntries: items.map((galleryItem) => ({
          attachment: {
            id: `gallery-${galleryItem.hash}`,
            type: "image",
            name: "Image",
            extension:
              galleryItem.path.split(".").pop()?.toLowerCase() || "png",
            path: galleryItem.path,
          },
          imageThreads: galleryItem.threads.map((thread) => ({
            id: thread.threadId,
            title: thread.title,
            updatedAt: thread.updatedAt,
          })),
        })),
        initialIndex: index,
      });
    },
    [items, openMediaViewer],
  );

  if (isLoading) {
    return <div className={styles.state}>Loading images...</div>;
  }

  if (items.length === 0) {
    return <div className={styles.state}>No images yet.</div>;
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h2 className={styles.title}>Images</h2>
        <p className={styles.subtitle}>{items.length} image(s)</p>
      </header>

      <div className={styles.grid}>
        {items.map((item, index) => (
          <GalleryThumbnail
            key={item.hash}
            imagePath={item.path}
            title={`found in ${item.threads.length} ${
              item.threads.length === 1 ? "thread" : "threads"
            }`}
            onClick={() => handleOpenImage(item, index)}
          />
        ))}
      </div>
    </section>
  );
};
