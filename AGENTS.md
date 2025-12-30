# Repository Guidelines

## Project Structure & Module Organization
RESTY pairs a Vite/React front end with a Rust/Tauri shell. Front-end logic lives under `src/`, with `components/` housing timers, reminders, and analytics widgets, `pages/` providing route-level screens, `store/` exposing Zustand state, `utils/` wrapping IPC and timing helpers, and `i18n/` managing locale bootstrap. Desktop code resides in `src-tauri/src/` split into command handlers and services; `tauri.conf.json` captures bundling targets and `icons/` holds platform assets. Shared translation files live in `public/locales/`, while build products drop into `dist/` (web) and `AppDir/` (desktop installers).

## Build, Test & Development Commands
`pnpm install` bootstraps dependencies; prefer pnpm to keep the lockfile in sync. `pnpm run dev` launches the web preview on `http://127.0.0.1:13000/`. `pnpm build` followed by `pnpm preview` validates production output. Desktop flows use `pnpm tauri dev` for hot reload and `pnpm tauri build` for release bundles. Rust back-end edits must be checked with `cargo check` inside `src-tauri`; add `cargo test` modules for new logic and run them locally.

## Coding Style & Naming Conventions
TypeScript sticks to two-space indentation, `PascalCase` component files, `camelCase` hooks/utilities, and `kebab-case` CSS filenames such as `Dashboard.css`. Collocate translations under `i18n` keys and avoid hard-coded copy. React code favors pure components with hooks declared at top scope. Rust modules target edition 2021, lean on `anyhow::Result` for error propagation, and keep command names snake_case to match Tauri IPC conventions.

## Testing Guidelines
There is no formal automated suite yet, so cover changes with manual smoke tests: timer lifecycle, reminder overlays, language switching, and configuration persistence. When adding Rust logic, accompany it with focused `#[cfg(test)]` modules and run `cargo test`. For UI-heavy changes, record reproducible steps and note any new data seeds. Desktop features should be exercised once with `pnpm tauri dev` to confirm system integrations.

## Commit Workflow
Existing history favors concise action-first messages (e.g., `优化 计时器`, `修复 tray 状态`); keep summaries under 50 characters and reference scope when helpful. Every task should conclude with a local commit instead of opening a PR. Use the commit body to capture motivation, test evidence (commands run, platforms checked), linked issues or tasks, and note any breaking changes, migration steps, or new environment variables.

## Agent-Specific Checklist
- Before modifying any code, use context7 to obtain the latest documentation and specifications to ensure compliance with the latest requirements.
- After modifying any Rust code, run `cargo check` in `src-tauri` before submitting.
- Confirm both `pnpm build` and `pnpm tauri build` succeed when touching shared code paths.
- Upon completing a task, stage all touched files and create a Git commit with a brief, action-focused title covering the work.
