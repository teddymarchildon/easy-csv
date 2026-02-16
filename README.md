# Easy CSV

**A simple, fast macOS CSV editor for people who work with data every day.**

CSV files are everywhere — exports from databases, analytics platforms, CRMs, financial systems — yet the tools for editing them range from sluggish (Excel) to hostile (Numbers). Easy CSV fills the gap: a purpose-built desktop app that opens instantly, handles large files without freezing, and feels like it belongs on your Mac.

---

## The Problem

Anyone who works with CSVs regularly knows the pain:

- **Excel is overkill.** Opening a CSV in Excel means slow startup, formula misinterpretation, and the constant risk of silent data corruption (dates, leading zeros, long numbers).
- **Text editors are too raw.** Vim or VS Code show you the text, but navigating and editing a 50-column file as raw comma-delimited text is error-prone and tedious.
- **Web tools require upload.** Cloud-based editors introduce privacy concerns and network dependency for files that should stay local.

The market lacks a lightweight, privacy-respecting, keyboard-driven CSV editor that treats the format as a first-class citizen.

## The Solution

Easy CSV is a native macOS desktop application designed for a single job: making CSV editing fast, reliable, and pleasant. No account required. No cloud uploads. Your data never leaves your machine.

### Core Design Principles

1. **Speed over features.** The app opens in under a second. Large files parse in a background thread so the UI never locks. Virtual scrolling renders only visible rows, keeping memory usage flat regardless of file size.

2. **Keyboard-first, mouse-friendly.** Every action is reachable via keyboard shortcuts. Arrow keys navigate cells, Enter edits in place, Cmd+K opens a command palette. But nothing requires memorization — every action is also available through menus and toolbars.

3. **Data integrity by default.** Easy CSV reads and writes plain text. No proprietary formats, no formula evaluation, no silent type coercion. What you see is exactly what gets saved.

4. **Native Mac experience.** Hidden titlebar with inset traffic lights, system theme integration, standard macOS menu bar, and familiar shortcuts (Cmd+S, Cmd+Z, Cmd+W). It feels like it shipped with the OS.

---

## Features

### Multi-Tab Editing
Open multiple CSV files simultaneously with full state isolation per tab. Each tab tracks its own undo history, filter state, and unsaved changes independently. Switch between files with Cmd+Option+Arrow or click the tab bar.

### Undo/Redo with Smart Coalescing
A 50-level undo stack captures every edit with descriptive labels ("Edit cell", "Delete row", "Paste"). Rapid keystrokes within a 2-second window are coalesced into a single entry, so undoing a burst of typing reverts the whole burst — not character by character.

### Find and Replace
Cmd+F opens an inline find bar that searches across headers and cell values. Navigate matches with arrow buttons or Enter, replace individually or all at once. The current match is highlighted in the grid for spatial context.

### Per-Column Filtering
Click any column header to apply a substring filter. Multiple filters combine with AND logic, letting you drill into exactly the rows you need. Filtered views can be exported as new CSV files (Shift+Cmd+E), preserving only the rows you care about.

### Command Palette
Cmd+K opens a searchable command palette — type to fuzzy-filter any available action. Grouped by section, with keyboard shortcut hints inline. Designed for power users who want to stay in flow without reaching for the mouse.

### Drag-and-Drop
Drop a `.csv` file onto the window to open it immediately. No dialog, no friction.

### Recent Files Sidebar
Cmd+B toggles a resizable sidebar showing your 15 most recently opened files. One click to reopen, with a remove option to keep the list tidy.

### Column Resizing
Drag column borders to resize. Double-click a border to auto-fit the column to its content. A dynamic row-number gutter keeps data aligned.

### Theme Support
Light, Dark, or System — persisted across sessions. Follows macOS appearance changes in real time when set to System.

---

## Architecture

The architecture is driven by two non-negotiable requirements: **UI responsiveness** and **data safety**.

```
┌──────────────────────────────────────────────────────┐
│                   Electron Shell                      │
│                                                      │
│  ┌─────────────┐  IPC (contextBridge)  ┌───────────┐│
│  │ Main Process │◄────────────────────►│  Renderer  ││
│  │              │                      │  (React)   ││
│  │  File I/O    │                      │            ││
│  │  Native Menu │                      │  Zustand   ││
│  │  Settings    │                      │  Virtual   ││
│  │  Recent Files│                      │  Grid      ││
│  └──────┬───────┘                      └────────────┘│
│         │                                            │
│  ┌──────▼───────┐                                    │
│  │ Worker Thread │                                   │
│  │  (PapaParse)  │                                   │
│  └───────────────┘                                   │
└──────────────────────────────────────────────────────┘
```

### Why This Architecture

- **Worker thread for CSV parsing.** Parsing is CPU-bound. Running PapaParse in a dedicated Node.js worker thread keeps the main process responsive and the renderer buttery smooth, even for multi-megabyte files. Progress events stream back to the UI in real time.

- **Zustand for state.** Lightweight, minimal boilerplate, and pairs naturally with React's rendering model. Shallow selectors prevent unnecessary re-renders — critical when the grid contains thousands of cells. The store encapsulates undo/redo stacks, tab snapshots, and filter state in a single coherent model.

- **TanStack Virtual for the grid.** Only rows visible in the viewport are rendered to the DOM. This makes scroll performance independent of file size — a 100-row file and a 100,000-row file feel identical.

- **Electron with context isolation.** Node integration is disabled in the renderer. All file system access goes through a typed IPC bridge (`contextBridge`), enforcing a clean security boundary. The sandbox is enabled.

### Key Technical Decisions

| Decision | Rationale |
|---|---|
| Electron over Tauri | Mature ecosystem, predictable Node.js worker model, reliable macOS integration |
| PapaParse over manual parsing | Battle-tested RFC 4180 compliance, handles edge cases (quoted fields, newlines in values) |
| Zustand over Redux | Less ceremony for a single-app store; built-in shallow equality for performance |
| Virtual scrolling over pagination | Preserves spatial context; users can scroll freely without cognitive load of page numbers |
| Local storage over SQLite | Settings and recents are simple key-value data; electron-store is zero-config JSON persistence |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron 30 |
| Build system | electron-vite + Vite 5 |
| UI framework | React 18 |
| State management | Zustand 5 |
| Table utilities | TanStack Table + TanStack Virtual |
| CSV engine | PapaParse (in Node.js worker thread) |
| Validation | Zod |
| Persistence | electron-store |
| Language | TypeScript 5.6 (strict) |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start in development mode (hot-reload)
npm run dev

# Build for production
npm run build

# Preview the production build
npm run preview
```

### Other Scripts

```bash
npm run lint          # ESLint across all source files
npm run check-types   # Full TypeScript type check (no emit)
```

---

## Project Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # Window creation, IPC handlers
│   ├── menu.ts              # Native macOS menu bar
│   ├── settingsStore.ts     # Theme preferences (electron-store)
│   ├── recentFiles.ts       # Recent file tracking
│   └── services/
│       ├── fileManager.ts   # File I/O orchestration
│       ├── csvWorker.ts     # Worker thread lifecycle
│       └── csvWorkerScript.ts  # PapaParse worker
├── preload/                 # Secure IPC bridge (contextBridge)
├── renderer/                # React application
│   ├── App.tsx
│   ├── state/gridStore.ts   # Zustand store (undo, tabs, filters)
│   ├── hooks/               # File operation hooks
│   └── components/
│       ├── DataGrid.tsx     # Virtualized spreadsheet grid
│       ├── Toolbar.tsx      # File actions, undo/redo
│       ├── TabBar.tsx       # Multi-tab navigation
│       ├── FindBar.tsx      # Search and replace
│       ├── CommandPalette.tsx  # Cmd+K launcher
│       ├── SettingsDialog.tsx  # Theme selection
│       ├── RecentFilesPanel.tsx # Sidebar
│       └── StatusBar.tsx    # Row/column count, progress
└── shared/types.ts          # Shared TypeScript types
```

---

## Roadmap

The foundation is solid — what follows is guided by real usage patterns and user feedback:

- **Diff preview before save.** Show a visual summary of what changed since the last save, giving users confidence before committing edits to disk.
- **Typed columns and validation.** Let users declare column types (date, number, email) and surface validation errors inline — catching bad data before it propagates downstream.
- **Test coverage.** Unit tests for the CSV worker (parsing edge cases) and the Zustand store (undo/redo, tab lifecycle, filter logic).
- **Export formats.** Save as TSV, JSON, or fixed-width — broadening the utility without losing the CSV-first identity.
- **Custom delimiters.** Auto-detect and support semicolons, pipes, and tabs as field separators.

---

## Security Model

Easy CSV follows Electron security best practices:

- **Context isolation** enabled — renderer code cannot access Node.js APIs directly.
- **Node integration** disabled in the renderer process.
- **Sandbox** enabled — OS-level process isolation.
- **No remote content** — the app loads only local files; no network requests, no telemetry, no analytics.
- All file operations flow through a **typed IPC bridge**, making the attack surface explicit and auditable.

---

## License

Private — not currently published.
