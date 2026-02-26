import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CsvDocument, SavePayload, ThemeMode } from '@shared/types';
import { FileManager } from './services/fileManager';
import { RecentFileStore } from './recentFiles';
import { SettingsStore } from './settingsStore';
import { buildAppMenu } from './menu';
import { logger } from './logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
let mainWindow: BrowserWindow | null = null;

app.setName('Easy CSV');
app.setAppUserModelId('com.easysheet.app');

const recents = new RecentFileStore();
const settings = new SettingsStore();
const fileManager = new FileManager({
  onProgress: (payload) => {
    mainWindow?.webContents.send('csv:progress', payload);
  },
  recents
});

const isMac = process.platform === 'darwin';

// Apply saved theme preference before creating the window
nativeTheme.themeSource = settings.getThemeMode();

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  });

  buildAppMenu(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const showTimeout = setTimeout(() => {
    logger.warn('ready-to-show did not fire within 5 seconds — forcing window visible');
    mainWindow?.show();
  }, 5000);

  mainWindow.once('ready-to-show', () => clearTimeout(showTimeout));

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error('Renderer failed to load:', { errorCode, errorDescription });
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadURL('app://bundle/renderer/index.html');
  }
};

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

app.whenReady().then(() => {
  const rendererDir = path.join(__dirname, '..');

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };

  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const filePath = path.resolve(rendererDir, decodeURIComponent(url.pathname).slice(1));
    if (!filePath.startsWith(rendererDir)) {
      return new Response('Forbidden', { status: 403 });
    }
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(data, {
      headers: { 'content-type': mimeTypes[ext] || 'application/octet-stream' }
    });
  });

  createWindow().catch((error) => logger.error(error));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => logger.error(error));
    }
  });
});

ipcMain.handle('dialog:open-file', async () => {
  if (!mainWindow) {
    return null;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv', 'tsv'] }]
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return fileManager.open(filePaths[0]);
});

ipcMain.handle('dialog:save-file', async (_, defaultPath?: string) => {
  if (!mainWindow) {
    return null;
  }

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });

  if (canceled || !filePath) {
    return null;
  }

  return filePath;
});

ipcMain.handle('file:load', async (_event, filePath: string) => {
  return fileManager.open(filePath);
});

ipcMain.handle('file:save', async (_event, payload: SavePayload) => {
  await fileManager.save(payload);
  return true;
});

ipcMain.handle('recent:list', () => recents.list());

ipcMain.handle('recent:remove', (_event, filePath: string) => recents.remove(filePath));

ipcMain.handle('file:reveal', async (_event, targetPath: string) => {
  if (!targetPath) {
    return;
  }

  await shell.showItemInFolder(targetPath);
});

ipcMain.on('log', (_event, message: unknown) => {
  logger.info('[renderer]', message);
});

// ── Theme / settings ──────────────────────────────

ipcMain.handle('settings:get-theme', () => ({
  mode: settings.getThemeMode(),
  resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}));

ipcMain.handle('settings:set-theme', (_event, mode: ThemeMode) => {
  settings.setThemeMode(mode);
  nativeTheme.themeSource = mode;
  return {
    mode,
    resolved: (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') as const
  };
});

nativeTheme.on('updated', () => {
  const resolved = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  mainWindow?.webContents.send('theme:changed', resolved);
});
