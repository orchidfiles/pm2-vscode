# PM2 VS Code: Agent Guidelines

This VS Code extension adds a PM2 process tree to the Explorer panel, with actions to start, stop, restart, and view logs.

## Scope

The project handles extension UI and commands only. It does not manage PM2 configuration, ecosystem files, or deployment. All interaction with PM2 goes through its external CLI binary, without a dependency on the PM2 Node.js API.

## Implementation Principles

- Build with `tsup` into `dist/extension.js` (`vscode` external; bundle app code and `lodash`). `pnpm package` uses `vsce package --no-dependencies`, so the VSIX relies on that bundle.
- Keep `extensionKind: ["ui"]`. The extension is intended for local use, not Remote SSH.
- Per-process start, stop, and restart: optimistic status in the tree, poll PM2 until settled, revert the optimistic row on error. Bulk actions (`startAll`, `stopAll`, `restartAll`) re-fetch from PM2 without per-process optimistic state.
- Run all PM2 commands through `execFileAsync('pm2', [...])`, never through shell string interpolation.
- Target processes by their numeric `pm_id`, never by name, because process names are not unique.
- Keep tree items as stateless value objects. All state belongs in `Pm2Provider`.
- Use TypeScript strict mode, avoid unsafe casts, and validate external data before assigning types.
- Keep the status type as `Pm2Status | string`. Map known statuses to the enum and pass unknown PM2 statuses through unchanged.
- Auto-refresh uses `pm2.processesRefreshInterval` and `pm2.metricsRefreshInterval` (seconds; `0` disables that timer). Defaults and setting keys are in `PM2_REFRESH_INTERVALS` (`constants.ts`); behavior is implemented in `pm2-provider.ts` (`applyFetched`, frozen metrics when metrics auto-refresh is off).

## Repository Structure

- `src/`: extension source.
- `tsup.config.ts`: bundle entry and output for production.
- `tests/`: Vitest unit tests. Mock the VS Code API with `vi.mock`; tests do not require a VS Code runtime.

## File Responsibilities

Each file has a single responsibility. Do not put functions in constants, constants in utils, or logic in types or enums.

- `constants.ts`: constants and lookup structures only.
- `utils.ts`: shared helpers (PM2 list parsing, refresh interval reading, errors, `execFileAsync`, shell quoting).
- `types.ts`: interfaces and type aliases.
- `enums.ts`: enums.
- `extension.ts`: activation and command registration.
- `pm2-provider.ts`: tree data provider, PM2 CLI, polling, refresh timers, optimistic overrides, display metrics.
- `pm2-item.ts`: tree row presentation and `contextValue` for action menus.

## Working with the Codebase

- Prefer editing existing files. The codebase is intentionally small, so avoid adding abstractions.
- When changing polling logic in `pm2-provider.ts`, account for concurrent polls and abort flags.
- Keep `contributes.menus` in `package.json` synchronized with the switch cases in `Pm2Item`. Menu entries control which buttons appear for each `contextValue`.
