import type { CellValue, ColumnProfile } from '@shared/types';

const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const ISO_DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T ][\d:.+-Z]+)?$/;

export interface FilteredRowEntry {
  row: CellValue[];
  index: number;
}

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!NUMBER_RE.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: string): number | null => {
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const parsed = Date.parse(trimmed.replace(/\//g, '-'));
  return Number.isNaN(parsed) ? null : parsed;
};

const matchContains = (cell: CellValue, filterValue: string): boolean =>
  String(cell ?? '').toLowerCase().includes(filterValue.toLowerCase());

const evaluateNumericQuery = (cell: CellValue, query: string): boolean | null => {
  const raw = String(cell ?? '').trim();
  const cellValue = parseNumber(raw);
  if (cellValue === null) return false;

  const trimmedQuery = query.trim();
  if (!trimmedQuery.length) return true;

  const betweenMatch = trimmedQuery.match(/^(.+)\.\.(.+)$/);
  if (betweenMatch) {
    const min = parseNumber(betweenMatch[1]);
    const max = parseNumber(betweenMatch[2]);
    if (min === null || max === null) return null;
    return cellValue >= min && cellValue <= max;
  }

  const opMatch = trimmedQuery.match(/^(>=|<=|>|<|=)\s*(.+)$/);
  if (opMatch) {
    const operand = parseNumber(opMatch[2]);
    if (operand === null) return null;
    switch (opMatch[1]) {
      case '>':
        return cellValue > operand;
      case '>=':
        return cellValue >= operand;
      case '<':
        return cellValue < operand;
      case '<=':
        return cellValue <= operand;
      case '=':
        return cellValue === operand;
      default:
        return null;
    }
  }

  const exact = parseNumber(trimmedQuery);
  if (exact !== null) {
    return cellValue === exact;
  }

  return null;
};

const evaluateDateQuery = (cell: CellValue, query: string): boolean | null => {
  const raw = String(cell ?? '').trim();
  const cellValue = parseDate(raw);
  if (cellValue === null) return false;

  const trimmedQuery = query.trim();
  if (!trimmedQuery.length) return true;

  const betweenMatch = trimmedQuery.match(/^(.+)\.\.(.+)$/);
  if (betweenMatch) {
    const min = parseDate(betweenMatch[1]);
    const max = parseDate(betweenMatch[2]);
    if (min === null || max === null) return null;
    return cellValue >= min && cellValue <= max;
  }

  const keywordMatch = trimmedQuery.match(/^(before|after|on)\s+(.+)$/i);
  if (keywordMatch) {
    const operand = parseDate(keywordMatch[2]);
    if (operand === null) return null;
    const keyword = keywordMatch[1].toLowerCase();
    if (keyword === 'before') return cellValue < operand;
    if (keyword === 'after') return cellValue > operand;
    return cellValue === operand;
  }

  const opMatch = trimmedQuery.match(/^(>=|<=|>|<|=)\s*(.+)$/);
  if (opMatch) {
    const operand = parseDate(opMatch[2]);
    if (operand === null) return null;
    switch (opMatch[1]) {
      case '>':
        return cellValue > operand;
      case '>=':
        return cellValue >= operand;
      case '<':
        return cellValue < operand;
      case '<=':
        return cellValue <= operand;
      case '=':
        return cellValue === operand;
      default:
        return null;
    }
  }

  const exact = parseDate(trimmedQuery);
  if (exact !== null) {
    return cellValue === exact;
  }

  return null;
};

const evaluateCellFilter = (cell: CellValue, filterValue: string, profile?: ColumnProfile): boolean => {
  if (!filterValue.trim().length) return true;
  if (profile?.inferredType === 'number') {
    const result = evaluateNumericQuery(cell, filterValue);
    return result === null ? matchContains(cell, filterValue) : result;
  }
  if (profile?.inferredType === 'date') {
    const result = evaluateDateQuery(cell, filterValue);
    return result === null ? matchContains(cell, filterValue) : result;
  }
  return matchContains(cell, filterValue);
};

export const buildFilteredRowEntries = (
  rows: CellValue[][],
  filters: Record<number, string>,
  columnProfiles: ColumnProfile[] = []
): FilteredRowEntry[] => {
  const entries = rows.map((row, index) => ({ row, index }));
  const filterEntries = Object.entries(filters).filter(([, value]) => value?.trim().length);
  if (!filterEntries.length) {
    return entries;
  }
  return entries.filter(({ row }) =>
    filterEntries.every(([columnIndex, value]) =>
      evaluateCellFilter(row[Number(columnIndex)], value, columnProfiles[Number(columnIndex)])
    )
  );
};
