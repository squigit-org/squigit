/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlatformBridge } from "../types";

// The electronAPI will be injected by preload.ts
const api = (window as any).electronAPI || {
  invoke: async () => {},
  on: async () => () => {},
};

export const platform: PlatformBridge = {
  invoke: (cmd, args) => api.invoke(cmd, args),
  listen: (event, handler) => api.on(event, handler),
  convertFileSrc: (path) => `squigit-asset://${encodeURIComponent(path)}`,
  fs: {
    exists: (path, options) => api.invoke("fs:exists", { path, ...options }),
    readTextFile: (path, options) =>
      api.invoke("fs:readTextFile", { path, ...options }),
    writeTextFile: (path, content, options) =>
      api.invoke("fs:writeTextFile", { path, content, ...options }),
    mkdir: (path, options) => api.invoke("fs:mkdir", { path, ...options }),
  },
  dialog: {
    open: (options) => api.invoke("dialog:open", options),
    save: (options) => api.invoke("dialog:save", options),
  },
  app: {
    getVersion: () => api.invoke("app:getVersion"),
    getRuntimeVersion: () => api.invoke("app:getRuntimeVersion"),
    exit: (code) => api.invoke("app:exit", { code }),
    relaunch: () => api.invoke("app:relaunch"),
  },
  window: {
    startDragging: () => api.invoke("window:startDragging"),
  },
  updater: {
    check: () => api.invoke("updater:check"),
  },
};

export { commands } from "./commands";
export { listenTo } from "./events";
export type * from "../tauri/tauri.types";
export const platformType = "linux";
