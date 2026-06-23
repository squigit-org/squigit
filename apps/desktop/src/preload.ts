/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron';

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('dragover', (e: any) => {
      e.preventDefault();
      ipcRenderer.emit('tauri://drag-over', {}, { paths: [] });
    });

    window.addEventListener('dragleave', (e: any) => {
      e.preventDefault();
      ipcRenderer.emit('tauri://drag-leave', {}, { paths: [] });
    });

    window.addEventListener('drop', (e: any) => {
      e.preventDefault();
      const paths = Array.from(e.dataTransfer?.files || [])
        .map((f: any) => f.path)
        .filter(Boolean);
      if (paths.length > 0) {
        ipcRenderer.emit('tauri://drag-drop', {}, { paths });
      } else {
        ipcRenderer.emit('tauri://drag-leave', {}, { paths: [] });
      }
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
});
