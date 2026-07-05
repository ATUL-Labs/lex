---
name: context-health
description: Manage .ctx/ folder health - compress sessions, update index, prevent context overflow. Use when context is growing large, starting a new session, or doing maintenance.
---

# Context Health

Keep the .ctx/ folder lean and useful. Prevent context overflow.

## Initialize a Project

When `.ctx/` does not exist:

1. Create the folder structure:
   ```
   .ctx/
     INDEX.md
     status.md
     audit.log
     sessions/
     pages/
       stack.md
       mistakes.md
       patterns.md
       design.md
       rules.md
   ```
2. Scan the project to populate `pages/stack.md`:
   - Read package.json / composer.json / go.mod / requirements.txt for stack
   - List top-level folder structure
   - Identify framework (Laravel, Next.js, Django, etc.)
   - Note naming conventions from existing code
3. Write initial `status.md` and `INDEX.md`
4. Populate `pages/rules.md` with any CLAUDE.md / AGENTS.md / .cursorrules content

## Compress Old Sessions

When `sessions/` has more than 20 files:
- Summarize oldest sessions into phase summaries in `pages/`
- Delete the individual session files that were compressed
- Update INDEX.md

## Prune Knowledge Pages

When a knowledge page exceeds 100 lines:
- Keep the most recent and most important entries
- Archive the rest into a `pages/archive/` subfolder
- Update INDEX.md

## Token Budget

The ctx protocol should never consume more than 200 lines of context per session:
- status.md: ~30 lines (always loaded)
- INDEX.md: ~30 lines (always loaded)
- Knowledge pages: ~100 lines total (only relevant ones loaded)
- wip.md: ~40 lines (only during active work)

If approaching this budget, summarize rather than include raw content.

## Index Maintenance

INDEX.md must always reflect reality. After any change to `.ctx/`:
- Add new pages
- Remove deleted pages
- Update line counts and summaries

## Index Hygiene

When initializing `.ctx/`, ensure the project `.gitignore` contains `.ctx/index.db`
(plus its `-wal`/`-shm` siblings via `.ctx/index.db*`). The index is regenerable;
never commit it, never treat it as a source of truth.
