import type { CellValue, ColumnProfile } from '@shared/types';
import type { FilteredRowEntry } from './filtering';

export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  columnIndex: number;
  direction: SortDirection;
}

const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const ISO_DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T ][\d:.+-Z]+)?$/;

const parseNumber = (value: CellValue): number | null => {
  const trimmed = String(value ?? '').trim();
  if (!NUMBER_RE.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: CellValue): number | null => {
  const trimmed = String(value ?? '').trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const parsed = Date.parse(trimmed.replace(/\//g, '-'));
  return Number.isNaN(parsed) ? null : parsed;
};

const compareText = (left: CellValue, right: CellValue): number =>
  String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    sensitivity: 'accent',
    numeric: true
  });

const compareCellValues = (
  left: CellValue,
  right: CellValue,
  profile?: ColumnProfile
): number => {
  const leftBlank = left === null || left === undefined || String(left).trim() === '';
  const rightBlank = right === null || right === undefined || String(right).trim() === '';
  if (leftBlank && rightBlank) return 0;
  if (leftBlank) return 1;
  if (rightBlank) return -1;

  if (profile?.inferredType === 'number') {
    const leftNumber = parseNumber(left);
    const rightNumber = parseNumber(right);
    if (leftNumber !== null && rightNumber !== null) {
      return leftNumber - rightNumber;
    }
  }

  if (profile?.inferredType === 'date') {
    const leftDate = parseDate(left);
    const rightDate = parseDate(right);
    if (leftDate !== null && rightDate !== null) {
      return leftDate - rightDate;
    }
  }

  return compareText(left, right);
};

export const sortRowEntries = (
  entries: FilteredRowEntry[],
  sorts: SortRule[],
  columnProfiles: ColumnProfile[]
): FilteredRowEntry[] => {
  if (!sorts.length) {
    return entries;
  }

  return [...entries].sort((left, right) => {
    for (const sort of sorts) {
      const comparison = compareCellValues(
        left.row[sort.columnIndex],
        right.row[sort.columnIndex],
        columnProfiles[sort.columnIndex]
      );
      if (comparison !== 0) {
        return sort.direction === 'asc' ? comparison : -comparison;
      }
    }
    return left.index - right.index;
  });
};
