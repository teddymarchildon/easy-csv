interface ToolbarProps {
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onSaveFilteredAs(): void;
  onNewCsv(): void;
  onAddRow(): void;
  onAddColumn(): void;
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
  hasData: boolean;
  hasActiveFilters: boolean;
  undoLabel?: string;
  redoLabel?: string;
  dirty: boolean;
  filePath?: string | null;
  wrapText: boolean;
  onToggleWrap(): void;
}

/* ── Inline SVG icons (16×16, stroke-based) ──────── */

const IconOpen = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 13V4.5a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />
    <path d="M2 8h12" />
  </svg>
);

const IconSave = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.5 14H3.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h7l3 3v8a1 1 0 0 1-1 1Z" />
    <path d="M10 2v3H6V2" />
    <path d="M5.5 9.5h5v4h-5z" />
  </svg>
);

const IconSaveAs = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 14H3.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h7l3 3v4" />
    <path d="M10 2v3H6V2" />
    <path d="M11.5 11l-2.5 3h5l-2.5-3Z" />
  </svg>
);

const IconAddRow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="12" height="4" rx="0.75" />
    <rect x="2" y="9" width="12" height="4" rx="0.75" />
    <line x1="8" y1="9.5" x2="8" y2="12.5" />
    <line x1="6.5" y1="11" x2="9.5" y2="11" />
  </svg>
);

const IconAddCol = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="2" width="4" height="12" rx="0.75" />
    <rect x="9" y="2" width="4" height="12" rx="0.75" />
    <line x1="11" y1="6.5" x2="11" y2="9.5" />
    <line x1="9.5" y1="8" x2="12.5" y2="8" />
  </svg>
);

const IconUndo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h6.5a3 3 0 0 1 0 6H9" />
    <path d="M6.5 3.5 4 6l2.5 2.5" />
  </svg>
);

const IconRedo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6H5.5a3 3 0 0 0 0 6H7" />
    <path d="M9.5 3.5 12 6 9.5 8.5" />
  </svg>
);

const IconSaveFiltered = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h12l-4 4.5V12l-4 2V7.5L2 3Z" />
  </svg>
);

const IconNewFile = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5L9.5 2Z" />
    <path d="M9.5 2v3h3" />
    <line x1="8" y1="8" x2="8" y2="12" />
    <line x1="6" y1="10" x2="10" y2="10" />
  </svg>
);

const IconWrapText = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="4" x2="14" y2="4" />
    <path d="M2 8h9a2.5 2.5 0 0 1 0 5H9" />
    <path d="M10.5 11.5 9 13l1.5 1.5" />
    <line x1="2" y1="12" x2="5" y2="12" />
  </svg>
);

const Toolbar = ({
  onOpen,
  onSave,
  onSaveAs,
  onSaveFilteredAs,
  onNewCsv,
  onAddRow,
  onAddColumn,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasData,
  hasActiveFilters,
  undoLabel,
  redoLabel,
  dirty,
  filePath,
  wrapText,
  onToggleWrap
}: ToolbarProps) => {
  const filename = filePath ? filePath.split('/').pop() : 'Untitled.csv';

  const undoTitle = undoLabel ? `Undo: ${undoLabel} (⌘Z)` : 'Undo (⌘Z)';
  const redoTitle = redoLabel ? `Redo: ${redoLabel} (⇧⌘Z)` : 'Redo (⇧⌘Z)';

  return (
    <div className="toolbar">
      <button onClick={onNewCsv}>
        <IconNewFile /> New
      </button>
      <button onClick={onOpen}>
        <IconOpen /> Open
      </button>
      <button className="primary" onClick={onSave} disabled={!dirty}>
        <IconSave /> Save
      </button>
      <button onClick={onSaveAs} disabled={!hasData}>
        <IconSaveAs /> Save As
      </button>
      <button onClick={onSaveFilteredAs} disabled={!hasActiveFilters} title="Save Filtered As… (⇧⌘E)">
        <IconSaveFiltered /> Save Filtered
      </button>
      <div className="toolbar-separator" />
      <button onClick={onAddRow} disabled={!hasData}>
        <IconAddRow /> Row
      </button>
      <button onClick={onAddColumn} disabled={!hasData}>
        <IconAddCol /> Column
      </button>
      <button className={wrapText ? 'active' : ''} onClick={onToggleWrap} disabled={!hasData} title="Toggle Text Wrapping">
        <IconWrapText /> Wrap
      </button>
      <div className="toolbar-separator" />
      <button onClick={onUndo} disabled={!canUndo} title={undoTitle}>
        <IconUndo /> Undo
      </button>
      <button onClick={onRedo} disabled={!canRedo} title={redoTitle}>
        <IconRedo /> Redo
      </button>
      {filename && (
        <div className="toolbar-file-badge">
          {dirty && <span className="toolbar-file-dot" />}
          <span className="toolbar-file-name">{filename}</span>
        </div>
      )}
    </div>
  );
};

export default Toolbar;

