import { ipcMain } from "electron";
import { addon } from "../system/addon";
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
    const tmpPath = path.join(app.getPath("temp"), `squigit_tmp_${Date.now()}.png`);
    await fs.writeFile(tmpPath, Buffer.from(args.bytes));
    const result = addon.store_image_from_path?.(tmpPath);
    await fs.unlink(tmpPath).catch(() => {});
    return result;
  });

  ipcMain.handle("store_file_from_path", (_, args) => addon.store_file_from_path?.(args.path));
  ipcMain.handle("validate_text_file", () => true);
  ipcMain.handle("resolve_attachment_path", (_, args) => args.path);

  ipcMain.handle("read_attachment_text", async (_, args) => {
    const fs = require("fs/promises");
    return await fs.readFile(args.path, "utf-8");
  });
}
