/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message, PendingAssistantTurn } from "./types";

export function buildCommittedAssistantMessage(
  turn: PendingAssistantTurn,
  thoughtSeconds?: number,
): Message {
  const isStopped = turn.stopped || turn.phase === "stopped";
  const committedText =
    turn.rawText.trim().length > 0 ? turn.rawText : turn.displayText;

  return {
    id: turn.id,
    role: "model",
    text: committedText.trimEnd(),
    timestamp: Date.now(),
    thoughtSeconds,
    stopped: isStopped,
    alreadyStreamed: true,
    citations: turn.visibleCitations,
    toolSteps: turn.toolSteps,
  };
}

export function markPendingTurnTransportDone(
  turn: PendingAssistantTurn,
  finalResponse: string,
  getElapsedThoughtSeconds: (startedAtMs: number) => number,
): PendingAssistantTurn {
  const nextRawText =
    finalResponse.trim().length > 0 ? finalResponse : turn.rawText;
  const hasVisibleText = nextRawText.trim().length > 0;

  return {
    ...turn,
    rawText: nextRawText,
    thoughtSeconds: hasVisibleText
      ? turn.thoughtSeconds ?? getElapsedThoughtSeconds(turn.requestStartedAtMs)
      : turn.thoughtSeconds,
    phase:
      turn.phase === "thinking"
        ? hasVisibleText
          ? "primed"
          : "complete"
        : turn.phase,
    transportDone: true,
    visibleCitations:
      !hasVisibleText && turn.phase === "thinking"
        ? turn.pendingCitations
        : turn.visibleCitations,
  };
}
