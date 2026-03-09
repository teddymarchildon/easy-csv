import { app, BrowserWindow, Menu } from 'electron';

type BuildAppMenuOptions = {
  getMainWindow: () => BrowserWindow | null;
  reopenMainWindow: () => void;
};

export const buildAppMenu = ({ getMainWindow, reopenMainWindow }: BuildAppMenuOptions) => {
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
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            sendMenuAction('new-tab');
          }
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            sendMenuAction('open');
          }
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
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }]
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
          label: 'Easy CSV Help',
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
