import { parentPort, workerData } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';
import type { CellValue, SavePayload } from '@shared/types';

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
        newline: '\n' | '\r\n';
      };
    }
  | { type: 'written'; filePath: string };

const detectDelimiter = (sample: string): string => {
  const candidates: Record<string, number> = {
    ',': 0,
    '\t': 0,
    ';': 0,
    '|': 0
  };

  for (const char of sample) {
    if (char in candidates) {
      candidates[char] += 1;
    }
  }

  return (
    Object.entries(candidates).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    ','
  );
};

const detectNewline = (input: string): '\n' | '\r\n' => {
  if (input.includes('\r\n')) {
    return '\r\n';
  }
  return '\n';
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

      const fileBuffer = await readFile(task.filePath);
      const fileText = fileBuffer.toString('utf-8');
      const newline = detectNewline(fileText);
      const delimiter = task.delimiter ?? detectDelimiter(fileText.slice(0, 4096));

      const { data } = Papa.parse<string[]>(fileText, {
        delimiter,
        newline,
        skipEmptyLines: true
      });

      const [headerRow = [], ...rows] = data;
      const headers = headerRow.map((value, index) => value || `Column ${index + 1}`);

      emit({
        type: 'progress',
        stage: 'parsing',
        percent: 1,
        filePath: task.filePath
      });

      emit({
        type: 'result',
        payload: { headers, rows, delimiter, newline }
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

      const normalizedHeaders = headers.map((header, index) => header || `Column ${index + 1}`);
      const csvText = Papa.unparse(
        {
          fields: normalizedHeaders,
          data: rows
        },
        {
          delimiter,
          newline
        }
      );
      await writeFile(filePath, csvText, 'utf-8');
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
