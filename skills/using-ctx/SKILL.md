---
name: using-ctx
description: Bootstrap for ctx - the universal coding companion. Loaded every session. Establishes the protocol for project memory, skill invocation, reasoning steps, token efficiency, and crash recovery. Must fire before any other action.
---

# ctx - Universal Coding Companion

You have ctx installed. It gives you project memory, reasoning steps, efficient code style, design intelligence, token-efficient operation, and crash recovery.

## Session Start Protocol

Every session, before ANY response:

1. Check if `.ctx/` folder exists in the project root
   - YES: Read `.ctx/status.md` (~30 lines). Check if `.ctx/wip.md` exists (crash recovery).
   - NO: This is a new project. Offer to run `/context-health` to initialize.
2. If `wip.md` exists after a compaction in the SAME conversation: continue silently.
   If it exists on a COLD start (new conversation): show the user what was in
   progress in 2-3 lines. Ask: resume or start fresh?
3. Scan `.ctx/INDEX.md` to know what knowledge exists. Do NOT load knowledge pages yet.

## Before Any Task

4. Determine task type: UI, backend, bug fix, new feature, refactor, docs
5. Load ONLY the relevant knowledge pages from `.ctx/pages/`:
   - Bug fix: `mistakes.md`
   - UI work: `design.md` + `patterns.md`; then follow the design-intelligence
     skill's loading rule (one style page + picked palette/fonts only)
   - Backend: `patterns.md`
   - New feature: `patterns.md` + `design.md`
   - Setup/boot/test/deploy questions: `run.md`
   - Any task: check `mistakes.md` if doing something similar to a past failure
6. Do NOT bulk-load all pages. Token budget for .ctx/ content: under 200 lines per session.

## Before Writing Code

7. Is there a simpler way? Ladder:
   a. Does this need to exist at all?
   b. Standard library does it? Use it.
   c. Native platform feature covers it? Use it.
   d. Already-installed dependency solves it? Use it.
   e. Can it be one line? One line.
   f. Only then: the minimum code that works.
8. Does this match the project's patterns? (check `patterns.md` if loaded)
9. If UI: is this intentional design or template-looking? Never boring. Never what every AI generates.
10. Unfamiliar or version-sensitive API? Invoke the docs-cache skill: check
    `ctx docs <term>` before writing the call, fetch-and-distill on miss.

## Code Output Rules

- NEVER use em dashes. Not in code, not in comments, not in output, not in commit messages. Use hyphens (-) or rephrase. This is enforced, not optional.
- No unnecessary comments. Only comment the WHY when non-obvious.
- No emojis in code or output unless user asks.
- No boilerplate, no scaffolding "for later."
- Shortest working diff wins.
- Fewest files possible.
- Deletion over addition. Boring over clever.

## Token Efficiency

These rules reduce token consumption on every agent:

### Read smart, not wide
- Before reading a file, check wip.md "Files read this session" list. Already read? Skip.
- Use search/grep to find the relevant lines BEFORE reading a whole file.
- Read with line offsets and limits. Never dump an entire 500-line file when you need 20 lines.
- One targeted read beats three exploratory reads.

### Output lean
- No trailing summaries of what you just did. The diff is visible.
- No preambles ("Let me think about this..."). Just act.
- Responses under 3 sentences unless the user asks for detail.
- State results, not process.

### Don't re-derive
- status.md tells you the project state. Don't re-scan to confirm.
- patterns.md tells you conventions. Don't re-read files to rediscover them.
- mistakes.md tells you what failed. Don't repeat the investigation.
- If you learned something this session, add it to wip.md so you don't re-derive it later in the same session.

### Tool focus
Use the tool that matches the stack, not the generic one. If an MCP server matching
the project's stack is connected (Postgres/MySQL MCP for DB questions, Playwright MCP
for E2E, Stripe MCP for payments, GitHub MCP for PRs/CI), prefer it over shell probing
or guessing. The viewer's `/api/mcps` endpoint lists stack-matched suggestions for
this project; recommend missing ones to the user only when a task would clearly
benefit - not as a routine.

The static map only knows common stacks. If it returns nothing (or misses the tech
you are actually working with), infer suggestions yourself from stack.md and the
manifests - you know the MCP ecosystem better than any hardcoded list. Same rule
applies: suggest only what the current task needs.

### Continuity protocol (three layers)

Layer 1 - ambient: update wip.md after EVERY significant step (file written, decision
made, test run). State on disk must never be more than one step old.

Layer 2 - deliberate: the moment you notice context pressure (low-context system
warnings, platform usage indicators around 80%), STOP and flush before continuing:
current step and remaining steps to wip.md, any unrecorded decisions to pages/.
Do not wait for compaction to happen to you.

Layer 3 - backstop (hook platforms): a PreCompact hook logs the event to audit.log,
and the SessionStart hook re-injects this bootstrap plus CURRENT PROJECT STATE
(status.md) and INTERRUPTED WORK (wip.md) after compaction automatically.

After ANY compaction or context loss: state was already rehydrated or is one read
away (status.md + wip.md). CONTINUE the work silently from the current step. Do not
ask the user to re-explain. Do not re-derive what the files already say.

## Structural Queries (ctx-index)

The plugin ships a self-maintaining SQLite index (`.ctx/index.db`, regenerable,
gitignored). When node is available, prefer one index query over grep-and-read chains:

Structural-query ladder: if a code-graph MCP (e.g. codebase-memory-mcp) is
connected, use it for call-graphs, dead code, and trace-paths; for
where-is-X and references use `ctx search`; if node is unavailable, grep.

- Where is something: `node "<plugin-root>/bin/ctx.js" search <terms>` (10 lines max)
- Search terms are ANDed - prefer one distinctive term over several common ones.
- What is in a file: `node "<plugin-root>/bin/ctx.js" symbols <file>` (skip reading whole files)
- What talks to a route: `node "<plugin-root>/bin/ctx.js" links dashboard/tasks` (backend route + frontend consumers; slashless form avoids Git Bash path mangling on Windows)
- Stack docs: `node "<plugin-root>/bin/ctx.js" docs <term>` searches the global
  distilled docs cache (~/.ctx/docs/), built up by the docs-cache skill.
- Large legacy folders: list path prefixes in `.ctx/ignore` (one per line) to exclude them from indexing.

On Claude Code, `<plugin-root>` is `${CLAUDE_PLUGIN_ROOT}`; a PostToolUse hook keeps
the index fresh automatically. On other platforms the index lazily refreshes on every
query, so results are always current. If node is unavailable, fall back to grep - the
index is an enhancer, never a requirement. True call-graphs and dead-code detection
are out of scope by design; `search` gives reference-level answers.

## During Work

10. Create `.ctx/wip.md` at task start:
    ```markdown
    # Work In Progress
    started: YYYY-MM-DD HH:MM
    agent: model-name
    via: platform-name
    task: Brief description

    ## Plan
    1. [ ] Step one
    2. [ ] Step two

    ## Files read this session
    - (track files read to avoid re-reads)

    ## Files modified
    - (updated as work proceeds)

    ## Current state
    (what's done, what's left)
    ```
11. Update `wip.md` checkboxes after each significant step.
12. Append to `.ctx/audit.log`: `YYYY-MM-DD HH:MM | agent | platform | action | target`

## After Completing Work

13. Delete `.ctx/wip.md`
14. Rewrite `.ctx/status.md` with current state (~30 lines max)
15. Append compressed session summary to `.ctx/sessions/YYYY-MM-DD.md`
16. Extract learnings:
    - New pattern discovered: append to `pages/patterns.md`
    - Something broke: append to `pages/mistakes.md`
    - Design decision made: append to `pages/design.md`
17. Update `.ctx/INDEX.md` if new pages were added
18. Final audit.log entry for session end

## Auto-Grow: When Structure Changes

When you CREATE new files, folders, modules, or components during work:
- Update `pages/stack.md` with the new structure
- Add new patterns to `pages/patterns.md` if a new convention was established
- Update `pages/design.md` if new UI patterns were introduced

When you DELETE or RENAME files, folders, modules, or components:
- Remove stale references from `pages/stack.md`
- Remove patterns from `pages/patterns.md` that reference deleted code
- Remove design rules from `pages/design.md` that reference deleted components
- Check `pages/mistakes.md` - if a mistake references deleted code, keep the rule but note the code is gone

When dependencies change (new packages installed, packages removed):
- Update `pages/stack.md` tech section

The knowledge base must reflect the project AS IT IS, not as it was. Stale knowledge is worse than no knowledge.

## Auto-Prune: Keeping .ctx/ Lean

When `sessions/` has more than 20 files:
- Summarize the oldest sessions into phase summaries in `pages/`
- Remove the individual session files that were summarized
- Update INDEX.md

When any knowledge page exceeds 100 lines:
- Keep the most recent and relevant entries
- Archive the rest to `pages/archive/` (create if needed)
- Update INDEX.md

When INDEX.md exceeds 40 lines:
- Consolidate session entries by phase/month
- Remove entries for archived/deleted pages

## Multi-Agent Handoff

The primary use case: Agent A was working, session ended or crashed, Agent B picks up.

wip.md is the handoff signal:
- If wip.md exists when you start: another agent was here before you. Read it. You know exactly what was in progress, which steps are done, which files were touched.
- When you finish: delete wip.md. The next agent starts clean.
- If YOU crash: wip.md survives. The next agent (even on a different platform) resumes your work.

For simultaneous agents working on the SAME project:
- Each agent should work in its own git branch or worktree
- .ctx/ lives on the main branch - read it before branching
- After merging back, the merging agent updates .ctx/
- audit.log is append-only - both entries survive a merge
- Knowledge pages: if both agents added entries, keep both on merge
- status.md: the agent that merges last rewrites it with current state

## Session Summary Format

```markdown
---
date: YYYY-MM-DD
agent: model-name
via: platform-name
---

# Brief Title

## What happened
1-3 sentences.

## Decisions
- decision: why

## Learned
- pattern/mistake/design rule (and which page it was added to)

## Files touched
file1, file2, file3
```

## Available Skills

Invoke these via your platform's skill tool when they apply. If no skill tool exists, read the SKILL.md file directly.

| Skill | When to use | Trigger |
|-------|-------------|---------|
| brainstorming | Before building anything new | "let's build", "add feature", "I have an idea" |
| planning | Multi-step task needs a plan | After brainstorming, or "plan this" |
| executing | Have a plan, need to execute it | After planning is complete |
| tdd | Implementing a feature or fix | Before writing implementation code |
| debugging | Bug, test failure, unexpected behavior | Before proposing fixes |
| docs-cache | Unfamiliar or version-sensitive API | Before writing calls against it |
| verification | About to claim work is done | Before committing or saying "done" |
| code-review | Code was written or modified | After writing code, before merge |
| efficient-code | Writing any code | Always active - shortest diff, YAGNI |
| design-intelligence | UI or frontend work | Any visual component, page, or layout |
| subagent-dispatch | 2+ independent tasks | Tasks with no shared state |
| finishing-branch | Implementation complete, tests pass | Before merge, PR, or cleanup |
| context-health | Context growing large, session long | When approaching context limits |

## Skill Priority

1. Process skills first: brainstorming, debugging (determine HOW to approach)
2. Implementation skills second: tdd, design-intelligence (guide execution)
3. Quality skills last: verification, code-review (confirm correctness)

efficient-code is always active. It's not invoked - it's a stance.

## Platform Adaptation

Skills describe actions, not tool names. Per-platform tool mappings: see references/*-tools.md - claude-code (also Cursor), codex, gemini, copilot, windsurf, antigravity, trae, universal

## The Non-Negotiables

- NEVER skip `.ctx/` updates after work. The next agent depends on it.
- NEVER bulk-load all knowledge pages. Load only what the task needs.
- NEVER leave `wip.md` after completing work. Delete it.
- NEVER re-read a file you already read this session without reason.
- NEVER design boring UI. If it looks like every AI-generated template, redo it.
- NEVER add code comments explaining WHAT. Only comment WHY when non-obvious.
- NEVER use em dashes anywhere. Hyphens (-) only.
- ALWAYS log to audit.log. The trail is how we know who did what.
- ALWAYS check wip.md on session start. Crash recovery is not optional.
- ALWAYS update stack.md when project structure changes.
- ALWAYS remove stale references when files are deleted.
