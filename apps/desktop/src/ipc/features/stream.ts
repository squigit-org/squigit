import type { IpcMainInvokeEvent } from "electron";

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeStreamEvent = (streamEvent: any) => {
  if (!streamEvent || typeof streamEvent !== "object") {
    return streamEvent;
  }

  const type =
    streamEvent.type || streamEvent.eventType || streamEvent.event_type;
  const normalized = {
    ...streamEvent,
    ...(type ? { type } : {}),
  };

  delete normalized.eventType;
  delete normalized.event_type;

  if ("args" in normalized) {
    normalized.args = parseMaybeJson(normalized.args);
  }
  if ("result" in normalized) {
    normalized.result = parseMaybeJson(normalized.result);
  }
  if ("payload" in normalized) {
    normalized.payload = parseMaybeJson(normalized.payload);
  }

  return normalized;
};

export const sendStreamEvent = (
  event: IpcMainInvokeEvent,
  channelId: string,
  err: any,
  streamEvent: any,
) => {
  if (err) {
    event.sender.send(channelId, {
      type: "error",
      message: err.message || String(err),
    });
    return;
  }

  event.sender.send(channelId, normalizeStreamEvent(streamEvent));
};
