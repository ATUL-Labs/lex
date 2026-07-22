# Changelog

All notable changes to lex. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.25] - 2026-07-22 — LTS

### Added
- **Live DB introspection** — `queryDbSchema()` in `db-connector.js` connects to the
  actual running database and introspects real schema. Supports SQLite (`PRAGMA table_info`,
  `PRAGMA foreign_key_list`, `PRAGMA index_list`), MySQL (`information_schema.COLUMNS`,
  `KEY_COLUMN_USAGE`), and PostgreSQL (`information_schema`, `pg_index`, `pg_enum`).
  Returns tables with columns including PK, FK, unique, nullable, default, index, enum values.
- **`/api/db-schema` endpoint** — serves live DB schema to the viewer. Returns
  `{connected, type, tables}` or `{connected: false, error}`.
- **Migrations / Live DB toggle** — viewer schema panel has a toggle switch between
  migration-parsed schema and live database schema. Both use the same card rendering
  with PK/UQ/IDX badges, nullable indicators, defaults, enum types, FK arrows.
- **Rich schema metadata in extraction** — `extract.js` now captures `isPk`, `isUnique`,
  `isNullable`, `isIndex`, `defaultVal`, `enumValues` for both PHP migrations and SQL files.
  PHP: detects `$table->id()`, `->primary()`, `->unique()`, `->index()`, `->nullable()`,
  `->default()`, `->enum()`, `->autoIncrement()`. SQL: detects `PRIMARY KEY`, `UNIQUE`,
  `NOT NULL`, `DEFAULT`, `INDEX`, `ENUM()`, `AUTOINCREMENT`/`AUTO_INCREMENT`.
- **Schema column migration** — `indexer.js` auto-migrates existing `schema_columns` table
  via `ALTER TABLE ADD COLUMN` for all new fields. No data loss on upgrade.
- **Project config system** — `.lex/config.json` as single source of truth for language,
  framework, database, commands, paths, skip_dirs, schema_formats. Auto-detected by
  `lex config --detect`. Read by `lex check`, `db-connector.js`, `indexer.js`.
- **`lex config` CLI** — `lex config` (print), `lex config --detect` (refresh),
  `lex config --set key value` (manual override).
- **`lex skills evolve`** — auto-generates skills from session patterns (3+ occurrences).
  Auto-skills go to `.lex/skills/` with `auto-generated: true`, max 5 per project.
- **`lex skills review`** — review and approve auto-generated skills.
- **Gateway: `config` and `skills` commands** — agents can manage project config and
  skill evolution via gateway (zero approval).
- **DB status badge in viewer** — shows live database connection status with type
  (sqlite/mysql/postgres) and location. Green=connected, amber=configured, grey=no-db.
- **`GATEWAY-REF.md`** — on-demand reference for gateway command table, patch modes,
  and examples. Loaded only when agent needs to construct gateway requests.
- **`npm update -g @atul-labs/lex`** — documented in README Quick Start.

### Changed
- **AGENTS.md optimized** — 61% token reduction (4,280 → 1,670 tokens). Gateway command
  table moved to `GATEWAY-REF.md`. Proactive Memory, post-build verification, search,
  and design sections compressed without losing enforcement.
- **`/api/schema` endpoint** — now returns `isPk`, `isUnique`, `isNullable`, `isIndex`,
  `defaultVal`, `enumValues` in column data.
- **`renderSchemaCard`** — renders PK/UQ/IDX badges, nullable indicators, default values,
  enum types in both inline panel and fullscreen canvas.
- **`detectDbConfig`** — reads from `.lex/config.json` first, falls back to `.env`.
  Returns `null` if no valid database configured (no more default `database.sqlite`).

### Fixed
- **Stale MySQL config** — `lex config --detect` no longer falsely detects MySQL for
  non-Laravel projects. Returns `database: null` when no DB is present.
- **`lex check`** — now verifies `config.json` existence and auto-detects/creates it
  if missing.

### LTS
- Long-term support release. Stable API, no breaking changes until 0.2.

## [0.1.24] - 2026-07-21

### Added
- **API security scanner** — `lex test <url> [method]` sends HTTP requests and runs
  security scan: missing headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options,
  X-XSS-Protection, Referrer-Policy, Permissions-Policy), SQL error signatures,
  information disclosure (stack traces, framework leaks, debug mode, X-Powered-By),
  XSS reflection detection. `--xss` flag for dedicated XSS scan.
- **Dev loop** — `lex devloop` tests all indexed endpoints with smart categorization:
  `pass` (200-299), `auth-required` (302→/login, 401, 403, 419), `redirect`,
  `not-found` (404), `method-not-allowed` (405), `server-error` (500+),
  `connection-error` (ECONNREFUSED). Saves report to `.lex/devloop.json`.
- **Diff mode** — `lex devloop --diff` compares current run to previous, shows
  changed/new/removed endpoints and error/finding deltas.
- **Auth support** — `lex devloop --cookie="session=..."` and `--token="Bearer ..."`
  pass authentication to test protected routes.
- **Auto port detection** — reads `.lex/agent.json`, `.lex/pages/run.md`, `.env`,
  `docker-compose.yml`, and source code to find app's actual port. Probes both
  IPv4 (127.0.0.1) and IPv6 ([::1]) localhost.
- **App server status indicator** — viewer shows live green/red status for the
  detected app server. Polls every 10 seconds.
- **API tester in viewer UI** — send requests, get security scan results with
  severity-categorized findings. URL auto-populates from detected app URL.
- **Dev loop in viewer UI** — one-click test all endpoints with categorized results.
- **Gateway expansion** — added `test`, `devloop`, `convert`, `integrity`, `chain`, `task`
  commands. Total: 30+ gateway commands.
- **Image converter** — `lex convert <input> <output>` converts SVG to PNG, WebP, or ICO
  using headless Chrome CDP rendering. PNG to ICO also supported. Multi-size ICO
  (`--multi`) generates 16, 32, 48, 64, 128, 256px in one file. Pure JS ICO encoder.
  Zero dependencies.

### Fixed
- **SQL injection false positives** — security scan now operates on truncated body
  (50K) instead of full response body (800K+). Tightened SQL error signature regex
  to require error context, not just "MySQL" alone.
- **HSTS on HTTP** — `Missing strict-transport-security header` finding is now
  suppressed on HTTP dev servers (only flagged on HTTPS).
- **Smart pass/fail** — 302 redirects to `/login` classified as `auth-required`
  (OK) instead of `fail`. 401/403/419 also classified as `auth-required`.
- **Actionable summary** — dev loop reports "5 OK, 55 require auth, 0 errors"
  instead of "5 passed, 95 failed".

## [0.1.23] - 2026-07-15

### Fixed
- **`.env` parsing on Windows** - `\r\n` line endings caused `DB_DATABASE` and
  other env vars to not be parsed, breaking schema data viewer on Windows.

## [0.1.22] - 2026-07-15

### Added
- **8 new skills** - api-design, performance, refactoring, git-workflow,
  error-handling, logging, caching, accessibility. Total: 24 skills.
- **Schema data viewer** - "View Data" button on every schema card in the viewer.
  Opens a modal with paginated table data (10 rows per page, prev/next buttons).
  Supports SQLite (built-in), MySQL (via mysql CLI), and PostgreSQL (via psql CLI).
  Auto-detects DB config from `.env` file.
- **`lex run <command>`** - wraps app execution, captures stderr, detects errors,
  and reports them to the lex server. Works with any command (npm test, php artisan
  serve, python manage.py runserver, etc.).
- **App errors endpoint** - `/api/app-errors` (GET/POST) for storing and retrieving
  application errors. `lex errors` now shows both console errors AND app errors.
- **Gateway `errors` command** - updated to fetch both console and app errors.

## [0.1.21] - 2026-07-15

### Fixed
- **SQL files now indexed automatically** - `.sql` was missing from `TEXT_EXT`,
  so SQL files were never indexed despite having `extractSchemaSql` ready.
  Now `.sql`, `.html`, `.json`, `.xml`, `.toml`, `.ini`, `.txt`, `.env`,
  `.rb`, `.go`, `.rs`, `.java`, `.c`, `.h`, `.cpp`, `.cs`, `.graphql`, `.prisma`,
  `.svelte`, `.astro`, `.twig`, `.ejs`, `.hbs`, `.pug`, and many more are indexed.
- **Watcher import bug fixed** - `watcher.js` imported `updateFile` from
  `./extract` but it's exported from `./indexer`. The watcher was silently
  failing, never updating files on change. Now fixed.

### Added
- **`lex memory <terms>`** - searches only `.lex/pages/` knowledge files
  (mistakes, patterns, design, rules, run, stack). Powered by FTS5 full-text
  search. Also available via gateway: `{"cmd":"memory","args":["ValidationError"]}`.

## [0.1.20] - 2026-07-14

### Changed
- **Everything inside `.lex/`** - `lex init` now copies skills to `.lex/skills/`
  and agent files (AGENTS.md, CLAUDE.md, GEMINI.md, ANTIGRAVITY.md) to `.lex/`.
  Project root stays clean - only `.lex/` and `.gitignore` are added.
- **All path references updated** - AGENTS.md, CLAUDE.md, BOOTSTRAP.md, SKILL.md,
  GEMINI.md, ANTIGRAVITY.md, and session-start hook now reference `.lex/skills/`
  instead of `skills/`.
- **CLI commands use `lex` not `node bin/lex.js`** - all instruction files now
  use the `lex` command directly since it's installed globally.

## [0.1.19] - 2026-07-14

### Added
- **`lex update`** - self-update via npm. Runs `npm install -g @atul-labs/lex@latest`
  and reports the new version. Works from any directory (no `.lex/` required).

## [0.1.18] - 2026-07-14

### Added
- **`lex --version` / `lex -v`** - prints version number from package.json.

## [0.1.17] - 2026-07-14

### Added
- **`lex init` copies skills/ into each project** - all 56 skill files (160 KB)
  are copied so agents can read `skills/<name>/SKILL.md` directly from the project.
  Skills are only copied if `skills/` doesn't already exist (non-destructive).

## [0.1.16] - 2026-07-14

### Added
- **`lex init` copies agent instruction files** - AGENTS.md, CLAUDE.md, GEMINI.md,
  ANTIGRAVITY.md are now copied into each project so agents discover lex automatically.
- **Global install support for pre-commit hook** - hook now falls back to
  `require.resolve('@atul-labs/lex/bin/lex.js')` and the global install path,
  not just local `find` in the project.
- **`isGlobalInstall()` helper** - detects if lex is running from a global npm install
  and shows `lex serve` instead of the full path in init output.

## [0.1.15] - 2026-07-14

### Added
- **Browser audit with crawling** - `lex audit` now crawls all internal links
  by default (BFS, depth 2, max 30 pages). Extracts `<a href>` links from each
  page via CDP and visits them all in a single browser tab for cookie persistence.
- **Login automation** - `.lex/audit.json` config supports login before crawling:
  URL, form field selectors/values, submit selector. Lex logs in first, then
  crawls authenticated pages with the session cookie.
- **CLI crawl flags** - `--no-crawl`, `--depth=N`, `--max-pages=N` for controlling
  crawl behavior from the command line.
- **Port probing** - CDP debugging port now probes 4747-4755 for availability
  instead of hardcoding, avoiding conflicts with stale processes.

### Changed
- **Single-tab crawl session** - entire crawl uses one browser tab so login
  cookies persist across all pages. Previously each URL got a new tab.
- **Browser target creation** - switched from deprecated `/json/new` HTTP endpoint
  to `Target.createTarget` via browser-level WebSocket (Chrome 150+ compatible).
- **WebSocket event handling** - migrated from Node EventEmitter API to standard
  `addEventListener`/`removeEventListener` for Node 22 built-in `WebSocket`.
- **Test badge** - updated to 97 tests passing.

### Fixed
- `targets.find is not a function` - Chrome's `/json/list` can return non-array
  responses; added `Array.isArray` guard.
- `ws.on is not a function` - Node 22 built-in `WebSocket` doesn't extend
  `EventEmitter`; all event handlers updated to standard DOM API.
- Port conflicts when 4748 was occupied by stale processes; now probes for
  available port before launching browser.

## [0.1.14] - 2026-07-13

### Added
- **Gateway `errors` command** - fetches browser console errors from a running
  `lex serve` instance via the gateway. Agents can now see console errors
  without `run_command` or `read_url_content`.
- **Gateway `links` command** - queries route/consumer relationships from the
  index. With no args returns all links, with a URL arg filters by exact or
  prefix match.
- **Gateway `delete` command** - safe delete via `fileops.rm()`, moves files
  to `.lex/trash/` with timestamp prefix.
- **Three gateway input formats** - agents can now use:
  1. Empty file (filename = command, 21% less overhead)
  2. Plain text (`cmd arg1 arg2` or `cmd|arg1|arg2`, 17% less overhead)
  3. JSON (backward compatible)
- **Gateway token tracking** - gateway commands now appear in `lex tokens`
  output, tracked as both writes and injections.

### Changed
- **Renamed `gateway.process()` to `gateway.processRequest()`** - eliminates
  shadowing of the global `process` object, which caused `process.execPath`
  to be `undefined` inside the function.
- **Diff memory optimization** - `diff` command now loads FTS content only
  for modified files instead of all indexed files. ~21x less memory on a
  106-file project.
- **Updated AGENTS.md** - documented all 3 input formats and added `links`
  and `delete` to the command table.
- **Updated README.md** - added Gateway section with feature comparison table,
  updated test badge to 83 tests.

### Fixed
- `links` command was documented in gateway header but never implemented.
- `delete` command was listed in available commands but never implemented.
- Gateway header comment was stale (missing `errors`, `diff`, input formats).

## [0.1.13] - 2026-07-10

### Changed
- **Renamed ctx to lex** - the codebase is law. Full rename: `ctx` -> `lex`,
  `.ctx/` -> `.lex/`, `CTX_DOCS_DIR` -> `LEX_DOCS_DIR`, `bin/ctx.js` ->
  `bin/lex.js`, `skills/using-ctx/` -> `skills/using-lex/`. All CLI commands
  now use `lex` (e.g. `lex init`, `lex guard`, `lex serve`).

### Added
- **lex guard command** - enforcement mechanism that scans the codebase for
  violations of lex rules. Detects exposed secrets (OpenAI keys, AWS keys,
  GitHub tokens, Slack tokens, Google API keys, JWTs, connection strings with
  embedded credentials, hardcoded passwords/API keys/secrets) as CRITICAL
  findings (exit code 1), and database anti-patterns (1-to-1 profile tables,
  settings tables, EAV pattern) as IMPORTANT findings. Run before every commit.
- **Security skill** - always-active stance (like efficient-code) that prevents
  secrets from entering code, commits, logs, or output. Hard gate: no API key,
  password, token, or connection string may be written inline. `lex init` now
  auto-adds `.env`, `.env.*`, and `!.env.example` to `.gitignore`. Code review
  skill updated with mandatory secret scanning (pattern-based) as a CRITICAL
  check before any merge.
- **Database architecture skill** - wide-table, denormalize-first philosophy.
  Prevents the common AI pattern of creating many small tables connected by
  foreign keys. Rules: no 1-to-1 tables, no tables for bounded 1-to-few
  relationships, no EAV (use JSON columns), denormalize fields read together.
  Activates when creating migrations or designing schemas. Code review skill
  updated with database design checks.
- **Stack overlays** - five overlay packs (PHP, Rust, Python, TypeScript, Go)
  for debugging, TDD, code-review, and efficient-code skills. Each overlay adds
  stack-specific tools, bug catalogs, test patterns, and review checks (~30-50
  lines) loaded on-demand alongside the core SKILL.md. `lex init` auto-detects
  the project's language and framework from manifest files (composer.json,
  Cargo.toml, pyproject.toml, requirements.txt, go.mod, package.json) and
  writes the overlay key into `stack.md`. The using-lex protocol tells agents
  to load the matching overlay when invoking any skill that has one.
- **Viewer dark/light theme** - moon/sun toggle in the header switches between
  the existing dark palette and a new light palette with proper contrast. Theme
  choice persists in `localStorage`. All hardcoded accent colors replaced with
  CSS variables (`--accent-rgb`, `--accent-2-rgb`) so both themes propagate
  across every component including SVG schema lines.
- **Viewer collapsible panels** - each panel (Now, Codebase, Graph, Schema,
  Memory) has a collapse button to shrink to its title bar. A **View** dropdown
  in the header shows/hides any panel entirely. Layout uses
  `grid-auto-flow: row dense` so visible panels reflow to fill gaps. Panel
  state persists in `localStorage`.

## [0.1.12] - 2026-07-09

### Added
- **Schema canvas focus mode** - click a table to spotlight it: the table, its FK
  neighbors, and their connecting lines stay lit while everything else dims. Click
  another table to move focus, click empty canvas (or the same table) to clear.
  Dragging is unaffected (sub-5px pointer movement counts as a click).
- **Stack-matched MCP suggestions** - new `/api/mcps` endpoint scans project manifests
  (package.json, composer.json, requirements.txt, pyproject.toml, go.mod, Dockerfile,
  CI workflows) two levels deep and maps detected tech to specific MCP servers
  (Laravel → laravel-boost, Postgres → Postgres MCP, Snowflake → Snowflake MCP, ...).
  Shown as chips in the viewer's Codebase panel; the using-lex skill now tells agents
  to prefer the stack-matching MCP over generic shell probing ("tool focus"), and to
  infer suggestions themselves when the static map misses.
- MCP suggestions already configured in the project `.mcp.json` or `~/.claude.json`
  are hidden - only genuinely missing servers are suggested.
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
- **`run.md` standard knowledge page** - sixth default page scaffolded by `lex init`
  (alongside stack/mistakes/patterns/design/rules): how to install, boot, test, and access
  the app. Wired into init, INDEX template, context-health, and the using-lex loading rules
  (setup/boot/test/deploy questions load `run.md`).
- **Local marketplace install** - `.claude-plugin/marketplace.json` so the plugin can be
  installed from a local checkout: `claude plugin marketplace add <path>` then
  `claude plugin install lex@lex-local`.
- `/api/ls?dir=` viewer endpoint - immediate subdirectories and files of a directory,
  derived from the existing files index.

### Fixed
- `lex hook-update` no longer swallows errors silently: index-update and live.json failures
  are written to stderr (visible in hook logs) while stdout remains valid hook JSON.

## [0.1.10] - 2026-07-05

### Added
- Multi-project port fallback for `lex serve` - if the requested port is busy, tries the
  next one (up to +8), so several projects can each run their own viewer simultaneously.

### Changed
- README rewrite: honest token-savings section (mechanisms stated, benchmark explicitly
  pending), clearer install matrix, acknowledgments.
- All platform manifest versions aligned.

## [0.1.9] - 2026-07-05

### Added
- **`lex init`** - scaffolds a complete `.lex/` folder from templates (status, INDEX,
  knowledge pages, sessions dir, gitignore entries) in one command.
- **Live activity indicator** - PostToolUse hook writes `.lex/live.json`; the viewer shows
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
- **Live viewer** (`lex serve`) - local mission-control dashboard: live status, wip task
  list, knowledge pages, full-text search, index statistics. Read-only, localhost-bound.

## [0.1.6] - 2026-07-05

### Added
- Codegraph tier-B: optional integration with codebase-memory-mcp for true call-graphs;
  skills prefer the graph when connected, fall back to `lex search` then grep.
- Trae platform mapping (rules file template + tool reference).
- `docs/verify.md` - 10-check install verification checklist per platform.

## [0.1.5] - 2026-07-05

### Added
- Design data provider: 8 style catalogs with real CSS recipes, 12 curated palettes,
  10 font pairings, motion recipes, mandatory per-project design identity, and an
  anti-generic gate that blocks template-looking UI.

## [0.1.4] - 2026-07-05

### Added
- Distilled docs cache (`~/.lex/docs/`): global, self-building, version-verified API
  cheatsheets shared across all projects on the machine; searchable via `lex docs <term>`.

## [0.1.3] - 2026-07-05

### Added
- **lex-index** - self-maintaining SQLite structural memory: `lex search` (full-text with
  snippets), `lex symbols` (file outline without reading the file), `lex links` (API
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
- `.lex/` project memory protocol: `status.md`, `INDEX.md`, `wip.md`, `audit.log`,
  knowledge pages (stack/mistakes/patterns/design/rules), session summaries.
- Reasoning skills: using-lex (bootstrap), brainstorming, planning, executing, tdd,
  debugging, verification, code-review, efficient-code, subagent-dispatch,
  finishing-branch, context-health.
- Multi-platform delivery: Claude Code, Codex, Cursor, Windsurf, Copilot, Gemini CLI,
  Antigravity, Kimi manifests + session-start hooks.
