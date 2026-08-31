import { useCallback } from 'react';
import { useGridStore } from '../state/gridStore';

export const useFileHandlers = () => {
  const openTab = useGridStore((state) => state.openTab);
  const switchTab = useGridStore((state) => state.switchTab);
  const markSaved = useGridStore((state) => state.markSaved);

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
      const snapshot = useGridStore.getState();
      const targetPath =
        !snapshot.filePath || options?.saveAs
          ? await window.api.chooseSaveLocation(snapshot.filePath ?? undefined)
          : snapshot.filePath;

      if (!targetPath) {
        return;
      }

      const payload = {
        filePath: targetPath,
        headers: snapshot.headers,
        rows: snapshot.rows,
        delimiter: snapshot.delimiter,
        newline: snapshot.newline,
        hasFinalNewline: snapshot.hasFinalNewline,
        hasUtf8Bom: snapshot.hasUtf8Bom,
        expectedVersion: targetPath === snapshot.filePath ? snapshot.fileVersion : undefined
      };

      let result = await window.api.saveFile(payload);
      if (!result.ok) {
        const overwrite = window.confirm(
          'This file changed on disk after Rowly opened it. Overwrite the newer version?'
        );
        if (!overwrite) return;
        result = await window.api.saveFile({ ...payload, force: true });
      }

      if (!result.ok) return;
      markSaved(targetPath, result.fileVersion);
      return targetPath;
    },
    [markSaved]
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
      newline,
      hasFinalNewline: true,
      hasUtf8Bom: false
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
