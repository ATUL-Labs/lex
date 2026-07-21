<div align="center">

<img src="docs/images/lex-hero.svg" alt="lex — The shared brain for AI coding agents" width="100%">

[![Tests](https://img.shields.io/badge/tests-169%20pass-brightgreen)](#)
[![Version](https://img.shields.io/badge/version-0.1.24-blue)](#)
[![Stability](https://img.shields.io/badge/stability-stable-blue)](#)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-green)](#)
[![Dependencies](https://img.shields.io/badge/dependencies-zero-success)](#)
[![Platforms](https://img.shields.io/badge/platforms-9%2B-informational)](#platform-support)

[Quick Start](#quick-start) &bull; [CLI](#cli) &bull; [Gateway](#gateway-zero-approval-commands) &bull; [Viewer](#viewer) &bull; [Skills](#skills) &bull; [Docs](#docs)

</div>

<br>

## The problem

You're building a feature in Claude Code. You hit a usage limit mid-task. You open
Cursor, or Windsurf, or Trae — and now you're explaining everything again. What you
were doing. What you already tried. What broke last time. The new agent has no memory
of the last one.

Multiply that across three projects and it's a constant tax: re-explaining,
re-discovering, occasionally re-breaking something that was already fixed.

**lex exists because the chat window was never the right place to keep a project's
memory.** The chat is disposable. `.lex/` is not.

### The test lex is built to pass

> Start a task in Claude Code. Close it mid-way. Open Cursor. Type "continue".  
> The agent picks up exactly where the last one left off — same knowledge, same
> discipline, same taste, on a completely different tool, with zero re-explaining.

---

## What's new in 0.1.24

| Feature | Description |
|---------|-------------|
| **API security scanner** | `lex test <url>` — sends requests, scans for missing headers, SQL errors, XSS reflection, info disclosure |
| **Dev loop** | `lex devloop` — tests all indexed endpoints with smart categories (OK, auth-required, not-found, server-error) |
| **Diff mode** | `lex devloop --diff` — compares to last run, shows only what changed |
| **Auth support** | `lex devloop --cookie=...` or `--token=...` — test protected routes |
| **Auto port detection** | Reads `run.md`, `.env`, `agent.json`, `docker-compose.yml`. Probes IPv4 + IPv6 |
| **Expected findings filter** | HSTS suppressed on HTTP dev servers (only flagged on HTTPS) |
| **Actionable summary** | "5 OK, 55 require auth, 0 errors" instead of "5 passed, 95 failed" |
| **Gateway expansion** | 30+ commands (was 18). Added `test`, `devloop`, `convert`, `integrity`, `chain`, `task` |
| **Image converter** | `lex convert hero.svg hero.png` — SVG to PNG/WebP/ICO via headless Chrome. Multi-size ICO for favicons |

Full changelog: [CHANGELOG.md](CHANGELOG.md)

---

## Demo

<table>
  <tr>
    <td align="center"><b>Dark mode</b></td>
    <td align="center"><b>Light mode</b></td>
  </tr>
  <tr>
    <td><img src="docs/images/viewer-dark.png" alt="lex viewer in dark mode" width="480"></td>
    <td><img src="docs/images/viewer-light.png" alt="lex viewer in light mode" width="480"></td>
  </tr>
</table>

<img src="docs/images/viewer-panels.png" alt="lex viewer with collapsible panels and schema canvas" width="960">

```bash
# Run the viewer
node bin/lex.js serve

# Catch secrets before they ship
node bin/lex.js guard

# Search without reading files
node bin/lex.js search "userTask overdue"

# Test all endpoints with smart categorization
node bin/lex.js devloop
```

---

## Why it's cheap on tokens

The usual way an agent "understands" a codebase is expensive: grep for a term, read
the whole file that matched, read three more files to find where something else is
defined, read every migration to piece together the database. Each read costs tokens,
and most of a 500-line file is irrelevant to the one function you needed.

**lex replaces that pattern with a query:**

```bash
lex search loadAgentConfig
# → lib/indexer.js:42  function loadAgentConfig(root) {
# → tests/indexer.test.js:88  test('loadAgentConfig returns defaults')
# 2 files, ~248 tokens. grep would return ~4,880.
```

On a 45K-file repo, a common query like `ocr` returns 224 tokens via lex vs **6.7
million tokens** via grep. That's not a savings - it's the difference between working
and crashing.

Full benchmarks: [docs/benchmarks.md](docs/benchmarks.md)

---

<br>

## What it does

<table>
<tr>
<td width="50%" valign="top">

### Memory & Continuity

**Continuity engine** — `wip.md` checkpoints, ~80% context flush, hooks. Sessions survive compaction, crashes, and handoffs.

**Project memory** — `.lex/` folder with knowledge pages, session summaries, audit trail. Any agent that can read a file gets the full picture.

**Crash recovery** — the next agent resumes exactly where the last one left off.

```bash
$ lex status
# → .lex/wip.md found — resuming task
# → Step 3 of 5: implement auth middleware
# → Last edit: src/auth.js (2m ago)
```

</td>
<td width="50%" valign="top">

### Code Intelligence

**lex-index** — self-maintaining SQLite index. Zero tokens to maintain.

```bash
$ lex search validateToken
# → lib/auth.js:42  function validateToken()
# → tests/auth.test.js:88  test('rejects expired')
# 2 files, ~248 tokens
```

**lex guard** — scans for exposed secrets + DB anti-patterns before every commit.

**Browser audit** — headless Chrome/Edge crawls all pages, captures console + network errors.

**API tester** — `lex test <url>` runs security scan: missing headers, SQL errors, XSS, info disclosure.

**Dev loop** — `lex devloop` tests all endpoints with smart categories: OK, auth-required, not-found, server-error.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Agent Tools

**Reasoning skills** — 16 skills: brainstorming, planning, TDD, debugging, verification, code review, and more. Each with a `HARD-GATE` — written answers required before proceeding.

**Stack overlays** — PHP? Agent uses Xdebug. Rust? Agent uses `dbg!` and audits `unsafe`. 5 overlay packs auto-detect at `lex init`.

**Image converter** — `lex convert hero.svg hero.png` — SVG to PNG/WebP/ICO via headless Chrome.

</td>
<td width="50%" valign="top">

### Infrastructure

**Gateway** — 30+ commands via `write_to_file` — zero user approval, zero shell quoting.

```bash
# Agent writes this:
write_to_file('.lex/in/r.json', 'search auth')
# Result auto-injected as context. No approval needed.
```

**Live viewer** — `lex serve` opens a mission-control dashboard: status, task list, knowledge, schema, search, agent activity, API tester.

**Zero dependencies** — pure markdown + one small Node script. No build step, no server, nothing to update.

</td>
</tr>
</table>

One plugin replaces the separate reasoning, style, and memory tools you'd otherwise
stitch together — and it works identically on **9+ platforms**.

---

<br>

## Quick Start

### 1. Install

**One-line (npm global — recommended):**
```bash
npm install -g @atul-labs/lex
```
Then use `lex` from anywhere:
```bash
lex init          # initialize .lex/ in your project
lex serve         # live viewer at http://localhost:4747
lex audit         # headless browser audit of your dev server
lex guard         # scan for exposed secrets before commit
```

**Or per-platform plugin:**

**Claude Code:**
```bash
claude plugin install github:ATUL-Labs/lex
```

**Codex:**
```bash
codex plugin install github:ATUL-Labs/lex
```

**Gemini CLI:**
```bash
gemini extensions install github:ATUL-Labs/lex
```

**Cursor / Windsurf:** Auto-detected from plugin manifests. No manual setup.

**Any agent:** If it can read files, lex works. Point it at `skills/using-lex/SKILL.md`.

<details>
<summary>More install options (per-project, clone, Trae, manual)</summary>

#### Per-project (clone and link)
```bash
git clone https://github.com/ATUL-Labs/lex.git
cd lex && npm link   # makes `lex` available globally
```

#### Per-project (drop into codebase)
```bash
cp -r lex-plugin/skills/ .          # Skills folder - agents auto-discover
cp lex-plugin/CLAUDE.md .           # Claude Code / Cursor / Windsurf
cp lex-plugin/AGENTS.md .           # Codex / Copilot / Windsurf
cp lex-plugin/GEMINI.md .           # Gemini CLI
```

#### Trae (no plugin system)
```bash
mkdir -p .trae/rules
cp <lex-repo>/templates/platform/trae-rules.md .trae/rules/project_rules.md
```
</details>

### 2. Initialize

Tell your agent:
```
Initialize lex for this project
```

Or run directly:
```bash
node <lex-repo>/bin/lex.js init
```

This creates `.lex/` with `status.md`, `INDEX.md`, knowledge pages, and detects your
stack (PHP, Rust, Python, TypeScript, Go) to load the right overlays.

### 3. Start working

The plugin activates automatically every session. The agent reads `.lex/status.md`,
checks for `wip.md` (crash recovery), and loads only the knowledge pages relevant to
the current task.

---

<br>

## CLI

Requires Node 22+.

```bash
node <lex-repo>/bin/lex.js init [dir]                # scaffold .lex/ from templates
node <lex-repo>/bin/lex.js guard                      # scan for exposed secrets + DB anti-patterns
node <lex-repo>/bin/lex.js check                      # pre-flight: wip.md, index, guard
node <lex-repo>/bin/lex.js tokens                     # session token usage + context budget
node <lex-repo>/bin/lex.js search userTask overdue   # full-text, fuzzy + line numbers
node <lex-repo>/bin/lex.js grep "TODO|FIXME"         # regex search (patterns FTS can't do)
node <lex-repo>/bin/lex.js symbols src/App.tsx       # symbol list without reading the file
node <lex-repo>/bin/lex.js links dashboard/tasks     # route + every frontend consumer
node <lex-repo>/bin/lex.js recent 20                 # recently modified files from audit log
node <lex-repo>/bin/lex.js errors                    # console errors captured from browser
node <lex-repo>/bin/lex.js audit [urls...]           # headless browser audit (auto-detects dev server)
node <lex-repo>/bin/lex.js test <url> [method]       # send request + security scan (headers, SQL, XSS)
node <lex-repo>/bin/lex.js devloop [--diff]          # test all endpoints, categorize results
node <lex-repo>/bin/lex.js convert <in> <out>        # SVG to PNG/WebP/ICO, PNG to ICO
node <lex-repo>/bin/lex.js patch <file> <mode> ...   # surgical edit by anchor (saves tokens)
node <lex-repo>/bin/lex.js ls [dir]                  # list files from index (instant)
node <lex-repo>/bin/lex.js read <file> [start-end]   # read file with line numbers
node <lex-repo>/bin/lex.js refresh                   # manual reindex (rarely needed)
node <lex-repo>/bin/lex.js watch [port]              # server + file watcher, instant search
node <lex-repo>/bin/lex.js serve [port]              # live viewer, defaults to 4747
```

**`guard`** scans all source files for hardcoded API keys, passwords, tokens,
connection strings (CRITICAL - exits with code 1 if found), and database
anti-patterns like 1-to-1 tables, EAV, and settings tables (IMPORTANT).
**Run it before every commit.**

**`watch`** starts the viewer server with a file watcher. Files are re-indexed
automatically on save (debounced 300ms). When `watch` is running, `lex search`
routes through the server via HTTP — cutting latency from ~200ms to ~15ms.

Large legacy folders: list path prefixes in `.lex/ignore` (one per line) to exclude
them from indexing.

### `patch` — surgical edits

```bash
# Insert after an anchor
lex patch src/app.js after "const x = 1" --insert "const y = 2;"

# Replace an anchor
lex patch src/app.js replace "oldFunction()" --insert "newFunction()"

# Compact pipe format (41% shorter than JSON)
echo 'src/app.js|after|const x = 1|const y = 2;' | lex patch

# JSON mode (for agents)
lex patch '{"file":"src/app.js","anchor":"const x = 1","insertion":"const y = 2;","mode":"after"}'
```

**Smart features:** auto-anchor (shortest unique substring), fuzzy match (typo
tolerance with similarity %), diff output on every patch, preview mode, multi-match
context.

**Safety:** `rm` moves files to `.lex/trash/` with a timestamp prefix. `mv` backs up
the destination before overwriting. Both report the trash path for recovery.

### `audit` — headless browser runtime check

```bash
# Auto-detect dev server, crawl all pages (default: depth 2, max 30 pages)
lex audit

# Explicit URLs
lex audit http://localhost:3000 http://localhost:5173

# Single page, no crawling
lex audit --no-crawl http://localhost:3000

# Deep crawl (depth 4, up to 100 pages)
lex audit --depth=4 --max-pages=100

# JSON output for agents
lex audit --json

# Wait longer for slow pages
lex audit --wait=5000
```

Launches your installed Chrome/Edge/Brave in headless mode, visits each URL,
and captures:
- **Console errors** — `console.error`, uncaught exceptions, unhandled rejections
- **Network errors** — HTTP 4xx/5xx responses, failed resource loads
- **Console warnings** — `console.warn`

**Crawling**: By default, after each page loads, lex extracts all `<a href>` links
on the same origin and visits them too (BFS, up to `--depth` and `--max-pages`).
This catches errors on every page — dashboard, settings, login, etc.

**Login support**: Create `.lex/audit.json` (gitignored — may contain credentials):

```json
{
  "login": {
    "url": "/login",
    "fields": {
      "#email": "test@example.com",
      "#password": "testpass123"
    },
    "submit": "button[type=submit]"
  },
  "crawl": true,
  "maxDepth": 3,
  "maxPages": 50,
  "waitMs": 3000
}
```

Lex logs in first, gets the session cookie, then crawls all authenticated pages.
A single browser tab is reused for the entire session so cookies persist.

Auto-detects browser path on Windows, macOS, Linux, and WSL. Zero dependencies —
uses Chrome DevTools Protocol over WebSocket (built into Node 22).

Via gateway (no approval needed):
```
write_to_file('.lex/in/audit.json', '', true)  # auto-detect URLs, crawl all pages
```

### `test` — API endpoint security scanner

```bash
# Test a single endpoint
lex test http://localhost:3000/api/users
lex test http://localhost:3000/api/users POST

# XSS scan
lex test http://localhost:3000/search?q=test --xss
```

Sends an HTTP request and runs a security scan on the response:
- **Missing security headers** — CSP, X-Frame-Options, HSTS, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- **SQL error signatures** — SQLSTATE, PDOException, MySQL errors, SQLite errors, syntax errors
- **Information disclosure** — stack traces, framework version leaks, debug mode, X-Powered-By
- **XSS reflection** — injected parameters reflected without encoding

Via gateway:
```
write_to_file('.lex/in/r.json', 'test http://localhost:3000/api/users GET')
```

### `devloop` — test all endpoints at once

```bash
# Test all indexed endpoints
lex devloop

# Compare to previous run (shows what changed)
lex devloop --diff

# Test with authentication
lex devloop --cookie="session=abc123"
lex devloop --token="Bearer eyJhbG..."

# Filter to endpoints from a specific file
lex devloop src/api/auth.js
```

Tests every route and API consumer found in the index. Each endpoint gets a category:

| Category | Meaning | Counts as |
|----------|---------|-----------|
| `pass` | 200-299 | OK |
| `auth-required` | 302→/login, 401, 403, 419 | OK (expected) |
| `redirect` | 302 to non-auth URL | OK |
| `not-found` | 404 | Fail |
| `method-not-allowed` | 405 | OK |
| `server-error` | 500+ | Fail |
| `connection-error` | ECONNREFUSED | Fail |

**Smart summary** — instead of "72 failed", you get:
```
100 endpoints tested: 5 OK, 55 require auth, 38 not found, 2 method not allowed, 2 findings, 0 actionable errors
```

**Diff mode** — compares to the last run's `.lex/devloop.json`:
```
3 changed, 0 new, 0 removed, -3 errors, +0 findings
  get /research: 500 server-error -> 200 pass
  post /journals: 419 csrf-required -> 200 pass
```

**Expected findings filter** — HSTS is suppressed on HTTP dev servers (only flagged on HTTPS).

**Auto port detection** — reads `.lex/pages/run.md`, `.lex/agent.json`, `.env`, and `docker-compose.yml` to find the app's actual port. Probes both IPv4 and IPv6 localhost.

Via gateway:
```
write_to_file('.lex/in/r.json', 'devloop')
write_to_file('.lex/in/r.json', 'devloop --diff')
```

### `convert` — SVG to PNG/WebP/ICO

```bash
# SVG to PNG (2x retina)
lex convert hero.svg hero.png --width=1200 --height=630 --scale=2

# SVG to WebP (17x smaller than PNG)
lex convert hero.svg hero.webp --width=1200 --height=630

# SVG to single-size ICO (favicon)
lex convert logo.svg favicon.ico --size=32

# SVG to multi-size ICO (16, 32, 48, 64, 128, 256)
lex convert logo.svg favicon.ico --multi

# PNG to ICO
lex convert logo.png favicon.ico --multi
```

Renders SVG using headless Chrome/Edge via CDP (same zero-dependency approach as `lex audit`). ICO encoder is pure JS — wraps PNG data in ICO container format. Multi-size ICO includes all standard favicon sizes in one file.

Via gateway:
```
write_to_file('.lex/in/r.json', 'convert hero.svg hero.png')
write_to_file('.lex/in/req.json', '{"cmd":"convert","args":{"input":"logo.svg","output":"favicon.ico","multi":true}}')
```

### Gateway: zero-approval commands

The gateway lets agents use lex **without `run_command`** — no user approval,
no shell quoting, no PowerShell escaping. The agent writes a request to
`.lex/in/` via `write_to_file` (a native tool), the PostToolUse hook processes
it, and the result is auto-injected as `additionalContext`.

**Three input formats** (pick the lightest):

```
# 1. Empty file = no-arg command (filename IS the command, 21% less overhead)
write_to_file('.lex/in/errors.json', '', true)

# 2. Plain text = cmd + args (17% less overhead than JSON)
write_to_file('.lex/in/r.json', 'search ValidationError')
write_to_file('.lex/in/r.json', 'grep res\\.status|src/app.js')

# 3. JSON = full control (backward compatible)
write_to_file('.lex/in/req.json', '{"cmd":"search","args":["InputError"]}')
```

**30+ commands available:** `search`, `memory`, `recall`, `episode`, `note`, `docs`,
`proactive`, `symbols`, `grep`, `read`, `patch`, `insert`, `rename`, `delete`, `batch`,
`chain`, `task`, `synth`, `check`, `diff`, `errors`, `audit`, `integrity`, `test`,
`devloop`, `convert`, `undo`, `snapshot`, `refs`, `recent`, `links`, `guard`, `decay`, `assoc`.

| Feature | Gateway (`write_to_file`) | CLI (`run_command`) |
|---------|--------------------------|---------------------|
| User approval | **Never** | Every call |
| Shell quoting | None | Required (PowerShell) |
| Output injection | Auto (`additionalContext`) | Manual (read stdout) |
| Batch support | Yes (1 call, N commands) | No (N calls) |
| Token overhead | 42-50 tokens | 24-28 tokens |

Gateway costs ~20 more raw tokens per call, but saves **all approval friction**
and enables **batching** (2 commands in 1 call saves 24%).

---

<br>

## Viewer

```bash
node <lex-repo>/bin/lex.js serve        # http://127.0.0.1:4747
node <lex-repo>/bin/lex.js serve 3000   # specific port
```

A live mission-control dashboard for your project. Here's what you can do:

**Monitor**
- **App server status** — auto-detects your app's port from `run.md`, `.env`, `docker-compose.yml`. Live green/red indicator, polls every 10s
- **Agent activity timeline** — see every file edit, search, and command your AI agent has run
- **Current task list** — live view of `wip.md` steps and their status

**Explore code**
- **Full-text search** — search the entire codebase without opening files. Results show file, line number, and context
- **API link graph** — visual graph of every API route and its frontend consumers. Filter by URL, color-coded by HTTP method
- **Schema ERD** — tables, columns, foreign keys from real migrations. Fullscreen pannable/zoomable canvas
- **Symbol browser** — list functions, classes, and exports in any file without reading it

**Test & secure**
- **API tester** — send requests to any endpoint, get security scan with findings categorized by severity (High/Medium/Low). URL auto-populates from detected app server
- **Dev loop** — one click tests all indexed endpoints. Smart categories: OK, auth-required, not-found, server-error. Actionable summary instead of raw pass/fail
- **Console errors** — captures `console.error`, uncaught exceptions, and network failures from your dev pages

**Knowledge**
- **Knowledge pages** — browse `.lex/pages/` with rendered markdown (stack.md, mistakes.md, patterns.md, design.md, rules.md)
- **Session summaries** — read past agent sessions to see what was done and why

Dark/light theme toggle. Collapsible panels — show only what you need. Read-only and localhost-bound — never modifies your project.

Full details: [docs/viewer.md](docs/viewer.md)

---

<br>

## Skills

16 skills, each a standalone `SKILL.md` with a `HARD-GATE` — written answers required
before proceeding. No gate, no code. Stack overlays (PHP, Rust, Python, TypeScript,
Go) auto-detect at `lex init` and add language-specific tooling guidance.

Full skill catalog: [docs/skills.md](docs/skills.md)

---

<br>

## How It Works

<img src="docs/images/lex-architecture.svg" alt="lex architecture: .lex/ folder structure and agent flow" width="100%">

`.lex/` folder in each project root stores: `status.md` (current state), `wip.md`
(work-in-progress, exists only during active work), `INDEX.md` (knowledge table of
contents), `audit.log` (agent activity trail), knowledge pages, and session
summaries. Any agent that can read markdown can use it.

**Crash recovery:** `wip.md` checkpoints let the next agent resume exactly where the
last one left off — same knowledge, same discipline, on a completely different tool.

**Enforcement:** PostToolUse hook warns if `wip.md` missing, auto-logs edits. Git
pre-commit hook runs `lex guard` and blocks on CRITICAL violations.

Full architecture: [docs/how-it-works.md](docs/how-it-works.md)

---

<br>

## Platform Support

| Platform | How it activates | Install |
|----------|-----------------|---------|
| **Any CLI** | `lex` global command | `npm install -g @atul-labs/lex` |
| **Claude Code** | Shell hook at session start | `claude plugin install github:ATUL-Labs/lex` |
| **Codex** | Shell hook at session start | `codex plugin install github:ATUL-Labs/lex` |
| **Cursor** | Auto-detected from manifest | Drop in project root |
| **Windsurf** | `AGENTS.md` at session start | Auto-detected from `.windsurf/plugin.json` |
| **Copilot CLI** | Shares Claude Code mechanism | Same as Claude Code |
| **Gemini CLI** | `GEMINI.md` as context file | `gemini extensions install github:ATUL-Labs/lex` |
| **Kimi Code** | Manifest at session start | `/plugins install github:ATUL-Labs/lex` |
| **Antigravity** | `ANTIGRAVITY.md` context file | `agy plugin install github:ATUL-Labs/lex` |
| **Any agent** | Reads `skills/using-lex/SKILL.md` | Drop `skills/` in project root |

---

<br>

## Optional: code graph upgrade

lex-index answers "where is X used" with text search. For true call-graphs,
dead-code detection, and trace-paths on large codebases, add the MIT-licensed
[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (single
static binary, zero dependencies, fully local):

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

```powershell
# Windows
Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; .\install.ps1
```

lex works fully without it - skills prefer the graph when connected, fall back to
`lex search`, then grep.

---

<br>

## Docs

- [benchmarks.md](docs/benchmarks.md) — speed, token savings, gateway overhead, test results
- [skills.md](docs/skills.md) — full skill catalog, stack overlays
- [how-it-works.md](docs/how-it-works.md) — `.lex/` folder, crash recovery, enforcement, file structure
- [viewer.md](docs/viewer.md) — panel details, API tester, dev loop, app server status, console error capture
- [upgrading.md](docs/upgrading.md) — safe upgrade path, no data loss
- [CHANGELOG.md](CHANGELOG.md) — version history

---

<br>

## Acknowledgments

- Cross-platform plugin delivery pattern inspired by [superpowers](https://github.com/obra/superpowers) by Jesse Vincent (MIT)
- Efficient code ladder inspired by [ponytail](https://github.com/DietrichGebert/ponytail)
- README design principles from [beautify-github-readme](https://github.com/oil-oil/beautify-github-readme)

All skill content is original.

## Author

**pulak-ranjan** - [LinkedIn](https://www.linkedin.com/in/pulak-ranjan/) | [GitHub](https://github.com/pulak-ranjan)

Built by [ATUL AI](https://github.com/ATUL-Labs). Free for all developers.

## License

Apache 2.0 - see [LICENSE](LICENSE) for details.

---

<div align="center">

### If lex saved you from re-explaining your project to yet another AI agent...

**[Star this repo](https://github.com/ATUL-Labs/lex)** - it helps other developers discover it.

[Report a bug](https://github.com/ATUL-Labs/lex/issues) &bull; [Request a feature](https://github.com/ATUL-Labs/lex/issues) &bull; [CHANGELOG](CHANGELOG.md)

</div>
