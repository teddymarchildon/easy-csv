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
      {progress ? (
        <span>
          {progress.stage === 'parsing' ? 'Loading' : 'Saving'} {Math.round(progress.percent * 100)}%
        </span>
      ) : (
        <span>Ready</span>
      )}
    </div>
  );
};

export default StatusBar;

