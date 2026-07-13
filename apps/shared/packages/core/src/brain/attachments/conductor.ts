/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { getHarnessPort, type HarnessTextAttachment } from "../../ports";
import { TEXT_EXTENSION_VALUES, getExtension } from "./extensions";
import {
  isAttachmentLinkDestination,
  LINK_ATTACHMENT_MENTION_RE,
} from "./markdown";
import { isAttachmentPath, unwrapMarkdownLinkDestination } from "./paths";

const TEXT_EXTENSION_SET = new Set<string>(TEXT_EXTENSION_VALUES);

export interface PreparedBrainInput {
  displayText: string;
  brainText: string;
  consumedTextAttachments: HarnessTextAttachment[];
}

function parseTextLocalAttachmentPaths(messageText: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const match of messageText.matchAll(LINK_ATTACHMENT_MENTION_RE)) {
    const rawDestination = String(match[2] || "");
    const path = unwrapMarkdownLinkDestination(rawDestination);
    if (!isAttachmentLinkDestination(rawDestination) || !isAttachmentPath(path)) {
      continue;
    }

    const extension = getExtension(path);
    if (!TEXT_EXTENSION_SET.has(extension) || seen.has(path)) continue;

    seen.add(path);
    paths.push(path);
  }

  return paths;
}

export async function prepareBrainInput(
  messageText: string,
): Promise<PreparedBrainInput> {
  const displayText = messageText;
  const textAttachmentPaths = parseTextLocalAttachmentPaths(messageText);

  if (textAttachmentPaths.length === 0) {
    return {
      displayText,
      brainText: messageText,
      consumedTextAttachments: [],
    };
  }

  const prepared = await getHarnessPort().prepareTextFirstMessage({
    messageText,
    textAttachmentPaths,
  });

  return {
    displayText,
    brainText: prepared.messageText,
    consumedTextAttachments: prepared.attachments,
  };
}
