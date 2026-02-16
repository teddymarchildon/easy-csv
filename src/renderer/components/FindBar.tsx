import { useEffect, useRef, useState } from 'react';

interface FindBarProps {
  open: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  matchCount: number;
  currentMatch: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onReplace: (replaceValue: string) => void;
  onReplaceAll: (replaceValue: string) => void;
  replaceExpanded: boolean;
  onToggleReplace: () => void;
}

const IconChevronUp = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10l4-4 4 4" />
  </svg>
);

const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6l4 4 4-4" />
  </svg>
);

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

const IconReplace = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2l3 3-3 3" />
    <path d="M14 5H6.5a3.5 3.5 0 1 0 0 7H8" />
  </svg>
);

const IconToggleExpand = ({ expanded }: { expanded: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {expanded ? <path d="M2 4l3 3 3-3" /> : <path d="M3 2l3 3-3 3" />}
  </svg>
);

const FindBar = ({
  open,
  searchTerm,
  onSearchChange,
  matchCount,
  currentMatch,
  onNext,
  onPrev,
  onClose,
  onReplace,
  onReplaceAll,
  replaceExpanded,
  onToggleReplace
}: FindBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceValue, setReplaceValue] = useState('');

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
      setReplaceValue('');
    }
  }, [open]);

  if (!open) return null;

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab' && !e.shiftKey && replaceExpanded) {
      e.preventDefault();
      replaceInputRef.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      inputRef.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        onReplaceAll(replaceValue);
      } else {
        onReplace(replaceValue);
      }
    }
  };

  const matchLabel =
    searchTerm.length > 0
      ? matchCount > 0
        ? `${currentMatch + 1} of ${matchCount}`
        : 'No results'
      : '';

  return (
    <div className="find-bar">
      <button
        className="find-bar__toggle"
        onClick={onToggleReplace}
        title={replaceExpanded ? 'Hide replace' : 'Show replace'}
      >
        <IconToggleExpand expanded={replaceExpanded} />
      </button>
      <div className="find-bar__rows">
        {/* Search row */}
        <div className="find-bar__row">
          <div className="find-bar__input-wrapper">
            <input
              ref={inputRef}
              className="find-bar__input"
              type="text"
              placeholder="Find in sheet..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {matchLabel && (
              <span className="find-bar__match-count">{matchLabel}</span>
            )}
          </div>
          <button
            className="find-bar__btn"
            onClick={onPrev}
            disabled={matchCount === 0}
            title="Previous match (Shift+Enter)"
          >
            <IconChevronUp />
          </button>
          <button
            className="find-bar__btn"
            onClick={onNext}
            disabled={matchCount === 0}
            title="Next match (Enter)"
          >
            <IconChevronDown />
          </button>
          <button
            className="find-bar__btn"
            onClick={onClose}
            title="Close (Escape)"
          >
            <IconClose />
          </button>
        </div>

        {/* Replace row */}
        {replaceExpanded && (
        <div className="find-bar__row">
          <div className="find-bar__input-wrapper">
            <input
              ref={replaceInputRef}
              className="find-bar__input"
              type="text"
              placeholder="Replace with..."
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
            />
          </div>
          <button
            className="find-bar__btn"
            onClick={() => onReplace(replaceValue)}
            disabled={matchCount === 0}
            title="Replace (Enter in replace field)"
          >
            <IconReplace />
          </button>
          <button
            className="find-bar__btn find-bar__btn--label"
            onClick={() => onReplaceAll(replaceValue)}
            disabled={matchCount === 0}
            title="Replace All (⇧⌘Enter in replace field)"
          >
            All
          </button>
          {/* Spacer to align with close button above */}
          <div className="find-bar__btn-spacer" />
        </div>
        )}
      </div>
    </div>
  );
};

export default FindBar;
