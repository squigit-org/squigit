/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  attachmentFromPath,
  getAttachmentHash,
  isDocumentExtension,
  isImageExtension,
  type Attachment,
  type AttachmentFileType,
} from "@squigit/core/brain/attachments";
import {
  getProviderPort,
  type AttachmentPreparationResult,
  type SubmissionAttachmentResult,
} from "@squigit/core/ports";

const createJobId = () => `attachment_${crypto.randomUUID()}`;
const createPreflightId = () => `preflight_${crypto.randomUUID()}`;

function getFileType(attachment: Attachment): AttachmentFileType {
  if (attachment.fileType) {
    return attachment.fileType;
  }
  if (attachment.type === "image" || isImageExtension(attachment.extension)) {
    return "image_upload";
  }
  if (isDocumentExtension(attachment.extension)) {
    return "document_upload";
  }
  return "text_local";
}

function normalizeAttachment(attachment: Attachment): Attachment {
  const fileType = getFileType(attachment);
  const attachmentHash =
    attachment.attachmentHash ||
    getAttachmentHash(attachment.casPath || attachment.path) ||
    undefined;
  const sourcePath =
    attachment.sourcePath ||
    (!attachmentHash && !attachment.casPath ? attachment.path : undefined);

  if (attachment.status) {
    return {
      ...attachment,
      attachmentHash,
      fileType,
      sourcePath,
      error: attachment.error ?? null,
    };
  }

  return {
    ...attachment,
    attachmentHash,
    fileType,
    sourcePath,
    preparationJobId: attachment.preparationJobId || createJobId(),
    status: "pending",
    error: null,
  };
}

function isReadyResult(result: {
  status: AttachmentPreparationResult["status"];
}): boolean {
  return result.status === "ready";
}

function resultError(
  result: AttachmentPreparationResult | SubmissionAttachmentResult,
) {
  return {
    code: result.error_code || "ATTACHMENT_PREPARATION_FAILED",
    message:
      result.error_message ||
      `Could not prepare this attachment (${result.status}).`,
  };
}

function applyPreparationResult(
  attachment: Attachment,
  result: AttachmentPreparationResult,
): Attachment {
  const isReady = isReadyResult(result);
  return {
    ...attachment,
    attachmentHash: result.attachment_hash || attachment.attachmentHash,
    casPath: result.cas_path || attachment.casPath || attachment.path,
    path: result.cas_path || attachment.path,
    fileType: result.file_type || attachment.fileType,
    status: isReady ? "ready" : "failed",
    error: isReady ? null : resultError(result),
  };
}

function requestCancelAfterPaint(jobId: string) {
  window.requestAnimationFrame(() => {
    void getProviderPort().cancelAttachment(jobId).catch((error) => {
      console.warn("[attachments] Could not cancel preparation job:", error);
    });
  });
}

function mergeWithExisting(
  incoming: Attachment,
  existing: Attachment | undefined,
): Attachment {
  if (!existing) {
    return normalizeAttachment(incoming);
  }

  return normalizeAttachment({
    ...existing,
    ...incoming,
    attachmentHash: incoming.attachmentHash || existing.attachmentHash,
    casPath: incoming.casPath || existing.casPath,
    preparationJobId:
      incoming.preparationJobId || existing.preparationJobId,
    fileType: incoming.fileType || existing.fileType,
    status: incoming.status || existing.status,
    error: incoming.error === undefined ? existing.error : incoming.error,
  });
}

export function useAttachments() {
  const [attachments, setAttachmentsState] = useState<Attachment[]>([]);
  const [isSubmittingAttachments, setIsSubmittingAttachments] = useState(false);
  const startedJobsRef = useRef(new Set<string>());

  useEffect(() => {
    for (const attachment of attachments) {
      const jobId = attachment.preparationJobId;
      if (
        attachment.status !== "pending" ||
        !jobId ||
        startedJobsRef.current.has(jobId)
      ) {
        continue;
      }

      startedJobsRef.current.add(jobId);
      const sourcePath =
        attachment.casPath || attachment.sourcePath || attachment.path;

      void getProviderPort()
        .prepareAttachment({ jobId, sourcePath })
        .then((result) => {
          setAttachmentsState((current) =>
            current.map((item) =>
              item.id === attachment.id &&
              item.preparationJobId === result.job_id
                ? applyPreparationResult(item, result)
                : item,
            ),
          );
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Could not prepare this attachment.";
          setAttachmentsState((current) =>
            current.map((item) =>
              item.id === attachment.id &&
              item.preparationJobId === jobId
                ? {
                    ...item,
                    status: "failed",
                    error: {
                      code: "ATTACHMENT_PREPARATION_FAILED",
                      message,
                    },
                  }
                : item,
            ),
          );
        });
    }
  }, [attachments]);

  const setAttachments = useCallback((nextAttachments: Attachment[]) => {
    setAttachmentsState((current) => {
      const currentById = new Map(current.map((item) => [item.id, item]));
      const nextIds = new Set(nextAttachments.map((item) => item.id));

      for (const item of current) {
        if (
          !nextIds.has(item.id) &&
          item.status === "pending" &&
          item.preparationJobId
        ) {
          requestCancelAfterPaint(item.preparationJobId);
        }
      }

      return nextAttachments.map((item) =>
        mergeWithExisting(item, currentById.get(item.id)),
      );
    });
  }, []);

  const addAttachments = useCallback((newOnes: Attachment[]) => {
    setAttachmentsState((current) => [
      ...current,
      ...newOnes.map(normalizeAttachment),
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachmentsState((current) => {
      const removed = current.find((item) => item.id === id);
      if (
        removed?.status === "pending" &&
        removed.preparationJobId
      ) {
        requestCancelAfterPaint(removed.preparationJobId);
      }
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachmentsState((current) => {
      for (const item of current) {
        if (item.status === "pending" && item.preparationJobId) {
          requestCancelAfterPaint(item.preparationJobId);
        }
      }
      return [];
    });
  }, []);

  const clearSubmittedAttachments = useCallback((attachmentIds: string[]) => {
    const submittedIds = new Set(attachmentIds);
    setAttachmentsState((current) =>
      current.filter((item) => !submittedIds.has(item.id)),
    );
  }, []);

  const addFromPath = useCallback(
    (
      path: string,
      id?: string,
      originalName?: string,
      sourcePath?: string,
    ) => {
      addAttachments([
        attachmentFromPath(path, id, originalName, sourcePath),
      ]);
    },
    [addAttachments],
  );

  const retryAttachment = useCallback((id: string) => {
    setAttachmentsState((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              preparationJobId: createJobId(),
              status: "pending",
              error: null,
            }
          : item,
      ),
    );
  }, []);

  const prepareSubmission = useCallback(
    async (
      threadId: string,
      userMessageId: string,
      hashes: string[],
    ): Promise<string> => {
      setIsSubmittingAttachments(true);
      let hasStructuredFailures = false;
      try {
        const result = await getProviderPort().prepareSubmissionAttachments({
          preflightId: createPreflightId(),
          threadId,
          userMessageId,
          hashes,
        });
        const failedResults = result.results.filter(
          (item) => !isReadyResult(item),
        );

        if (failedResults.length > 0) {
          hasStructuredFailures = true;
          const failuresByHash = new Map(
            failedResults.map((item) => [item.attachment_hash, item]),
          );
          setAttachmentsState((current) =>
            current.map((item) => {
              const hash =
                item.attachmentHash ||
                getAttachmentHash(item.casPath || item.path) ||
                "";
              const failure = failuresByHash.get(hash);
              return failure
                ? {
                    ...item,
                    fileType: failure.file_type || item.fileType,
                    status: "failed",
                    error: resultError(failure),
                  }
                : item;
            }),
          );
          throw new Error(
            failedResults
              .map((item) => resultError(item).message)
              .join("\n"),
          );
        }

        if (!result.preflight_token) {
          throw new Error("Attachment preflight returned no token.");
        }
        return result.preflight_token;
      } catch (error) {
        if (!hasStructuredFailures) {
          const message =
            error instanceof Error
              ? error.message
              : "Could not validate the attached files.";
          const hashSet = new Set(hashes);
          setAttachmentsState((current) =>
            current.map((item) => {
              const hash =
                item.attachmentHash ||
                getAttachmentHash(item.casPath || item.path);
              return hash && hashSet.has(hash)
                ? {
                    ...item,
                    status: "failed",
                    error: {
                      code: "ATTACHMENT_PREFLIGHT_FAILED",
                      message,
                    },
                  }
                : item;
            }),
          );
        }
        setIsSubmittingAttachments(false);
        throw error;
      }
    },
    [],
  );

  const finishSubmission = useCallback(() => {
    setIsSubmittingAttachments(false);
  }, []);

  return {
    attachments,
    setAttachments,
    addAttachments,
    addFromPath,
    removeAttachment,
    clearAttachments,
    clearSubmittedAttachments,
    retryAttachment,
    prepareSubmission,
    finishSubmission,
    isSubmittingAttachments,
  };
}
