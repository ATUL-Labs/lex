# ctx

The shared brain for developers who work across many AI coding agents.

**Author:** [pulak-ranjan](https://github.com/pulak-ranjan) | **Owned by:** [ATUL AI](https://github.com/ATUL-Labs)

> **Beta.** The core protocol, index, and viewer are built and
> tested, but this is still young software - expect rough edges. Token-savings
> benchmarks are in progress; see [Why it's cheap on tokens](#why-its-cheap-on-tokens)
> for what's measured versus what's still being verified.

## The problem this solves

You're building a feature in Claude Code. You hit a usage limit mid-task. You open
Trae, or Windsurf, or Antigravity, and now you're explaining the whole thing again -
what you were doing, what you already tried, what broke last time. The new agent has
no memory of the last one. Multiply that across three projects you're juggling at
once and it's a constant tax: re-explaining, re-discovering, occasionally re-breaking
something that was already fixed once.

ctx exists because the chat window was never the right place to keep a project's
memory. The chat is disposable. `.ctx/` is not.

**The test ctx is built to pass:** start a task in Claude Code, close it mid-way,
open Trae, type "continue" - and the agent picks up exactly where the last one left
off. Same knowledge, same discipline, same taste, on a completely different tool,
with zero re-explaining.

## Why it's cheap on tokens

The usual way an agent "understands" a codebase is expensive: grep for a term, read
the whole file that matched, read three more files to find where something else is
defined, read every migration to piece together what the database looks like. Each of
those reads costs real tokens, and most of a 500-line file is irrelevant to the one
function you needed.

ctx replaces that pattern with a query:

- **Never a full-file read to find something.** `ctx search <term>` returns the
  matching lines with a snippet - not the file. `ctx symbols <file>` lists what's in
  a file without opening it.
- **Never re-derived from source.** The database schema, the API routes, the
  cross-file links - all of it lives in a SQLite index (`.ctx/index.db`) built once
  and kept fresh automatically. Ask a question, get an answer in one command, instead
  of reading migrations or route files by hand every time.
- **Never re-read what's already known.** `mistakes.md`, `patterns.md`, and `status.md`
  are ~30-100 lines each, loaded only when the task needs them - not the whole
  project's history, every session.
- **Never lost, so never rebuilt.** This is what the continuity engine above is for:
  a fixed bug stays fixed because the next agent reads that it was fixed, instead of
  re-discovering the same problem and re-writing the same fix.

We haven't published a benchmarked token-savings percentage yet - claiming one
without measuring it would be exactly the kind of unverified number this project
tries to avoid. Benchmarking is actively in progress (this is a beta release); an
exact figure will replace this paragraph once it's measured properly,
not guessed. What's true and checkable today: the mechanisms above exist, they're
index-backed rather than read-backed, and you can watch them work live in the
viewer (`ctx serve`) - one search, one line back, not a file.

## What it does

- **Continuity engine**: three-layer state protection - step-cadence `wip.md` checkpoints, deliberate flush at ~80% context pressure, PreCompact/SessionStart hooks on Claude Code. Sessions survive compaction, crashes, and - the point of the whole system - handoffs to a completely different agent
- **Project memory**: `.ctx/` folder with compressed conversations, knowledge pages, page-index tree. Any agent that can read a file gets the full picture, no vendor lock-in
- **Agent audit trail**: who did what, when, which model, which platform - so when you switch tools mid-project, you can see exactly what the last one did
- **Smart loading**: index-then-load - reads ~80 lines on start, pulls knowledge on demand. Never floods a fresh agent's context with everything at once
- **ctx-index**: self-maintaining SQLite index (zero tokens to maintain) - `search`, `symbols`, API-to-frontend `links`, and a DB schema map (tables/columns/foreign keys from real migrations) via one CLI call; auto-updated by a PostToolUse hook on Claude Code, lazily refreshed everywhere else
- **Docs cache**: global self-building cheatsheets (`~/.ctx/docs/`) - agents check distilled, version-verified API notes before guessing from training data; searchable via `ctx docs <term>`. Shared across every project on the machine, so the second project benefits from the first one's work
- **Live viewer**: `ctx serve` opens a local mission-control page showing exactly what any agent working on the project can see - live status, task list, knowledge, index, schema, and a banner that lights up the moment an agent starts writing. Auto-picks a free port so several projects can each run their own view at once
- **Reasoning skills**: brainstorming, planning, TDD, debugging, verification, code review, subagent dispatch - the same discipline enforced on every agent, every platform
- **Design intelligence**: data-backed, not vibes - 8 style catalogs with real CSS recipes, 12 curated palettes, 10 font pairings, motion recipes; mandatory per-project design identity and an anti-generic gate that blocks template-looking UI
- **Efficient code**: YAGNI, stdlib first, shortest diff, no bloat (always active)
- **Zero dependencies**: pure markdown files plus one small Node script for the index/viewer - no build step, no server to maintain, nothing to update

One plugin replaces the separate reasoning/style/memory tools you'd otherwise stitch together - and unlike those, it works identically on Claude Code, Codex, Windsurf, Cursor, Copilot, Gemini, Antigravity, OpenCode, pi, and Kimi.

---

## Quick Start

### 1. Install the plugin

#### Option A: Install globally (all projects)

**Claude Code:**
```bash
claude plugin install github:ATUL-Labs/ctx
```

**Codex:**
```bash
codex plugin install github:ATUL-Labs/ctx
```

**Gemini CLI:**
```bash
gemini extensions install github:ATUL-Labs/ctx
```

**Cursor:**
Add to your Cursor extensions - the `.cursor-plugin/plugin.json` is auto-detected.

**Windsurf:**
The `AGENTS.md` file is auto-detected when the plugin is installed.

**Trae:**

Trae has no plugin system. Copy the ctx rules file into your project:

```bash
mkdir -p .trae/rules
cp <ctx-repo>/templates/platform/trae-rules.md .trae/rules/project_rules.md
```

#### Option B: Install per-project (drop into codebase)

Extract the zip into your project root. The agent auto-detects the files:

```bash
# Unzip into your project
unzip ctx-plugin.zip -d .ctx-plugin

# Or just copy what your agent needs:
cp -r ctx-plugin/skills/ .          # Skills folder - agents auto-discover
cp ctx-plugin/CLAUDE.md .           # Claude Code / Cursor / Windsurf
cp ctx-plugin/AGENTS.md .           # Codex / Copilot / Windsurf
cp ctx-plugin/GEMINI.md .           # Gemini CLI
```

The agent reads `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` at session start - these bootstrap files tell it about the skills and the `.ctx/` protocol. No manual setup needed.

#### Option C: Any agent (universal)

If the agent can read files, ctx works. Point it at `skills/using-ctx/SKILL.md` - that single file teaches the agent the full protocol. No install mechanism required.

### 2. Initialize a project

In any project, tell your agent:
```
Initialize ctx for this project
```

Or invoke the skill directly:
```
/context-health
```

The agent will:
1. Create `.ctx/` folder in your project root
2. Scan your project (package.json, composer.json, folder structure)
3. Generate `status.md`, `INDEX.md`, and knowledge pages
4. You're ready to go

### 3. Start working

The plugin activates automatically every session. The agent will:
- Read `.ctx/status.md` to know where things stand
- Check for `wip.md` (crash recovery from interrupted sessions)
- Load only the knowledge pages relevant to the current task
- Track work in progress, log actions, and update knowledge after completing work

---

## CLI

Requires Node 22+. From anywhere inside a ctx project:

```bash
node <ctx-repo>/bin/ctx.js init [dir]                # scaffold .ctx/ from templates
node <ctx-repo>/bin/ctx.js search userTask overdue   # full-text, 10 lines max
node <ctx-repo>/bin/ctx.js symbols src/App.tsx       # symbol list without reading the file
node <ctx-repo>/bin/ctx.js links dashboard/tasks     # route + every frontend consumer
node <ctx-repo>/bin/ctx.js docs <term>              # search global distilled docs cache
node <ctx-repo>/bin/ctx.js refresh                   # manual reindex (rarely needed)
node <ctx-repo>/bin/ctx.js serve [port]              # live viewer, defaults to 4747
```

`serve` auto-picks the next free port (up to +8) if the requested one is busy - run it
in several projects at once and each gets its own viewer, no manual port juggling.

Large legacy folders: list path prefixes in `.ctx/ignore` (one per line) to exclude them from indexing.

---

## Viewer

The live viewer opens a mission-control dashboard to monitor your project in real time:

```bash
node <ctx-repo>/bin/ctx.js serve        # http://127.0.0.1:4747 (or next free port)
node <ctx-repo>/bin/ctx.js serve 3000   # start from a specific port instead
```

**Working on several projects at once?** Run `serve` in each one - if 4747 is taken,
the next tries 4748, then 4749, and so on up to 4755. Every project gets its own tab,
you never have to remember or pick ports yourself.

Displays live status (project name, agent activity, version), current task list from `wip.md`, all knowledge pages with markdown rendering, full-text search, and index statistics. The API-to-frontend link graph is grouped by route/consumer pairing, filterable by URL substring, and color-coded by HTTP method. Activity timeline reverses audit log entries and groups by date. File preview drawer with symbol outline on demand. Live activity panel shows when an agent is writing to the project - useful for watching a second agent work on the same project from a different session. Database schema panel displays tables, columns, and foreign key relationships extracted from migrations and SQL files. Read-only and localhost-bound - never modifies your project.

---

## Optional: code graph upgrade

ctx-index answers "where is X used" with text search. For true call-graphs,
dead-code detection, and trace-paths on large codebases, add the MIT-licensed
[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (single
static binary, zero dependencies, fully local):

```bash
# macOS / Linux (auto-detects and configures Claude Code and other agents)
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

```powershell
# Windows
Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; .\install.ps1
```

ctx works fully without it - the skills tell agents to prefer the graph when
it is connected and fall back to `ctx search`, then grep, when it is not.

---

## How It Works

### The `.ctx/` folder (per-project)

Created in each project root. Any agent that can read markdown can use it.

```
.ctx/
  status.md       Current state (~30 lines). Rewritten each session.
  INDEX.md        Table of contents - what knowledge exists, 1-line per page.
  wip.md          Work-in-progress. Exists ONLY during active work (crash recovery).
  audit.log       One-line entries: timestamp | agent | platform | action | target

  sessions/       Compressed conversation summaries (one per day)
  pages/          Knowledge pages:
    stack.md        Tech stack, folder structure, naming conventions
    mistakes.md     What broke, why, never repeat
    patterns.md     What works in this project
    design.md       Design rules for this project
    rules.md        Agent output rules
```

### Token budget

| File | When loaded | Lines |
|------|-------------|-------|
| status.md | Every session | ~30 |
| INDEX.md | Every session | ~30 |
| Relevant pages | Only when task needs them | ~100 max |
| wip.md | Only during active work | ~40 |
| **Total** | | **~200 max** |

The agent never bulk-loads all knowledge. It reads the index, decides what's relevant, and pulls only those pages.

### Crash recovery

When an agent starts a task, it creates `wip.md` with the plan and progress. If the session disconnects mid-work, the next agent (even a different one on a different platform) finds `wip.md` and knows:
- What was being worked on
- Which steps are done
- Which files were modified
- Where to resume

When work completes normally, `wip.md` is deleted. If it exists at session start, something was interrupted.

### Agent audit trail

Every action is logged to `audit.log`:
```
2026-06-29 14:30 | claude-sonnet-4-6 | claude-code | rewrite | components/Dashboard.tsx
2026-06-29 15:00 | gpt-4o | windsurf | create | tests/DashboardTest.php
```

Any agent can see who did what, when, and on which platform.

---

## Skills

All skills are in `skills/`. Each is a standalone SKILL.md that any agent can read.

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **using-ctx** | Auto (session start) | Bootstrap - protocol, skill index, rules |
| **brainstorming** | "let's build", "add feature", "idea" | Explore ideas before building |
| **planning** | After brainstorming, or "plan this" | Break specs into executable tasks |
| **executing** | After planning | Work through plans with checkpoints |
| **tdd** | Before writing implementation | Test-driven development (red-green-refactor) |
| **debugging** | Bug, test failure, unexpected behavior | Systematic root-cause analysis |
| **verification** | Before claiming "done" | Prove work is complete with evidence |
| **code-review** | After writing code | Quality, security, correctness review |
| **efficient-code** | Always active | YAGNI, shortest diff, no bloat |
| **design-intelligence** | Any UI/frontend work | Intentional design, never template-looking |
| **docs-cache** | Agents at session start | Global distilled API docs, version-verified |
| **subagent-dispatch** | 2+ independent tasks | Parallel agent execution |
| **finishing-branch** | Before merge/PR | PR creation, merge, cleanup workflow |
| **context-health** | Init, maintenance, overflow | Manage .ctx/, compress, prevent overflow |

### Skill priority

1. **Process skills first**: brainstorming, debugging (determine HOW to approach)
2. **Implementation skills second**: tdd, design-intelligence (guide execution)
3. **Quality skills last**: verification, code-review (confirm correctness)

`efficient-code` is always active - it's a stance, not an invocation.

---

## Platform Support

ctx works on any agent through 3 delivery mechanisms:

| Platform | How it activates | Install command |
|----------|-----------------|-----------------|
| Claude Code | Shell hook auto-injects at session start | `claude plugin install github:ATUL-Labs/ctx` |
| Codex | Shell hook auto-injects at session start | `codex plugin install github:ATUL-Labs/ctx` |
| Cursor | Shell hook auto-injects at session start | Auto-detected from `.cursor-plugin/plugin.json` |
| Copilot CLI | Shell hook (shares Claude Code mechanism) | Same as Claude Code |
| Gemini CLI | `GEMINI.md` loaded as context file | `gemini extensions install github:ATUL-Labs/ctx` |
| Kimi Code | Manifest triggers `using-ctx` skill at session start | `/plugins install github:ATUL-Labs/ctx` |
| Windsurf | Shell hook / `AGENTS.md` at session start | Auto-detected from `.windsurf/plugin.json` |
| Antigravity | `ANTIGRAVITY.md` context file loaded at session start | `agy plugin install github:ATUL-Labs/ctx` |
| **Any agent** | Agent reads `skills/using-ctx/SKILL.md` | Drop `skills/` in project root, or point agent at the file |

---

## File Structure

```
ctx/
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
    using-ctx/SKILL.md             # Bootstrap (loaded every session)
    using-ctx/references/          # Per-platform tool mappings
    brainstorming/SKILL.md
    planning/SKILL.md
    executing/SKILL.md
    tdd/SKILL.md
    debugging/SKILL.md
    verification/SKILL.md
    code-review/SKILL.md
    efficient-code/SKILL.md
    design-intelligence/SKILL.md
    docs-cache/SKILL.md
    subagent-dispatch/SKILL.md
    finishing-branch/SKILL.md
    context-health/SKILL.md
  
  templates/                       # .ctx/ templates (copied to projects on init)
    STATUS.md
    INDEX.md
    wip.md
    pages/
      stack.md
      mistakes.md
      patterns.md
      design.md
      rules.md
```

---

## Acknowledgments

- Cross-platform plugin delivery pattern (hooks, manifests, session-start bootstrap) inspired by [superpowers](https://github.com/obra/superpowers) by Jesse Vincent (MIT)
- Efficient code ladder inspired by [ponytail](https://github.com/obra/superpowers) - the lazy senior dev approach to writing less code
- Token optimization concepts informed by [sipcode](https://github.com/Anuj7411/sipcode) - context window efficiency for AI coding agents

All skill content is original.

## Author

**pulak-ranjan** - [LinkedIn](https://www.linkedin.com/in/pulak-ranjan/) | [GitHub](https://github.com/pulak-ranjan)

Owned by [ATUL AI](https://github.com/ATUL-Labs). Free to use for all developers.

## License

Apache 2.0 - see [LICENSE](LICENSE) for details.
