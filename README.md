# ctx

Universal coding companion plugin for AI coding agents.

**Author:** [pulak-ranjan](https://github.com/pulak-ranjan) | **Owned by:** [ATUL AI](https://github.com/ATUL-Labs)

One plugin replaces superpowers + ponytail + ui-ux-pro-max. Works on any coding agent: Claude Code, Codex, Windsurf, Cursor, Copilot, Gemini, Antigravity, OpenCode, pi, Kimi.

## What it does

- **Reasoning**: brainstorming, planning, TDD, debugging, verification, code review, subagent dispatch
- **Efficient code**: YAGNI, stdlib first, shortest diff, no bloat (always active)
- **Design intelligence**: never boring UI, intentional design choices
- **Project memory**: `.ctx/` folder with compressed conversations, knowledge pages, page-index tree
- **Smart loading**: index-then-load - reads ~80 lines on start, pulls knowledge on demand
- **Continuity engine**: three-layer state protection - step-cadence `wip.md` checkpoints, deliberate flush at ~80% context pressure, PreCompact/SessionStart hooks on Claude Code. Sessions survive compaction, crashes, and agent handoffs
- **ctx-index**: self-maintaining SQLite index (zero tokens to maintain) - `search`, `symbols`, and API-to-frontend `links` via one CLI call; auto-updated by a PostToolUse hook on Claude Code, lazily refreshed everywhere else
- **Agent audit**: who did what, when, which model, which platform
- **Zero dependencies**: pure markdown files, no runtime, no build step

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

## CLI

Requires Node 22+. From anywhere inside a ctx project:

```bash
node <ctx-repo>/bin/ctx.js search userTask overdue   # full-text, 10 lines max
node <ctx-repo>/bin/ctx.js symbols src/App.tsx       # symbol list without reading the file
node <ctx-repo>/bin/ctx.js links /dashboard/tasks    # route + every frontend consumer
node <ctx-repo>/bin/ctx.js refresh                   # manual reindex (rarely needed)
```

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
