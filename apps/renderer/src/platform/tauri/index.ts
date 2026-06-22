/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  exists,
  readTextFile,
  writeTextFile,
  mkdir,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  getVersion,
  getTauriVersion,
} from "@tauri-apps/api/app";
import { exit, relaunch } from "@tauri-apps/plugin-process";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import type { PlatformBridge } from "../types";

export const platform: PlatformBridge = {
  invoke,
  listen: <T>(event: string, handler: (payload: T) => void) =>
    listen(event, (e) => handler(e.payload as unknown as T)),
  convertFileSrc,
  fs: {
    exists: (path, options) =>
      exists(path, { baseDir: options?.baseDir === "AppConfig" ? BaseDirectory.AppConfig : undefined }),
    readTextFile: (path, options) =>
      readTextFile(path, { baseDir: options?.baseDir === "AppConfig" ? BaseDirectory.AppConfig : undefined }),
    writeTextFile: (path, content, options) =>
      writeTextFile(path, content, { baseDir: options?.baseDir === "AppConfig" ? BaseDirectory.AppConfig : undefined }),
    mkdir: (path, options) =>
      mkdir(path, {
        baseDir: options?.baseDir === "AppConfig" ? BaseDirectory.AppConfig : undefined,
        recursive: options?.recursive,
      }),
    removeFile: (path, options) =>
      remove(path, { baseDir: options?.baseDir === "AppConfig" ? BaseDirectory.AppConfig : undefined }),
  },
  dialog: { open, save },
  app: { getVersion, getRuntimeVersion: getTauriVersion, exit, relaunch },
  window: { startDragging: () => getCurrentWindow().startDragging() },
  updater: { check },
};

export * from "./commands.ts";
export * from "./events.ts";
export * from "./tauri.types.ts";
export const platformType = typeof window !== "undefined" && "electronAPI" in window ? "linux" : "linux";
