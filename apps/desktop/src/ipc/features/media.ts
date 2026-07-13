import { ipcMain } from "electron";
import { addon } from "../system/addon";
import { requireStringArg } from "../system/arguments";
import { getThreadDir } from "./thread";

const resolveOcrImagePath = (rawImagePath: string) => {
  const path = require("path");
  const fs = require("fs");
  const base = addon.get_store_base_dir?.();

  if (!base) return rawImagePath;

  const normalized = path.normalize(rawImagePath);
  if (!path.isAbsolute(normalized)) {
    const relative = normalized.replace(/^(\.\.[/\\])+/, "").replace(/^\.?[/\\]/, "");
    if (relative === "objects" || relative.startsWith(`objects${path.sep}`)) {
      return path.join(base, relative);
    }
    return path.join(base, "threads", relative);
  }

  if (fs.existsSync(normalized)) {
    return normalized;
  }

  const marker = `${path.sep}objects${path.sep}`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex !== -1) {
    return path.join(base, "objects", normalized.slice(markerIndex + marker.length));
  }

  return normalized;
};

export function registerMediaHandlers() {
  ipcMain.handle("detect_image_tone", async (_, args) => {
    try {
      const fs = require("fs/promises");
      const buf = await fs.readFile(args.path || args.imagePath);
      return addon.detect_image_tone?.(buf) || "dark";
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
      const annotationsPath = require("path").join(
        threadDir,
        "ocr_annotations.json",
      );
      let annotations: any = {};
      try {
        annotations = JSON.parse(await fs.readFile(annotationsPath, "utf-8"));
      } catch {}
      annotations[args.modelId || "eng"] = args.ocrData;
      await fs.writeFile(annotationsPath, JSON.stringify(annotations, null, 2));
    } catch (e) {
      console.error("save_ocr_data error", e);
    }
  });

  ipcMain.handle("get_ocr_data", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const annotationsPath = require("path").join(
        getThreadDir(args.threadId),
        "ocr_annotations.json",
      );
      const annotations = JSON.parse(
        await fs.readFile(annotationsPath, "utf-8"),
      );
      return annotations[args.modelId || "eng"] || null;
    } catch {
      return null;
    }
  });

  ipcMain.handle("get_ocr_annotations", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const annotationsPath = require("path").join(
        getThreadDir(args.threadId),
        "ocr_annotations.json",
      );
      return JSON.parse(await fs.readFile(annotationsPath, "utf-8"));
    } catch {
      return {};
    }
  });

  ipcMain.handle("init_ocr_annotations", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const threadDir = getThreadDir(args.threadId);
      await fs.mkdir(threadDir, { recursive: true });
      const annotationsPath = require("path").join(
        threadDir,
        "ocr_annotations.json",
      );
      let annotations: any = {};
      try {
        annotations = JSON.parse(await fs.readFile(annotationsPath, "utf-8"));
      } catch {}
      for (const modelId of args.modelIds || []) {
        if (!(modelId in annotations)) annotations[modelId] = null;
      }
      await fs.writeFile(annotationsPath, JSON.stringify(annotations, null, 2));
    } catch (e) {
      console.error("init_ocr_annotations error", e);
    }
  });

  ipcMain.handle("spawn_capture", () => {});
  ipcMain.handle("process_image_path", (_, args) =>
    addon.process_image_path?.(args.path),
  );
  ipcMain.handle("ocr_image", async (_, args) => {
    const absolutePath = resolveOcrImagePath(
      requireStringArg("ocr_image", args, "imageData", "imagePath", "path"),
    );
    const resultJson = await addon.ocr_image?.(
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
    if (addon.copy_image_to_clipboard) {
      return addon.copy_image_to_clipboard(args.base64Data);
    }
    const { clipboard, nativeImage } = require("electron");
    const image = nativeImage.createFromDataURL(
      `data:image/png;base64,${args.base64Data}`,
    );
    clipboard.writeImage(image);
  });
  ipcMain.handle("copy_image_from_path_to_clipboard", (_, args) => {
    if (addon.copy_image_from_path_to_clipboard) {
      return addon.copy_image_from_path_to_clipboard(args.path);
    }
    const { clipboard, nativeImage } = require("electron");
    const image = nativeImage.createFromPath(args.path);
    clipboard.writeImage(image);
  });

  ipcMain.handle("read_clipboard_text", () => {
    if (addon.read_clipboard_text) {
      return addon.read_clipboard_text();
    }
    return require("electron").clipboard.readText();
  });

  ipcMain.handle("cancel_download_ocr_model", (_, args) =>
    addon.cancel_download_ocr_model?.(args.modelId),
  );
  ipcMain.handle("download_ocr_model", async (event, args) => {
    return addon.download_ocr_model?.(
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
    (_, args) => addon.get_model_path?.(args.modelId) || "",
  );
  ipcMain.handle("cancel_ocr_job", () => {});
  ipcMain.handle(
    "list_downloaded_models",
    () => addon.list_downloaded_models?.() || [],
  );

  ipcMain.handle("upload_image_to_imgbb", (_, args) =>
    addon.upload_image_to_imgbb?.(args.imagePath, args.apiKey),
  );

  ipcMain.handle("close_imgbb_window", () =>
    require("electron").BrowserWindow.getFocusedWindow()?.close(),
  );

  ipcMain.handle("spawn_capture_to_input", () => {});
}
