import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { CloseTabChoice, MergeRecentFilesPayload, OpenRecentFileResult, RecentFile, SavePayload, ThemeMode } from '@shared/types';
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
let activeEditorDirty = false;
let bypassCloseConfirm = false;
let closeSaveInFlight = false;
const pendingOpenFiles: string[] = [];
let openFileEventsReady = false;

app.setName('Rowly');
app.setAppUserModelId('com.teddymarchildon.easycsv');

const recents = new RecentFileStore();
const settings = new SettingsStore();
const pendingSaveBookmarks = new Map<string, string>();
const fileManager = new FileManager({
  onProgress: (payload) => {
    mainWindow?.webContents.send('csv:progress', payload);
  },
  recents
});

const isMac = process.platform === 'darwin';
const absolutePathSchema = z.string().min(1).refine((value) => path.isAbsolute(value), 'Expected an absolute file path');
const themeModeSchema = z.enum(['light', 'dark', 'system']);
const mergePayloadSchema = z.object({ pathA: absolutePathSchema, pathB: absolutePathSchema });
const savePayloadSchema = z.custom<SavePayload>((value) => {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SavePayload>;
  const expectedVersion = payload.expectedVersion as unknown;
  const validVersion =
    expectedVersion === undefined ||
    (typeof expectedVersion === 'object' &&
      expectedVersion !== null &&
      Number.isFinite((expectedVersion as { mtimeMs?: unknown }).mtimeMs) &&
      Number.isFinite((expectedVersion as { size?: unknown }).size));
  return (
    typeof payload.filePath === 'string' &&
    path.isAbsolute(payload.filePath) &&
    Array.isArray(payload.headers) &&
    payload.headers.every((header) => typeof header === 'string') &&
    Array.isArray(payload.rows) &&
    payload.rows.every((row) =>
      Array.isArray(row) && row.every((cell) => cell === null || typeof cell === 'string' || (typeof cell === 'number' && Number.isFinite(cell)))
    ) &&
    typeof payload.delimiter === 'string' &&
    payload.delimiter.length === 1 &&
    (payload.newline === '\n' || payload.newline === '\r\n' || payload.newline === '\r') &&
    typeof payload.hasFinalNewline === 'boolean' &&
    typeof payload.hasUtf8Bom === 'boolean' &&
    (payload.force === undefined || typeof payload.force === 'boolean') &&
    validVersion
  );
}, 'Invalid save payload');

// Apply saved theme preference before creating the window
nativeTheme.themeSource = settings.getThemeMode();

const restoreMainWindow = async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
};

const enqueueOpenFile = (filePath: string) => {
  if (!filePath || pendingOpenFiles.includes(filePath)) {
    return;
  }
  pendingOpenFiles.push(filePath);
};

const isMacPermissionError = (error: unknown) =>
  process.platform === 'darwin' &&
  error instanceof Error &&
  ((('code' in error) && (error.code === 'EPERM' || error.code === 'EACCES')) ||
    error.message.includes('EPERM') ||
    error.message.includes('EACCES') ||
    error.message.toLowerCase().includes('operation not permitted') ||
    error.message.toLowerCase().includes('permission denied'));

const isMissingFileError = (error: unknown) =>
  error instanceof Error &&
  (('code' in error && error.code === 'ENOENT') || error.message.includes('ENOENT'));

const hydrateRecentFile = async (recent: RecentFile): Promise<RecentFile> => {
  let stopAccessing: (() => void) | undefined;
  try {
    if (process.platform === 'darwin' && recent.bookmark) {
      try {
        stopAccessing = app.startAccessingSecurityScopedResource(recent.bookmark) as () => void;
      } catch {
        return { ...recent, status: 'permission-required' };
      }
    }
    await stat(recent.path);
    return { ...recent, status: 'available' };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { ...recent, status: 'missing' };
    }
    if (isMacPermissionError(error)) {
      return { ...recent, status: 'permission-required' };
    }
    return { ...recent, status: 'available' };
  } finally {
    stopAccessing?.();
  }
};

const listRecentFiles = async () => Promise.all(recents.list().map((recent) => hydrateRecentFile(recent)));

const syncSystemRecentDocuments = () => {
  app.clearRecentDocuments();
  recents.list().slice().reverse().forEach((recent) => app.addRecentDocument(recent.path));
};

const promptToChooseRecentFileLocation = async ({
  filePath,
  title,
  message,
  buttonLabel
}: {
  filePath: string;
  title: string;
  message: string;
  buttonLabel: string;
}) => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    message,
    defaultPath: filePath,
    buttonLabel,
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv', 'tsv'] }],
    securityScopedBookmarks: process.platform === 'darwin'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const bookmark = Array.isArray((result as { bookmarks?: string[] }).bookmarks)
    ? (result as { bookmarks?: string[] }).bookmarks?.[0]
    : undefined;

  return { filePath: selectedPath, bookmark };
};

const promptToReauthorizeFile = async (filePath: string) =>
  promptToChooseRecentFileLocation({
    filePath,
    title: 'Allow Rowly to Reopen This File',
    message: 'macOS requires permission to reopen this file from Recents.',
    buttonLabel: 'Allow Access'
  });

const promptToLocateRecentFile = async (filePath: string) =>
  promptToChooseRecentFileLocation({
    filePath,
    title: 'Locate Moved Recent File',
    message: 'This recent file was moved or renamed. Choose its new location to keep it in Recents.',
    buttonLabel: 'Update Recent'
  });

const openFileFromPath = async (filePath: string) => {
  const bookmark = recents.find(filePath)?.bookmark;

  try {
    return await fileManager.open(filePath, { bookmark });
  } catch (error) {
    if (!isMacPermissionError(error)) {
      throw error;
    }

    const reauthorized = await promptToReauthorizeFile(filePath);
    if (!reauthorized) {
      throw error;
    }

    if (reauthorized.filePath !== filePath) {
      recents.remove(filePath);
    }

    return fileManager.open(reauthorized.filePath, { bookmark: reauthorized.bookmark });
  }
};

const openRecentFile = async (filePath: string): Promise<OpenRecentFileResult> => {
  const existing = recents.find(filePath);

  try {
    const document = await openFileFromPath(filePath);
    const recentFile = await hydrateRecentFile(recents.find(filePath) ?? {
      path: filePath,
      openedAt: new Date().toISOString(),
      bookmark: existing?.bookmark
    });

    return {
      document,
      recentFile,
      pathChanged: false
    };
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    const located = await promptToLocateRecentFile(filePath);
    if (!located) {
      throw error;
    }

    const document = await fileManager.open(located.filePath, { bookmark: located.bookmark });
    recents.replace(filePath, located.filePath, located.bookmark);

    return {
      document,
      recentFile: await hydrateRecentFile(recents.find(located.filePath) ?? {
        path: located.filePath,
        openedAt: new Date().toISOString(),
        bookmark: located.bookmark
      }),
      pathChanged: located.filePath !== filePath
    };
  }
};

const openRecentFilesForMerge = async (pathA: string, pathB: string) => {
  const [documentA, documentB] = await Promise.all([openFileFromPath(pathA), openFileFromPath(pathB)]);
  return fileManager.mergeDocuments(documentA, documentB, [pathA, pathB]);
};

const refreshAppMenu = () => {
  buildAppMenu({
    getMainWindow: () => mainWindow,
    reopenMainWindow: () => {
      restoreMainWindow().catch((error) => logger.error(error));
    },
    getRecentFiles: () => recents.list().map((recent) => recent.path),
    openRecentFile: (filePath) => {
      handleOpenFileRequest(filePath).catch((error) => logger.error(error));
    },
    clearRecentFiles: () => {
      recents.clear();
      syncSystemRecentDocuments();
      mainWindow?.webContents.send('recent:changed');
      refreshAppMenu();
    }
  });
};

const flushPendingOpenFiles = () => {
  if (!mainWindow || mainWindow.isDestroyed() || !openFileEventsReady) {
    return;
  }

  const filePaths = pendingOpenFiles.splice(0, pendingOpenFiles.length);
  filePaths.forEach((filePath) => {
    mainWindow?.webContents.send('file:open-request', filePath);
  });
};

const handleOpenFileRequest = async (filePath: string) => {
  enqueueOpenFile(filePath);

  // Finder can send open-file before Electron is ready on cold launch.
  if (!app.isReady()) {
    return;
  }

  await restoreMainWindow();
  flushPendingOpenFiles();
};

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

  activeEditorDirty = false;
  bypassCloseConfirm = false;
  mainWindow.setDocumentEdited(false);

  refreshAppMenu();

  mainWindow.on('closed', () => {
    openFileEventsReady = false;
    mainWindow = null;
  });

  mainWindow.on('close', async (event) => {
    if (!activeEditorDirty || bypassCloseConfirm) {
      return;
    }

    event.preventDefault();
    const response = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Save Changes', 'Cancel', 'Discard Changes'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Unsaved Changes',
      message: 'One or more tabs have unsaved changes.',
      detail: 'Save all changes before closing Rowly?'
    });

    if (response.response === 0) {
      if (!closeSaveInFlight) {
        closeSaveInFlight = true;
        mainWindow?.webContents.send('app:save-before-close');
      }
    } else if (response.response === 2) {
      activeEditorDirty = false;
      mainWindow?.setDocumentEdited(false);
      bypassCloseConfirm = true;
      mainWindow?.close();
      bypassCloseConfirm = false;
    }
  });

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
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (targetUrl !== currentUrl) event.preventDefault();
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
    const relativePath = path.relative(rendererDir, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return new Response('Forbidden', { status: 403 });
    }
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(data, {
      headers: { 'content-type': mimeTypes[ext] || 'application/octet-stream' }
    });
  });

  createWindow()
    .then(() => {
      flushPendingOpenFiles();
    })
    .catch((error) => logger.error(error));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      restoreMainWindow().catch((error) => logger.error(error));
    }
  });
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  handleOpenFileRequest(filePath).catch((error) => logger.error(error));
});

ipcMain.handle('dialog:open-file', async () => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv', 'tsv'] }],
    securityScopedBookmarks: process.platform === 'darwin'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const bookmark = Array.isArray((result as { bookmarks?: string[] }).bookmarks)
    ? (result as { bookmarks?: string[] }).bookmarks?.[0]
    : undefined;

  const document = await fileManager.open(filePath, { bookmark });
  refreshAppMenu();
  return document;
});

ipcMain.handle('dialog:confirm-close-tab', async (_event, fileName: string): Promise<CloseTabChoice> => {
  if (!mainWindow) return 'cancel';
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Save', 'Cancel', "Don't Save"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: 'Save Changes?',
    message: `Do you want to save the changes made to “${fileName}”?`,
    detail: 'Your changes will be lost if you don’t save them.'
  });
  if (result.response === 0) return 'save';
  if (result.response === 2) return 'discard';
  return 'cancel';
});

ipcMain.handle('dialog:save-file', async (_, defaultPath?: string) => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    securityScopedBookmarks: process.platform === 'darwin'
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const bookmark = (result as { bookmark?: string }).bookmark;
  if (bookmark) {
    pendingSaveBookmarks.set(result.filePath, bookmark);
  }

  return result.filePath;
});

ipcMain.handle('file:load', async (_event, filePath: string) => {
  const document = await openFileFromPath(absolutePathSchema.parse(filePath));
  refreshAppMenu();
  return document;
});

ipcMain.handle('recent:open', async (_event, filePath: string) => {
  const result = await openRecentFile(absolutePathSchema.parse(filePath));
  refreshAppMenu();
  return result;
});

ipcMain.handle('file:merge-recents', async (_event, payload: MergeRecentFilesPayload) => {
  const parsed = mergePayloadSchema.parse(payload) as MergeRecentFilesPayload;
  return openRecentFilesForMerge(parsed.pathA, parsed.pathB);
});

ipcMain.handle('app:start-open-file-events', () => {
  openFileEventsReady = true;
  return pendingOpenFiles.splice(0, pendingOpenFiles.length);
});

ipcMain.handle('file:save', async (_event, payload: SavePayload) => {
  const parsedPayload = savePayloadSchema.parse(payload);
  const bookmark = pendingSaveBookmarks.get(parsedPayload.filePath) ?? recents.find(parsedPayload.filePath)?.bookmark;
  if (bookmark) {
    pendingSaveBookmarks.delete(parsedPayload.filePath);
  }
  const result = await fileManager.save(parsedPayload, { bookmark });
  if (result.ok) refreshAppMenu();
  return result;
});

ipcMain.handle('recent:list', () => listRecentFiles());

ipcMain.handle('recent:locate', async (_event, filePath: string) => {
  filePath = absolutePathSchema.parse(filePath);
  const located = await promptToLocateRecentFile(filePath);
  if (!located) {
    return null;
  }

  recents.replace(filePath, located.filePath, located.bookmark);
  syncSystemRecentDocuments();
  refreshAppMenu();
  return listRecentFiles();
});

ipcMain.handle('recent:remove', (_event, filePath: string) => {
  const next = recents.remove(absolutePathSchema.parse(filePath));
  syncSystemRecentDocuments();
  refreshAppMenu();
  return next;
});

ipcMain.handle('recent:clear', () => {
  const next = recents.clear();
  syncSystemRecentDocuments();
  refreshAppMenu();
  return next;
});

ipcMain.handle('file:reveal', async (_event, targetPath: string) => {
  targetPath = absolutePathSchema.parse(targetPath);
  await shell.showItemInFolder(targetPath);
});

ipcMain.on('log', (_event, message: unknown) => {
  logger.info('[renderer]', message);
});

ipcMain.on('window:set-dirty', (_event, dirty: boolean) => {
  activeEditorDirty = dirty;
  mainWindow?.setDocumentEdited(dirty);
});

ipcMain.on('app:save-before-close-complete', (_event, success: boolean) => {
  closeSaveInFlight = false;
  if (!success || !mainWindow || mainWindow.isDestroyed()) return;
  activeEditorDirty = false;
  mainWindow.setDocumentEdited(false);
  bypassCloseConfirm = true;
  mainWindow.close();
  bypassCloseConfirm = false;
});

// ── Theme / settings ──────────────────────────────

ipcMain.handle('settings:get-theme', () => ({
  mode: settings.getThemeMode(),
  resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}));

ipcMain.handle('settings:set-theme', (_event, mode: ThemeMode) => {
  mode = themeModeSchema.parse(mode);
  settings.setThemeMode(mode);
  nativeTheme.themeSource = mode;
  return {
    mode,
    resolved: nativeTheme.shouldUseDarkColors ? ('dark' as const) : ('light' as const)
  };
});

nativeTheme.on('updated', () => {
  const resolved = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  mainWindow?.webContents.send('theme:changed', resolved);
});
