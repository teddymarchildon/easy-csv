import { useCallback, useRef, useState } from 'react';
import { useGridStore } from '../state/gridStore';

interface TabBarProps {
  onOpen(): void;
}

const TabBar = ({ onOpen }: TabBarProps) => {
  const tabs = useGridStore((s) => s.tabs);
  const activeTabId = useGridStore((s) => s.activeTabId);
  const activeDirty = useGridStore((s) => s.dirty);
  const activeFilePath = useGridStore((s) => s.filePath);
  const switchTab = useGridStore((s) => s.switchTab);
  const closeTab = useGridStore((s) => s.closeTab);
  const reorderTabs = useGridStore((s) => s.reorderTabs);

  const dragIndexRef = useRef<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const getDisplayName = useCallback(
    (tab: (typeof tabs)[number]) => {
      const fp = tab.id === activeTabId ? activeFilePath : tab.filePath;
      if (!fp) return 'Untitled.csv';
      return fp.split('/').pop() || 'Untitled.csv';
    },
    [activeTabId, activeFilePath]
  );

  const isDirty = useCallback(
    (tab: (typeof tabs)[number]) => {
      if (tab.id === activeTabId) return activeDirty;
      // For inactive tabs, use the stored dirty flag (synced on switch)
      return tab.dirty;
    },
    [activeTabId, activeDirty]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const state = useGridStore.getState();
      let tabDirty = false;

      if (tabId === state.activeTabId) {
        tabDirty = state.dirty;
      } else {
        const snap = state._tabSnapshots[tabId];
        tabDirty = snap?.dirty ?? false;
      }

      if (tabDirty) {
        const confirmed = window.confirm(
          'This tab has unsaved changes. Close it anyway?'
        );
        if (!confirmed) return;
      }

      closeTab(tabId);
    },
    [closeTab]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault();
        handleCloseTab(tabId);
      }
    },
    [handleCloseTab]
  );

  const getTooltip = useCallback(
    (tab: (typeof tabs)[number]) => {
      const fp = tab.id === activeTabId ? activeFilePath : tab.filePath;
      return fp || 'Untitled.csv';
    },
    [activeTabId, activeFilePath]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      const target = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => target.classList.add('tab--dragging'));
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
        setDropTargetIndex(index);
      }
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex) {
        reorderTabs(fromIndex, toIndex);
      }
      dragIndexRef.current = null;
      setDropTargetIndex(null);
    },
    [reorderTabs]
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDropTargetIndex(null);
  }, []);

  return (
    <div className="tab-bar">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const isDragTarget = dropTargetIndex === index;
        const isDraggedBefore =
          isDragTarget &&
          dragIndexRef.current !== null &&
          dragIndexRef.current > index;
        const isDraggedAfter =
          isDragTarget &&
          dragIndexRef.current !== null &&
          dragIndexRef.current < index;

        return (
          <div
            key={tab.id}
            className={
              `tab` +
              (isActive ? ' tab--active' : '') +
              (isDraggedBefore ? ' tab--drop-before' : '') +
              (isDraggedAfter ? ' tab--drop-after' : '')
            }
            onClick={() => switchTab(tab.id)}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            title={getTooltip(tab)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {isDirty(tab) && <span className="tab__dirty-dot" />}
            <span className="tab__name">{getDisplayName(tab)}</span>
            <button
              className="tab__close"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTab(tab.id);
              }}
              title="Close tab"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path
                  d="M1 1l6 6M7 1L1 7"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        );
      })}
      <button className="tab-bar__new" onClick={onOpen} title="Open File (⌘O)">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 1v10M1 6h10"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default TabBar;
