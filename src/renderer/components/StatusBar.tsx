import type { ColumnProfile, CsvMeta, ProgressPayload } from '@shared/types';

interface StatusBarProps {
  meta: CsvMeta;
  dirty: boolean;
  progress: ProgressPayload | null;
  columnProfiles: ColumnProfile[];
}

const StatusBar = ({ meta, dirty, progress, columnProfiles }: StatusBarProps) => {
  const typeCounts = columnProfiles.reduce(
    (acc, profile) => {
      if (profile.inferredType === 'number') acc.number += 1;
      if (profile.inferredType === 'date') acc.date += 1;
      if (profile.inferredType === 'mixed') acc.mixed += 1;
      return acc;
    },
    { number: 0, date: 0, mixed: 0 }
  );

  const summaryBits: string[] = [];
  if (typeCounts.number > 0) summaryBits.push(`${typeCounts.number} numeric`);
  if (typeCounts.date > 0) summaryBits.push(`${typeCounts.date} date`);
  if (typeCounts.mixed > 0) summaryBits.push(`${typeCounts.mixed} mixed`);
  const inferenceLabel = summaryBits.length ? `Inferred: ${summaryBits.join(' | ')}` : 'Inferred: text/empty';

  return (
    <div className="status-bar">
      <span>
        {meta.rowCount} rows × {meta.columnCount} columns {dirty ? '(Unsaved)' : ''}
      </span>
      <span className="status-bar__middle">{inferenceLabel}</span>
      <span>
        {progress
          ? `${progress.stage === 'parsing' ? 'Loading' : 'Saving'} ${Math.round(progress.percent * 100)}%`
          : 'Ready'}
      </span>
    </div>
  );
};

export default StatusBar;

