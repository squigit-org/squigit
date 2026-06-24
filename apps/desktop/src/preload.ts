/// <reference lib="dom" />
import { contextBridge, ipcRenderer, webUtils } from 'electron';

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('dragover', (e: any) => {
      e.preventDefault();
    });

    window.addEventListener('dragleave', (e: any) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e: any) => {
      e.preventDefault();
    });
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (command: string, args?: Record<string, unknown>) => {
    return ipcRenderer.invoke(command, args);
  },
  on: (channel: string, listener: (payload: any) => void) => {
    const subscription = (_event: any, payload: any) => listener(payload);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  getPathForFile: (file: any) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (e) {
      return file.path;
    }
  },
});
