# lex - Universal Coding Companion

This plugin provides reasoning, efficient code, design intelligence, project memory, and crash recovery.

On session start, read `.lex/skills/using-lex/SKILL.md` for the full protocol. All other skills are in `.lex/skills/` and invoked on demand by reading their SKILL.md.

## MANDATORY session start (every time, no exceptions)

1. Read `.lex/status.md` - know where the project stands
2. Check if `.lex/wip.md` exists - if yes, another agent was interrupted. Read it. Resume or ask the user.
3. Scan `.lex/INDEX.md` - know what knowledge exists. Do NOT load all pages.
4. Read `.lex/config.json` — single source of truth for language, framework, database, commands, paths, skip_dirs, schema_formats. If missing, run `lex config --detect`. NEVER guess DB type/path or create `database.sqlite` — if `config.database` is null, there is no database.

## MANDATORY before any task

1. Run `lex check` (or gateway `{"cmd":"check"}`) — verifies index is fresh, server running, no guard violations. Auto-fixes stale index, auto-starts server. If FAIL: fix issues before proceeding.
2. Create `.lex/wip.md` with the plan and steps. This is NOT optional. If you start a task without wip.md, crash recovery is impossible.
3. Update wip.md after every significant step (file written, test run, decision made).
4. Append to `.lex/audit.log`: `YYYY-MM-DD HH:MM | agent | platform | action | target`

## Use config.json for all project decisions

Consult `.lex/config.json` before any project-specific decision. Use `config.database` (never guess), `config.commands` (never guess framework commands), `config.paths` (never scan blindly), `config.skip_dirs`, `config.schema_formats`, `config.framework`. If stale, run `lex config --detect`.

## Search the index, NOT the filesystem

Before grep-ing or reading whole files, use the lex index (zero tokens, instant). The index auto-refreshes — gateway commands check file mtimes and re-index stale files before returning results.

```
lex search <terms>     # find where something is (returns lines, not files)
lex memory <terms>     # search .lex/pages/ (mistakes, patterns, design, approaches)
lex symbols <file>     # see what's in a file without reading it
lex refs <symbol>      # find all references to a function/class/variable
lex docs <term>        # search distilled API docs + design systems cache
lex recall <terms>     # search persistent + episodic memory in one call
lex errors             # fetch console + app errors (auto-persists to mistakes.md)
lex guard              # scan for exposed secrets + DB anti-patterns
lex check              # pre-flight health check
```

Do NOT grep the whole project and read 500-line files when one `lex search` gives you the 10 lines you need.

## Building UI: ALWAYS query design docs first

Before writing any UI, query the distilled design systems:

```
lex docs "card component"       # get exact JSX patterns with specific classes
lex docs "color palette saas"   # get exact hex values for your product type
lex docs "button hover"         # get exact hover/transition patterns
lex docs "touch target mobile"  # get accessibility rules
lex docs "spacing typography"   # get exact scale values
```

Available: `design-saas-dashboard.md`, `design-landing-page.md`, `design-ecommerce.md`, `design-mobile-app.md`, `design-rules-quick-reference.md`. DO NOT generate UI from scratch — always query the design system first.

## Gateway: use lex WITHOUT running commands

Write a request to `.lex/in/` using `write_to_file` — the PostToolUse hook processes it and injects the result into your context. No commands, no PowerShell quoting, no approval.

```
# 1. Empty file = no-arg command (filename IS the command)
write_to_file('.lex/in/errors.json', '', true)

# 2. Plain text = cmd + args
write_to_file('.lex/in/r.json', 'search ValidationError')

# 3. JSON = full control
write_to_file('.lex/in/req.json', '{"cmd":"search","args":["InputError"]}')
```

**Full command table, patch modes, and examples**: read `skills/using-lex/GATEWAY-REF.md`. Key commands: `search`, `symbols`, `grep`, `read`, `patch`, `insert`, `rename`, `delete`, `batch`, `chain`, `config`, `skills`, `errors`, `audit`, `integrity`, `test`, `devloop`, `convert`, `proactive`, `synth`, `recall`, `note`, `undo`, `snapshot`, `refs`, `links`, `guard`, `check`, `diff`, `recent`, `task`, `decay`, `assoc`, `promote`, `capture`.

## Skill Evolution: auto-generated skills

After major milestones, run `lex skills evolve` to auto-generate skills from session patterns (3+ occurrences). Auto-skills go to `.lex/skills/` with `auto-generated: true`, max 5 per project. Run `lex skills review --approve` to promote. Do NOT treat auto-skills as authoritative until approved.

## Proactive Memory System

At session start: `lex proactive` (or `{"cmd":"proactive","args":["lib/indexer.js"]}`) — context-aware retrieval surfaces relevant past mistakes, patterns, design decisions, and session episodes. Ranked by recency × relevance × frequency × success_rate.

At session end: `lex synth` auto-generates a session episode from audit.log. No need to manually call `lex episode`.

Periodic maintenance: `lex decay --apply` (compress old episodes), `lex assoc --apply` (build "see also" links), `lex promote --apply` (mistakes→patterns→rules), `lex capture --apply` (detect edit→run→error→edit patterns).

## MANDATORY after completing work

1. Run `lex synth` to auto-synthesize session episode from audit.log
2. Delete `.lex/wip.md`
3. Rewrite `.lex/status.md` with current state (~30 lines max)
4. Extract learnings to `pages/mistakes.md`, `pages/patterns.md`, `pages/design.md`, or `pages/approaches.md`
5. Run `lex assoc --apply` to rebuild memory association links
6. Run `lex guard` before committing - never commit exposed secrets

## MANDATORY post-build verification (pages, UI, frontend)

After building or modifying any HTML/page/UI, you MUST verify before answering:

1. `lex audit <url>` — browser audit (console errors, network, performance)
2. `lex integrity <file.html>` — orphan CSS, undefined vars, broken refs
3. Zero console errors allowed — fix before responding
4. Verify production build (not dev build) — no dev-only warnings
5. Visual check — no blank sections, broken layouts, missing content
6. Only then respond. Do NOT tell the user "just refresh and check" — YOU verify first.

## Enforcement (hooks enforce, instructions suggest)

- PostToolUse hook WARNS if you edit without wip.md
- PostToolUse hook AUTO-LOGS every edit to audit.log
- Git pre-commit hook runs `lex guard` and BLOCKS commits with CRITICAL violations
- `.lex/agent.json` controls enforcement rules
