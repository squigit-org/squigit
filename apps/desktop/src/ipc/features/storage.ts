import { ipcMain } from "electron";
import { addon, parseAddonJson, requireAddonFn } from "../system/addon";
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
  ipcMain.handle("validate_text_file", () => true);
  ipcMain.handle("resolve_attachment_path", (_, args) => args.path);
  ipcMain.handle("register_attachment_source", (_, args) =>
    requireAddonFn("register_attachment_source")(
      requireStringArg(
        "register_attachment_source",
        args,
        "threadId",
        "thread_id",
      ),
      requireStringArg(
        "register_attachment_source",
        args,
        "casPath",
        "cas_path",
      ),
      requireStringArg(
        "register_attachment_source",
        args,
        "sourcePath",
        "source_path",
      ),
      args?.displayName ?? args?.display_name,
    ),
  );
  ipcMain.handle("resolve_attachment_source_path", (_, args) =>
    requireAddonFn("resolve_attachment_source_path")(
      requireStringArg(
        "resolve_attachment_source_path",
        args,
        "casPath",
        "cas_path",
      ),
      args?.threadId ?? args?.thread_id,
    ),
  );
  ipcMain.handle("list_attachment_sources", (_, args) => {
    const json = requireAddonFn("list_attachment_sources")(
      args?.threadId ?? args?.thread_id,
    );
    return parseAddonJson("list_attachment_sources", json);
  });

  ipcMain.handle("read_attachment_text", async (_, args) => {
    const fs = require("fs/promises");
    return await fs.readFile(args.path, "utf-8");
  });
}
