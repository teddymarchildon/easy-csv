import { Worker } from 'node:worker_threads';
import type { CsvDocument, ProgressPayload, SavePayload } from '@shared/types';

type WorkerTask =
  | { kind: 'parse'; filePath: string; delimiter?: string }
  | { kind: 'write'; payload: SavePayload };

type WorkerResult =
  | {
      type: 'result';
      payload: {
        headers: string[];
        rows: CsvDocument['rows'];
        delimiter: string;
        newline: CsvDocument['newline'];
      };
    }
  | { type: 'written'; filePath: string }
  | ProgressPayload & { type: 'progress' };

const workerUrl = new URL('./csvWorkerScript.js', import.meta.url);

const runWorker = <T>(task: WorkerTask, onProgress?: (payload: ProgressPayload) => void) => {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: task
    });

    worker.on('message', (message: WorkerResult) => {
      if (message.type === 'progress') {
        onProgress?.({
          stage: message.stage,
          percent: message.percent,
          filePath: message.filePath
        });
        return;
      }

      if (message.type === 'result') {
        resolve(message.payload as T);
        return;
      }

      if (message.type === 'written') {
        resolve(message as T);
      }
    });

    worker.once('error', (error) => {
      reject(error);
    });

    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`CSV worker exited with code ${code}`));
      }
    });
  });
};

export const parseCsv = (filePath: string, onProgress?: (payload: ProgressPayload) => void) =>
  runWorker<Omit<CsvDocument, 'meta' | 'updatedAt'>>(
    {
      kind: 'parse',
      filePath
    },
    onProgress
  );

export const writeCsv = (payload: SavePayload, onProgress?: (payload: ProgressPayload) => void) =>
  runWorker<{ type: 'written'; filePath: string }>(
    {
      kind: 'write',
      payload
    },
    onProgress
  );
