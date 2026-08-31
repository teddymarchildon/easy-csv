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
import HelpDialog from './components/HelpDialog';
import type { HelpDialogSection } from './components/HelpDialog';
import StatusBar from './components/StatusBar';
import { useGridStore } from './state/gridStore';
import { useFileHandlers } from './hooks/useFileHandlers';
import { buildFilteredRowEntries } from './state/filtering';
import type { SortDirection } from './state/sorting';

const DEFAULT_PANEL_WIDTH = 280;
const MIN_PANEL_WIDTH = 140;
const MAX_PANEL_WIDTH = 600;

const App = () => {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [selectedRecentPaths, setSelectedRecentPaths] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('rowly.recentsCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<HelpDialogSection>('filter');
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [findBarReplaceOpen, setFindBarReplaceOpen] = useState(false);
  const [findBarFocusToken, setFindBarFocusToken] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastSearchTerm, setLastSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [wrapText, setWrapText] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeColumnIndex, setActiveColumnIndex] = useState<number | null>(null);
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const gridRef = useRef<DataGridHandle>(null);
  const { openViaDialog, openFile, save, saveAs, saveFilteredAs } = useFileHandlers();

  const togglePanel = useCallback(() => setPanelCollapsed((prev) => !prev), []);
  const toggleWrapText = useCallback(() => setWrapText((prev) => !prev), []);
  const openFilterHelp = useCallback(() => {
    setHelpSection('filter');
    setHelpOpen(true);
  }, []);
  const openKeyboardHelp = useCallback(() => {
    setHelpSection('shortcuts');
    setHelpOpen(true);
  }, []);

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
  const sorts = useGridStore((s) => s.sorts);
  const setFilter = useGridStore((s) => s.setFilter);
  const setSort = useGridStore((s) => s.setSort);
  const clearSort = useGridStore((s) => s.clearSort);
  const clearAllSorts = useGridStore((s) => s.clearAllSorts);
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
  const anyDirty = useGridStore((s) =>
    s.dirty || Object.values(s._tabSnapshots).some((snapshot) => snapshot.dirty)
  );
  const filePath = useGridStore((s) => s.filePath);
  const delimiter = useGridStore((s) => s.delimiter);
  const newline = useGridStore((s) => s.newline);
  const hasUtf8Bom = useGridStore((s) => s.hasUtf8Bom);
  const meta = useGridStore((s) => s.meta);
  const columnProfiles = useGridStore((s) => s.columnProfiles);
  const openTab = useGridStore((s) => s.openTab);
  const canUndo = useGridStore((s) => s.undoStack.length > 0);
  const canRedo = useGridStore((s) => s.redoStack.length > 0);
  const undoLabel = useGridStore((s) =>
    s.undoStack.length ? s.undoStack[s.undoStack.length - 1].label : undefined
  );
  const redoLabel = useGridStore((s) =>
    s.redoStack.length ? s.redoStack[s.redoStack.length - 1].label : undefined
  );

  const applySortToActiveColumn = useCallback((direction: SortDirection) => {
    if (activeColumnIndex === null || activeColumnIndex >= headers.length) return;
    setSort(activeColumnIndex, direction);
  }, [activeColumnIndex, headers.length, setSort]);

  const clearActiveSort = useCallback(() => {
    if (activeColumnIndex === null || activeColumnIndex >= headers.length) return;
    clearSort(activeColumnIndex);
  }, [activeColumnIndex, headers.length, clearSort]);

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

  const filteredRowCount = useMemo(
    () => buildFilteredRowEntries(rows, filters, columnProfiles).length,
    [rows, filters, columnProfiles]
  );

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
    setLastSearchTerm(value);
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

  const focusGridAfterSearchNavigation = useCallback(() => {
    requestAnimationFrame(() => {
      gridRef.current?.focusGrid();
    });
  }, []);

  const handleSearchNextAndFocusGrid = useCallback(() => {
    handleSearchNext();
    focusGridAfterSearchNavigation();
  }, [focusGridAfterSearchNavigation, handleSearchNext]);

  const handleSearchPrevAndFocusGrid = useCallback(() => {
    handleSearchPrev();
    focusGridAfterSearchNavigation();
  }, [focusGridAfterSearchNavigation, handleSearchPrev]);

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
    setFindBarReplaceOpen(false);
    setSearchTerm('');
    setCurrentMatchIndex(0);
  }, []);

  const openFindBarAndFocus = useCallback((withReplace = false) => {
    setFindBarOpen(true);
    setFindBarReplaceOpen(withReplace);
    setSearchTerm(lastSearchTerm);
    setCurrentMatchIndex(0);
    setFindBarFocusToken((prev) => prev + 1);
  }, [lastSearchTerm]);

  const handleToggleFindReplace = useCallback(() => {
    setFindBarReplaceOpen((prev) => !prev);
  }, []);

  const refreshRecents = useCallback(async () => {
    const files = await window.api.getRecentFiles();
    setRecentFiles(files);
    setSelectedRecentPaths((current) =>
      current.filter((path) => files.some((file) => file.path === path && file.status !== 'missing'))
    );
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
      try {
        const result = await window.api.openRecentFile(targetPath);
        const state = useGridStore.getState();
        const existing = state.tabs.find((tab) => tab.filePath === result.document.filePath);
        if (existing) {
          state.switchTab(existing.id);
        } else {
          openTab(result.document);
        }
        setNotice(null);
        refreshRecents();
      } catch (error) {
        setProgress(null);
        const message = error instanceof Error ? error.message : String(error);
        setNotice(`Couldn’t open ${targetPath.split('/').pop() || targetPath}: ${message}`);
        refreshRecents();
      }
    },
    [openTab, refreshRecents]
  );

  const handleLocateRecent = useCallback(
    async (targetPath: string) => {
      const result = await window.api.locateRecentFile(targetPath);
      if (!result) {
        return;
      }

      setRecentFiles(result);
      setSelectedRecentPaths((current) =>
        current.filter((path) => result.some((file) => file.path === path && file.status !== 'missing'))
      );
    },
    []
  );

  const handleRemoveRecent = useCallback(
    async (targetPath: string) => {
      await window.api.removeRecentFile(targetPath);
      refreshRecents();
    },
    [refreshRecents]
  );

  const handleClearRecents = useCallback(async () => {
    const files = await window.api.clearRecentFiles();
    setRecentFiles(files);
    setSelectedRecentPaths([]);
  }, []);

  const handleRevealRecent = useCallback(async (targetPath: string) => {
    await window.api.revealInFinder(targetPath);
  }, []);

  const handleToggleRecentSelection = useCallback((targetPath: string) => {
    setSelectedRecentPaths((current) => {
      if (current.includes(targetPath)) {
        return current.filter((path) => path !== targetPath);
      }

      if (current.length >= 2) {
        return current;
      }

      return [...current, targetPath];
    });
  }, []);

  const handleMergeSelectedRecents = useCallback(async () => {
    if (selectedRecentPaths.length !== 2) {
      return;
    }

    const [pathA, pathB] = selectedRecentPaths;
    try {
      const result = await window.api.mergeRecentFiles(pathA, pathB);
      openTab(result.document);
      setSelectedRecentPaths([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Could not merge files:\n\n${pathA}\n${pathB}\n\n${message}`);
    }
  }, [selectedRecentPaths, openTab]);

  const handleSave = useCallback(async () => {
    try {
      await save();
      refreshRecents();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Could not save file:\n\n${message}`);
    }
  }, [save, refreshRecents]);

  const handleSaveAs = useCallback(async () => {
    try {
      await saveAs();
      refreshRecents();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Could not save file:\n\n${message}`);
    }
  }, [saveAs, refreshRecents]);

  const handleSaveFilteredAs = useCallback(async () => {
    try {
      const targetPath = await saveFilteredAs();
      if (targetPath) {
        await openFile(targetPath);
        refreshRecents();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Could not save filtered rows:\n\n${message}`);
    }
  }, [saveFilteredAs, openFile, refreshRecents]);

  const handleCreateNewCsv = useCallback(() => {
    const defaultHeaders = ['Column 1', 'Column 2', 'Column 3'];
    openTab({
      headers: defaultHeaders,
      rows: [new Array(defaultHeaders.length).fill('')],
      delimiter: ',',
      newline: '\n',
      hasFinalNewline: true,
      hasUtf8Bom: false,
      filePath: null,
      updatedAt: new Date().toISOString(),
      meta: { rowCount: 1, columnCount: defaultHeaders.length }
    });
  }, [openTab]);

  /** Close a tab with a native Save / Cancel / Don't Save sheet. */
  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const state = useGridStore.getState();
      const activeBefore = state.activeTabId;
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      let tabDirty = false;

      if (tabId === state.activeTabId) {
        tabDirty = state.dirty;
      } else {
        const snap = state._tabSnapshots[tabId];
        tabDirty = snap?.dirty ?? false;
      }

      if (tabDirty) {
        const fileName = (tab?.filePath?.split('/').pop()) || 'Untitled.csv';
        const choice = await window.api.confirmCloseTab(fileName);
        if (choice === 'cancel') return;
        if (choice === 'save') {
          if (state.activeTabId !== tabId) state.switchTab(tabId);
          try {
            const savedPath = await save();
            if (!savedPath) {
              if (activeBefore && activeBefore !== tabId) useGridStore.getState().switchTab(activeBefore);
              return;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setNotice(`Couldn’t save ${fileName}: ${message}`);
            if (activeBefore && activeBefore !== tabId) useGridStore.getState().switchTab(activeBefore);
            return;
          }
        }
      }

      useGridStore.getState().closeTab(tabId);
      if (activeBefore && activeBefore !== tabId && useGridStore.getState().tabs.some((candidate) => candidate.id === activeBefore)) {
        useGridStore.getState().switchTab(activeBefore);
      }
    },
    [save]
  );

  // --- Command palette ---

  const commandActions: CommandAction[] = useMemo(
    () => [
      { id: 'open-file', label: 'Open File', shortcut: '⌘O', section: 'File' },
      { id: 'save', label: 'Save', shortcut: '⌘S', section: 'File' },
      { id: 'save-as', label: 'Save As', shortcut: '⇧⌘S', section: 'File' },
      { id: 'save-filtered-as', label: 'Save Filtered As', shortcut: '⇧⌘E', section: 'File' },
      { id: 'new-csv', label: 'New CSV', shortcut: '⌘T', section: 'File' },
      { id: 'close-tab', label: 'Close Tab', shortcut: '⌘W', section: 'File' },
      { id: 'find', label: 'Find', shortcut: '⌘F', section: 'Edit' },
      { id: 'find-replace', label: 'Find and Replace', section: 'Edit' },
      { id: 'toggle-sidebar', label: panelCollapsed ? 'Show Recents' : 'Hide Recents', shortcut: '⌘B', section: 'View' },
      { id: 'add-row', label: 'Add Row', section: 'Edit' },
      { id: 'add-column', label: 'Add Column', section: 'Edit' },
      { id: 'sort-ascending', label: 'Sort Ascending', section: 'Edit' },
      { id: 'sort-descending', label: 'Sort Descending', section: 'Edit' },
      { id: 'clear-sort', label: 'Clear Sort', section: 'Edit' },
      { id: 'clear-all-sorts', label: 'Clear All Sorts', section: 'Edit' },
      { id: 'undo', label: undoLabel ? `Undo: ${undoLabel}` : 'Undo', shortcut: '⌘Z', section: 'Edit' },
      { id: 'redo', label: redoLabel ? `Redo: ${redoLabel}` : 'Redo', shortcut: '⇧⌘Z', section: 'Edit' },
      { id: 'copy-all', label: 'Copy All to Clipboard', section: 'Edit' },
      { id: 'toggle-wrap', label: wrapText ? 'Disable Text Wrapping' : 'Enable Text Wrapping', section: 'View' },
      { id: 'settings', label: 'Settings', shortcut: '⌘,', section: 'Preferences' },
      { id: 'help-filter-language', label: 'Help: Filter Language + Command Palette', section: 'Help' },
      { id: 'help-keyboard-shortcuts', label: 'Help: Keyboard Shortcuts', section: 'Help' }
    ],
    [panelCollapsed, undoLabel, redoLabel, wrapText]
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
        case 'new-csv':
          handleCreateNewCsv();
          break;
        case 'close-tab': {
          const activeId = useGridStore.getState().activeTabId;
          if (activeId) handleCloseTab(activeId);
          break;
        }
        case 'find':
          openFindBarAndFocus(false);
          break;
        case 'find-replace':
          openFindBarAndFocus(true);
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
        case 'sort-ascending':
          applySortToActiveColumn('asc');
          break;
        case 'sort-descending':
          applySortToActiveColumn('desc');
          break;
        case 'clear-sort':
          clearActiveSort();
          break;
        case 'clear-all-sorts':
          clearAllSorts();
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
        case 'toggle-wrap':
          toggleWrapText();
          break;
        case 'settings':
          setSettingsOpen(true);
          break;
        case 'help-filter-language':
          openFilterHelp();
          break;
        case 'help-keyboard-shortcuts':
          openKeyboardHelp();
          break;
      }
    },
    [handleOpen, handleSave, handleSaveAs, handleSaveFilteredAs, handleCreateNewCsv, handleCloseTab, togglePanel, addRow, addColumn, applySortToActiveColumn, clearActiveSort, clearAllSorts, undo, redo, headers, rows, toggleWrapText, openFilterHelp, openKeyboardHelp, openFindBarAndFocus]
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
        openFindBarAndFocus(false);
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
        handleCreateNewCsv();
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
  }, [undo, redo, handleCloseTab, handleCreateNewCsv, handleSaveFilteredAs, openFindBarAndFocus]);

  // --- Effects ---

  useEffect(() => {
    refreshRecents();
  }, [refreshRecents]);

  useEffect(() => {
    const dispose = window.api.onRecentFilesChange(refreshRecents);
    return () => dispose();
  }, [refreshRecents]);

  useEffect(() => {
    try {
      window.localStorage.setItem('rowly.recentsCollapsed', panelCollapsed ? '1' : '0');
    } catch {
      // The sidebar still works when local preferences are unavailable.
    }
  }, [panelCollapsed]);

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
      if (action === 'help-filter-language') {
        openFilterHelp();
      }
      if (action === 'help-keyboard-shortcuts') {
        openKeyboardHelp();
      }
      if (action === 'new-csv') {
        handleCreateNewCsv();
      }
      if (action === 'close-tab') {
        const id = useGridStore.getState().activeTabId;
        if (id) handleCloseTab(id);
      }
    });

    return () => dispose();
  }, [handleOpen, handleSave, handleSaveAs, handleSaveFilteredAs, handleCloseTab, handleCreateNewCsv, openFilterHelp, openKeyboardHelp]);

  useEffect(() => {
    const handleOpenRequest = async (targetPath: string) => {
      try {
        await openFile(targetPath);
        refreshRecents();
      } catch (error) {
        setProgress(null);
        const message = error instanceof Error ? error.message : String(error);
        window.alert(`Could not open file:\n\n${targetPath}\n\n${message}`);
      }
    };

    const dispose = window.api.onOpenFileRequest((filePath) => {
      void handleOpenRequest(filePath);
    });

    window.api.startOpenFileEvents().then((filePaths) => {
      filePaths.forEach((filePath) => {
        void handleOpenRequest(filePath);
      });
    });

    return () => dispose();
  }, [openFile, refreshRecents]);

  // Main process owns the close prompt; save every dirty tab when requested.
  useEffect(() => {
    const dispose = window.api.onSaveBeforeClose(() => {
      void (async () => {
        try {
          const tabIds = useGridStore.getState().tabs
            .filter((tab) => {
              const state = useGridStore.getState();
              return tab.id === state.activeTabId
                ? state.dirty
                : state._tabSnapshots[tab.id]?.dirty ?? false;
            })
            .map((tab) => tab.id);

          for (const tabId of tabIds) {
            const state = useGridStore.getState();
            if (state.activeTabId !== tabId) state.switchTab(tabId);
            const targetPath = await save();
            if (!targetPath) {
              window.api.completeSaveBeforeClose(false);
              return;
            }
          }
          window.api.completeSaveBeforeClose(true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          window.alert(`Could not save before closing:\n\n${message}`);
          window.api.completeSaveBeforeClose(false);
        }
      })();
    });
    return () => dispose();
  }, [save]);

  useEffect(() => {
    window.api.setWindowDirty(anyDirty);
  }, [anyDirty]);

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
    if (!headers.length) return null;

    const currentSearch = searchMatches.length > 0 ? searchMatches[currentMatchIndex] : null;

    return (
      <DataGrid
        ref={gridRef}
        headers={headers}
        rows={rows}
        columnProfiles={columnProfiles}
        filters={filters}
        sorts={sorts}
        onFilterChange={setFilter}
        onSetSort={setSort}
        onClearSort={clearSort}
        onClearAllSorts={clearAllSorts}
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
        onOpenFilterHelp={openFilterHelp}
        onSearchNext={handleSearchNextAndFocusGrid}
        onSearchPrev={handleSearchPrevAndFocusGrid}
        onSearchClose={handleFindBarClose}
        searchTerm={searchTerm}
        searchMatches={searchMatches}
        currentSearchMatch={currentSearch}
        wrapText={wrapText}
        onActiveColumnChange={setActiveColumnIndex}
      />
    );
  }, [headers, rows, columnProfiles, filters, sorts, setFilter, setSort, clearSort, clearAllSorts, updateCell, updateHeader, insertRowAt, insertColumnAt, removeRow, removeColumn, moveRows, moveColumns, beginBatch, commitBatch, searchTerm, searchMatches, currentMatchIndex, wrapText, openFilterHelp, handleSearchNextAndFocusGrid, handleSearchPrevAndFocusGrid, handleFindBarClose]);

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
        wrapText={wrapText}
        onToggleWrap={toggleWrapText}
        onOpenHelp={openFilterHelp}
      />
      <TabBar onNew={handleCreateNewCsv} onClose={(tabId) => { void handleCloseTab(tabId); }} />
      {notice && (
        <div className="app-notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss notification">×</button>
        </div>
      )}
      <div
        className={`viewport${isPanelResizing ? ' viewport--resizing' : ''}${panelCollapsed ? ' viewport--panel-collapsed' : ''}`}
        style={{ gridTemplateColumns: panelCollapsed ? '0px 1fr' : `${panelWidth}px 1fr` }}
      >
        <div className={`panel${panelCollapsed ? ' panel--collapsed' : ''}`}>
      <RecentFilesPanel
        files={recentFiles}
        selectedPaths={selectedRecentPaths}
        onOpen={handleOpenRecent}
        onLocate={handleLocateRecent}
        onToggleSelect={handleToggleRecentSelection}
        onMergeSelected={handleMergeSelectedRecents}
        onRemove={handleRemoveRecent}
        onReveal={handleRevealRecent}
        onClear={handleClearRecents}
            emptyState="No recent files yet."
          />
          {!panelCollapsed && (
            <div
              className="panel-resize-handle"
              onMouseDown={startPanelResize}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const delta = event.key === 'ArrowLeft' ? -16 : 16;
                setPanelWidth((width) => Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width + delta)));
              }}
              role="separator"
              aria-label="Resize Recent Files sidebar"
              aria-orientation="vertical"
              aria-valuemin={MIN_PANEL_WIDTH}
              aria-valuemax={MAX_PANEL_WIDTH}
              aria-valuenow={panelWidth}
              tabIndex={0}
            />
          )}
        </div>
        <div className="grid-panel">
          <button
            className={`panel-toggle${panelCollapsed ? ' panel-toggle--collapsed' : ''}`}
            onClick={togglePanel}
            title={panelCollapsed ? 'Show sidebar (⌘B)' : 'Hide sidebar (⌘B)'}
            aria-label={panelCollapsed ? 'Show Recent Files sidebar' : 'Hide Recent Files sidebar'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              {panelCollapsed ? (
                <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M7 2L3 5l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          {gridContent || (
            <div className="welcome-screen">
              <div className="welcome-hero">
                <svg className="welcome-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="8" width="36" height="32" rx="3" />
                  <line x1="6" y1="18" x2="42" y2="18" />
                  <line x1="18" y1="8" x2="18" y2="40" />
                  <line x1="30" y1="8" x2="30" y2="40" />
                  <line x1="6" y1="28" x2="42" y2="28" />
                </svg>
                <h2 className="welcome-title">Open a CSV file</h2>
                <p className="welcome-subtitle">Drop a file anywhere, or choose an option below</p>
                <div className="welcome-actions">
                  <button className="welcome-btn welcome-btn--primary" onClick={handleOpen}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 13V4.5a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />
                      <path d="M2 8h12" />
                    </svg>
                    Open File
                  </button>
                  <button className="welcome-btn" onClick={handleCreateNewCsv}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.5 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5L9.5 2Z" />
                      <path d="M9.5 2v3h3" />
                      <line x1="8" y1="8" x2="8" y2="12" />
                      <line x1="6" y1="10" x2="10" y2="10" />
                    </svg>
                    New CSV
                  </button>
                </div>
              </div>

              {recentFiles.length > 0 && (
                <div className="welcome-recents">
                  <h3 className="welcome-section-title">Recent Files</h3>
                  <RecentFilesPanel
                    files={recentFiles}
                    onOpen={handleOpenRecent}
                    onLocate={handleLocateRecent}
                    onRemove={handleRemoveRecent}
                    onReveal={handleRevealRecent}
                    emptyState="No recent files yet."
                    variant="welcome"
                    limit={5}
                  />
                </div>
              )}

              <div className="welcome-shortcuts">
                <div className="welcome-shortcut"><kbd>⌘O</kbd> Open</div>
                <div className="welcome-shortcut"><kbd>⌘K</kbd> Commands</div>
                <div className="welcome-shortcut"><kbd>⌘F</kbd> Find</div>
              </div>
            </div>
          )}
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
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} section={helpSection} />
      <StatusBar
        meta={meta}
        dirty={dirty}
        progress={progress}
        filteredRowCount={filteredRowCount}
        delimiter={delimiter}
        newline={newline}
        hasUtf8Bom={hasUtf8Bom}
      />
      <FindBar
        open={findBarOpen}
        focusToken={findBarFocusToken}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        matchCount={searchMatches.length}
        currentMatch={currentMatchIndex}
        onNext={handleSearchNextAndFocusGrid}
        onPrev={handleSearchPrevAndFocusGrid}
        onClose={handleFindBarClose}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
        replaceExpanded={findBarReplaceOpen}
        onToggleReplace={handleToggleFindReplace}
      />
    </div>
  );
};

export default App;
