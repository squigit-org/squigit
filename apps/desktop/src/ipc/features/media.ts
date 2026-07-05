import { ipcMain } from "electron";
import { addon, requireAddonFn } from "../system/addon";
import { requireStringArg } from "../system/arguments";
import { getThreadDir } from "./thread";
import { sendStreamEvent } from "./stream";

export function registerMediaHandlers() {
  ipcMain.handle("analyze_image", async (event, args) => {
    return addon.analyzeImage?.(
      args.imagePath,
      args.model,
      args.userMessage,
      (err: any, streamEvent: any) => {
        sendStreamEvent(event, args.channelId, err, streamEvent);
      },
    );
  });

  ipcMain.handle("detect_image_tone", async (_, args) => {
    try {
      const fs = require("fs/promises");
      const buf = await fs.readFile(args.path || args.imagePath);
      return addon.detectImageTone?.(buf) || "dark";
    } catch (e) {
      console.error("detect_image_tone error:", e);
      return "dark";
    }
  });

  ipcMain.handle("save_ocr_data", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const threadDir = getThreadDir(args.threadId);
      await fs.mkdir(threadDir, { recursive: true });
      const framePath = require("path").join(threadDir, "ocr_frame.json");
      let frame: any = {};
      try {
        frame = JSON.parse(await fs.readFile(framePath, "utf-8"));
      } catch {}
      frame[args.modelId || "eng"] = args.ocrData;
      await fs.writeFile(framePath, JSON.stringify(frame, null, 2));
    } catch (e) {
      console.error("save_ocr_data error", e);
    }
  });

  ipcMain.handle("get_ocr_data", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const framePath = require("path").join(
        getThreadDir(args.threadId),
        "ocr_frame.json",
      );
      const frame = JSON.parse(await fs.readFile(framePath, "utf-8"));
      return frame[args.modelId || "eng"] || null;
    } catch {
      return null;
    }
  });

  ipcMain.handle("get_ocr_frame", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const framePath = require("path").join(
        getThreadDir(args.threadId),
        "ocr_frame.json",
      );
      return JSON.parse(await fs.readFile(framePath, "utf-8"));
    } catch {
      return {};
    }
  });

  ipcMain.handle("init_ocr_frame", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const threadDir = getThreadDir(args.threadId);
      await fs.mkdir(threadDir, { recursive: true });
      const framePath = require("path").join(threadDir, "ocr_frame.json");
      let frame: any = {};
      try {
        frame = JSON.parse(await fs.readFile(framePath, "utf-8"));
      } catch {}
      for (const modelId of args.modelIds || []) {
        if (!(modelId in frame)) frame[modelId] = null;
      }
      await fs.writeFile(framePath, JSON.stringify(frame, null, 2));
    } catch (e) {
      console.error("init_ocr_frame error", e);
    }
  });

  ipcMain.handle("spawn_capture", () => {});
  ipcMain.handle("process_image_path", (_, args) =>
    addon.processImagePath?.(args.path),
  );
  ipcMain.handle("ocr_image", async (_, args) => {
    let absolutePath = args.imageData;
    const path = require("path");
    if (!path.isAbsolute(absolutePath)) {
      const base = addon.getStoreBaseDir?.();
      const active = addon.getActiveProfileId?.();
      if (base && active) {
        absolutePath = path.join(base, active, "threads", absolutePath);
      }
    }
    const resultJson = await addon.ocrImage?.(
      absolutePath,
      args.isBase64 || false,
      args.modelName || "eng",
    );
    if (!resultJson) throw new Error("OCR returned no result");
    const parsed = JSON.parse(resultJson);
    if (Array.isArray(parsed)) {
      return parsed.map((r: any) => ({
        text: r.text,
        box_coords: r.box || r.box_coords,
        confidence: r.confidence || 1.0,
      }));
    }
    return parsed;
  });
  ipcMain.handle("read_image_file", async (_, args) => {
    const fs = require("fs/promises");
    const buf = await fs.readFile(args.path);
    return Array.from(buf);
  });
  ipcMain.handle("copy_image_to_clipboard", (_, args) => {
    if (addon.copyImageToClipboard) {
      return addon.copyImageToClipboard(args.base64Data);
    }
    const { clipboard, nativeImage } = require("electron");
    const image = nativeImage.createFromDataURL(
      `data:image/png;base64,${args.base64Data}`,
    );
    clipboard.writeImage(image);
  });
  ipcMain.handle("copy_image_from_path_to_clipboard", (_, args) => {
    if (addon.copyImageFromPathToClipboard) {
      return addon.copyImageFromPathToClipboard(args.path);
    }
    const { clipboard, nativeImage } = require("electron");
    const image = nativeImage.createFromPath(args.path);
    clipboard.writeImage(image);
  });

  ipcMain.handle("read_clipboard_text", () => {
    if (addon.readClipboardText) {
      return addon.readClipboardText();
    }
    return require("electron").clipboard.readText();
  });

  ipcMain.handle("cancel_download_ocr_model", (_, args) =>
    addon.cancelDownloadOcrModel?.(args.modelId),
  );
  ipcMain.handle("download_ocr_model", async (event, args) => {
    return addon.downloadOcrModel?.(
      args.modelId,
      args.url,
      (err: any, progressJson: string) => {
        if (err) {
          console.error("Download OCR Model error:", err);
          return;
        }
        try {
          const payload = JSON.parse(progressJson);
          event.sender.send("download-progress", payload);
        } catch (e) {
          console.error("Failed to parse ocr download progress", e);
        }
      },
    );
  });
  ipcMain.handle(
    "get_model_path",
    (_, args) => addon.getModelPath?.(args.modelId) || "",
  );
  ipcMain.handle("cancel_ocr_job", () => {});
  ipcMain.handle(
    "list_downloaded_models",
    () => addon.listDownloadedModels?.() || [],
  );

  ipcMain.handle("upload_image_to_imgbb", (_, args) =>
    addon.uploadImageToImgbb?.(args.imagePath, args.apiKey),
  );

  ipcMain.handle("close_imgbb_window", () =>
    require("electron").BrowserWindow.getFocusedWindow()?.close(),
  );

  ipcMain.handle("spawn_capture_to_input", () => {});
}
