import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import test from 'node:test';

const workerUrl = new URL('../out/main/csvWorkerScript.js', import.meta.url);

const runWorker = (workerData) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData });
    worker.on('message', (message) => {
      if (message.type === 'result' || message.type === 'written') resolve(message);
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited with ${code}`));
    });
  });

const withFixture = async (contents, run) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rowly-csv-'));
  const filePath = path.join(directory, 'fixture.csv');
  await writeFile(filePath, contents);
  return run(filePath);
};

test('detects quoted delimiters and preserves blank headers, rows, BOM, and final newline semantics', async () => {
  const source = '\ufeff;name\r\n"x,y";Ada\r\n;\r\n';
  await withFixture(source, async (filePath) => {
    const parsed = await runWorker({ kind: 'parse', filePath });
    assert.deepEqual(parsed.payload.headers, ['', 'name']);
    assert.deepEqual(parsed.payload.rows, [['x,y', 'Ada'], ['', '']]);
    assert.equal(parsed.payload.delimiter, ';');
    assert.equal(parsed.payload.newline, '\r\n');
    assert.equal(parsed.payload.hasUtf8Bom, true);
    assert.equal(parsed.payload.hasFinalNewline, true);

    await runWorker({
      kind: 'write',
      payload: { filePath, ...parsed.payload }
    });
    assert.equal(await readFile(filePath, 'utf8'), '\ufeff;name\r\nx,y;Ada\r\n;\r\n');
  });
});

test('preserves classic Mac line endings and absence of a final newline', async () => {
  const source = 'a,b\r1,2';
  await withFixture(source, async (filePath) => {
    const parsed = await runWorker({ kind: 'parse', filePath });
    assert.equal(parsed.payload.newline, '\r');
    assert.equal(parsed.payload.hasFinalNewline, false);
    await runWorker({ kind: 'write', payload: { filePath, ...parsed.payload } });
    assert.equal(await readFile(filePath, 'utf8'), source);
  });
});

test('rejects malformed quotes instead of silently rewriting the file', async () => {
  await withFixture('a,b\n"unterminated,2', async (filePath) => {
    await assert.rejects(
      runWorker({ kind: 'parse', filePath }),
      /Could not safely parse CSV/
    );
  });
});

test('rejects invalid UTF-8 instead of decoding replacement characters', async () => {
  await withFixture(Buffer.from([0x61, 0x2c, 0x62, 0x0a, 0xff]), async (filePath) => {
    await assert.rejects(runWorker({ kind: 'parse', filePath }), /not valid UTF-8/);
  });
});
