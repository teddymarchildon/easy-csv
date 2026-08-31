import { app, BrowserWindow, Menu } from 'electron';

type BuildAppMenuOptions = {
  getMainWindow: () => BrowserWindow | null;
  reopenMainWindow: () => void;
  getRecentFiles: () => string[];
  openRecentFile: (filePath: string) => void;
  clearRecentFiles: () => void;
};

export const buildAppMenu = ({
  getMainWindow,
  reopenMainWindow,
  getRecentFiles,
  openRecentFile,
  clearRecentFiles
}: BuildAppMenuOptions) => {
  const sendMenuAction = (action: string) => {
    getMainWindow()?.webContents.send('menu:action', { action });
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New CSV',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            sendMenuAction('new-csv');
          }
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            sendMenuAction('open');
          }
        },
        {
          label: 'Open Recent',
          submenu: [
            ...getRecentFiles().map((filePath) => ({
              label: filePath.split('/').pop() || filePath,
              sublabel: filePath,
              click: () => openRecentFile(filePath)
            })),
            ...(getRecentFiles().length > 0
              ? [
                  { type: 'separator' as const },
                  {
                    label: 'Clear Menu',
                    click: clearRecentFiles
                  }
                ]
              : [{ label: 'No Recent Files', enabled: false }])
          ]
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            sendMenuAction('save');
          }
        },
        {
          label: 'Save As…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => {
            sendMenuAction('save-as');
          }
        },
        {
          label: 'Save Filtered As…',
          accelerator: 'Shift+CmdOrCtrl+E',
          click: () => {
            sendMenuAction('save-filtered-as');
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            sendMenuAction('close-tab');
          }
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            sendMenuAction('settings');
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        ...(!app.isPackaged
          ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }, { type: 'separator' as const }]
          : []),
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'window',
      submenu: [
        {
          label: 'Reopen Main Window',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            reopenMainWindow();
          }
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'front' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Rowly Help',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            sendMenuAction('help-filter-language');
          }
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            sendMenuAction('help-keyboard-shortcuts');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};
