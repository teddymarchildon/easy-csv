import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { RendererApi } from './types';

const api: RendererApi = {
  openFileViaDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openFile: (path) => ipcRenderer.invoke('file:load', path),
  openRecentFile: (path) => ipcRenderer.invoke('recent:open', path),
  startOpenFileEvents: () => ipcRenderer.invoke('app:start-open-file-events'),
  chooseSaveLocation: (defaultPath) => ipcRenderer.invoke('dialog:save-file', defaultPath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  mergeRecentFiles: (pathA, pathB) => ipcRenderer.invoke('file:merge-recents', { pathA, pathB }),
  getRecentFiles: () => ipcRenderer.invoke('recent:list'),
  locateRecentFile: (path) => ipcRenderer.invoke('recent:locate', path),
  removeRecentFile: (path) => ipcRenderer.invoke('recent:remove', path),
  revealInFinder: (targetPath) => ipcRenderer.invoke('file:reveal', targetPath),
  getTheme: () => ipcRenderer.invoke('settings:get-theme'),
  setTheme: (mode) => ipcRenderer.invoke('settings:set-theme', mode),
  onThemeChange: (callback) => {
    const listener = (_event: IpcRendererEvent, resolved: Parameters<typeof callback>[0]) => {
      callback(resolved);
    };
    ipcRenderer.on('theme:changed', listener);
    return () => {
      ipcRenderer.removeListener('theme:changed', listener);
    };
  },
  onProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: Parameters<typeof callback>[0]) => {
      callback(payload);
    };
    ipcRenderer.on('csv:progress', listener);
    return () => {
      ipcRenderer.removeListener('csv:progress', listener);
    };
  },
  onOpenFileRequest: (callback) => {
    const listener = (_event: IpcRendererEvent, filePath: string) => {
      callback(filePath);
    };
    ipcRenderer.on('file:open-request', listener);
    return () => {
      ipcRenderer.removeListener('file:open-request', listener);
    };
  },
  onMenuAction: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: { action: Parameters<typeof callback>[0] }) => {
      callback(payload.action);
    };
    ipcRenderer.on('menu:action', listener);
    return () => {
      ipcRenderer.removeListener('menu:action', listener);
    };
  },
  setWindowDirty: (dirty) => ipcRenderer.send('window:set-dirty', dirty),
  log: (message) => ipcRenderer.send('log', message)
};

contextBridge.exposeInMainWorld('api', api);
