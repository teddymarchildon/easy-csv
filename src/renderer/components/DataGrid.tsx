import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { CellValue } from '@shared/types';
import classNames from 'classnames';

export interface SearchMatch {
  row: number;  // -1 for header match
  col: number;
}

interface DataGridProps {
  headers: string[];
  rows: CellValue[][];
  filters: Record<number, string>;
  onFilterChange: (columnIndex: number, value: string) => void;
  onEditCell: (rowIndex: number, columnIndex: number, value: CellValue) => void;
  onEditHeader: (columnIndex: number, value: string) => void;
  onInsertRowAt: (rowIndex: number) => void;
  onInsertColumnAt: (columnIndex: number) => void;
  onDeleteRow: (rowIndex: number) => void;
  onDeleteColumn: (columnIndex: number) => void;
  onMoveRows: (fromStart: number, fromEnd: number, toIndex: number) => void;
  onMoveColumns: (fromStart: number, fromEnd: number, toIndex: number) => void;
  onBeginBatch: (label: string) => void;
  onCommitBatch: () => void;
  searchTerm?: string;
  searchMatches?: SearchMatch[];
  currentSearchMatch?: SearchMatch | null;
}

type ContextMenu = {
  x: number;
  y: number;
  sourceRowIndex: number;
  columnIndex: number;
  isHeader?: boolean;
} | null;

type CellRange = {
  anchorRow: number; // source row index
  anchorCol: number;
  focusRow: number; // source row index
  focusCol: number;
};

type Selection =
  | { type: 'cells'; range: CellRange }
  | { type: 'header'; anchorCol: number; focusCol: number }
  | null;

export interface DataGridHandle {
  selectAll: () => void;
}

const DEFAULT_COLUMN_WIDTH = 150;
const MIN_COLUMN_WIDTH = 50;

const DataGrid = forwardRef<DataGridHandle, DataGridProps>(({ headers, rows, filters, onFilterChange, onEditCell, onEditHeader, onInsertRowAt, onInsertColumnAt, onDeleteRow, onDeleteColumn, onMoveRows, onMoveColumns, onBeginBatch, onCommitBatch, searchTerm, searchMatches, currentSearchMatch }, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ rowIndex: number; columnIndex: number } | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [selected, setSelected] = useState<Selection>(null);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [isResizing, setIsResizing] = useState(false);
  const [openFilters, setOpenFilters] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const resizeRef = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  useImperativeHandle(ref, () => ({
    selectAll: () => {
      if (rows.length > 0 && headers.length > 0) {
        setSelected({
          type: 'cells',
          range: {
            anchorRow: 0,
            anchorCol: 0,
            focusRow: rows.length - 1,
            focusCol: headers.length - 1
          }
        });
      }
    }
  }), [rows.length, headers.length]);

  // Reset column widths when headers change (new file loaded)
  const headerKey = headers.join('\0');
  useEffect(() => {
    setColumnWidths({});
  }, [headerKey]);

  const gridTemplateColumns = useMemo(
    () => headers.map((_, i) => `${columnWidths[i] ?? DEFAULT_COLUMN_WIDTH}px`).join(' '),
    [headers, columnWidths]
  );

  // Row number gutter width adapts to digit count
  const rowNumWidth = useMemo(() => {
    const digits = Math.max(2, String(rows.length).length);
    return digits * 7 + 16;
  }, [rows.length]);

  const fullGridTemplateColumns = useMemo(
    () => `${rowNumWidth}px ${gridTemplateColumns}`,
    [rowNumWidth, gridTemplateColumns]
  );

  const totalGridWidth = useMemo(
    () => rowNumWidth + headers.reduce((sum, _, i) => sum + (columnWidths[i] ?? DEFAULT_COLUMN_WIDTH), 0),
    [headers, columnWidths, rowNumWidth]
  );

  const handleBodyScroll = useCallback(() => {
    if (scrollRef.current && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }, []);

  const filteredRows = useMemo(() => {
    const filterEntries = Object.entries(filters).filter(([, value]) => value?.length);
    if (!filterEntries.length) {
      return rows.map((row, index) => ({ row, index }));
    }
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        filterEntries.every(([columnIndex, value]) => {
          const cell = row[Number(columnIndex)];
          return String(cell ?? '').toLowerCase().includes(value.toLowerCase());
        })
      );
  }, [rows, filters]);

  // Map from source row index → filtered row index (for keyboard navigation)
  const sourceToFilteredIndex = useMemo(() => {
    const map = new Map<number, number>();
    filteredRows.forEach((entry, filteredIdx) => {
      map.set(entry.index, filteredIdx);
    });
    return map;
  }, [filteredRows]);

  // --- Search match lookup ---
  const searchMatchSet = useMemo(() => {
    const set = new Set<string>();
    if (searchMatches) {
      for (const m of searchMatches) {
        set.add(`${m.row}:${m.col}`);
      }
    }
    return set;
  }, [searchMatches]);

  const isSearchMatch = (sourceRowIndex: number, columnIndex: number) =>
    searchMatchSet.has(`${sourceRowIndex}:${columnIndex}`);

  const isCurrentSearchMatch = (sourceRowIndex: number, columnIndex: number) =>
    currentSearchMatch?.row === sourceRowIndex && currentSearchMatch?.col === columnIndex;

  // Scroll to the current search match when it changes
  useEffect(() => {
    if (!currentSearchMatch || currentSearchMatch.row === -1) return;
    const filteredIdx = sourceToFilteredIndex.get(currentSearchMatch.row);
    if (filteredIdx !== undefined) {
      rowVirtualizerRef.current?.scrollToIndex(filteredIdx, { align: 'center' });
    }
  }, [currentSearchMatch, sourceToFilteredIndex]);

  // We need a ref to the virtualizer so the effect above can access it
  const rowVirtualizerRef = useRef<ReturnType<typeof useVirtualizer> | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    estimateSize: () => 32,
    getScrollElement: () => scrollRef.current,
    overscan: 10
  });
  rowVirtualizerRef.current = rowVirtualizer;

  // --- Cell editing ---
  const startEditing = (rowIndex: number, columnIndex: number) => {
    const sourceRow = filteredRows[rowIndex];
    const cellValue = sourceRow?.row[columnIndex];
    setEditing({ rowIndex: sourceRow?.index ?? rowIndex, columnIndex });
    setDraftValue(cellValue === null || cellValue === undefined ? '' : String(cellValue));
  };

  const commitEdit = () => {
    if (!editing) {
      return;
    }
    onEditCell(editing.rowIndex, editing.columnIndex, draftValue);
    setEditing(null);
    gridRef.current?.focus();
  };

  const commitEditAndNavigate = (direction: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
    if (!editing) return;
    const { rowIndex: sourceRow, columnIndex: col } = editing;
    onEditCell(sourceRow, col, draftValue);
    setEditing(null);
    gridRef.current?.focus();

    const filteredIdx = sourceToFilteredIndex.get(sourceRow);
    if (filteredIdx === undefined) return;

    let newRow = sourceRow;
    let newCol = col;

    if (direction === 'ArrowUp') {
      const idx = filteredIdx - 1;
      if (idx < 0) {
        setSelected({ type: 'header', anchorCol: col, focusCol: col });
        return;
      }
      newRow = filteredRows[idx].index;
    } else if (direction === 'ArrowDown') {
      const idx = filteredIdx + 1;
      if (idx >= filteredRows.length) return;
      newRow = filteredRows[idx].index;
    } else if (direction === 'ArrowLeft') {
      newCol = Math.max(0, col - 1);
    } else if (direction === 'ArrowRight') {
      newCol = Math.min(headers.length - 1, col + 1);
    }

    setSelected({
      type: 'cells',
      range: { anchorRow: newRow, anchorCol: newCol, focusRow: newRow, focusCol: newCol }
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraftValue('');
    gridRef.current?.focus();
  };

  // --- Header editing ---
  const startEditingHeader = (columnIndex: number) => {
    setEditingHeader(columnIndex);
    setDraftValue(headers[columnIndex] ?? '');
  };

  const commitHeaderEdit = () => {
    if (editingHeader === null) return;
    onEditHeader(editingHeader, draftValue);
    setEditingHeader(null);
    gridRef.current?.focus();
  };

  const cancelHeaderEdit = () => {
    setEditingHeader(null);
    setDraftValue('');
    gridRef.current?.focus();
  };

  const commitHeaderEditAndNavigate = (direction: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
    if (editingHeader === null) return;
    const col = editingHeader;
    onEditHeader(col, draftValue);
    setEditingHeader(null);
    gridRef.current?.focus();

    if (direction === 'ArrowDown') {
      if (filteredRows.length > 0) {
        const firstSourceRow = filteredRows[0].index;
        setSelected({
          type: 'cells',
          range: { anchorRow: firstSourceRow, anchorCol: col, focusRow: firstSourceRow, focusCol: col }
        });
      }
    } else if (direction === 'ArrowLeft') {
      const newCol = col - 1;
      if (newCol >= 0) {
        setSelected({ type: 'header', anchorCol: newCol, focusCol: newCol });
      }
    } else if (direction === 'ArrowRight') {
      const newCol = col + 1;
      if (newCol < headers.length) {
        setSelected({ type: 'header', anchorCol: newCol, focusCol: newCol });
      }
    }
    // ArrowUp: stay on same header (no row above headers)
  };

  // --- Selection helpers ---
  const getSelectionBounds = (range: CellRange) => ({
    minRow: Math.min(range.anchorRow, range.focusRow),
    maxRow: Math.max(range.anchorRow, range.focusRow),
    minCol: Math.min(range.anchorCol, range.focusCol),
    maxCol: Math.max(range.anchorCol, range.focusCol)
  });

  const isCellInSelection = (sourceRowIndex: number, columnIndex: number) => {
    if (selected?.type !== 'cells') return false;
    const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selected.range);
    return (
      sourceRowIndex >= minRow &&
      sourceRowIndex <= maxRow &&
      columnIndex >= minCol &&
      columnIndex <= maxCol
    );
  };

  const isSingleCellSelected = (sourceRowIndex: number, columnIndex: number) =>
    selected?.type === 'cells' &&
    selected.range.anchorRow === selected.range.focusRow &&
    selected.range.anchorCol === selected.range.focusCol &&
    selected.range.anchorRow === sourceRowIndex &&
    selected.range.anchorCol === columnIndex;

  const isHeaderSelected = (columnIndex: number) => {
    if (selected?.type !== 'header') return false;
    const minCol = Math.min(selected.anchorCol, selected.focusCol);
    const maxCol = Math.max(selected.anchorCol, selected.focusCol);
    return columnIndex >= minCol && columnIndex <= maxCol;
  };

  const isSingleHeaderSelected = (columnIndex: number) =>
    selected?.type === 'header' &&
    selected.anchorCol === selected.focusCol &&
    selected.anchorCol === columnIndex;

  const handleCellClick = (virtualRowIndex: number, columnIndex: number, e: React.MouseEvent) => {
    const sourceRow = filteredRows[virtualRowIndex];
    const sourceIndex = sourceRow?.index ?? virtualRowIndex;

    // Shift+click: extend selection from anchor
    if (e.shiftKey && selected?.type === 'cells') {
      setSelected({
        type: 'cells',
        range: {
          ...selected.range,
          focusRow: sourceIndex,
          focusCol: columnIndex
        }
      });
      gridRef.current?.focus();
      return;
    }

    // If this exact cell is the only selected cell, start editing
    if (isSingleCellSelected(sourceIndex, columnIndex)) {
      startEditing(virtualRowIndex, columnIndex);
      return;
    }

    // Otherwise, select just this cell (blur will handle committing any active edit)
    setSelected({
      type: 'cells',
      range: {
        anchorRow: sourceIndex,
        anchorCol: columnIndex,
        focusRow: sourceIndex,
        focusCol: columnIndex
      }
    });
    gridRef.current?.focus();
  };

  const handleHeaderClick = (columnIndex: number, e: React.MouseEvent) => {
    // Shift+click: extend selection from anchor
    if (e.shiftKey && selected?.type === 'header') {
      setSelected({ type: 'header', anchorCol: selected.anchorCol, focusCol: columnIndex });
      gridRef.current?.focus();
      return;
    }

    // If this exact header is the only selected header, start editing
    if (isSingleHeaderSelected(columnIndex)) {
      startEditingHeader(columnIndex);
      return;
    }

    // Otherwise, select just this header
    setSelected({ type: 'header', anchorCol: columnIndex, focusCol: columnIndex });
    gridRef.current?.focus();
  };

  // --- Copy / Paste ---
  const handleCopy = () => {
    if (selected?.type === 'header') {
      const minCol = Math.min(selected.anchorCol, selected.focusCol);
      const maxCol = Math.max(selected.anchorCol, selected.focusCol);
      const values: string[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        values.push(String(headers[col] ?? ''));
      }
      navigator.clipboard.writeText(values.join('\t'));
      return;
    }
    if (selected?.type !== 'cells') return;
    const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selected.range);

    // Only copy visible (filtered) rows within the range
    const visibleRows = filteredRows.filter(
      (entry) => entry.index >= minRow && entry.index <= maxRow
    );

    const text = visibleRows
      .map((entry) => {
        const cells: string[] = [];
        for (let col = minCol; col <= maxCol; col++) {
          cells.push(String(entry.row[col] ?? ''));
        }
        return cells.join('\t');
      })
      .join('\n');

    navigator.clipboard.writeText(text);
  };

  const handlePaste = async () => {
    if (selected?.type === 'header') {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const pasteValues = text.split('\n')[0]?.split('\t') ?? [];
      const minCol = Math.min(selected.anchorCol, selected.focusCol);
      const maxCol = Math.max(selected.anchorCol, selected.focusCol);
      const isSingleCellClipboard = pasteValues.length === 1;
      onBeginBatch('Paste');
      if (isSingleCellClipboard) {
        // Fill all selected headers with the single value
        for (let col = minCol; col <= maxCol; col++) {
          onEditHeader(col, pasteValues[0]);
        }
      } else {
        pasteValues.forEach((value, offset) => {
          const targetCol = minCol + offset;
          if (targetCol < headers.length) {
            onEditHeader(targetCol, value);
          }
        });
      }
      onCommitBatch();
      return;
    }
    if (selected?.type !== 'cells') return;
    const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selected.range);

    const text = await navigator.clipboard.readText();
    if (!text) return;

    const pasteRows = text.split('\n').map((line) => line.split('\t'));

    // If clipboard contains a single cell, fill all selected cells with that value
    const isSingleCellClipboard =
      pasteRows.length === 1 && pasteRows[0].length === 1;

    onBeginBatch('Paste');
    if (isSingleCellClipboard) {
      const value = pasteRows[0][0];
      for (let row = minRow; row <= maxRow; row++) {
        if (row >= rows.length) continue;
        for (let col = minCol; col <= maxCol; col++) {
          if (col >= headers.length) continue;
          onEditCell(row, col, value);
        }
      }
    } else {
      pasteRows.forEach((pasteCols, rowOffset) => {
        const targetRow = minRow + rowOffset;
        if (targetRow >= rows.length) return;
        pasteCols.forEach((value, colOffset) => {
          const targetCol = minCol + colOffset;
          if (targetCol >= headers.length) return;
          onEditCell(targetRow, targetCol, value);
        });
      });
    }
    onCommitBatch();
  };

  // --- Cut (copy + clear) ---
  const handleCut = () => {
    if (selected?.type === 'header') {
      const minCol = Math.min(selected.anchorCol, selected.focusCol);
      const maxCol = Math.max(selected.anchorCol, selected.focusCol);
      const values: string[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        values.push(String(headers[col] ?? ''));
      }
      navigator.clipboard.writeText(values.join('\t'));
      onBeginBatch('Cut');
      for (let col = minCol; col <= maxCol; col++) {
        onEditHeader(col, '');
      }
      onCommitBatch();
      return;
    }
    if (selected?.type !== 'cells') return;
    handleCopy();
    const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selected.range);
    onBeginBatch('Cut');
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        onEditCell(row, col, '');
      }
    }
    onCommitBatch();
  };

  // --- Context menu ---
  const handleContextMenu = (e: React.MouseEvent, virtualRowIndex: number, columnIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceRow = filteredRows[virtualRowIndex];
    const sourceIndex = sourceRow?.index ?? virtualRowIndex;

    // Select the cell on right-click if not already in selection
    if (!isCellInSelection(sourceIndex, columnIndex)) {
      setSelected({
        type: 'cells',
        range: {
          anchorRow: sourceIndex,
          anchorCol: columnIndex,
          focusRow: sourceIndex,
          focusCol: columnIndex
        }
      });
    }

    // Anchor the menu to the cell element rather than mouse coordinates,
    // so two-finger-click doesn't place it far from the cell.
    const cellEl = e.currentTarget as HTMLElement;
    const rect = cellEl.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 440;
    const x = Math.max(0, Math.min(rect.left - 80, window.innerWidth - menuWidth - 8));
    const y = Math.max(0, Math.min(rect.top - 30, window.innerHeight - menuHeight - 8));
    setContextMenu({ x, y, sourceRowIndex: sourceIndex, columnIndex });
  };

  const handleHeaderContextMenu = (e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    // Only change selection if the right-clicked header isn't already in the selection
    if (!isHeaderSelected(columnIndex)) {
      setSelected({ type: 'header', anchorCol: columnIndex, focusCol: columnIndex });
    }

    const cellEl = e.currentTarget as HTMLElement;
    const rect = cellEl.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = 320;
    const x = Math.max(0, Math.min(rect.left - 80, window.innerWidth - menuWidth - 8));
    const y = Math.max(0, Math.min(rect.bottom, window.innerHeight - menuHeight - 8));
    setContextMenu({ x, y, sourceRowIndex: 0, columnIndex, isHeader: true });
  };

  const closeContextMenu = () => setContextMenu(null);

  // --- Context menu move helpers ---
  const getSelectedRowRange = (): { fromStart: number; fromEnd: number } | null => {
    if (!contextMenu) return null;
    if (selected?.type === 'cells') {
      const { minRow, maxRow } = getSelectionBounds(selected.range);
      return { fromStart: minRow, fromEnd: maxRow };
    }
    // Fallback: just the right-clicked row
    return { fromStart: contextMenu.sourceRowIndex, fromEnd: contextMenu.sourceRowIndex };
  };

  const getSelectedColumnRange = (): { fromStart: number; fromEnd: number } | null => {
    if (!contextMenu) return null;
    if (selected?.type === 'header') {
      const minCol = Math.min(selected.anchorCol, selected.focusCol);
      const maxCol = Math.max(selected.anchorCol, selected.focusCol);
      return { fromStart: minCol, fromEnd: maxCol };
    }
    if (selected?.type === 'cells') {
      const { minCol, maxCol } = getSelectionBounds(selected.range);
      return { fromStart: minCol, fromEnd: maxCol };
    }
    return { fromStart: contextMenu.columnIndex, fromEnd: contextMenu.columnIndex };
  };

  const handleMoveRowUp = () => {
    const range = getSelectedRowRange();
    if (!range || range.fromStart <= 0) return;
    onMoveRows(range.fromStart, range.fromEnd, range.fromStart - 1);
    // Update selection to follow the moved rows
    const offset = range.fromEnd - range.fromStart;
    const newStart = range.fromStart - 1;
    if (selected?.type === 'cells') {
      setSelected({
        type: 'cells',
        range: { ...selected.range, anchorRow: newStart, focusRow: newStart + offset }
      });
    }
    closeContextMenu();
  };

  const handleMoveRowDown = () => {
    const range = getSelectedRowRange();
    if (!range || range.fromEnd >= rows.length - 1) return;
    onMoveRows(range.fromStart, range.fromEnd, range.fromEnd + 2);
    // Update selection to follow the moved rows
    const offset = range.fromEnd - range.fromStart;
    const newStart = range.fromStart + 1;
    if (selected?.type === 'cells') {
      setSelected({
        type: 'cells',
        range: { ...selected.range, anchorRow: newStart, focusRow: newStart + offset }
      });
    }
    closeContextMenu();
  };

  const handleMoveColumnLeft = () => {
    const range = getSelectedColumnRange();
    if (!range || range.fromStart <= 0) return;
    onMoveColumns(range.fromStart, range.fromEnd, range.fromStart - 1);
    const offset = range.fromEnd - range.fromStart;
    const newStart = range.fromStart - 1;
    if (selected?.type === 'header') {
      setSelected({ type: 'header', anchorCol: newStart, focusCol: newStart + offset });
    } else if (selected?.type === 'cells') {
      setSelected({
        type: 'cells',
        range: { ...selected.range, anchorCol: newStart, focusCol: newStart + offset }
      });
    }
    closeContextMenu();
  };

  const handleMoveColumnRight = () => {
    const range = getSelectedColumnRange();
    if (!range || range.fromEnd >= headers.length - 1) return;
    onMoveColumns(range.fromStart, range.fromEnd, range.fromEnd + 2);
    const offset = range.fromEnd - range.fromStart;
    const newStart = range.fromStart + 1;
    if (selected?.type === 'header') {
      setSelected({ type: 'header', anchorCol: newStart, focusCol: newStart + offset });
    } else if (selected?.type === 'cells') {
      setSelected({
        type: 'cells',
        range: { ...selected.range, anchorCol: newStart, focusCol: newStart + offset }
      });
    }
    closeContextMenu();
  };

  // Close context menu on any click, scroll, or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [contextMenu]);

  // --- Keyboard navigation ---
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle keyboard events when editing a cell or header
    if (editing || editingHeader !== null) return;

    const isMeta = e.metaKey || e.ctrlKey;

    if (isMeta && e.key === 'c') {
      e.preventDefault();
      handleCopy();
      return;
    }

    if (isMeta && e.key === 'v') {
      e.preventDefault();
      handlePaste();
      return;
    }

    if (isMeta && e.key === 'x') {
      e.preventDefault();
      handleCut();
      return;
    }

    // Header-selected navigation
    if (selected?.type === 'header') {
      const { anchorCol, focusCol } = selected;
      const isSingleHeader = anchorCol === focusCol;

      // Cmd/Ctrl + Arrow → extend header selection to edge
      if (isMeta && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') {
          setSelected({ type: 'header', anchorCol: Math.max(anchorCol, focusCol), focusCol: 0 });
        } else if (e.key === 'ArrowRight') {
          setSelected({ type: 'header', anchorCol: Math.min(anchorCol, focusCol), focusCol: headers.length - 1 });
        }
        return;
      }

      if (['ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowDown') {
          // Move into the first visible row of this column
          if (filteredRows.length > 0) {
            const firstSourceRow = filteredRows[0].index;
            setSelected({
              type: 'cells',
              range: { anchorRow: firstSourceRow, anchorCol: focusCol, focusRow: firstSourceRow, focusCol: focusCol }
            });
          }
        } else if (e.key === 'ArrowLeft') {
          const newCol = focusCol - 1;
          if (newCol >= 0) {
            if (e.shiftKey) {
              setSelected({ type: 'header', anchorCol, focusCol: newCol });
            } else {
              setSelected({ type: 'header', anchorCol: newCol, focusCol: newCol });
            }
          }
        } else if (e.key === 'ArrowRight') {
          const newCol = focusCol + 1;
          if (newCol < headers.length) {
            if (e.shiftKey) {
              setSelected({ type: 'header', anchorCol, focusCol: newCol });
            } else {
              setSelected({ type: 'header', anchorCol: newCol, focusCol: newCol });
            }
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      // Enter → edit the focused header (only when single)
      if (e.key === 'Enter' && isSingleHeader) {
        startEditingHeader(focusCol);
        return;
      }
      // Printable character → overwrite header and enter edit mode (only when single)
      if (e.key.length === 1 && !isMeta && isSingleHeader) {
        e.preventDefault();
        setEditingHeader(focusCol);
        setDraftValue(e.key);
        return;
      }
      // Delete/Backspace → clear selected headers
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (isSingleHeader) {
          setEditingHeader(focusCol);
          setDraftValue('');
        } else {
          const minCol = Math.min(anchorCol, focusCol);
          const maxCol = Math.max(anchorCol, focusCol);
          onBeginBatch('Clear Headers');
          for (let c = minCol; c <= maxCol; c++) {
            onEditHeader(c, '');
          }
          onCommitBatch();
        }
        return;
      }
      return;
    }

    if (selected?.type !== 'cells') return;
    const { anchorRow, anchorCol, focusRow, focusCol } = selected.range;

    // Cmd/Ctrl + Arrow → extend current selection to edge in that direction
    if (isMeta && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selected.range);
      if (e.key === 'ArrowRight') {
        setSelected({
          type: 'cells',
          range: { anchorRow: minRow, anchorCol: minCol, focusRow: maxRow, focusCol: headers.length - 1 }
        });
      } else if (e.key === 'ArrowLeft') {
        setSelected({
          type: 'cells',
          range: { anchorRow: minRow, anchorCol: 0, focusRow: maxRow, focusCol: maxCol }
        });
      } else if (e.key === 'ArrowDown') {
        setSelected({
          type: 'cells',
          range: { anchorRow: minRow, anchorCol: minCol, focusRow: rows.length - 1, focusCol: maxCol }
        });
      } else if (e.key === 'ArrowUp') {
        setSelected({
          type: 'cells',
          range: { anchorRow: 0, anchorCol: minCol, focusRow: maxRow, focusCol: maxCol }
        });
      }
      return;
    }

    // Arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();

      let newRow = focusRow;
      let newCol = focusCol;

      const currentFilteredIdx = sourceToFilteredIndex.get(focusRow);
      if (currentFilteredIdx === undefined) return;

      if (e.key === 'ArrowUp') {
        const idx = currentFilteredIdx - 1;
        if (idx < 0) {
          // At the top row — move selection up to the column header
          if (!e.shiftKey) {
            setSelected({ type: 'header', anchorCol: focusCol, focusCol: focusCol });
          }
          return;
        }
        newRow = filteredRows[idx].index;
      } else if (e.key === 'ArrowDown') {
        const idx = currentFilteredIdx + 1;
        if (idx >= filteredRows.length) return;
        newRow = filteredRows[idx].index;
      } else if (e.key === 'ArrowLeft') {
        newCol = Math.max(0, focusCol - 1);
      } else if (e.key === 'ArrowRight') {
        newCol = Math.min(headers.length - 1, focusCol + 1);
      }

      if (e.shiftKey) {
        // Extend selection from anchor
        setSelected({
          type: 'cells',
          range: { anchorRow, anchorCol, focusRow: newRow, focusCol: newCol }
        });
      } else {
        // Move to single cell
        setSelected({
          type: 'cells',
          range: { anchorRow: newRow, anchorCol: newCol, focusRow: newRow, focusCol: newCol }
        });
      }
      return;
    }

    // Enter → edit single selected cell
    if (e.key === 'Enter') {
      const isSingle = anchorRow === focusRow && anchorCol === focusCol;
      if (isSingle) {
        const filteredIdx = sourceToFilteredIndex.get(anchorRow);
        if (filteredIdx !== undefined) {
          startEditing(filteredIdx, anchorCol);
        }
      }
      return;
    }

    // Escape → clear selection
    if (e.key === 'Escape') {
      setSelected(null);
      return;
    }

    // Printable character → overwrite cell content and enter edit mode
    if (e.key.length === 1 && !isMeta) {
      const isSingle = anchorRow === focusRow && anchorCol === focusCol;
      if (isSingle) {
        const filteredIdx = sourceToFilteredIndex.get(anchorRow);
        if (filteredIdx !== undefined) {
          e.preventDefault();
          setEditing({ rowIndex: anchorRow, columnIndex: anchorCol });
          setDraftValue(e.key);
        }
      }
      return;
    }

    // Delete/Backspace → clear selected cells
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const isSingle = anchorRow === focusRow && anchorCol === focusCol;
      if (isSingle) {
        const filteredIdx = sourceToFilteredIndex.get(anchorRow);
        if (filteredIdx !== undefined) {
          setEditing({ rowIndex: anchorRow, columnIndex: anchorCol });
          setDraftValue('');
        }
      } else {
        const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selected.range);
        onBeginBatch('Clear Cells');
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            onEditCell(r, c, '');
          }
        }
        onCommitBatch();
      }
    }
  };

  // Clear selection when clicking on the grid background
  const handleBackgroundClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.classList.contains('grid-scroll-area') ||
      target.classList.contains('data-grid')
    ) {
      setSelected(null);
    }
  };

  // --- Column resize drag logic ---
  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current) return;
    const { colIndex, startX, startWidth } = resizeRef.current;
    const delta = e.clientX - startX;
    const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + delta);
    setColumnWidths((prev) => ({ ...prev, [colIndex]: newWidth }));
  }, []);

  const handleResizeMouseUp = useCallback(() => {
    resizeRef.current = null;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResizeMouseMove);
    document.removeEventListener('mouseup', handleResizeMouseUp);
  }, [handleResizeMouseMove]);

  const startResize = useCallback(
    (e: React.MouseEvent, colIndex: number) => {
      e.preventDefault();
      const startWidth = columnWidths[colIndex] ?? DEFAULT_COLUMN_WIDTH;
      resizeRef.current = { colIndex, startX: e.clientX, startWidth };
      setIsResizing(true);
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleResizeMouseUp);
    },
    [columnWidths, handleResizeMouseMove, handleResizeMouseUp]
  );

  // Auto-fit column width on double-click
  const autoFitColumn = useCallback(
    (colIndex: number) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Measure cell content with cell font
      ctx.font = '0.85rem Inter, system-ui, sans-serif';
      let maxWidth = 0;

      // Measure header text with header font
      const headerText = headers[colIndex] ?? '';
      const headerCanvas = document.createElement('canvas');
      const headerCtx = headerCanvas.getContext('2d');
      if (headerCtx) {
        headerCtx.font = '600 0.75rem Inter, system-ui, sans-serif';
        maxWidth = Math.max(maxWidth, headerCtx.measureText(headerText).width);
      }

      // Measure all row values
      for (const row of rows) {
        const cellValue = String(row[colIndex] ?? '');
        const measured = ctx.measureText(cellValue).width;
        if (measured > maxWidth) {
          maxWidth = measured;
        }
      }

      // Add padding (0.5rem each side ~16px) + buffer
      const newWidth = Math.max(MIN_COLUMN_WIDTH, Math.ceil(maxWidth) + 32);
      setColumnWidths((prev) => ({ ...prev, [colIndex]: newWidth }));
    },
    [headers, rows]
  );

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, [handleResizeMouseMove, handleResizeMouseUp]);

  return (
    <div
      ref={gridRef}
      tabIndex={0}
      className={classNames('data-grid', { 'data-grid--resizing': isResizing })}
      onClick={handleBackgroundClick}
      onKeyDown={handleKeyDown}
    >
      <div className="data-grid__header-scroll" ref={headerScrollRef}>
        <div className="data-grid__header" style={{ gridTemplateColumns: fullGridTemplateColumns, minWidth: `${totalGridWidth}px` }}>
          <div className="data-grid__row-number data-grid__row-number--header" />
          {headers.map((header, index) => {
            const headerSelected = isHeaderSelected(index);
            const headerEditing = editingHeader === index;
            const headerIsMatch = isSearchMatch(-1, index);
            const headerIsCurrentMatch = isCurrentSearchMatch(-1, index);
            return (
                <div
                key={header + index}
                className={classNames('data-grid__header-cell', {
                  'data-grid__header-cell--selected': headerSelected && !headerEditing,
                  'data-grid__header-cell--editing': headerEditing,
                  'data-grid__header-cell--search-match': headerIsMatch && !headerIsCurrentMatch,
                  'data-grid__header-cell--search-current': headerIsCurrentMatch
                })}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!headerEditing) {
                    handleHeaderClick(index, e);
                  }
                }}
                onContextMenu={(e) => handleHeaderContextMenu(e, index)}
              >
                <div className="data-grid__header-label">
                  {headerEditing ? (
                    <input
                      className="data-grid__header-edit-input"
                      autoFocus
                      value={draftValue}
                      onChange={(event) => setDraftValue(event.target.value)}
                      onBlur={commitHeaderEdit}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitHeaderEdit();
                        } else if (event.key === 'Escape') {
                          cancelHeaderEdit();
                        } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                          event.preventDefault();
                          commitHeaderEditAndNavigate(event.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span style={{ cursor: 'default', flex: 1 }}>
                      {header}
                    </span>
                  )}
                  <button
                    className={classNames('filter-toggle', { 'filter-toggle--active': filters[index]?.length })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(index)) {
                          next.delete(index);
                        } else {
                          next.add(index);
                        }
                        return next;
                      });
                    }}
                    title="Filter column"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1 2a1 1 0 0 1 1-1h12a1 1 0 0 1 .8 1.6L10 10v4a1 1 0 0 1-.55.9l-2 1A1 1 0 0 1 6 15v-5L1.2 2.6A1 1 0 0 1 1 2z" />
                    </svg>
                  </button>
                </div>
                {openFilters.has(index) && (
                  <input
                    autoFocus
                    placeholder="Filter..."
                    value={filters[index] ?? ''}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onFilterChange(index, event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Escape') {
                        setOpenFilters((prev) => {
                          const next = new Set(prev);
                          next.delete(index);
                          return next;
                        });
                      }
                    }}
                  />
                )}
                <div
                  className="resize-handle"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => startResize(e, index)}
                  onDoubleClick={() => autoFitColumn(index)}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid-scroll-area" ref={scrollRef} onScroll={handleBodyScroll}>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            minWidth: `${totalGridWidth}px`,
            position: 'relative'
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowEntry = filteredRows[virtualRow.index];
            const rowValues = rowEntry?.row ?? [];
            const sourceIndex = rowEntry?.index ?? virtualRow.index;

            return (
              <div
                key={virtualRow.key}
                className="data-grid__row"
                style={{
                  gridTemplateColumns: fullGridTemplateColumns,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                <div className="data-grid__row-number">{sourceIndex + 1}</div>
                {headers.map((_, columnIndex) => {
                  const isEditing =
                    editing?.rowIndex === sourceIndex && editing?.columnIndex === columnIndex;
                  const cellSelected = isCellInSelection(sourceIndex, columnIndex);
                  const cellValue = rowValues[columnIndex] ?? '';
                  const cellIsMatch = isSearchMatch(sourceIndex, columnIndex);
                  const cellIsCurrentMatch = isCurrentSearchMatch(sourceIndex, columnIndex);
                  return (
                    <div
                      key={`${virtualRow.index}-${columnIndex}`}
                      className={classNames('data-grid__cell', {
                        'data-grid__cell--selected': cellSelected && !isEditing,
                        'data-grid__cell--editing': isEditing,
                        'data-grid__cell--search-match': cellIsMatch && !cellIsCurrentMatch,
                        'data-grid__cell--search-current': cellIsCurrentMatch
                      })}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCellClick(virtualRow.index, columnIndex, e);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, virtualRow.index, columnIndex)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draftValue}
                          onChange={(event) => setDraftValue(event.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              commitEdit();
                            } else if (event.key === 'Escape') {
                              cancelEdit();
                            } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                              event.preventDefault();
                              commitEditAndNavigate(event.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
                            }
                          }}
                        />
                      ) : (
                        cellValue
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <button
          className="data-grid__add-row"
          onClick={(e) => {
            e.stopPropagation();
            onInsertRowAt(rows.length);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2H9v5a1 1 0 1 1-2 0V9H2a1 1 0 0 1 0-2h5V2a1 1 0 0 1 1-1z" />
          </svg>
          <span>New Row</span>
        </button>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu__item"
            onClick={() => { handleCut(); closeContextMenu(); }}
          >
            Cut
          </button>
          <button
            className="context-menu__item"
            onClick={() => { handleCopy(); closeContextMenu(); }}
          >
            Copy
          </button>
          <button
            className="context-menu__item"
            onClick={() => { handlePaste(); closeContextMenu(); }}
          >
            Paste
          </button>
          <div className="context-menu__separator" />
          {!contextMenu.isHeader && (
            <>
              <button
                className="context-menu__item"
                onClick={() => { onInsertRowAt(contextMenu.sourceRowIndex); closeContextMenu(); }}
              >
                Insert Row Above
              </button>
              <button
                className="context-menu__item"
                onClick={() => { onInsertRowAt(contextMenu.sourceRowIndex + 1); closeContextMenu(); }}
              >
                Insert Row Below
              </button>
              <div className="context-menu__separator" />
              <button
                className={classNames('context-menu__item', { 'context-menu__item--disabled': (getSelectedRowRange()?.fromStart ?? 0) <= 0 })}
                onClick={handleMoveRowUp}
              >
                Move Row Up
              </button>
              <button
                className={classNames('context-menu__item', { 'context-menu__item--disabled': (getSelectedRowRange()?.fromEnd ?? rows.length - 1) >= rows.length - 1 })}
                onClick={handleMoveRowDown}
              >
                Move Row Down
              </button>
              <div className="context-menu__separator" />
            </>
          )}
          <button
            className="context-menu__item"
            onClick={() => { onInsertColumnAt(contextMenu.columnIndex); closeContextMenu(); }}
          >
            Insert Column Left
          </button>
          <button
            className="context-menu__item"
            onClick={() => { onInsertColumnAt(contextMenu.columnIndex + 1); closeContextMenu(); }}
          >
            Insert Column Right
          </button>
          <div className="context-menu__separator" />
          <button
            className={classNames('context-menu__item', { 'context-menu__item--disabled': (getSelectedColumnRange()?.fromStart ?? 0) <= 0 })}
            onClick={handleMoveColumnLeft}
          >
            Move Column Left
          </button>
          <button
            className={classNames('context-menu__item', { 'context-menu__item--disabled': (getSelectedColumnRange()?.fromEnd ?? headers.length - 1) >= headers.length - 1 })}
            onClick={handleMoveColumnRight}
          >
            Move Column Right
          </button>
          <div className="context-menu__separator" />
          {!contextMenu.isHeader && (
            <button
              className="context-menu__item context-menu__item--danger"
              onClick={() => { onDeleteRow(contextMenu.sourceRowIndex); closeContextMenu(); setSelected(null); }}
            >
              Delete Row
            </button>
          )}
          <button
            className="context-menu__item context-menu__item--danger"
            onClick={() => { onDeleteColumn(contextMenu.columnIndex); closeContextMenu(); setSelected(null); }}
          >
            Delete Column
          </button>
        </div>
      )}
    </div>
  );
});

export default memo(DataGrid);
