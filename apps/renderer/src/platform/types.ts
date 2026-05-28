/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OpenDialogOptions {
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface SaveDialogOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface PlatformBridge {
  invoke<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  convertFileSrc(path: string): string;

  fs: {
    exists(path: string, options?: { baseDir?: string }): Promise<boolean>;
    readTextFile(path: string, options?: { baseDir?: string }): Promise<string>;
    writeTextFile(
      path: string,
      content: string,
      options?: { baseDir?: string },
    ): Promise<void>;
    mkdir(
      path: string,
      options?: { baseDir?: string; recursive?: boolean },
    ): Promise<void>;
  };
  dialog: {
    open(options?: OpenDialogOptions): Promise<string | string[] | null>;
    save(options?: SaveDialogOptions): Promise<string | null>;
  };
  app: {
    getVersion(): Promise<string>;
    getRuntimeVersion(): Promise<string>;
    exit(code?: number): Promise<void>;
    relaunch(): Promise<void>;
  };
  window: {
    startDragging(): Promise<void>;
  };
  updater: {
    check(): Promise<{
      downloadAndInstall: () => Promise<void>;
    } | null>;
  };
}
