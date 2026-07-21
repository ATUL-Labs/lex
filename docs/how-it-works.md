# How It Works

## The `.lex/` folder

Created in each project root. Any agent that can read markdown can use it.

```
.lex/
  status.md       Current state (~30 lines). Rewritten each session.
  INDEX.md        Table of contents - what knowledge exists.
  wip.md          Work-in-progress. Exists ONLY during active work.
  audit.log       timestamp | agent | platform | action | target
  agent.json      Enforcement flags (require_wip, auto_audit_log, etc.)
  token-ledger.json  Session token tracking (auto-updated by hooks)
  sessions/       Compressed conversation summaries (one per day)
  pages/
    stack.md        Tech stack, folder structure, naming conventions
    run.md          How to install, boot, test, and access the app
    mistakes.md     What broke, why, never repeat
    patterns.md     What works in this project
    design.md       Design rules for this project
    rules.md        Agent output rules
```

## Token budget

| File | When loaded | Lines |
|------|-------------|-------|
| `status.md` | Every session | ~30 |
| `INDEX.md` | Every session | ~30 |
| Relevant pages | Only when task needs them | ~100 max |
| `wip.md` | Only during active work | ~40 |
| **Total** | | **~200 max** |

## Crash recovery

When an agent starts a task, it creates `wip.md` with the plan and progress. If the
session disconnects, the next agent finds `wip.md` and knows exactly what was being
worked on, which steps are done, which files were modified, and where to resume.

When work completes normally, `wip.md` is deleted. If it exists at session start,
something was interrupted.

## Agent audit trail

```
2026-06-29 14:30 | claude-sonnet-4-6 | claude-code | rewrite | components/Dashboard.tsx
2026-06-29 15:00 | gpt-5.5 | windsurf | create | tests/DashboardTest.php
```

Any agent can see who did what, when, and on which platform.

## Enforcement (hooks enforce, instructions suggest)

- **PostToolUse hook** warns if you edit without `wip.md` - you WILL see the warning
- **PostToolUse hook** auto-logs every edit to `audit.log` - no manual logging needed
- **Git pre-commit hook** runs `lex guard` and BLOCKS commits with CRITICAL violations
- **`.lex/agent.json`** controls enforcement: `{ require_wip, auto_audit_log, warn_no_wip_on_edit, block_commit_on_critical }`
- **`lex check`** validates pre-flight: wip.md exists, index fresh, no guard violations, `.env` gitignored
- **`lex tokens`** tracks session token usage: files read, files written, commands run, hook injections

## File structure

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

  lib/
    indexer.js                    # SQLite FTS index, search, symbols, refresh
    extract.js                    # Symbol/link/schema extraction from source
    serve.js                      # HTTP viewer server + /api/cli endpoint
    watcher.js                    # File watcher for incremental indexing
    console-errors.js             # In-memory console error buffer
    patch.js                       # Surgical anchor-based file patching
    fileops.js                     # File operations (ls, read, write, rm, mv, stat)
    tokens.js                     # Token ledger tracking
    gateway.js                    # Zero-approval gateway command processor
    fetch.js                      # HTTP fetch helper for gateway errors command
    api-tester.js                 # API security scanner (headers, SQL, XSS, info disclosure)
    dev-loop.js                   # Endpoint tester with smart categorization, diff, auth
    image-convert.js              # SVG to PNG/WebP/ICO converter via headless Chrome CDP
    browser-detect.js             # Cross-platform Chrome/Edge/Brave path detection

  bin/
    lex.js                        # CLI entry point

  templates/                       # .lex/ templates (copied on init)
    STATUS.md  INDEX.md  wip.md
    pages/
      stack.md  run.md  mistakes.md  patterns.md  design.md  rules.md
```
</details>
