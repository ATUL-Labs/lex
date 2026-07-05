# Verifying a ctx install

Run these checks after installing ctx on each platform. Five minutes per platform.

## Any platform (core protocol)

1. Open a project with a `.ctx/` folder. Ask the agent: "what is the current
   project state?" - it must answer from status.md WITHOUT you pasting anything.

2. Start a small task, kill the session mid-way. Reopen: the agent must mention
   the interrupted work (wip.md) and offer to resume.

3. Ask "where is <some function> used?" - with node installed the agent should
   run ctx search (one command), not a chain of greps.

## Claude Code (hooks - tier 1)

4. Session start: bootstrap + CURRENT PROJECT STATE section appear injected
   (ask: "what did your session-start context contain?").

5. Edit any file, then query `node <ctx>/bin/ctx.js search <new symbol>` -
   the PostToolUse hook must have indexed it already (zero manual refresh).

6. Run /compact, then continue working - the agent must resume silently from
   rehydrated state, not ask you to re-explain.

## Trae / Antigravity / Windsurf (rules-file platforms - tier 1)

7. Confirm the rules file is in place (.trae/rules/project_rules.md,
   Windsurf rules, Antigravity instructions per README).

8. Repeat checks 1-3. Additionally: after several steps of work, open
   .ctx/wip.md yourself - it must reflect the current step (cadence rule).

9. Cross-agent handoff (the hero scenario): start a task in Claude Code,
   close it, type "continue" in Trae - zero re-explaining expected.

## Codegraph MCP (optional tier B)

10. With codebase-memory-mcp connected: ask "what calls <function>?" - the
    agent should query the graph MCP, not grep.

## Recording results

Note pass/fail per check per platform in your own tracker. Failures in checks
1-3 are protocol bugs (file an issue); failures in 4-6 are hook wiring;
failures in 7-9 usually mean the rules file is missing or truncated.
