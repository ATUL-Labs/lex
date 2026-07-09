# Changelog

All notable changes to ctx. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- File preview renders `.md` files as formatted markdown by default (headings, lists,
  checkboxes, code fences, frontmatter chips) using the existing viewer renderer, with a
  `raw`/`rendered` toggle per pane. Clicking an outline symbol switches to raw view and
  jumps to the line. Non-markdown files are unaffected.

### Performance
- Raw code view caps initial render at 5,000 lines; larger files get a
  "show remaining N lines" expander (outline jumps past the cap auto-expand).
  An 18k-line file now builds 5k DOM nodes up front instead of 18k.
- Schema canvas FK-line redraws during card drag are coalesced to one per
  animation frame (pointermove can fire at 120Hz+), with a guaranteed final
  redraw on release - keeps dragging smooth on schemas far larger than 44 tables.

## [0.1.11] - 2026-07-09

### Added
- **Schema fullscreen canvas** - the Schema panel's `expand` button opens a pannable,
  zoomable ERD canvas: drag to pan, wheel to zoom (toward cursor), `+`/`-`/`fit` buttons.
  Tables are auto-laid-out by FK-connectivity clustering; cards are draggable and dragged
  positions persist in localStorage (`reset layout` clears them). FK lines are drawn in
  world coordinates so they stay attached at any zoom level. Filter box dims non-matching
  tables without disturbing the layout.
- **Split-pane file preview** - the file drawer is now pane-based, VS Code style:
  - The file path is a clickable **breadcrumb**; each folder segment drops down a listing
    of that directory (navigable up and down) backed by the new `/api/ls` endpoint.
  - A **"referenced by" strip** shows files that mention the current file (full-text stem
    match; may include false positives, and says so).
  - Any file can be opened **to the side**: the drawer widens and splits into two
    independent panes, each with its own outline, code view, and close button.
- **`run.md` standard knowledge page** - sixth default page scaffolded by `ctx init`
  (alongside stack/mistakes/patterns/design/rules): how to install, boot, test, and access
  the app. Wired into init, INDEX template, context-health, and the using-ctx loading rules
  (setup/boot/test/deploy questions load `run.md`).
- **Local marketplace install** - `.claude-plugin/marketplace.json` so the plugin can be
  installed from a local checkout: `claude plugin marketplace add <path>` then
  `claude plugin install ctx@ctx-local`.
- `/api/ls?dir=` viewer endpoint - immediate subdirectories and files of a directory,
  derived from the existing files index.

### Fixed
- `ctx hook-update` no longer swallows errors silently: index-update and live.json failures
  are written to stderr (visible in hook logs) while stdout remains valid hook JSON.

## [0.1.10] - 2026-07-05

### Added
- Multi-project port fallback for `ctx serve` - if the requested port is busy, tries the
  next one (up to +8), so several projects can each run their own viewer simultaneously.

### Changed
- README rewrite: honest token-savings section (mechanisms stated, benchmark explicitly
  pending), clearer install matrix, acknowledgments.
- All platform manifest versions aligned.

## [0.1.9] - 2026-07-05

### Added
- **`ctx init`** - scaffolds a complete `.ctx/` folder from templates (status, INDEX,
  knowledge pages, sessions dir, gitignore entries) in one command.
- **Live activity indicator** - PostToolUse hook writes `.ctx/live.json`; the viewer shows
  a banner the moment an agent starts writing to the project.
- **DB schema ERD panel** - real tables, columns, and foreign keys extracted from Laravel
  migrations and SQL files into the index, rendered as linked cards in the viewer.

## [0.1.8] - 2026-07-05

### Added
- Viewer v2: markdown rendering for knowledge pages, file preview drawer with symbol
  outline, grouped/filterable API link graph (color-coded by HTTP method), activity
  timeline grouped by date.

## [0.1.7] - 2026-07-05

### Added
- **Live viewer** (`ctx serve`) - local mission-control dashboard: live status, wip task
  list, knowledge pages, full-text search, index statistics. Read-only, localhost-bound.

## [0.1.6] - 2026-07-05

### Added
- Codegraph tier-B: optional integration with codebase-memory-mcp for true call-graphs;
  skills prefer the graph when connected, fall back to `ctx search` then grep.
- Trae platform mapping (rules file template + tool reference).
- `docs/verify.md` - 10-check install verification checklist per platform.

## [0.1.5] - 2026-07-05

### Added
- Design data provider: 8 style catalogs with real CSS recipes, 12 curated palettes,
  10 font pairings, motion recipes, mandatory per-project design identity, and an
  anti-generic gate that blocks template-looking UI.

## [0.1.4] - 2026-07-05

### Added
- Distilled docs cache (`~/.ctx/docs/`): global, self-building, version-verified API
  cheatsheets shared across all projects on the machine; searchable via `ctx docs <term>`.

## [0.1.3] - 2026-07-05

### Added
- **ctx-index** - self-maintaining SQLite structural memory: `ctx search` (full-text with
  snippets), `ctx symbols` (file outline without reading the file), `ctx links` (API
  route-to-frontend consumer graph). Auto-updated by a PostToolUse hook on Claude Code,
  lazily refreshed everywhere else.

## [0.1.2] - 2026-07-05

### Added
- **Continuity engine** - three-layer state protection: step-cadence `wip.md` checkpoints,
  deliberate flush at ~80% context pressure, PreCompact/SessionStart hooks. Sessions
  survive compaction, crashes, and handoffs to a different agent.

### Changed
- Hardened all skills: tightened triggers, added platform tool-mapping references.

## [0.1.0] - 2026-06-29

### Added
- Initial release: universal coding companion for cross-agent work.
- `.ctx/` project memory protocol: `status.md`, `INDEX.md`, `wip.md`, `audit.log`,
  knowledge pages (stack/mistakes/patterns/design/rules), session summaries.
- Reasoning skills: using-ctx (bootstrap), brainstorming, planning, executing, tdd,
  debugging, verification, code-review, efficient-code, subagent-dispatch,
  finishing-branch, context-health.
- Multi-platform delivery: Claude Code, Codex, Cursor, Windsurf, Copilot, Gemini CLI,
  Antigravity, Kimi manifests + session-start hooks.
