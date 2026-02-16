import { create } from 'zustand';
import type { CellValue, CsvDocument } from '@shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Snapshot = {
  headers: string[];
  rows: CellValue[][];
  delimiter: string;
  newline: '\n' | '\r\n';
  filePath?: string | null;
};

export type UndoEntry = {
  snapshot: Snapshot;
  label: string;
  timestamp: number;
  coalesceKey?: string;
};

/** Lightweight info shown in the tab bar. */
export interface TabInfo {
  id: string;
  filePath: string | null;
  dirty: boolean;
}

/** Full serialised state for an inactive tab. */
interface TabSnapshot {
  headers: string[];
  rows: CellValue[][];
  delimiter: string;
  newline: '\n' | '\r\n';
  filePath: string | null;
  dirty: boolean;
  meta: { rowCount: number; columnCount: number };
  filters: Record<number, string>;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  _batchDepth: number;
  _batchLabel: string | null;
  _batchSnapshot: Snapshot | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_UNDO_HISTORY = 50;
const COALESCE_WINDOW_MS = 2000;

let _nextTabId = 1;
const generateTabId = (): string => `tab-${_nextTabId++}`;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface GridState extends Snapshot {
  dirty: boolean;
  meta: CsvDocument['meta'];
  filters: Record<number, string>;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // Batch / transaction internals
  _batchDepth: number;
  _batchLabel: string | null;
  _batchSnapshot: Snapshot | null;

  // Tab management
  tabs: TabInfo[];
  activeTabId: string | null;
  _tabSnapshots: Record<string, TabSnapshot>;

  // Tab actions
  openTab: (doc: CsvDocument) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  newTab: () => void;

  // Data loading / clearing
  setData: (doc: CsvDocument) => void;

  // Mutations
  updateCell: (rowIndex: number, columnIndex: number, value: CellValue) => void;
  addRow: () => void;
  addColumn: () => void;
  insertRowAt: (rowIndex: number) => void;
  insertColumnAt: (columnIndex: number) => void;
  removeRow: (rowIndex: number) => void;
  removeColumn: (columnIndex: number) => void;
  moveRows: (fromStart: number, fromEnd: number, toIndex: number) => void;
  moveColumns: (fromStart: number, fromEnd: number, toIndex: number) => void;
  updateHeader: (columnIndex: number, value: string) => void;
  replaceAll: (term: string, replacement: string, matches: { row: number; col: number }[]) => void;
  setFilter: (columnIndex: number, value: string) => void;
  hasActiveFilters: () => boolean;
  getFilteredRows: () => CellValue[][];
  clear: () => void;
  markSaved: (filePath?: string | null) => void;
  undo: () => void;
  redo: () => void;
  beginBatch: (label: string) => void;
  commitBatch: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cloneSnapshot = (state: Snapshot | GridState): Snapshot => ({
  headers: [...state.headers],
  rows: state.rows.map((row) => [...row]),
  delimiter: state.delimiter,
  newline: state.newline,
  filePath: state.filePath ?? null
});

const createEmptySnapshot = (): Snapshot => ({
  headers: [],
  rows: [],
  delimiter: ',',
  newline: '\n',
  filePath: null
});

/** Trim a stack to at most MAX_UNDO_HISTORY entries (drops oldest). */
const trimStack = (stack: UndoEntry[]): UndoEntry[] =>
  stack.length > MAX_UNDO_HISTORY ? stack.slice(stack.length - MAX_UNDO_HISTORY) : stack;

/** Capture the full active-tab data from the flat state into a TabSnapshot. */
const captureActiveTab = (state: GridState): TabSnapshot => ({
  headers: state.headers,
  rows: state.rows,
  delimiter: state.delimiter,
  newline: state.newline,
  filePath: state.filePath ?? null,
  dirty: state.dirty,
  meta: { ...state.meta },
  filters: { ...state.filters },
  undoStack: [...state.undoStack],
  redoStack: [...state.redoStack],
  _batchDepth: state._batchDepth,
  _batchLabel: state._batchLabel,
  _batchSnapshot: state._batchSnapshot
});

/** Flatten a TabSnapshot back into the shape used by the top-level store. */
const restoreFromTabSnapshot = (
  snap: TabSnapshot
): Omit<TabSnapshot, 'filePath'> & { filePath: string | null } => ({
  headers: snap.headers,
  rows: snap.rows,
  delimiter: snap.delimiter,
  newline: snap.newline,
  filePath: snap.filePath,
  dirty: snap.dirty,
  meta: snap.meta,
  filters: snap.filters,
  undoStack: snap.undoStack,
  redoStack: snap.redoStack,
  _batchDepth: snap._batchDepth,
  _batchLabel: snap._batchLabel,
  _batchSnapshot: snap._batchSnapshot
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGridStore = create<GridState>()((set, get) => {
  /**
   * Central mutation helper.
   *
   * @param label        Human-readable description shown in undo/redo UI.
   * @param mutator      Callback that mutates a draft Snapshot in-place.
   * @param coalesceKey  Optional key for coalescing rapid edits (e.g. "cell:3:5").
   */
  const applyMutation = (
    label: string,
    mutator: (draft: Snapshot) => void,
    coalesceKey?: string
  ) => {
    set((state) => {
      const now = Date.now();
      const next = cloneSnapshot(state);
      mutator(next);

      const newMeta = {
        rowCount: next.rows.length,
        columnCount: next.headers.length
      };

      // --- Batch mode: accumulate without pushing to undo stack -----------
      if (state._batchDepth > 0) {
        return {
          ...state,
          ...next,
          dirty: true,
          // Keep batch snapshot from before the first mutation in the batch
          _batchSnapshot: state._batchSnapshot ?? cloneSnapshot(state),
          meta: newMeta
        };
      }

      // --- Coalescing: merge rapid same-target edits ----------------------
      if (coalesceKey) {
        const top = state.undoStack[state.undoStack.length - 1];
        if (
          top &&
          top.coalesceKey === coalesceKey &&
          now - top.timestamp < COALESCE_WINDOW_MS
        ) {
          // Keep the existing top entry (original "before" snapshot) and
          // just update its timestamp so the window slides forward.
          const updatedTop: UndoEntry = { ...top, timestamp: now };
          const updatedUndo = [...state.undoStack.slice(0, -1), updatedTop];
          return {
            ...state,
            ...next,
            dirty: true,
            undoStack: updatedUndo,
            redoStack: [],
            meta: newMeta
          };
        }
      }

      // --- Normal push ----------------------------------------------------
      const previous = cloneSnapshot(state);
      const entry: UndoEntry = {
        snapshot: previous,
        label,
        timestamp: now,
        coalesceKey
      };
      return {
        ...state,
        ...next,
        dirty: true,
        undoStack: trimStack([...state.undoStack, entry]),
        redoStack: [],
        meta: newMeta
      };
    });
  };

  return {
    ...createEmptySnapshot(),
    dirty: false,
    meta: { rowCount: 0, columnCount: 0 },
    filters: {},
    undoStack: [],
    redoStack: [],
    _batchDepth: 0,
    _batchLabel: null,
    _batchSnapshot: null,

    // Tab management – initial state
    tabs: [],
    activeTabId: null,
    _tabSnapshots: {},

    // =====================================================================
    // Tab actions
    // =====================================================================

    openTab: (doc) =>
      set((state) => {
        const newId = generateTabId();

        // Save current active tab's full data (if any)
        const updatedSnapshots = { ...state._tabSnapshots };
        let updatedTabs = [...state.tabs];

        if (state.activeTabId) {
          updatedSnapshots[state.activeTabId] = captureActiveTab(state);
          // Sync outgoing tab's lightweight info
          updatedTabs = updatedTabs.map((t) =>
            t.id === state.activeTabId
              ? { ...t, dirty: state.dirty, filePath: state.filePath ?? null }
              : t
          );
        }

        // Add new tab
        updatedTabs.push({
          id: newId,
          filePath: doc.filePath ?? null,
          dirty: false
        });

        return {
          // Load new document into the flat state
          headers: doc.headers,
          rows: doc.rows,
          delimiter: doc.delimiter,
          newline: doc.newline,
          filePath: doc.filePath ?? null,
          dirty: false,
          meta: doc.meta,
          filters: {},
          undoStack: [],
          redoStack: [],
          _batchDepth: 0,
          _batchLabel: null,
          _batchSnapshot: null,
          // Tab bookkeeping
          tabs: updatedTabs,
          activeTabId: newId,
          _tabSnapshots: updatedSnapshots
        };
      }),

    switchTab: (tabId) =>
      set((state) => {
        if (tabId === state.activeTabId) return state;

        const targetSnap = state._tabSnapshots[tabId];
        if (!targetSnap) return state; // target not found

        // Save current active tab
        const updatedSnapshots = { ...state._tabSnapshots };
        if (state.activeTabId) {
          updatedSnapshots[state.activeTabId] = captureActiveTab(state);
        }

        // Remove target from snapshots (it's becoming the active flat state)
        delete updatedSnapshots[tabId];

        // Sync outgoing tab's lightweight info in tabs array
        const updatedTabs = state.tabs.map((t) => {
          if (t.id === state.activeTabId) {
            return { ...t, dirty: state.dirty, filePath: state.filePath ?? null };
          }
          return t;
        });

        return {
          ...restoreFromTabSnapshot(targetSnap),
          tabs: updatedTabs,
          activeTabId: tabId,
          _tabSnapshots: updatedSnapshots
        };
      }),

    closeTab: (tabId) =>
      set((state) => {
        const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
        if (tabIndex === -1) return state;

        const newTabs = state.tabs.filter((t) => t.id !== tabId);
        const updatedSnapshots = { ...state._tabSnapshots };
        delete updatedSnapshots[tabId];

        // --- Closing the active tab ----------------------------------------
        if (tabId === state.activeTabId) {
          if (newTabs.length === 0) {
            // No tabs left → reset to empty state
            return {
              ...createEmptySnapshot(),
              dirty: false,
              meta: { rowCount: 0, columnCount: 0 },
              filters: {},
              undoStack: [],
              redoStack: [],
              _batchDepth: 0,
              _batchLabel: null,
              _batchSnapshot: null,
              tabs: [],
              activeTabId: null,
              _tabSnapshots: {}
            };
          }

          // Switch to the nearest neighbour
          const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
          const newActiveTab = newTabs[newActiveIndex];
          const targetSnap = updatedSnapshots[newActiveTab.id];

          if (targetSnap) {
            delete updatedSnapshots[newActiveTab.id];
            return {
              ...restoreFromTabSnapshot(targetSnap),
              tabs: newTabs,
              activeTabId: newActiveTab.id,
              _tabSnapshots: updatedSnapshots
            };
          }

          // Fallback (shouldn't normally happen)
          return { ...state, tabs: newTabs, activeTabId: newActiveTab.id, _tabSnapshots: updatedSnapshots };
        }

        // --- Closing a non-active tab --------------------------------------
        return { ...state, tabs: newTabs, _tabSnapshots: updatedSnapshots };
      }),

    newTab: () =>
      set((state) => {
        const newId = generateTabId();

        const updatedSnapshots = { ...state._tabSnapshots };
        let updatedTabs = [...state.tabs];

        if (state.activeTabId) {
          updatedSnapshots[state.activeTabId] = captureActiveTab(state);
          updatedTabs = updatedTabs.map((t) =>
            t.id === state.activeTabId
              ? { ...t, dirty: state.dirty, filePath: state.filePath ?? null }
              : t
          );
        }

        updatedTabs.push({ id: newId, filePath: null, dirty: false });

        return {
          ...createEmptySnapshot(),
          dirty: false,
          meta: { rowCount: 0, columnCount: 0 },
          filters: {},
          undoStack: [],
          redoStack: [],
          _batchDepth: 0,
          _batchLabel: null,
          _batchSnapshot: null,
          tabs: updatedTabs,
          activeTabId: newId,
          _tabSnapshots: updatedSnapshots
        };
      }),

    // =====================================================================
    // Data loading / clearing
    // =====================================================================

    setData: (doc) =>
      set((state) => ({
        headers: doc.headers,
        rows: doc.rows,
        delimiter: doc.delimiter,
        newline: doc.newline,
        filePath: doc.filePath ?? null,
        dirty: false,
        filters: {},
        undoStack: [],
        redoStack: [],
        _batchDepth: 0,
        _batchLabel: null,
        _batchSnapshot: null,
        meta: doc.meta,
        // Sync active tab info
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, filePath: doc.filePath ?? null, dirty: false }
            : t
        )
      })),

    // =====================================================================
    // Mutations (each passes a label + optional coalesceKey)
    // =====================================================================

    updateCell: (rowIndex, columnIndex, value) => {
      const current = get().rows[rowIndex]?.[columnIndex];
      const currentStr = current === null || current === undefined ? '' : String(current);
      if (currentStr === value) return;
      applyMutation(
        'Edit Cell',
        (draft) => {
          draft.rows[rowIndex] = draft.rows[rowIndex] ?? [];
          draft.rows[rowIndex][columnIndex] = value;
        },
        `cell:${rowIndex}:${columnIndex}`
      );
    },

    addRow: () => {
      applyMutation('Add Row', (draft) => {
        const columnCount = draft.headers.length || (draft.rows[0]?.length ?? 0);
        draft.rows.push(new Array(columnCount).fill(''));
      });
    },

    addColumn: () => {
      applyMutation('Add Column', (draft) => {
        const nextIndex = draft.headers.length + 1;
        draft.headers.push(`Column ${nextIndex}`);
        draft.rows = draft.rows.map((row) => [...row, '']);
      });
    },

    insertRowAt: (rowIndex) => {
      applyMutation('Insert Row', (draft) => {
        const columnCount = draft.headers.length || (draft.rows[0]?.length ?? 0);
        draft.rows.splice(rowIndex, 0, new Array(columnCount).fill(''));
      });
    },

    insertColumnAt: (columnIndex) => {
      applyMutation('Insert Column', (draft) => {
        const nextIndex = draft.headers.length + 1;
        draft.headers.splice(columnIndex, 0, `Column ${nextIndex}`);
        draft.rows = draft.rows.map((row) => {
          const newRow = [...row];
          newRow.splice(columnIndex, 0, '');
          return newRow;
        });
      });
    },

    removeRow: (rowIndex) => {
      applyMutation('Delete Row', (draft) => {
        draft.rows.splice(rowIndex, 1);
      });
    },

    removeColumn: (columnIndex) => {
      applyMutation('Delete Column', (draft) => {
        draft.headers.splice(columnIndex, 1);
        draft.rows = draft.rows.map((row) => row.filter((_, idx) => idx !== columnIndex));
      });
    },

    moveRows: (fromStart, fromEnd, toIndex) => {
      const count = fromEnd - fromStart + 1;
      if (toIndex >= fromStart && toIndex <= fromEnd + 1) return; // no-op
      applyMutation('Move Row(s)', (draft) => {
        const extracted = draft.rows.splice(fromStart, count);
        const insertAt = toIndex > fromStart ? toIndex - count : toIndex;
        draft.rows.splice(insertAt, 0, ...extracted);
      });
    },

    moveColumns: (fromStart, fromEnd, toIndex) => {
      const count = fromEnd - fromStart + 1;
      if (toIndex >= fromStart && toIndex <= fromEnd + 1) return; // no-op
      applyMutation('Move Column(s)', (draft) => {
        const insertAt = toIndex > fromStart ? toIndex - count : toIndex;
        // Move headers
        const extractedHeaders = draft.headers.splice(fromStart, count);
        draft.headers.splice(insertAt, 0, ...extractedHeaders);
        // Move cell values in every row
        draft.rows = draft.rows.map((row) => {
          const extracted = row.splice(fromStart, count);
          row.splice(insertAt, 0, ...extracted);
          return row;
        });
      });
    },

    updateHeader: (columnIndex, value) => {
      if (get().headers[columnIndex] === value) return;
      applyMutation(
        'Edit Header',
        (draft) => {
          draft.headers[columnIndex] = value;
        },
        `header:${columnIndex}`
      );
    },

    replaceAll: (term, replacement, matches) => {
      if (!matches.length) return;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      applyMutation('Replace All', (draft) => {
        for (const { row, col } of matches) {
          if (row === -1) {
            draft.headers[col] = String(draft.headers[col] ?? '').replace(regex, replacement);
          } else {
            draft.rows[row] = draft.rows[row] ?? [];
            draft.rows[row][col] = String(draft.rows[row][col] ?? '').replace(regex, replacement);
          }
        }
      });
    },

    // =====================================================================
    // Non-undoable actions
    // =====================================================================

    setFilter: (columnIndex, value) =>
      set((state) => ({
        ...state,
        filters: {
          ...state.filters,
          [columnIndex]: value
        }
      })),

    hasActiveFilters: () => {
      const { filters } = get();
      return Object.values(filters).some((v) => v?.length > 0);
    },

    getFilteredRows: () => {
      const { rows, filters } = get();
      const filterEntries = Object.entries(filters).filter(([, value]) => value?.length);
      if (!filterEntries.length) return rows;
      return rows.filter((row) =>
        filterEntries.every(([columnIndex, value]) => {
          const cell = row[Number(columnIndex)];
          return String(cell ?? '').toLowerCase().includes(value.toLowerCase());
        })
      );
    },

    clear: () =>
      set((state) => ({
        ...createEmptySnapshot(),
        dirty: false,
        meta: { rowCount: 0, columnCount: 0 },
        filters: {},
        undoStack: [],
        redoStack: [],
        _batchDepth: 0,
        _batchLabel: null,
        _batchSnapshot: null,
        // Preserve tab management state
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId ? { ...t, dirty: false, filePath: null } : t
        ),
        activeTabId: state.activeTabId,
        _tabSnapshots: state._tabSnapshots
      })),

    markSaved: (filePath) =>
      set((state) => ({
        ...state,
        dirty: false,
        filePath: filePath ?? state.filePath,
        // Sync active tab info
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, dirty: false, filePath: filePath ?? state.filePath ?? t.filePath }
            : t
        )
      })),

    // =====================================================================
    // Undo / Redo
    // =====================================================================

    undo: () =>
      set((state) => {
        if (!state.undoStack.length) {
          return state;
        }
        const top = state.undoStack[state.undoStack.length - 1];
        const nextUndo = state.undoStack.slice(0, -1);
        const redoEntry: UndoEntry = {
          snapshot: cloneSnapshot(state),
          label: top.label,
          timestamp: Date.now()
        };
        return {
          ...state,
          ...top.snapshot,
          dirty: true,
          undoStack: nextUndo,
          redoStack: trimStack([...state.redoStack, redoEntry]),
          meta: {
            rowCount: top.snapshot.rows.length,
            columnCount: top.snapshot.headers.length
          }
        };
      }),

    redo: () =>
      set((state) => {
        if (!state.redoStack.length) {
          return state;
        }
        const top = state.redoStack[state.redoStack.length - 1];
        const remaining = state.redoStack.slice(0, -1);
        const undoEntry: UndoEntry = {
          snapshot: cloneSnapshot(state),
          label: top.label,
          timestamp: Date.now()
        };
        return {
          ...state,
          ...top.snapshot,
          dirty: true,
          redoStack: remaining,
          undoStack: trimStack([...state.undoStack, undoEntry]),
          meta: {
            rowCount: top.snapshot.rows.length,
            columnCount: top.snapshot.headers.length
          }
        };
      }),

    // =====================================================================
    // Batch / Transaction API
    // =====================================================================

    beginBatch: (label) =>
      set((state) => ({
        ...state,
        _batchDepth: state._batchDepth + 1,
        _batchLabel: state._batchLabel ?? label
      })),

    commitBatch: () =>
      set((state) => {
        const newDepth = state._batchDepth - 1;
        if (newDepth > 0) {
          // Still inside a nested batch — just decrement
          return { ...state, _batchDepth: newDepth };
        }
        // Outermost batch is complete — push the pre-batch snapshot as one entry
        if (state._batchSnapshot) {
          const entry: UndoEntry = {
            snapshot: state._batchSnapshot,
            label: state._batchLabel ?? 'Batch Edit',
            timestamp: Date.now()
          };
          return {
            ...state,
            _batchDepth: 0,
            _batchLabel: null,
            _batchSnapshot: null,
            undoStack: trimStack([...state.undoStack, entry]),
            redoStack: []
          };
        }
        // Batch was opened but no mutations happened
        return {
          ...state,
          _batchDepth: 0,
          _batchLabel: null,
          _batchSnapshot: null
        };
      })
  };
});
