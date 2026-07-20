import { ipcMain } from "electron";
import { requireAddonFn } from "../system/addon";
import { optionalStringArg, requireStringArg } from "../system/arguments";

const requireStringArrayArg = (
  command: string,
  args: Record<string, any> | undefined,
  ...names: string[]
) => {
  for (const name of names) {
    const value = args?.[name];
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      return value;
    }
  }

  throw new Error(`${command} requires ${names.join(" or ")}.`);
};

export function registerHarnessHandlers() {
  ipcMain.handle("prepare_text_first_message", (_, args) =>
    requireAddonFn("prepare_text_first_message")(
      requireStringArg(
        "prepare_text_first_message",
        args,
        "messageText",
        "message_text",
      ),
      requireStringArrayArg(
        "prepare_text_first_message",
        args,
        "textAttachmentPaths",
        "text_attachment_paths",
      ),
      optionalStringArg(args, "threadId", "thread_id"),
    ),
  );
}
