import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressPayload, RecentFile, ResolvedTheme, ThemeMode } from '@shared/types';
import type { CellValue } from '@shared/types';
import DataGrid from './components/DataGrid';
import type { DataGridHandle } from './components/DataGrid';
import Toolbar from './components/Toolbar';
import TabBar from './components/TabBar';
import FindBar from './components/FindBar';
import RecentFilesPanel from './components/RecentFilesPanel';
import CommandPalette from './components/CommandPalette';
import type { CommandAction } from './components/CommandPalette';
import SettingsDialog from './components/SettingsDialog';
import StatusBar from './components/StatusBar';
import { useGridStore } from './state/gridStore';
import { useFileHandlers } from './hooks/useFileHandlers';

const DEFAULT_PANEL_WIDTH = 280;
const MIN_PANEL_WIDTH = 140;
const MAX_PANEL_WIDTH = 600;

const App = () => {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const gridRef = useRef<DataGridHandle>(null);
  const { openViaDialog, openFile, save, saveAs, saveFilteredAs } = useFileHandlers();

  const togglePanel = useCallback(() => setPanelCollapsed((prev) => !prev), []);

  const applyTheme = useCallback((resolved: ResolvedTheme) => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  const handleThemeChange = useCallback(async (mode: ThemeMode) => {
    const result = await window.api.setTheme(mode);
    setThemeMode(result.mode);
    applyTheme(result.resolved);
  }, [applyTheme]);

  const hasActiveFilters = useGridStore((s) =>
    Object.values(s.filters).some((v) => v?.length > 0)
  );
  const headers = useGridStore((s) => s.headers);
  const rows = useGridStore((s) => s.rows);
  const filters = useGridStore((s) => s.filters);
  const setFilter = useGridStore((s) => s.setFilter);
  const updateCell = useGridStore((s) => s.updateCell);
  const updateHeader = useGridStore((s) => s.updateHeader);
  const addRow = useGridStore((s) => s.addRow);
  const addColumn = useGridStore((s) => s.addColumn);
  const insertRowAt = useGridStore((s) => s.insertRowAt);
  const insertColumnAt = useGridStore((s) => s.insertColumnAt);
  const removeRow = useGridStore((s) => s.removeRow);
  const removeColumn = useGridStore((s) => s.removeColumn);
  const moveRows = useGridStore((s) => s.moveRows);
  const moveColumns = useGridStore((s) => s.moveColumns);
  const undo = useGridStore((s) => s.undo);
  const redo = useGridStore((s) => s.redo);
  const beginBatch = useGridStore((s) => s.beginBatch);
  const commitBatch = useGridStore((s) => s.commitBatch);
  const storeReplaceAll = useGridStore((s) => s.replaceAll);
  const dirty = useGridStore((s) => s.dirty);
  const filePath = useGridStore((s) => s.filePath);
  const meta = useGridStore((s) => s.meta);
  const canUndo = useGridStore((s) => s.undoStack.length > 0);
  const canRedo = useGridStore((s) => s.redoStack.length > 0);
  const undoLabel = useGridStore((s) =>
    s.undoStack.length ? s.undoStack[s.undoStack.length - 1].label : undefined
  );
  const redoLabel = useGridStore((s) =>
    s.redoStack.length ? s.redoStack[s.redoStack.length - 1].label : undefined
  );

  // --- Find / search matches ---
  const searchMatches = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    const matches: { row: number; col: number }[] = [];
    // Search headers (row = -1 signals a header match)
    for (let col = 0; col < headers.length; col++) {
      if (String(headers[col] ?? '').toLowerCase().includes(term)) {
        matches.push({ row: -1, col });
      }
    }
    // Search data rows
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < headers.length; col++) {
        if (String((rows[row]?.[col] as CellValue) ?? '').toLowerCase().includes(term)) {
          matches.push({ row, col });
        }
      }
    }
    return matches;
  }, [searchTerm, headers, rows]);

  // Clamp current match index when matches change
  useEffect(() => {
    if (searchMatches.length === 0) {
      setCurrentMatchIndex(0);
    } else if (currentMatchIndex >= searchMatches.length) {
      setCurrentMatchIndex(0);
    }
  }, [searchMatches.length, currentMatchIndex]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentMatchIndex(0);
  }, []);

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
  }, [searchMatches.length]);

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  }, [searchMatches.length]);

  const handleReplace = useCallback((replaceValue: string) => {
    if (searchMatches.length === 0) return;
    const match = searchMatches[currentMatchIndex];
    if (!match) return;

    if (match.row === -1) {
      // Header match — replace the search term within the header text
      const original = String(headers[match.col] ?? '');
      const replaced = original.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), replaceValue);
      updateHeader(match.col, replaced);
    } else {
      // Cell match
      const original = String(rows[match.row]?.[match.col] ?? '');
      const replaced = original.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), replaceValue);
      updateCell(match.row, match.col, replaced);
    }
  }, [searchMatches, currentMatchIndex, searchTerm, headers, rows, updateHeader, updateCell]);

  const handleReplaceAll = useCallback((replaceValue: string) => {
    if (searchMatches.length === 0) return;
    storeReplaceAll(searchTerm, replaceValue, searchMatches);
    setCurrentMatchIndex(0);
  }, [searchMatches, searchTerm, storeReplaceAll]);

  const handleFindBarClose = useCallback(() => {
    setFindBarOpen(false);
    setSearchTerm('');
    setCurrentMatchIndex(0);
  }, []);

  // Tab actions
  const newTab = useGridStore((s) => s.newTab);
  const closeTab = useGridStore((s) => s.closeTab);

  const refreshRecents = useCallback(async () => {
    const files = await window.api.getRecentFiles();
    setRecentFiles(files);
  }, []);

  // --- Handlers (defined before any useEffect that references them) ---

  const handleOpen = useCallback(async () => {
    const document = await openViaDialog();
    if (document) {
      refreshRecents();
    }
  }, [openViaDialog, refreshRecents]);

  const handleOpenRecent = useCallback(
    async (targetPath: string) => {
      await openFile(targetPath);
      refreshRecents();
    },
    [openFile, refreshRecents]
  );

  const handleRemoveRecent = useCallback(
    async (targetPath: string) => {
      await window.api.removeRecentFile(targetPath);
      refreshRecents();
    },
    [refreshRecents]
  );

  const handleSave = useCallback(async () => {
    await save();
    refreshRecents();
  }, [save, refreshRecents]);

  const handleSaveAs = useCallback(async () => {
    await saveAs();
    refreshRecents();
  }, [saveAs, refreshRecents]);

  const handleSaveFilteredAs = useCallback(async () => {
    await saveFilteredAs();
  }, [saveFilteredAs]);

  const openTab = useGridStore((s) => s.openTab);

  const handleCreateNewCsv = useCallback(() => {
    const defaultHeaders = ['Column 1', 'Column 2', 'Column 3'];
    openTab({
      headers: defaultHeaders,
      rows: [new Array(defaultHeaders.length).fill('')],
      delimiter: ',',
      newline: '\n',
      filePath: null,
      updatedAt: new Date().toISOString(),
      meta: { rowCount: 1, columnCount: defaultHeaders.length }
    });
  }, [openTab]);

  /** Close a tab with dirty-check confirmation. */
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
        const confirmed = window.confirm('This tab has unsaved changes. Close it anyway?');
        if (!confirmed) return;
      }

      closeTab(tabId);
    },
    [closeTab]
  );

  // --- Command palette ---

  const commandActions: CommandAction[] = useMemo(
    () => [
      { id: 'open-file', label: 'Open File', shortcut: '⌘O', section: 'File' },
      { id: 'save', label: 'Save', shortcut: '⌘S', section: 'File' },
      { id: 'save-as', label: 'Save As', shortcut: '⇧⌘S', section: 'File' },
      { id: 'save-filtered-as', label: 'Save Filtered As', shortcut: '⇧⌘E', section: 'File' },
      { id: 'new-tab', label: 'New Tab', shortcut: '⌘T', section: 'File' },
      { id: 'close-tab', label: 'Close Tab', shortcut: '⌘W', section: 'File' },
      { id: 'find', label: 'Find', shortcut: '⌘F', section: 'Edit' },
      { id: 'toggle-sidebar', label: panelCollapsed ? 'Show Recents' : 'Hide Recents', shortcut: '⌘B', section: 'View' },
      { id: 'add-row', label: 'Add Row', section: 'Edit' },
      { id: 'add-column', label: 'Add Column', section: 'Edit' },
      { id: 'undo', label: undoLabel ? `Undo: ${undoLabel}` : 'Undo', shortcut: '⌘Z', section: 'Edit' },
      { id: 'redo', label: redoLabel ? `Redo: ${redoLabel}` : 'Redo', shortcut: '⇧⌘Z', section: 'Edit' },
      { id: 'copy-all', label: 'Copy All to Clipboard', section: 'Edit' },
      { id: 'settings', label: 'Settings', shortcut: '⌘,', section: 'Preferences' }
    ],
    [panelCollapsed, undoLabel, redoLabel]
  );

  const handleCommandSelect = useCallback(
    (id: string) => {
      switch (id) {
        case 'open-file':
          handleOpen();
          break;
        case 'save':
          handleSave();
          break;
        case 'save-as':
          handleSaveAs();
          break;
        case 'save-filtered-as':
          handleSaveFilteredAs();
          break;
        case 'new-tab':
          newTab();
          break;
        case 'close-tab': {
          const activeId = useGridStore.getState().activeTabId;
          if (activeId) handleCloseTab(activeId);
          break;
        }
        case 'find':
          setFindBarOpen(true);
          break;
        case 'toggle-sidebar':
          togglePanel();
          break;
        case 'add-row':
          addRow();
          break;
        case 'add-column':
          addColumn();
          break;
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'copy-all': {
          if (!headers.length) break;
          const headerLine = headers.join('\t');
          const rowLines = rows.map((row) => row.map((cell) => String(cell ?? '')).join('\t'));
          const text = [headerLine, ...rowLines].join('\n');
          navigator.clipboard.writeText(text);
          break;
        }
        case 'settings':
          setSettingsOpen(true);
          break;
      }
    },
    [handleOpen, handleSave, handleSaveAs, handleSaveFilteredAs, handleCloseTab, newTab, togglePanel, addRow, addColumn, undo, redo, headers, rows]
  );

  // --- Panel resize drag logic ---

  const handlePanelResizeMove = useCallback((e: MouseEvent) => {
    if (!panelResizeRef.current) return;
    const { startX, startWidth } = panelResizeRef.current;
    const delta = e.clientX - startX;
    const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, startWidth + delta));
    setPanelWidth(newWidth);
  }, []);

  const handlePanelResizeUp = useCallback(() => {
    panelResizeRef.current = null;
    setIsPanelResizing(false);
    document.removeEventListener('mousemove', handlePanelResizeMove);
    document.removeEventListener('mouseup', handlePanelResizeUp);
  }, [handlePanelResizeMove]);

  const startPanelResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      panelResizeRef.current = { startX: e.clientX, startWidth: panelWidth };
      setIsPanelResizing(true);
      document.addEventListener('mousemove', handlePanelResizeMove);
      document.addEventListener('mouseup', handlePanelResizeUp);
    },
    [panelWidth, handlePanelResizeMove, handlePanelResizeUp]
  );

  // Cleanup panel resize listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handlePanelResizeMove);
      document.removeEventListener('mouseup', handlePanelResizeUp);
    };
  }, [handlePanelResizeMove, handlePanelResizeUp]);

  // --- Global keyboard shortcuts ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'f') {
        e.preventDefault();
        setFindBarOpen(true);
      }
      if (mod && e.key === 'b') {
        e.preventDefault();
        setPanelCollapsed((prev) => !prev);
      }
      if (mod && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      if (mod && e.shiftKey && e.key === 'e') {
        e.preventDefault();
        handleSaveFilteredAs();
      }
      if (mod && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if (mod && e.key === 'a') {
        e.preventDefault();
        gridRef.current?.selectAll();
      }

      // Tab cycling: Cmd+Option+Left/Right
      if (mod && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const { tabs, activeTabId, switchTab: sw } = useGridStore.getState();
        if (tabs.length <= 1) return;
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex === -1) return;
        const nextIndex = e.key === 'ArrowLeft'
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        sw(tabs[nextIndex].id);
      }

      // New tab: Cmd+T
      if (mod && e.key === 't') {
        e.preventDefault();
        useGridStore.getState().newTab();
      }

      // Close tab: Cmd+W
      if (mod && e.key === 'w') {
        e.preventDefault();
        const { activeTabId: id } = useGridStore.getState();
        if (id) handleCloseTab(id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleCloseTab, handleSaveFilteredAs]);

  // --- Effects ---

  useEffect(() => {
    refreshRecents();
  }, [refreshRecents]);

  // --- Theme initialization and listener ---

  useEffect(() => {
    window.api.getTheme().then((payload) => {
      setThemeMode(payload.mode);
      applyTheme(payload.resolved);
    });
  }, [applyTheme]);

  useEffect(() => {
    const dispose = window.api.onThemeChange((resolved) => {
      applyTheme(resolved);
    });
    return () => dispose();
  }, [applyTheme]);

  useEffect(() => {
    const dispose = window.api.onProgress((payload) => {
      setProgress(payload.percent >= 1 ? null : payload);
    });
    return () => dispose();
  }, []);

  useEffect(() => {
    const dispose = window.api.onMenuAction((action) => {
      if (action === 'open') {
        handleOpen();
      }
      if (action === 'save') {
        handleSave();
      }
      if (action === 'save-as') {
        handleSaveAs();
      }
      if (action === 'save-filtered-as') {
        handleSaveFilteredAs();
      }
      if (action === 'settings') {
        setSettingsOpen(true);
      }
      if (action === 'new-tab') {
        newTab();
      }
      if (action === 'close-tab') {
        const id = useGridStore.getState().activeTabId;
        if (id) handleCloseTab(id);
      }
    });

    return () => dispose();
  }, [handleOpen, handleSave, handleSaveAs, handleSaveFilteredAs, handleCloseTab, newTab]);

  // Check ALL tabs for unsaved changes before unloading
  useEffect(() => {
    const handleUnload = (event: BeforeUnloadEvent) => {
      const state = useGridStore.getState();
      const anyDirty =
        state.dirty || Object.values(state._tabSnapshots).some((s) => s.dirty);
      if (!anyDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file?.path) {
        await openFile(file.path);
        refreshRecents();
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [openFile, refreshRecents]);

  const gridContent = useMemo(() => {
    if (!headers.length) {
      return <div className="empty-state">Drop a CSV or use Open to get started.</div>;
    }

    const currentSearch = searchMatches.length > 0 ? searchMatches[currentMatchIndex] : null;

    return (
      <DataGrid
        ref={gridRef}
        headers={headers}
        rows={rows}
        filters={filters}
        onFilterChange={setFilter}
        onEditCell={updateCell}
        onEditHeader={updateHeader}
        onInsertRowAt={insertRowAt}
        onInsertColumnAt={insertColumnAt}
        onDeleteRow={removeRow}
        onDeleteColumn={removeColumn}
        onMoveRows={moveRows}
        onMoveColumns={moveColumns}
        onBeginBatch={beginBatch}
        onCommitBatch={commitBatch}
        searchTerm={searchTerm}
        searchMatches={searchMatches}
        currentSearchMatch={currentSearch}
      />
    );
  }, [headers, rows, filters, setFilter, updateCell, updateHeader, searchTerm, searchMatches, currentMatchIndex]);

  return (
    <div className="app-shell">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onSaveFilteredAs={handleSaveFilteredAs}
        onNewCsv={handleCreateNewCsv}
        onAddRow={addRow}
        onAddColumn={addColumn}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        hasData={headers.length > 0}
        hasActiveFilters={hasActiveFilters}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        dirty={dirty}
        filePath={filePath}
      />
      <TabBar onOpen={handleOpen} />
      <div
        className={`viewport${isPanelResizing ? ' viewport--resizing' : ''}${panelCollapsed ? ' viewport--panel-collapsed' : ''}`}
        style={{ gridTemplateColumns: panelCollapsed ? '0px 1fr' : `${panelWidth}px 1fr` }}
      >
        <div className={`panel${panelCollapsed ? ' panel--collapsed' : ''}`}>
          <RecentFilesPanel
            files={recentFiles}
            onOpen={handleOpenRecent}
            onRemove={handleRemoveRecent}
            emptyState="No recent files yet."
          />
          {!panelCollapsed && (
            <div
              className="panel-resize-handle"
              onMouseDown={startPanelResize}
            />
          )}
        </div>
        <div className="grid-panel">
          <button
            className={`panel-toggle${panelCollapsed ? ' panel-toggle--collapsed' : ''}`}
            onClick={togglePanel}
            title={panelCollapsed ? 'Show sidebar (⌘B)' : 'Hide sidebar (⌘B)'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              {panelCollapsed ? (
                <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M7 2L3 5l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          {gridContent}
        </div>
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        actions={commandActions}
        onSelect={handleCommandSelect}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeChange={handleThemeChange}
      />
      <StatusBar meta={meta} dirty={dirty} progress={progress} />
      <FindBar
        open={findBarOpen}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        matchCount={searchMatches.length}
        currentMatch={currentMatchIndex}
        onNext={handleSearchNext}
        onPrev={handleSearchPrev}
        onClose={handleFindBarClose}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
      />
    </div>
  );
};

export default App;
