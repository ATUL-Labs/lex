<div align="center">

# lex

### The shared brain for AI coding agents.

Cross-agent project memory, enforcement rules, and a live viewer.  
Works on Claude Code, Cursor, Windsurf, Codex, Gemini, Copilot, Antigravity, Kimi, and any agent that can read files.

[![Tests](https://img.shields.io/badge/tests-50%20pass-brightgreen)](#)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-green)](#)
[![Dependencies](https://img.shields.io/badge/dependencies-zero-success)](#)
[![Platforms](https://img.shields.io/badge/platforms-9%2B-informational)](#platform-support)

[Quick Start](#quick-start) &bull; [Demo](#demo) &bull; [CLI](#cli) &bull; [Viewer](#viewer) &bull; [Skills](#skills) &bull; [How It Works](#how-it-works)

</div>

---

## The problem

You're building a feature in Claude Code. You hit a usage limit mid-task. You open
Cursor, or Windsurf, or Trae - and now you're explaining everything again. What you
were doing. What you already tried. What broke last time. The new agent has no memory
of the last one.

Multiply that across three projects and it's a constant tax: re-explaining,
re-discovering, occasionally re-breaking something that was already fixed.

**lex exists because the chat window was never the right place to keep a project's
memory.** The chat is disposable. `.lex/` is not.

### The test lex is built to pass

> Start a task in Claude Code. Close it mid-way. Open Cursor. Type "continue".  
> The agent picks up exactly where the last one left off - same knowledge, same
> discipline, same taste, on a completely different tool, with zero re-explaining.

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
```

---

## Why it's cheap on tokens

The usual way an agent "understands" a codebase is expensive: grep for a term, read
the whole file that matched, read three more files to find where something else is
defined, read every migration to piece together the database. Each read costs tokens,
and most of a 500-line file is irrelevant to the one function you needed.

**lex replaces that pattern with a query:**

- **Never a full-file read to find something.** `lex search <term>` returns matching
  lines with a snippet - not the file. `lex symbols <file>` lists what's in a file
  without opening it.
- **Never re-derived from source.** Database schema, API routes, cross-file links -
  all live in a SQLite index built once and kept fresh automatically. One command
  instead of reading migrations by hand.
- **Never re-read what's already known.** Knowledge pages are ~30-100 lines each,
  loaded only when the task needs them.
- **Never lost, so never rebuilt.** A fixed bug stays fixed because the next agent
  reads that it was fixed.

> Benchmarking is in progress. What's verifiable today: the mechanisms exist, they're
> index-backed rather than read-backed, and you can watch them work live in the viewer.

---

## What it does

| Feature | What it means |
|---------|---------------|
| **Continuity engine** | Three-layer state protection - `wip.md` checkpoints, ~80% context flush, hooks. Sessions survive compaction, crashes, and handoffs to a different agent |
| **Project memory** | `.lex/` folder with knowledge pages, session summaries, audit trail. Any agent that can read a file gets the full picture |
| **lex-index** | Self-maintaining SQLite index - `search`, `symbols`, API-to-frontend `links`, DB schema map. Zero tokens to maintain |
| **lex guard** | Scans for exposed secrets (CRITICAL) and DB anti-patterns (IMPORTANT) before every commit. Exit code 1 if found |
| **Live viewer** | `lex serve` opens a mission-control dashboard - live status, task list, knowledge, schema, search, agent activity. Dark/light theme, collapsible panels |
| **Reasoning skills** | 16 skills: brainstorming, planning, TDD, debugging, verification, code review, and more. Same discipline on every agent, every platform |
| **Stack overlays** | PHP? Agent uses Xdebug. Rust? Agent uses `dbg!` and audits `unsafe`. 5 overlay packs auto-detect at `lex init` |
| **Security stance** | Always active - never inline secrets, never commit `.env`, scan for exposed keys before commit |
| **DB architecture** | Wide tables over join farms, denormalize-first, no 1-to-1 tables, no EAV. Activates when designing schemas |
| **Design intelligence** | 8 style catalogs, 12 palettes, 10 font pairings. Anti-generic gate blocks template-looking UI |
| **Docs cache** | Global self-building cheatsheets (`~/.lex/docs/`). Agents check distilled, version-verified API notes before guessing |
| **Zero dependencies** | Pure markdown + one small Node script. No build step, no server, nothing to update |

One plugin replaces the separate reasoning, style, and memory tools you'd otherwise
stitch together - and it works identically on **9+ platforms**.

---

## Quick Start

### 1. Install

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
<summary>More install options (per-project, Trae, manual)</summary>

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

## CLI

Requires Node 22+.

```bash
node <lex-repo>/bin/lex.js init [dir]                # scaffold .lex/ from templates
node <lex-repo>/bin/lex.js guard                      # scan for exposed secrets + DB anti-patterns
node <lex-repo>/bin/lex.js search userTask overdue   # full-text, 10 lines max
node <lex-repo>/bin/lex.js symbols src/App.tsx       # symbol list without reading the file
node <lex-repo>/bin/lex.js links dashboard/tasks     # route + every frontend consumer
node <lex-repo>/bin/lex.js docs <term>              # search global distilled docs cache
node <lex-repo>/bin/lex.js refresh                   # manual reindex (rarely needed)
node <lex-repo>/bin/lex.js serve [port]              # live viewer, defaults to 4747
```

**`guard`** scans all source files for hardcoded API keys, passwords, tokens,
connection strings (CRITICAL - exits with code 1 if found), and database
anti-patterns like 1-to-1 tables, EAV, and settings tables (IMPORTANT).
**Run it before every commit.**

**`serve`** auto-picks the next free port (up to +8) if the requested one is busy -
run it in several projects at once and each gets its own viewer.

Large legacy folders: list path prefixes in `.lex/ignore` (one per line) to exclude
them from indexing.

---

## Viewer

```bash
node <lex-repo>/bin/lex.js serve        # http://127.0.0.1:4747 (or next free port)
node <lex-repo>/bin/lex.js serve 3000   # specific port
```

A live mission-control dashboard for your project:

- **Now panel** - live status, agent activity banner, current task list from `wip.md`
- **Codebase panel** - file/symbol/link stats, full-text search, MCP suggestions
- **Graph panel** - API-to-frontend link graph, filterable by URL, color-coded by HTTP method
- **Schema panel** - tables, columns, FK relationships from real migrations. Fullscreen pannable/zoomable ERD canvas
- **Memory panel** - knowledge pages with markdown rendering, session summaries, activity timeline

**Dark/light theme** - moon/sun toggle in the header. Persists in `localStorage`.

**Collapsible panels** - each panel has a collapse button. The **View** dropdown in
the header hides/shows any panel. Layout reflows automatically. State persists in
`localStorage`.

Read-only and localhost-bound - never modifies your project.

---

## Skills

16 skills, each a standalone `SKILL.md` that any agent can read:

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **using-lex** | Auto (session start) | Bootstrap - protocol, skill index, rules |
| **brainstorming** | "let's build", "add feature" | Explore ideas before building |
| **planning** | After brainstorming | Break specs into executable tasks |
| **executing** | After planning | Work through plans with checkpoints |
| **tdd** | Before implementation | Red-green-refactor |
| **debugging** | Bug, test failure | Systematic root-cause analysis |
| **verification** | Before claiming "done" | Prove work is complete with evidence |
| **code-review** | After writing code | Quality, security, correctness review |
| **efficient-code** | Always active | YAGNI, shortest diff, no bloat |
| **design-intelligence** | Any UI/frontend work | Intentional design, never template-looking |
| **docs-cache** | Session start | Global distilled API docs, version-verified |
| **subagent-dispatch** | 2+ independent tasks | Parallel agent execution |
| **finishing-branch** | Before merge/PR | PR creation, merge, cleanup |
| **context-health** | Init, maintenance | Manage `.lex/`, compress, prevent overflow |
| **security** | Any code, any file | Always active - never expose secrets |
| **database-architecture** | Designing schema | Wide tables, denormalize-first, no EAV |

### Stack overlays

`lex init` auto-detects your stack and loads matching overlays alongside each skill:

| Overlay | Languages | What it adds |
|---------|-----------|--------------|
| **php** | PHP, Laravel, Symfony | Xdebug/Telescope, Pest/PHPUnit, mass assignment checks, N+1 detection |
| **rust** | Rust | `dbg!`/clippy/miri, `#[test]` patterns, `unsafe` audits, borrow check review |
| **python** | Python, Django, FastAPI | pdb/breakpoint, pytest fixtures, mutable default arg checks |
| **typescript** | TS, React, Next.js, Vue | devtools, Vitest/Jest, `any`/`as` review, async correctness |
| **go** | Go | delve, table-driven tests, goroutine leak checks, `err` handling review |

~30-50 lines each, loaded on-demand only when the skill fires.

---

## How It Works

### The `.lex/` folder

Created in each project root. Any agent that can read markdown can use it.

```
.lex/
  status.md       Current state (~30 lines). Rewritten each session.
  INDEX.md        Table of contents - what knowledge exists.
  wip.md          Work-in-progress. Exists ONLY during active work.
  audit.log       timestamp | agent | platform | action | target
  sessions/       Compressed conversation summaries (one per day)
  pages/
    stack.md        Tech stack, folder structure, naming conventions
    run.md          How to install, boot, test, and access the app
    mistakes.md     What broke, why, never repeat
    patterns.md     What works in this project
    design.md       Design rules for this project
    rules.md        Agent output rules
```

### Token budget

| File | When loaded | Lines |
|------|-------------|-------|
| `status.md` | Every session | ~30 |
| `INDEX.md` | Every session | ~30 |
| Relevant pages | Only when task needs them | ~100 max |
| `wip.md` | Only during active work | ~40 |
| **Total** | | **~200 max** |

### Crash recovery

When an agent starts a task, it creates `wip.md` with the plan and progress. If the
session disconnects, the next agent finds `wip.md` and knows exactly what was being
worked on, which steps are done, which files were modified, and where to resume.

When work completes normally, `wip.md` is deleted. If it exists at session start,
something was interrupted.

### Agent audit trail

```
2026-06-29 14:30 | claude-sonnet-4-6 | claude-code | rewrite | components/Dashboard.tsx
2026-06-29 15:00 | gpt-4o | windsurf | create | tests/DashboardTest.php
```

Any agent can see who did what, when, and on which platform.

---

## Platform Support

| Platform | How it activates | Install |
|----------|-----------------|---------|
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

## File Structure

<details>
<summary>Click to expand</summary>

```
lex/
  .claude-plugin/plugin.json       # Claude Code manifest
  .codex-plugin/plugin.json        # Codex manifest
  .cursor-plugin/plugin.json       # Cursor manifest
  .kimi-plugin/plugin.json         # Kimi Code manifest
  .windsurf/plugin.json            # Windsurf manifest
  .antigravity-plugin/plugin.json  # Antigravity manifest
  AGENTS.md                        # Windsurf / Copilot instructions
  ANTIGRAVITY.md                   # Antigravity context file
  CLAUDE.md                        # Claude Code instructions
  GEMINI.md                        # Gemini CLI instructions
  gemini-extension.json            # Gemini extension manifest
  LICENSE                          # Apache 2.0
  README.md                        # This file

  hooks/
    hooks.json                     # Claude Code hook config
    hooks-codex.json               # Codex hook config
    hooks-cursor.json              # Cursor hook config
    run-hook.cmd                   # Polyglot dispatcher (Windows + Unix)
    session-start                  # Bootstrap script
    session-start-codex            # Codex-specific bootstrap

  skills/
    using-lex/SKILL.md             # Bootstrap (loaded every session)
    using-lex/references/          # Per-platform tool mappings
    brainstorming/SKILL.md
    planning/SKILL.md
    executing/SKILL.md
    tdd/SKILL.md
    tdd/overlays/                  php.md rust.md python.md typescript.md go.md
    debugging/SKILL.md
    debugging/overlays/            php.md rust.md python.md typescript.md go.md
    verification/SKILL.md
    code-review/SKILL.md
    code-review/overlays/          php.md rust.md python.md typescript.md go.md
    efficient-code/SKILL.md
    efficient-code/overlays/       php.md rust.md python.md typescript.md go.md
    security/SKILL.md              # Always-active: never inline secrets
    database-architecture/SKILL.md # Wide tables, denormalize-first
    design-intelligence/SKILL.md
    docs-cache/SKILL.md
    subagent-dispatch/SKILL.md
    finishing-branch/SKILL.md
    context-health/SKILL.md

  templates/                       # .lex/ templates (copied on init)
    STATUS.md  INDEX.md  wip.md
    pages/
      stack.md  run.md  mistakes.md  patterns.md  design.md  rules.md
```
</details>

---

## Acknowledgments

- Cross-platform plugin delivery pattern inspired by [superpowers](https://github.com/obra/superpowers) by Jesse Vincent (MIT)
- Efficient code ladder inspired by [ponytail](https://github.com/DietrichGebert/ponytail)
- Token optimization concepts informed by [sipcode](https://github.com/Anuj7411/sipcode)

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
