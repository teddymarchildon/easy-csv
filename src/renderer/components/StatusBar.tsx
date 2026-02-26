import type { CsvMeta, ProgressPayload } from '@shared/types';

interface StatusBarProps {
  meta: CsvMeta;
  dirty: boolean;
  progress: ProgressPayload | null;
}

const StatusBar = ({ meta, dirty, progress }: StatusBarProps) => {
  return (
    <div className="status-bar">
      <span>
        {meta.rowCount} rows × {meta.columnCount} columns {dirty ? '(Unsaved)' : ''}
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

