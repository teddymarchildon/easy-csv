import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('MAS entitlements permit persistent read-write access to user-selected files', async () => {
  const plist = await readFile(new URL('../entitlements.mas.plist', import.meta.url), 'utf8');
  assert.match(plist, /com\.apple\.security\.app-sandbox/);
  assert.match(plist, /com\.apple\.security\.files\.user-selected\.read-write/);
  assert.match(plist, /com\.apple\.security\.files\.bookmarks\.app-scope/);
  assert.match(plist, /com\.apple\.security\.application-groups/);
  assert.match(plist, /55PJ732NTM\.com\.teddymarchildon\.easycsv/);
});

test('macOS document types include CSV and TSV', async () => {
  const forgeConfig = await readFile(new URL('../forge.config.cjs', import.meta.url), 'utf8');
  assert.match(forgeConfig, /public\.comma-separated-values-text/);
  assert.match(forgeConfig, /public\.tab-separated-values-text/);
});
