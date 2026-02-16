import { readFile, writeFile } from 'node:fs/promises';
import type { CsvDocument, ProgressPayload, SavePayload } from '@shared/types';
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

  async open(filePath: string): Promise<CsvDocument> {
    const parsed = await parseCsv(filePath, this.onProgress);
    const document: CsvDocument = {
      ...parsed,
      filePath,
      updatedAt: new Date().toISOString(),
      meta: {
        rowCount: parsed.rows.length,
        columnCount: parsed.headers.length
      }
    };

    this.recents.add(filePath);
    logger.info(`Loaded CSV: ${filePath}`);
    return document;
  }

  async save(payload: SavePayload): Promise<void> {
    await writeCsv(payload, this.onProgress);
    this.recents.add(payload.filePath);
    logger.info(`Saved CSV: ${payload.filePath}`);
  }

  async readText(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
  }

  async writeText(filePath: string, contents: string): Promise<void> {
    await writeFile(filePath, contents, 'utf-8');
    this.recents.add(filePath);
  }
}
