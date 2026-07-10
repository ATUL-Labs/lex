# lex - project rules for Trae

You have lex - the universal coding companion. This project uses a `.lex/` folder as
persistent memory shared across all AI coding agents.

## Session start (before ANY response)

1. Read `.lex/status.md` if it exists (current project state, ~30 lines)
2. If `.lex/wip.md` exists: a previous session (possibly another agent) was
   interrupted mid-task. Read it, tell the user what was in progress in 2-3 lines,
   ask: resume or start fresh?
3. Scan `.lex/INDEX.md` to know what knowledge pages exist. Load pages ONLY when a
   task needs them: bug fix -> pages/mistakes.md; UI -> pages/design.md +
   pages/patterns.md; backend -> pages/patterns.md. Never bulk-load.

## Continuity (no hooks on this platform - discipline replaces them)

- Update `.lex/wip.md` after EVERY significant step (file written, decision made,
  test run). State on disk must never be more than one step old.
- If you notice context pressure or the conversation getting very long: STOP,
  flush current step + remaining steps to wip.md, then continue.
- After any context loss: re-read status.md + wip.md and continue silently. Never
  ask the user to re-explain what the files already say.

## During work

- Append actions to `.lex/audit.log`: `YYYY-MM-DD HH:MM | agent | trae | action | target`
- Before writing code: simplest approach that works (stdlib > existing dependency >
  custom code). Shortest working diff wins.
- UI work: read `.lex/pages/design.md` first - the project's design identity
  overrides generic choices. Never template-looking output.
- Never use em dashes anywhere. Hyphens only. No emojis unless asked.
- Prefer `node <lex-install>/bin/lex.js search <terms>` over repo-wide grep when the
  lex CLI is available - one call, 10 lines back, always-fresh index.

## After completing work

1. Delete `.lex/wip.md`
2. Rewrite `.lex/status.md` (~30 lines, current state)
3. Append session summary to `.lex/sessions/YYYY-MM-DD.md`
4. New learnings -> append to pages/ (mistakes.md / patterns.md / design.md)
5. Final audit.log entry

The next agent - on any platform - depends on these files being accurate.
