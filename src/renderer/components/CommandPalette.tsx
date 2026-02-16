import { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  section?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  onSelect: (id: string) => void;
}

const CommandPalette = ({ open, onClose, actions, onSelect }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter actions by substring match on label
  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const lower = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(lower));
  }, [actions, query]);

  // Group filtered actions by section
  const grouped = useMemo(() => {
    const groups: { section: string; items: CommandAction[] }[] = [];
    const sectionMap = new Map<string, CommandAction[]>();

    for (const action of filtered) {
      const section = action.section ?? '';
      if (!sectionMap.has(section)) {
        sectionMap.set(section, []);
      }
      sectionMap.get(section)!.push(action);
    }

    for (const [section, items] of sectionMap) {
      groups.push({ section, items });
    }

    return groups;
  }, [filtered]);

  // Build a flat list for keyboard navigation indexing
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Reset state when opened/closed
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightIndex(0);
      // Focus the input on next frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp highlight index when filtered list changes
  useEffect(() => {
    setHighlightIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-cmd-item]');
    const target = items[highlightIndex] as HTMLElement | undefined;
    target?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  const execute = (id: string) => {
    onClose();
    onSelect(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[highlightIndex];
      if (item) execute(item.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  let itemIndex = 0;

  return (
    <div className="cmd-palette-backdrop" onMouseDown={onClose}>
      <div
        className="cmd-palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className="cmd-palette__input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightIndex(0);
          }}
        />

        <div className="cmd-palette__list" ref={listRef}>
          {flatItems.length === 0 && (
            <div className="cmd-palette__empty">No matching commands</div>
          )}
          {grouped.map((group) => (
            <div key={group.section}>
              {group.section && (
                <div className="cmd-palette__section">{group.section}</div>
              )}
              {group.items.map((action) => {
                const idx = itemIndex++;
                const isHighlighted = idx === highlightIndex;
                return (
                  <button
                    key={action.id}
                    data-cmd-item
                    className={`cmd-palette__item${isHighlighted ? ' cmd-palette__item--active' : ''}`}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => execute(action.id)}
                  >
                    <span className="cmd-palette__item-label">{action.label}</span>
                    {action.shortcut && (
                      <span className="cmd-palette__shortcut">{action.shortcut}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
