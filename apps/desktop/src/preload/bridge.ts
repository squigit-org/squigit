import { contextBridge, ipcRenderer, webUtils } from 'electron';

export function exposeElectronApi() {
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
}
