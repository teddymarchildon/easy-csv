import { useEffect, useRef, useState } from 'react';
import type { RecentFile } from '@shared/types';

interface RecentFilesPanelProps {
  files: RecentFile[];
  selectedPaths?: string[];
  onOpen: (filePath: string) => void;
  onLocate: (filePath: string) => void;
  onToggleSelect?: (filePath: string) => void;
  onMergeSelected?: () => void;
  onRemove: (filePath: string) => void;
  onReveal: (filePath: string) => void;
  onClear?: () => void;
  emptyState: string;
  variant?: 'sidebar' | 'welcome';
  limit?: number;
}

function extractParts(filePath: string): { folder: string; fileName: string } {
  const segments = filePath.replace(/\\/g, '/').split('/');
  const fileName = segments.pop() || filePath;
  const folder = segments.slice(-2).join('/');
  return { folder, fileName };
}

function timeAgo(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const RecentFilesPanel = ({
  files,
  selectedPaths = [],
  onOpen,
  onLocate,
  onToggleSelect,
  onMergeSelected,
  onRemove,
  onReveal,
  onClear,
  emptyState,
  variant = 'sidebar',
  limit
}: RecentFilesPanelProps) => {
  const [mergeMode, setMergeMode] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [rowMenuPath, setRowMenuPath] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shownFiles = typeof limit === 'number' ? files.slice(0, limit) : files;
  const selectedCount = selectedPaths.length;

  useEffect(() => {
    if (!actionsOpen && !rowMenuPath) return;
    const closeAll = () => {
      setActionsOpen(false);
      setRowMenuPath(null);
    };
    const closeMenus = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      closeAll();
    };
    window.addEventListener('mousedown', closeMenus);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeMenus);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionsOpen, rowMenuPath]);

  const finishMerge = () => {
    onMergeSelected?.();
    setMergeMode(false);
  };

  const cancelMerge = () => {
    selectedPaths.forEach((path) => onToggleSelect?.(path));
    setMergeMode(false);
  };

  return (
    <div ref={panelRef} className={`recent-panel recent-panel--${variant}`}>
      {variant === 'sidebar' && (
        <div className="recent-panel__header">
          <div>
            <h3 className="recent-panel__title">Recent Files</h3>
            {mergeMode && <span className="recent-panel__hint">Select two files</span>}
          </div>
          {mergeMode ? (
            <div className="recent-panel__merge-actions">
              <button className="recent-panel__text-action" onClick={cancelMerge}>Cancel</button>
              <button className="recent-panel__merge" onClick={finishMerge} disabled={selectedCount !== 2}>Merge</button>
            </div>
          ) : (
            <div className="recent-panel__actions">
              <button className="recent-panel__actions-button" onClick={() => setActionsOpen((open) => !open)} aria-label="Recent files actions" aria-expanded={actionsOpen}>•••</button>
              {actionsOpen && (
                <div className="recent-panel__actions-menu">
                  <button disabled={files.length < 2} onClick={() => { cancelMerge(); setMergeMode(true); setActionsOpen(false); }}>Merge Two Files…</button>
                  <button disabled={files.length === 0} onClick={() => { onClear?.(); setActionsOpen(false); }}>Clear Recent Files</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {shownFiles.length === 0 && <p className="recent-panel__empty">{emptyState}</p>}
      <ul className="recent-list">
        {shownFiles.map((file) => {
          const { folder, fileName } = extractParts(file.path);
          const isSelected = selectedPaths.includes(file.path);
          const isMissing = file.status === 'missing';
          const needsPermission = file.status === 'permission-required';
          const selectDisabled = isMissing || needsPermission || (!isSelected && selectedCount >= 2);
          const detail = isMissing
            ? 'File moved or unavailable'
            : needsPermission
              ? 'Access required'
              : [folder, timeAgo(file.openedAt)].filter(Boolean).join(' · ');
          return (
            <li key={file.path} className={`recent-list__item${isSelected ? ' recent-list__item--selected' : ''}${isMissing ? ' recent-list__item--missing' : ''}${needsPermission ? ' recent-list__item--permission' : ''}`}>
              {mergeMode && onToggleSelect && (
                <button className={`recent-item__select${isSelected ? ' recent-item__select--selected' : ''}`} onClick={() => onToggleSelect(file.path)} disabled={selectDisabled} aria-label={isSelected ? `Deselect ${fileName}` : `Select ${fileName} for merge`} aria-pressed={isSelected}>
                  <span className="recent-item__select-box" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                </button>
              )}
              <button className="recent-item" onClick={() => onOpen(file.path)} title={file.path}>
                <span className="recent-item__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h4l1.5 1.5H13a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                </span>
                <span className="recent-item__text">
                  <span className="recent-item__name">{fileName}</span>
                  <span className="recent-item__folder">{detail}</span>
                </span>
              </button>
              {isMissing && <button className="recent-item__repair" onClick={() => onLocate(file.path)}>Locate…</button>}
              {needsPermission && <button className="recent-item__repair" onClick={() => onOpen(file.path)}>Allow…</button>}
              {variant === 'sidebar' && !mergeMode && (
                <div className="recent-item__menu-wrap">
                  <button className="recent-item__more" onClick={() => { setActionsOpen(false); setRowMenuPath((path) => path === file.path ? null : file.path); }} aria-label={`More actions for ${fileName}`} aria-expanded={rowMenuPath === file.path}>•••</button>
                  {rowMenuPath === file.path && (
                    <div className="recent-item__menu">
                      <button disabled={isMissing} onClick={() => { onReveal(file.path); setRowMenuPath(null); }}>Show in Finder</button>
                      <button className="danger" onClick={() => { onRemove(file.path); setRowMenuPath(null); }}>Remove from Recents</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RecentFilesPanel;
