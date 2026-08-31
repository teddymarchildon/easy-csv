export type CellValue = string | number | null;
export type CsvNewline = '\n' | '\r\n' | '\r';

export interface FileVersion {
  mtimeMs: number;
  size: number;
}
export type ColumnInferredType = 'empty' | 'number' | 'date' | 'boolean' | 'string' | 'mixed';

export interface ColumnProfile {
  inferredType: ColumnInferredType;
  confidence: number;
  nonNullCount: number;
  nullCount: number;
  parseableCount: {
    number: number;
    date: number;
    boolean: number;
  };
  invalidExamples: string[];
  numericStats?: {
    min: number;
    max: number;
    mean: number;
  };
  dateStats?: {
    minIso: string;
    maxIso: string;
  };
}

export interface CsvMeta {
  rowCount: number;
  columnCount: number;
}

export interface CsvDocument {
  headers: string[];
  rows: CellValue[][];
  delimiter: string;
  newline: CsvNewline;
  hasFinalNewline: boolean;
  hasUtf8Bom: boolean;
  fileVersion?: FileVersion;
  filePath?: string | null;
  updatedAt: string;
  meta: CsvMeta;
}

export interface SavePayload {
  filePath: string;
  headers: string[];
  rows: CellValue[][];
  delimiter: string;
  newline: CsvNewline;
  hasFinalNewline: boolean;
  hasUtf8Bom: boolean;
  expectedVersion?: FileVersion;
  force?: boolean;
}

export type SaveResult =
  | { ok: true; fileVersion: FileVersion }
  | { ok: false; conflict: true; currentVersion?: FileVersion };

export interface RecentFile {
  path: string;
  openedAt: string;
  bookmark?: string;
  status?: 'available' | 'missing';
}

export interface OpenRecentFileResult {
  document: CsvDocument;
  recentFile: RecentFile;
  pathChanged: boolean;
}

export interface ProgressPayload {
  stage: 'parsing' | 'writing';
  percent: number;
  filePath?: string;
}

export interface MergeRecentFilesPayload {
  pathA: string;
  pathB: string;
}

export interface MergeRecentFilesResult {
  document: CsvDocument;
  sourcePaths: [string, string];
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemePayload {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}
