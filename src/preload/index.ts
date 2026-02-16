import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { RendererApi } from './types';

const api: RendererApi = {
  openFileViaDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openFile: (path) => ipcRenderer.invoke('file:load', path),
  chooseSaveLocation: (defaultPath) => ipcRenderer.invoke('dialog:save-file', defaultPath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  getRecentFiles: () => ipcRenderer.invoke('recent:list'),
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
  onMenuAction: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: { action: Parameters<typeof callback>[0] }) => {
      callback(payload.action);
    };
    ipcRenderer.on('menu:action', listener);
    return () => {
      ipcRenderer.removeListener('menu:action', listener);
    };
  },
  log: (message) => ipcRenderer.send('log', message)
};

contextBridge.exposeInMainWorld('api', api);
