/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useMemo, useState } from "react";
import {
  codeFaviconSvg,
  excelFaviconSvg,
  fileFaviconSvg,
  imageFaviconSvg,
  pdfFaviconSvg,
  powerpointFaviconSvg,
  textFaviconSvg,
  wordFaviconSvg,
} from "@/assets/favicons";
import type { AcceptedExtension } from "@/lib";
import styles from "./CitationChip.module.css";

type FileIconAssetKey =
  | "code"
  | "excel"
  | "file"
  | "image"
  | "pdf"
  | "powerpoint"
  | "text"
  | "word";

type CitationChipVisual =
  | {
      kind: "favicon";
      src: string;
      alt?: string;
    }
  | {
      kind: "file";
      extension: string;
    };

export interface CitationChipProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  label: string;
  visual: CitationChipVisual;
  fullWidth?: boolean;
  animate?: boolean;
}

const FILE_ICON_ASSETS: Record<FileIconAssetKey, string> = {
  code: codeFaviconSvg,
  excel: excelFaviconSvg,
  file: fileFaviconSvg,
  image: imageFaviconSvg,
  pdf: pdfFaviconSvg,
  powerpoint: powerpointFaviconSvg,
  text: textFaviconSvg,
  word: wordFaviconSvg,
};

const FILE_ICON_BY_EXTENSION: Record<AcceptedExtension, FileIconAssetKey> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  txt: "text",
  md: "code",
  csv: "excel",
  json: "code",
  xml: "code",
  yaml: "code",
  yml: "code",
  html: "code",
  css: "code",
  js: "code",
  ts: "code",
  jsx: "code",
  tsx: "code",
  py: "code",
  rs: "code",
  go: "code",
  java: "code",
  c: "code",
  cpp: "code",
  h: "code",
  hpp: "code",
  pdf: "pdf",
  docx: "word",
  doc: "word",
  xlsx: "excel",
  xls: "excel",
  pptx: "powerpoint",
  ppt: "powerpoint",
  rtf: "word",
};

function getFileIconAsset(extension: string): string {
  const normalized = extension.trim().toLowerCase() as AcceptedExtension;
  const assetKey = FILE_ICON_BY_EXTENSION[normalized] || "file";
  return FILE_ICON_ASSETS[assetKey];
}

const FileExtensionIcon: React.FC<{ extension: string }> = ({ extension }) => {
  const iconSrc = useMemo(() => getFileIconAsset(extension), [extension]);

  return <img src={iconSrc} alt="" aria-hidden="true" className={styles.fileIcon} />;
};

export const CitationChip = forwardRef<HTMLAnchorElement, CitationChipProps>(
  (
    {
      label,
      visual,
      className,
      fullWidth = false,
      animate = false,
      ...anchorProps
    },
    ref,
  ) => {
    const [hideFavicon, setHideFavicon] = useState(false);

    return (
      <a
        ref={ref}
        {...anchorProps}
        className={[
          styles.chip,
          fullWidth ? styles.fullWidth : "",
          animate ? styles.reveal : "",
          className || "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {visual.kind === "favicon" ? (
          !hideFavicon && (
            <img
              src={visual.src}
              alt={visual.alt || ""}
              className={styles.iconImage}
              onError={() => setHideFavicon(true)}
            />
          )
        ) : (
          <FileExtensionIcon extension={visual.extension} />
        )}
        <span className={styles.title}>{label}</span>
      </a>
    );
  },
);

CitationChip.displayName = "CitationChip";
