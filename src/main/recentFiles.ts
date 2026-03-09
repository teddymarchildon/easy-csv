import Store from 'electron-store';
import type { RecentFile } from '@shared/types';

const MAX_RECENT = 15;

type RecentStoreShape = {
  recentFiles: RecentFile[];
};

const store = new Store<RecentStoreShape>({
  name: 'easysheet-preferences',
  defaults: {
    recentFiles: []
  }
});

export class RecentFileStore {
  list(): RecentFile[] {
    return store.get('recentFiles', []);
  }

  find(path: string): RecentFile | undefined {
    return this.list().find((entry) => entry.path === path);
  }

  add(path: string, bookmark?: string): RecentFile[] {
    const previous = this.find(path);
    const existing = this.list().filter((entry) => entry.path !== path);
    const nextBookmark = bookmark ?? previous?.bookmark;
    const next: RecentFile[] = [
      {
        path,
        openedAt: new Date().toISOString(),
        ...(nextBookmark ? { bookmark: nextBookmark } : {})
      },
      ...existing
    ].slice(0, MAX_RECENT);
    store.set('recentFiles', next);
    return next;
  }

  remove(path: string): RecentFile[] {
    const next = this.list().filter((entry) => entry.path !== path);
    store.set('recentFiles', next);
    return next;
  }
}

