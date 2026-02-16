import { useEffect, useRef } from 'react';
import type { ThemeMode } from '@shared/types';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

const themes: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'light',
    label: 'Light',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    mode: 'dark',
    label: 'Dark',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    mode: 'system',
    label: 'System',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="3" width="16" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 17h6M10 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
];

const SettingsDialog = ({ open, onClose, themeMode, onThemeChange }: SettingsDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="settings-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-dialog__header">
          <span className="settings-dialog__title">Settings</span>
          <button className="settings-dialog__close" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="settings-dialog__body">
          <p className="settings-section__label">Appearance</p>
          <p className="settings-section__description">
            Choose how Easy CSV looks. Select a theme or sync with your system setting.
          </p>
          <div className="theme-picker">
            {themes.map(({ mode, label, icon }) => (
              <button
                key={mode}
                className={`theme-option${themeMode === mode ? ' theme-option--active' : ''}`}
                onClick={() => onThemeChange(mode)}
              >
                <span className="theme-option__icon">{icon}</span>
                <span className="theme-option__label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
