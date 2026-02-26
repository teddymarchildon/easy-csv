export type CellValue = string | number | null;
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
  newline: '\n' | '\r\n';
  filePath?: string | null;
  updatedAt: string;
  meta: CsvMeta;
}

export interface SavePayload {
  filePath: string;
  headers: string[];
  rows: CellValue[][];
  delimiter: string;
  newline: '\n' | '\r\n';
}

export interface RecentFile {
  path: string;
  openedAt: string;
}

export interface ProgressPayload {
  stage: 'parsing' | 'writing';
  percent: number;
  filePath?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemePayload {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}
