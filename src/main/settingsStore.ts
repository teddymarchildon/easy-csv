import Store from 'electron-store';
import type { ThemeMode } from '@shared/types';

type SettingsShape = {
  themeMode: ThemeMode;
};

const store = new Store<SettingsShape>({
  name: 'easysheet-settings',
  defaults: {
    themeMode: 'system'
  }
});

export class SettingsStore {
  getThemeMode(): ThemeMode {
    return store.get('themeMode', 'system');
  }

  setThemeMode(mode: ThemeMode): void {
    store.set('themeMode', mode);
  }
}
