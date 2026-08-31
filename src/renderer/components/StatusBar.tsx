import type { CsvMeta, CsvNewline, ProgressPayload } from '@shared/types';

interface StatusBarProps {
  meta: CsvMeta;
  dirty: boolean;
  progress: ProgressPayload | null;
  filteredRowCount: number;
  delimiter: string;
  newline: CsvNewline;
  hasUtf8Bom: boolean;
}

const StatusBar = ({ meta, dirty, progress, filteredRowCount, delimiter, newline, hasUtf8Bom }: StatusBarProps) => {
  const visibleRowCount = filteredRowCount < meta.rowCount ? filteredRowCount : meta.rowCount;
  const delimiterLabel = delimiter === '\t' ? 'Tab' : delimiter === ',' ? 'Comma' : delimiter === ';' ? 'Semicolon' : `“${delimiter}”`;
  const newlineLabel = newline === '\r\n' ? 'CRLF' : newline === '\r' ? 'CR' : 'LF';

  return (
    <div className="status-bar">
      <span>
        {visibleRowCount} rows × {meta.columnCount} columns {dirty ? '(Unsaved)' : ''}
      </span>
      <span className="status-bar__middle">{meta.columnCount > 0 ? `${delimiterLabel} · UTF-8${hasUtf8Bom ? ' BOM' : ''} · ${newlineLabel}` : ''}</span>
      <span aria-live="polite">
        {progress
          ? `${progress.stage === 'parsing' ? 'Loading' : 'Saving'} ${Math.round(progress.percent * 100)}%`
          : 'Ready'}
      </span>
    </div>
  );
};

export default StatusBar;
