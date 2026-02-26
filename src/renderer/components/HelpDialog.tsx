import { useEffect, useState } from 'react';

export type HelpDialogSection = 'filter' | 'shortcuts';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
  section?: HelpDialogSection;
}

const HelpDialog = ({ open, onClose, section = 'filter' }: HelpDialogProps) => {
  const [activeSection, setActiveSection] = useState<HelpDialogSection>(section);

  useEffect(() => {
    if (open) {
      setActiveSection(section);
    }
  }, [open, section]);

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div className="help-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-dialog__header">
          <span className="help-dialog__title">Help</span>
          <button className="help-dialog__close" onClick={onClose} aria-label="Close help">
            ✕
          </button>
        </div>

        <div className="help-dialog__tabs">
          <button
            className={`help-tab${activeSection === 'filter' ? ' help-tab--active' : ''}`}
            onClick={() => setActiveSection('filter')}
          >
            Filters & Commands
          </button>
          <button
            className={`help-tab${activeSection === 'shortcuts' ? ' help-tab--active' : ''}`}
            onClick={() => setActiveSection('shortcuts')}
          >
            Keyboard Shortcuts
          </button>
        </div>

        <div className="help-dialog__body">
          {activeSection === 'filter' ? (
            <>
              <section className="help-section">
                <h3 className="help-section__title">Filter Language</h3>
                <p className="help-section__text">
                  Use plain text for contains matching, or use typed expressions for number/date columns.
                </p>
                <div className="help-grid">
                  <div className="help-grid__row">
                    <span className="help-grid__label">Text contains</span>
                    <code>apple</code>
                  </div>
                  <div className="help-grid__row">
                    <span className="help-grid__label">Numbers</span>
                    <code>{'>=10, <5, =42, 1..10'}</code>
                  </div>
                  <div className="help-grid__row">
                    <span className="help-grid__label">Dates</span>
                    <code>{'after 2025-01-01, before 2025-12-31, on 2025-06-01'}</code>
                  </div>
                  <div className="help-grid__row">
                    <span className="help-grid__label">Date range</span>
                    <code>{'2025-01-01..2025-12-31'}</code>
                  </div>
                </div>
                <p className="help-section__text">
                  Notes: text matching is case-insensitive, and filters across multiple columns combine with AND logic.
                </p>
              </section>

              <section className="help-section">
                <h3 className="help-section__title">Command Palette</h3>
                <p className="help-section__text">
                  Open with <kbd>Cmd</kbd>+<kbd>K</kbd> and type to search actions.
                </p>
                <ul className="help-list">
                  <li>Use <kbd>↑</kbd>/<kbd>↓</kbd> to move through results.</li>
                  <li>Press <kbd>Enter</kbd> to run the selected command.</li>
                  <li>Press <kbd>Esc</kbd> to close the palette.</li>
                  <li>Try commands like <code>Open File</code>, <code>Save Filtered As</code>, <code>Find and Replace</code>, and <code>Settings</code>.</li>
                </ul>
              </section>
            </>
          ) : (
            <section className="help-section">
              <h3 className="help-section__title">Keyboard Shortcuts</h3>
              <p className="help-section__text">
                Main shortcuts for navigation, editing, and app actions.
              </p>
              <div className="help-grid">
                <div className="help-grid__row">
                  <span className="help-grid__label">Open file</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>O</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Save / Save as</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>S</kbd> / <kbd>Shift</kbd><kbd>Cmd</kbd><kbd>S</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Save filtered as</span>
                  <span className="help-shortcut-combo"><kbd>Shift</kbd><kbd>Cmd</kbd><kbd>E</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Find / Command palette</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>F</kbd> / <kbd>Cmd</kbd><kbd>K</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Settings</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>,</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Undo / Redo</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>Z</kbd> / <kbd>Shift</kbd><kbd>Cmd</kbd><kbd>Z</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Select all</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>A</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">New / Close tab</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>T</kbd> / <kbd>Cmd</kbd><kbd>W</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Cycle tabs</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>Option</kbd><kbd>←</kbd> / <kbd>Cmd</kbd><kbd>Option</kbd><kbd>→</kbd></span>
                </div>
                <div className="help-grid__row">
                  <span className="help-grid__label">Toggle recents panel</span>
                  <span className="help-shortcut-combo"><kbd>Cmd</kbd><kbd>B</kbd></span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default HelpDialog;
