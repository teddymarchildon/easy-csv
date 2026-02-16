import { app, BrowserWindow, Menu, shell } from 'electron';

export const buildAppMenu = (win: BrowserWindow | null) => {
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
            win?.webContents.send('menu:action', { action: 'new-tab' });
          }
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            win?.webContents.send('menu:action', { action: 'open' });
          }
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            win?.webContents.send('menu:action', { action: 'save' });
          }
        },
        {
          label: 'Save As…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => {
            win?.webContents.send('menu:action', { action: 'save-as' });
          }
        },
        {
          label: 'Save Filtered As…',
          accelerator: 'Shift+CmdOrCtrl+E',
          click: () => {
            win?.webContents.send('menu:action', { action: 'save-filtered-as' });
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            win?.webContents.send('menu:action', { action: 'close-tab' });
          }
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            win?.webContents.send('menu:action', { action: 'settings' });
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
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Easy CSV Docs',
          click: () => shell.openExternal('https://example.com/docs')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};
