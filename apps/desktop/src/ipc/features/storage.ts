import { ipcMain } from "electron";
import { addon, requireAddonFn } from "../system/addon";
import { requireStringArg } from "../system/arguments";

export function registerStorageHandlers() {
  ipcMain.handle("store_image_from_path", (_, args) =>
    addon.store_image_from_path?.(
      requireStringArg("store_image_from_path", args, "path"),
    ),
  );
  ipcMain.handle("read_clipboard_image", () => addon.read_clipboard_image?.());

  ipcMain.handle("store_image_bytes", async (_, args) => {
    const fs = require("fs/promises");
    const path = require("path");
    const { app } = require("electron");
    const tmpPath = path.join(
      app.getPath("temp"),
      `squigit_tmp_${Date.now()}.png`,
    );
    await fs.writeFile(tmpPath, Buffer.from(args.bytes));
    const result = addon.store_image_from_path?.(tmpPath);
    await fs.unlink(tmpPath).catch(() => {});
    return result;
  });

  ipcMain.handle("store_file_from_path", (_, args) =>
    addon.store_file_from_path?.(args.path),
  );
  ipcMain.handle("store_text_in_cas", async (_, args) => {
    const fs = require("fs/promises");
    const path = require("path");
    const { app } = require("electron");
    const content = args?.content;

    if (typeof content !== "string") {
      throw new Error("store_text_in_cas requires string content.");
    }

    const requestedExtension =
      typeof args?.extension === "string"
        ? args.extension.trim().replace(/^\.+/, "").toLowerCase()
        : "";
    const extension = /^[a-z0-9][a-z0-9+_-]{0,31}$/.test(
      requestedExtension,
    )
      ? requestedExtension
      : "txt";
    const tempDirectory = await fs.mkdtemp(
      path.join(app.getPath("temp"), "squigit-cas-text-"),
    );
    const tempPath = path.join(tempDirectory, `edited.${extension}`);

    try {
      await fs.writeFile(tempPath, content, "utf-8");
      return requireAddonFn("store_file_from_path")(tempPath);
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  });
  ipcMain.handle("validate_text_file", async (_, args) => {
    const fs = require("fs/promises");
    const sourcePath = requireStringArg(
      "validate_text_file",
      args,
      "path",
    );
    const bytes = await fs.readFile(sourcePath);
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("resolve_attachment_path", (_, args) => args.path);
  ipcMain.handle("resolve_attachment_source_path", (_, args) =>
    requireAddonFn("resolve_attachment_source_path")(
      requireStringArg(
        "resolve_attachment_source_path",
        args,
        "attachmentHash",
        "attachment_hash",
      ),
      args?.threadId ?? args?.thread_id,
    ),
  );

  ipcMain.handle("read_attachment_text", async (_, args) => {
    const fs = require("fs/promises");
    return await fs.readFile(args.path, "utf-8");
  });
}
