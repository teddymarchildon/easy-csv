import { parentPort, workerData } from 'node:worker_threads';
import { chmod, open, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Papa from 'papaparse';
import type { CellValue, CsvNewline, FileVersion, SavePayload } from '@shared/types';

type WorkerTask =
  | {
      kind: 'parse';
      filePath: string;
      delimiter?: string;
    }
  | {
      kind: 'write';
      payload: SavePayload;
    };

type WorkerResponse =
  | { type: 'progress'; stage: 'parsing' | 'writing'; percent: number; filePath?: string }
  | {
      type: 'result';
      payload: {
        headers: string[];
        rows: CellValue[][];
        delimiter: string;
        newline: CsvNewline;
        hasFinalNewline: boolean;
        hasUtf8Bom: boolean;
        fileVersion: FileVersion;
      };
    }
  | { type: 'written'; filePath: string };

const detectNewline = (input: string): CsvNewline => {
  if (input.includes('\r\n')) {
    return '\r\n';
  }
  if (input.includes('\r')) {
    return '\r';
  }
  return '\n';
};

const detectDelimiter = (input: string, newline: CsvNewline): string => {
  const candidates = [',', '\t', ';', '|'];
  let best = { delimiter: ',', score: Number.NEGATIVE_INFINITY };

  for (const delimiter of candidates) {
    const sample = Papa.parse<string[]>(input, {
      delimiter,
      newline,
      preview: 25,
      skipEmptyLines: false
    });
    const rows = sample.data.filter((row) => !(row.length === 1 && row[0] === ''));
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    const [columnCount = 1, matchingRows = 0] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [];
    const quoteErrors = sample.errors.filter((error) => error.type === 'Quotes').length;
    const score = matchingRows * 100 + columnCount - quoteErrors * 10_000;
    if (columnCount > 1 && score > best.score) best = { delimiter, score };
  }

  return best.delimiter;
};

const atomicWriteFile = async (filePath: string, contents: string): Promise<FileVersion> => {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let existingMode: number | undefined;

  try {
    existingMode = (await stat(filePath)).mode;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }

  try {
    const handle = await open(temporaryPath, 'wx', existingMode);
    try {
      await handle.writeFile(contents, 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (existingMode !== undefined) {
      await chmod(temporaryPath, existingMode);
    }
    await rename(temporaryPath, filePath);
    const saved = await stat(filePath);
    return { mtimeMs: saved.mtimeMs, size: saved.size };
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

const task = workerData as WorkerTask;

const emit = (message: WorkerResponse) => {
  parentPort?.postMessage(message);
};

switch (task.kind) {
  case 'parse': {
    (async () => {
      emit({
        type: 'progress',
        stage: 'parsing',
        percent: 0,
        filePath: task.filePath
      });

      const fileHandle = await open(task.filePath, 'r');
      let fileBuffer: Buffer;
      let fileStats;
      try {
        [fileBuffer, fileStats] = await Promise.all([fileHandle.readFile(), fileHandle.stat()]);
      } finally {
        await fileHandle.close();
      }
      const hasUtf8Bom = fileBuffer.length >= 3 && fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb && fileBuffer[2] === 0xbf;
      const contents = hasUtf8Bom ? fileBuffer.subarray(3) : fileBuffer;
      let fileText: string;
      try {
        fileText = new TextDecoder('utf-8', { fatal: true }).decode(contents);
      } catch {
        throw new Error('This file is not valid UTF-8. Rowly did not open it to avoid corrupting its contents.');
      }
      const newline = detectNewline(fileText);
      const hasFinalNewline = fileText.endsWith('\n') || fileText.endsWith('\r');
      const delimiter = task.delimiter ?? detectDelimiter(fileText, newline);

      const parsed = Papa.parse<string[]>(fileText, {
        delimiter,
        newline,
        skipEmptyLines: false
      });
      const fatalErrors = parsed.errors.filter((error) => error.type === 'Quotes');
      if (fatalErrors.length) {
        const first = fatalErrors[0];
        throw new Error(`Could not safely parse CSV near row ${first.row ?? 'unknown'}: ${first.message}`);
      }

      const data = parsed.data;
      if (hasFinalNewline && data.length > 0 && data[data.length - 1]?.length === 1 && data[data.length - 1][0] === '') {
        data.pop();
      }

      const [headerRow = [], ...rows] = data;
      const headers = headerRow;

      emit({
        type: 'progress',
        stage: 'parsing',
        percent: 1,
        filePath: task.filePath
      });

      emit({
        type: 'result',
        payload: {
          headers,
          rows,
          delimiter,
          newline,
          hasFinalNewline,
          hasUtf8Bom,
          fileVersion: { mtimeMs: fileStats.mtimeMs, size: fileStats.size }
        }
      });
    })().catch((error) => {
      throw error;
    });
    break;
  }

  case 'write': {
    (async () => {
      const {
        payload: { headers, rows, delimiter, newline, filePath }
      } = task;

      emit({
        type: 'progress',
        stage: 'writing',
        percent: 0,
        filePath
      });

      let csvText = Papa.unparse(
        {
          fields: headers,
          data: rows
        },
        {
          delimiter,
          newline
        }
      );
      if (task.payload.hasFinalNewline) {
        csvText += newline;
      }
      if (task.payload.hasUtf8Bom) {
        csvText = `\ufeff${csvText}`;
      }
      await atomicWriteFile(filePath, csvText);
      emit({
        type: 'progress',
        stage: 'writing',
        percent: 1,
        filePath
      });
      emit({ type: 'written', filePath });
    })().catch((error) => {
      throw error;
    });
    break;
  }

  default:
    throw new Error('Unknown worker task');
}
