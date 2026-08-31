import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('wrap text is discoverable from the toolbar and cell context menu', async () => {
  const [toolbar, grid] = await Promise.all([
    readSource('src/renderer/components/Toolbar.tsx'),
    readSource('src/renderer/components/DataGrid.tsx')
  ]);

  assert.match(toolbar, /aria-pressed=\{wrapText\}/);
  assert.match(toolbar, /<IconWrapText \/> Wrap/);
  assert.match(grid, /role="menuitemcheckbox"/);
  assert.match(grid, /aria-checked=\{Boolean\(wrapText\)\}/);
  assert.match(grid, /Wrap Text in Sheet/);
});

test('wrapped cells are contained, clamped, and expanded for the focused row', async () => {
  const styles = await readSource('src/renderer/styles/app.css');
  const wrappedCellRule = styles.match(/\.data-grid--wrap-text \.data-grid__cell \{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? '';

  assert.match(wrappedCellRule, /overflow: hidden/);
  assert.doesNotMatch(wrappedCellRule, /overflow: visible/);
  assert.match(wrappedCellRule, /-webkit-line-clamp: 5/);
  assert.match(styles, /\.data-grid--wrap-text \.data-grid__row--expanded \.data-grid__cell/);
  assert.match(styles, /overflow-wrap: anywhere/);
});

test('wrapping does not expand headers and uses a multiline cell editor', async () => {
  const [styles, grid] = await Promise.all([
    readSource('src/renderer/styles/app.css'),
    readSource('src/renderer/components/DataGrid.tsx')
  ]);

  assert.doesNotMatch(styles, /data-grid--wrap-text \.data-grid__header-text/);
  assert.match(grid, /<textarea/);
  assert.match(grid, /className="data-grid__cell-editor"/);
});

test('wrap preference is persisted and captured independently for inactive tabs', async () => {
  const store = await readSource('src/renderer/state/gridStore.ts');

  assert.match(store, /WRAP_TEXT_PREFERENCE_KEY = 'rowly\.wrapText'/);
  assert.match(store, /wrapText: state\.wrapText/);
  assert.match(store, /wrapText: snap\.wrapText/);
  assert.match(store, /localStorage\.setItem\(WRAP_TEXT_PREFERENCE_KEY/);
});

test('context-menu positioning measures rendered content instead of assuming a fixed size', async () => {
  const grid = await readSource('src/renderer/components/DataGrid.tsx');

  assert.match(grid, /const menuRect = menu\.getBoundingClientRect\(\)/);
  assert.doesNotMatch(grid, /const menuHeight =/);
  assert.doesNotMatch(grid, /const menuWidth =/);
});
