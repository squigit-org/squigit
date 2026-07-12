/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useMemo, useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { getIcon } from "material-file-icons";
import { getBuiltInFavIconForUrl } from "@/components/icons";
import styles from "./CitationChip.module.css";

type CitationChipVisual =
  | {
      kind: "favicon";
      src: string;
      fallbackSrc?: string;
      alt?: string;
    }
  | {
      kind: "file";
      fileName: string;
    }
  | {
      kind: "loading";
    }
  | {
      kind: "error";
    };

export type CitationChipVariant = "site" | "file";

export interface CitationChipProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  label: string;
  visual: CitationChipVisual;
  variant?: CitationChipVariant;
  fullWidth?: boolean;
  animate?: boolean;
}

const DEFAULT_FILE_ICON_NAME = "file";

function resolveLocalFileIconMarkup(fileName: string): string {
  const normalizedFileName = fileName.trim() || DEFAULT_FILE_ICON_NAME;
  try {
    return getIcon(normalizedFileName).svg;
  } catch {
    return getIcon(DEFAULT_FILE_ICON_NAME).svg;
  }
}

const LocalFileIcon: React.FC<{ fileName: string }> = ({ fileName }) => {
  const iconMarkup = useMemo(
    () => resolveLocalFileIconMarkup(fileName),
    [fileName],
  );

  return (
    <span
      aria-hidden="true"
      className={styles.fileIcon}
      dangerouslySetInnerHTML={{ __html: iconMarkup }}
    />
  );
};

export const CitationChip = forwardRef<HTMLAnchorElement, CitationChipProps>(
  (
    {
      label,
      visual,
      variant,
      className,
      fullWidth = false,
      animate = false,
      ...anchorProps
    },
    ref,
  ) => {
    const [faviconSrc, setFaviconSrc] = useState(
      visual.kind === "favicon" ? visual.src : "",
    );
    const [hideFavicon, setHideFavicon] = useState(false);
    const resolvedVariant = variant || (visual.kind === "favicon" ? "site" : "file");
    const BuiltInFavicon =
      visual.kind === "favicon" && typeof anchorProps.href === "string"
        ? getBuiltInFavIconForUrl(anchorProps.href)
        : null;

    React.useEffect(() => {
      if (visual.kind !== "favicon") {
        setFaviconSrc("");
        setHideFavicon(false);
        return;
      }

      setFaviconSrc(visual.src);
      setHideFavicon(false);
    }, [visual]);

    return (
      <a
        ref={ref}
        {...anchorProps}
        className={[
          styles.chip,
          resolvedVariant === "file" ? styles.fileVariant : styles.siteVariant,
          fullWidth ? styles.fullWidth : "",
          animate ? styles.reveal : "",
          className || "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {visual.kind === "favicon" ? (
          BuiltInFavicon ? (
            <BuiltInFavicon className={styles.iconImage} />
          ) : (
          !hideFavicon && (
            <img
              src={faviconSrc}
              alt={visual.alt || ""}
              className={styles.iconImage}
              onError={() => {
                if (
                  visual.fallbackSrc &&
                  faviconSrc !== visual.fallbackSrc
                ) {
                  setFaviconSrc(visual.fallbackSrc);
                  return;
                }
                setHideFavicon(true);
              }}
            />
          )
          )
        ) : visual.kind === "loading" ? (
          <span className={styles.stateIcon} aria-hidden="true">
            <Loader2 size={14} className={styles.spinner} />
          </span>
        ) : visual.kind === "error" ? (
          <span className={styles.stateIcon} aria-hidden="true">
            <CircleAlert size={14} className={styles.errorIcon} />
          </span>
        ) : (
          <LocalFileIcon fileName={visual.fileName} />
        )}
        <span className={styles.title}>
          <bdi className={styles.titleText}>{label}</bdi>
        </span>
      </a>
    );
  },
);

CitationChip.displayName = "CitationChip";
