import type { CsvMeta, ProgressPayload } from '@shared/types';

interface StatusBarProps {
  meta: CsvMeta;
  dirty: boolean;
  progress: ProgressPayload | null;
  filteredRowCount: number;
}

const StatusBar = ({ meta, dirty, progress, filteredRowCount }: StatusBarProps) => {
  const visibleRowCount = filteredRowCount < meta.rowCount ? filteredRowCount : meta.rowCount;

  return (
    <div className="status-bar">
      <span>
        {visibleRowCount} rows × {meta.columnCount} columns {dirty ? '(Unsaved)' : ''}
      </span>
      <span className="status-bar__middle" />
      <span>
        {progress
          ? `${progress.stage === 'parsing' ? 'Loading' : 'Saving'} ${Math.round(progress.percent * 100)}%`
          : 'Ready'}
      </span>
    </div>
  );
};

export default StatusBar;
