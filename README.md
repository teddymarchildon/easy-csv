# Easy CSV

Easy CSV is a macOS-focused Electron app that delivers a fast, lightweight CSV editing experience with a virtualized grid, keyboard-first editing, and native-feeling menus.

## Scripts

- `npm run dev` – start Electron + Vite in watch mode.
- `npm run build` – bundle the main/preload/renderer code for production.
- `npm run preview` – preview the production build.
- `npm run lint` – run ESLint across the project.
- `npm run check-types` – perform a full TypeScript type check.

## Tech Stack

- Electron 30 with `electron-vite` for dev/build orchestration.
- React 18 + Zustand for the renderer.
- PapaParse in a Node worker for CSV parsing and serialization.
- Electron Store for recents/preferences and Electron Log for diagnostics.

## Next Steps

- Wire up richer diff previews before saving.
- Expand validation rules and typed columns.
- Add unit tests covering the CSV worker and state store.

