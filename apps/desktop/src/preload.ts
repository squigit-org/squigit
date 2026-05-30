import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (command: string, args?: Record<string, unknown>) => {
    return ipcRenderer.invoke(command, args);
  },
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    const subscription = (event: any, ...args: any[]) => listener(event, ...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
});
