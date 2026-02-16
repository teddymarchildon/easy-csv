import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGridStore } from '../state/gridStore';

export const useFileHandlers = () => {
  const openTab = useGridStore((state) => state.openTab);
  const switchTab = useGridStore((state) => state.switchTab);
  const markSaved = useGridStore((state) => state.markSaved);
  const snapshot = useGridStore(
    useShallow((state) => ({
      headers: state.headers,
      rows: state.rows,
      delimiter: state.delimiter,
      newline: state.newline,
      filePath: state.filePath
    }))
  );

  const openViaDialog = useCallback(async () => {
    const document = await window.api.openFileViaDialog();
    if (!document) {
      return null;
    }

    // Check if the file is already open in a tab
    if (document.filePath) {
      const { tabs, activeTabId } = useGridStore.getState();
      const existingTab = tabs.find((t) => t.filePath === document.filePath);
      if (existingTab) {
        if (existingTab.id !== activeTabId) {
          switchTab(existingTab.id);
        }
        return document;
      }
    }

    openTab(document);
    return document;
  }, [openTab, switchTab]);

  const openFile = useCallback(
    async (filePath: string) => {
      // Check if the file is already open in a tab
      const { tabs, activeTabId } = useGridStore.getState();
      const existingTab = tabs.find((t) => t.filePath === filePath);
      if (existingTab) {
        if (existingTab.id !== activeTabId) {
          switchTab(existingTab.id);
        }
        return null;
      }

      const document = await window.api.openFile(filePath);
      openTab(document);
      return document;
    },
    [openTab, switchTab]
  );

  const save = useCallback(
    async (options?: { saveAs?: boolean }) => {
      const targetPath =
        !snapshot.filePath || options?.saveAs
          ? await window.api.chooseSaveLocation(snapshot.filePath ?? undefined)
          : snapshot.filePath;

      if (!targetPath) {
        return;
      }

      await window.api.saveFile({
        filePath: targetPath,
        headers: snapshot.headers,
        rows: snapshot.rows,
        delimiter: snapshot.delimiter,
        newline: snapshot.newline
      });

      markSaved(targetPath);
      return targetPath;
    },
    [snapshot, markSaved]
  );

  const saveFilteredAs = useCallback(async () => {
    const { getFilteredRows, headers, delimiter, newline } = useGridStore.getState();
    const filteredRows = getFilteredRows();

    const targetPath = await window.api.chooseSaveLocation(undefined);
    if (!targetPath) return;

    await window.api.saveFile({
      filePath: targetPath,
      headers,
      rows: filteredRows,
      delimiter,
      newline
    });

    return targetPath;
  }, []);

  return {
    openViaDialog,
    openFile,
    save,
    saveAs: () => save({ saveAs: true }),
    saveFilteredAs
  };
};
