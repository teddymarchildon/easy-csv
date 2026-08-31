import type { CsvDocument, MergeRecentFilesResult, OpenRecentFileResult, ProgressPayload, RecentFile, ResolvedTheme, SavePayload, SaveResult, ThemeMode, ThemePayload } from '@shared/types';

export type MenuAction =
  | 'open'
  | 'save'
  | 'save-as'
  | 'save-filtered-as'
  | 'settings'
  | 'new-tab'
  | 'close-tab'
  | 'help-filter-language'
  | 'help-keyboard-shortcuts';

export interface RendererApi {
  openFileViaDialog(): Promise<CsvDocument | null>;
  openFile(path: string): Promise<CsvDocument>;
  openRecentFile(path: string): Promise<OpenRecentFileResult>;
  startOpenFileEvents(): Promise<string[]>;
  chooseSaveLocation(defaultPath?: string | null): Promise<string | null>;
  saveFile(payload: SavePayload): Promise<SaveResult>;
  mergeRecentFiles(pathA: string, pathB: string): Promise<MergeRecentFilesResult>;
  getRecentFiles(): Promise<RecentFile[]>;
  locateRecentFile(path: string): Promise<RecentFile[] | null>;
  removeRecentFile(path: string): Promise<RecentFile[]>;
  revealInFinder(path: string): Promise<void>;
  getTheme(): Promise<ThemePayload>;
  setTheme(mode: ThemeMode): Promise<ThemePayload>;
  onThemeChange(callback: (resolved: ResolvedTheme) => void): () => void;
  onProgress(callback: (payload: ProgressPayload) => void): () => void;
  onOpenFileRequest(callback: (filePath: string) => void): () => void;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
  onSaveBeforeClose(callback: () => void): () => void;
  completeSaveBeforeClose(success: boolean): void;
  setWindowDirty(dirty: boolean): void;
  log(message: unknown): void;
}
