import { readFile, stat, writeFile } from 'node:fs/promises';
import { app } from 'electron';
import type { CellValue, CsvDocument, MergeRecentFilesResult, ProgressPayload, SavePayload, SaveResult } from '@shared/types';
import { parseCsv, writeCsv } from './csvWorker';
import { RecentFileStore } from '../recentFiles';
import { logger } from '../logger';

interface FileManagerDeps {
  onProgress: (payload: ProgressPayload) => void;
  recents: RecentFileStore;
}

export class FileManager {
  private readonly onProgress: (payload: ProgressPayload) => void;
  private readonly recents: RecentFileStore;

  constructor({ onProgress, recents }: FileManagerDeps) {
    this.onProgress = onProgress;
    this.recents = recents;
  }

  private async withSecurityScopedAccess<T>(bookmark: string | undefined, run: () => Promise<T>): Promise<T> {
    if (process.platform !== 'darwin' || !bookmark) {
      return run();
    }

    let stopAccessing: (() => void) | undefined;
    try {
      stopAccessing = app.startAccessingSecurityScopedResource(bookmark) as () => void;
    } catch (error) {
      logger.warn('Failed to start security-scoped access', error);
    }

    try {
      return await run();
    } finally {
      try {
        stopAccessing?.();
      } catch {
        // Ignore cleanup errors; open/save result already determined.
      }
    }
  }

  async open(filePath: string, options?: { bookmark?: string }): Promise<CsvDocument> {
    const parsed = await this.withSecurityScopedAccess(options?.bookmark, () =>
      parseCsv(filePath, this.onProgress)
    );
    const document: CsvDocument = {
      ...parsed,
      filePath,
      updatedAt: new Date().toISOString(),
      meta: {
        rowCount: parsed.rows.length,
        columnCount: parsed.headers.length
      }
    };

    this.recents.add(filePath, options?.bookmark);
    logger.info(`Loaded CSV: ${filePath}`);
    return document;
  }

  async mergeRecentFiles(
    filePathA: string,
    filePathB: string,
    options?: { bookmarkA?: string; bookmarkB?: string }
  ): Promise<MergeRecentFilesResult> {
    const parsedA = await this.withSecurityScopedAccess(options?.bookmarkA, () =>
      parseCsv(filePathA, this.onProgress)
    );
    const parsedB = await this.withSecurityScopedAccess(options?.bookmarkB, () =>
      parseCsv(filePathB, this.onProgress)
    );

    return this.buildMergedDocument(parsedA, parsedB, [filePathA, filePathB]);
  }

  mergeDocuments(
    documentA: Pick<CsvDocument, 'headers' | 'rows' | 'delimiter' | 'newline' | 'hasFinalNewline' | 'hasUtf8Bom'>,
    documentB: Pick<CsvDocument, 'headers' | 'rows' | 'delimiter' | 'newline' | 'hasFinalNewline' | 'hasUtf8Bom'>,
    sourcePaths: [string, string]
  ): MergeRecentFilesResult {
    return this.buildMergedDocument(documentA, documentB, sourcePaths);
  }

  private buildMergedDocument(
    parsedA: Pick<CsvDocument, 'headers' | 'rows' | 'delimiter' | 'newline' | 'hasFinalNewline' | 'hasUtf8Bom'>,
    parsedB: Pick<CsvDocument, 'headers' | 'rows' | 'delimiter' | 'newline' | 'hasFinalNewline' | 'hasUtf8Bom'>,
    sourcePaths: [string, string]
  ): MergeRecentFilesResult {
    const headers = [...parsedA.headers];
    for (const header of parsedB.headers) {
      if (!headers.includes(header)) {
        headers.push(header);
      }
    }

    const normalizeRows = (sourceHeaders: string[], rows: CellValue[][]): CellValue[][] =>
      rows.map((row) => {
        const nextRow = new Array<CellValue>(headers.length).fill('');
        for (let sourceIndex = 0; sourceIndex < sourceHeaders.length; sourceIndex += 1) {
          const header = sourceHeaders[sourceIndex];
          const targetIndex = headers.indexOf(header);
          if (targetIndex === -1) {
            continue;
          }
          nextRow[targetIndex] = row[sourceIndex] ?? '';
        }
        return nextRow;
      });

    const mergedRows = [
      ...normalizeRows(parsedA.headers, parsedA.rows),
      ...normalizeRows(parsedB.headers, parsedB.rows)
    ];

    const document: CsvDocument = {
      headers,
      rows: mergedRows,
      delimiter: parsedA.delimiter,
      newline: parsedA.newline,
      hasFinalNewline: parsedA.hasFinalNewline,
      hasUtf8Bom: parsedA.hasUtf8Bom,
      filePath: null,
      updatedAt: new Date().toISOString(),
      meta: {
        rowCount: mergedRows.length,
        columnCount: headers.length
      }
    };

    logger.info(`Merged recent CSV files: ${sourcePaths[0]} + ${sourcePaths[1]}`);

    return {
      document,
      sourcePaths
    };
  }

  async save(payload: SavePayload, options?: { bookmark?: string }): Promise<SaveResult> {
    return this.withSecurityScopedAccess(options?.bookmark, async () => {
      if (payload.expectedVersion && !payload.force) {
        let current;
        try {
          current = await stat(payload.filePath);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return { ok: false, conflict: true };
          }
          throw error;
        }
        const changed =
          current.size !== payload.expectedVersion.size ||
          Math.abs(current.mtimeMs - payload.expectedVersion.mtimeMs) > 0.5;
        if (changed) {
          return {
            ok: false,
            conflict: true,
            currentVersion: { mtimeMs: current.mtimeMs, size: current.size }
          };
        }
      }

      await writeCsv(payload, this.onProgress);
      const saved = await stat(payload.filePath);
      this.recents.add(payload.filePath, options?.bookmark);
      logger.info(`Saved CSV: ${payload.filePath}`);
      return { ok: true, fileVersion: { mtimeMs: saved.mtimeMs, size: saved.size } };
    });
  }

  async readText(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
  }

  async writeText(filePath: string, contents: string): Promise<void> {
    await writeFile(filePath, contents, 'utf-8');
    this.recents.add(filePath);
  }
}
