import type { CellValue, ColumnInferredType, ColumnProfile } from '@shared/types';

const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const ISO_DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T ][\d:.+-Z]+)?$/;
const MAX_INVALID_EXAMPLES = 3;
const TYPE_THRESHOLD = 0.98;

const toTrimmedString = (value: CellValue): string => String(value ?? '').trim();

const parseBoolean = (value: string): boolean | null => {
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === 'yes' || lower === '1') return true;
  if (lower === 'false' || lower === 'no' || lower === '0') return false;
  return null;
};

const parseNumber = (value: string): number | null => {
  if (!NUMBER_RE.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: string): number | null => {
  if (!ISO_DATE_RE.test(value)) return null;
  const parsed = Date.parse(value.replace(/\//g, '-'));
  return Number.isNaN(parsed) ? null : parsed;
};

const pickInferredType = (
  nonNullCount: number,
  parseableCount: { number: number; date: number; boolean: number }
): { inferredType: ColumnInferredType; confidence: number } => {
  if (nonNullCount === 0) {
    return { inferredType: 'empty', confidence: 1 };
  }

  const numberRatio = parseableCount.number / nonNullCount;
  const dateRatio = parseableCount.date / nonNullCount;
  const booleanRatio = parseableCount.boolean / nonNullCount;

  if (numberRatio >= TYPE_THRESHOLD) {
    return { inferredType: 'number', confidence: numberRatio };
  }
  if (dateRatio >= TYPE_THRESHOLD) {
    return { inferredType: 'date', confidence: dateRatio };
  }
  if (booleanRatio >= TYPE_THRESHOLD) {
    return { inferredType: 'boolean', confidence: booleanRatio };
  }

  const bestRatio = Math.max(numberRatio, dateRatio, booleanRatio);
  if (bestRatio >= 0.5) {
    return { inferredType: 'mixed', confidence: bestRatio };
  }

  return { inferredType: 'string', confidence: 1 - bestRatio };
};

export const inferColumnProfiles = (headers: string[], rows: CellValue[][]): ColumnProfile[] => {
  return headers.map((_, columnIndex) => {
    let nonNullCount = 0;
    let nullCount = 0;
    const parseableCount = { number: 0, date: 0, boolean: 0 };
    const invalidExamples: string[] = [];
    const numericValues: number[] = [];
    const dateValues: number[] = [];

    for (const row of rows) {
      const raw = row[columnIndex];
      const value = toTrimmedString(raw);
      if (!value.length) {
        nullCount += 1;
        continue;
      }

      nonNullCount += 1;

      const asNumber = parseNumber(value);
      if (asNumber !== null) {
        parseableCount.number += 1;
        numericValues.push(asNumber);
      }

      const asDate = parseDate(value);
      if (asDate !== null) {
        parseableCount.date += 1;
        dateValues.push(asDate);
      }

      if (parseBoolean(value) !== null) {
        parseableCount.boolean += 1;
      }

      if (
        asNumber === null &&
        asDate === null &&
        parseBoolean(value) === null &&
        invalidExamples.length < MAX_INVALID_EXAMPLES
      ) {
        invalidExamples.push(value);
      }
    }

    const { inferredType, confidence } = pickInferredType(nonNullCount, parseableCount);

    const profile: ColumnProfile = {
      inferredType,
      confidence,
      nonNullCount,
      nullCount,
      parseableCount,
      invalidExamples
    };

    if (inferredType === 'number' && numericValues.length) {
      const sum = numericValues.reduce((acc, val) => acc + val, 0);
      profile.numericStats = {
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        mean: sum / numericValues.length
      };
    }

    if (inferredType === 'date' && dateValues.length) {
      const min = Math.min(...dateValues);
      const max = Math.max(...dateValues);
      profile.dateStats = {
        minIso: new Date(min).toISOString(),
        maxIso: new Date(max).toISOString()
      };
    }

    return profile;
  });
};

export const getTypeBadgeLabel = (type: ColumnInferredType): string => {
  switch (type) {
    case 'number':
      return '#';
    case 'date':
      return 'D';
    case 'boolean':
      return 'B';
    case 'mixed':
      return 'M';
    case 'empty':
      return 'E';
    case 'string':
    default:
      return 'S';
  }
};

export const getTypeLabel = (type: ColumnInferredType): string => {
  switch (type) {
    case 'number':
      return 'Number';
    case 'date':
      return 'Date';
    case 'boolean':
      return 'Boolean';
    case 'mixed':
      return 'Mixed';
    case 'empty':
      return 'Empty';
    case 'string':
    default:
      return 'Text';
  }
};
