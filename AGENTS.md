# lex - Universal Coding Companion

This plugin provides reasoning, efficient code, design intelligence, project memory, and crash recovery.

On session start, read `.lex/skills/using-lex/SKILL.md` for the full protocol. All other skills are in `.lex/skills/` and invoked on demand by reading their SKILL.md.

## MANDATORY session start (every time, no exceptions)

1. Read `.lex/status.md` - know where the project stands
2. Check if `.lex/wip.md` exists - if yes, another agent was interrupted. Read it. Resume or ask the user.
3. Scan `.lex/INDEX.md` - know what knowledge exists. Do NOT load all pages.

## MANDATORY before any task

1. Run `lex check` (or gateway `{"cmd":"check"}`) — verifies index is fresh, server running, no guard violations. Auto-fixes stale index, auto-starts server. If FAIL: fix issues before proceeding.
2. Create `.lex/wip.md` with the plan and steps. This is NOT optional. If you start a task without wip.md, crash recovery is impossible.
3. Update wip.md after every significant step (file written, test run, decision made).
4. Append to `.lex/audit.log`: `YYYY-MM-DD HH:MM | agent | platform | action | target`

## Search the index, NOT the filesystem

Before grep-ing or reading whole files, use the lex index (zero tokens, instant):

**The index auto-refreshes.** Gateway commands (`search`, `symbols`, `grep`, `refs`, `memory`) check file mtimes and re-index stale files before returning results. No manual refresh needed — even on platforms where the PostToolUse hook doesn't fire (Windsurf, Cursor).

```
lex search <terms>     # find where something is (returns lines, not files)
lex memory <terms>     # search only .lex/pages/ (mistakes, patterns, design, approaches)
lex symbols <file>     # see what's in a file without reading it
lex links <route>      # find route + every frontend consumer
lex refs <symbol>      # find all references to a function/class/variable
lex status             # one-command health check (files, wip, guard)
lex diff               # what files changed since last index
lex docs <term>        # search distilled API docs + design systems cache
lex errors             # fetch console + app errors from running server (auto-persists to mistakes.md)
lex test <url> [method] [--xss]  # test an API endpoint + security scan (or run XSS scan with --xss)
lex devloop [file]     # test ALL indexed endpoints, report pass/fail + security findings + errors
lex note <text>        # record a mistake/fix to .lex/pages/mistakes.md
lex recall <terms>     # search persistent + episodic memory in one call (mistakes, patterns, design, sessions)
lex episode <json>     # write a session summary to .lex/sessions/ for episodic memory
lex run <command>      # wrap app execution, capture errors, report to server
lex guard              # scan for exposed secrets + DB anti-patterns
lex check              # pre-flight: wip.md exists, index fresh, no guard violations
lex tokens             # session token usage (sent/received, files read/written)
```

Do NOT grep the whole project and read 500-line files when one `lex search` gives you the 10 lines you need. The index is the shared brain. Use it.

## Building UI: ALWAYS query design docs first

Before writing any UI component, page, or layout, query the distilled design systems:

```
lex docs "card component"       # get exact JSX patterns with specific classes
lex docs "color palette saas"   # get exact hex values for your product type
lex docs "button hover"         # get exact hover/transition patterns
lex docs "touch target mobile"  # get accessibility rules
lex docs "spacing typography"   # get exact scale values
```

Available design systems in the cache:
- `design-saas-dashboard.md` - Dark glassmorphism dashboards (colors, cards, tables, sidebar)
- `design-landing-page.md` - Modern minimal landing pages (hero, features, pricing, CTA)
- `design-ecommerce.md` - Clean commerce (product cards, cart, badges, ratings)
- `design-mobile-app.md` - iOS/React Native (list items, tab bar, inputs, safe areas)
- `design-rules-quick-reference.md` - Critical UX rules (contrast, touch, focus, animation)

DO NOT generate UI from scratch. Always query the design system first, then adapt the exact tokens and component patterns to your project.

## Gateway: use lex WITHOUT running commands

You can use lex search, symbols, patch, grep, refs, undo, and more **without `run_command`**.
Write a request to `.lex/in/` using `write_to_file` - the PostToolUse hook processes it
automatically and injects the result into your context as additionalContext.

Three input formats (all work, pick the lightest):

```
# 1. Empty file = no-arg command (filename IS the command, 21% less overhead)
write_to_file('.lex/in/errors.json', '', true)   # → {cmd:"errors",args:[]}

# 2. Plain text = cmd + args (17% less overhead than JSON)
write_to_file('.lex/in/r.json', 'search ValidationError')           # → {cmd:"search",args:["ValidationError"]}
write_to_file('.lex/in/r.json', 'grep res\\.status|src/app.js')     # → {cmd:"grep",args:["res\\.status","src/app.js"]}

# 3. JSON = full control (backward compatible)
write_to_file('.lex/in/req.json', '{"cmd":"search","args":["InputError"]}')
```

The result appears in your context immediately. No commands, no PowerShell quoting, no approval.

### Available commands

| cmd | args | example |
|-----|------|---------|
| `search` | `["terms"]` | `{"cmd":"search","args":["InputError"]}` |
| `memory` | `["terms"]` | `{"cmd":"memory","args":["InputError"]}` |
| `recall` | `["terms"?]` | `{"cmd":"recall","args":["FTS5"]}` (persistent + episodic memory in one call) |
| `episode` | `[{json}]` | `{"cmd":"episode","args":[{"title":"...","summary":"...","files":[...]}]}` |
| `docs` | `["terms"?]` | `{"cmd":"docs","args":["hasMany"]}` (search distilled API docs cache) |
| `symbols` | `["file.js"]` | `{"cmd":"symbols","args":["src/app.js"]}` |
| `grep` | `["pattern","file?"]` | `{"cmd":"grep","args":["res\\.status","src/app.js"]}` |
| `read` | `["file","start-end?"]` | `{"cmd":"read","args":["src/app.js","10-20"]}` |
| `patch` | `{file,anchor,insertion,mode}` | `{"cmd":"patch","args":{"file":"src/app.js","anchor":"const x=1","insertion":"const y=2;","mode":"after"}}` |
| `insert` | `{file,after?,before?,line}` | `{"cmd":"insert","args":{"file":"src/app.js","after":"const x=1","line":"const y=2;"}}` |
| `rename` | `{file?,from,to}` | `{"cmd":"rename","args":{"from":"oldName","to":"newName"}}` (omit `file` for multi-file) |
| `delete` | `["file"]` | `{"cmd":"delete","args":["src/old.js"]}` (safe delete to .lex/trash/) |
| `batch` | `[cmd1,cmd2,...]` | `{"cmd":"batch","args":[{"cmd":"search","args":["err"]},{"cmd":"symbols","args":["src/app.js"]}]}` |
| `diff` | `[]` | `{"cmd":"diff","args":[]}` |
| `errors` | `[]` | `{"cmd":"errors","args":[]}` (auto-persists to mistakes.md) |
| `note` | `["text"]` | `{"cmd":"note","args":["Fixed N+1 query in User model - eager load relations"]}` |
| `audit` | `["url1","url2"?]` | `{"cmd":"audit","args":[]}` (omit URLs for auto-detect) |
| `integrity` | `["file.html"?]` | `{"cmd":"integrity","args":["landing.html"]}` (omit file for all .html in root) |
| `test` | `[{url,method?,mode?}]` | `{"cmd":"test","args":[{"url":"http://127.0.0.1:3000/api/users","method":"GET"}]}` (set `mode:"xss"` for XSS scan) |
| `devloop` | `["file"?]` | `{"cmd":"devloop","args":["src/api/auth.js"]}` (test all indexed endpoints, report pass/fail + security findings) |
| `convert` | `{input,output,width?,height?,size?,multi?,scale?}` | `{"cmd":"convert","args":{"input":"hero.svg","output":"hero.png","width":1200,"height":630}}` (SVG to PNG/WebP/ICO, PNG to ICO) |
| `links` | `["/api/users"?]` | `{"cmd":"links","args":["/api/users"]}` (omit arg for all) |
| `undo` | `[]` | `{"cmd":"undo","args":[]}` |
| `snapshot` | `["save","file1","file2"]` | `{"cmd":"snapshot","args":["save","src/app.js"]}` |
| `refs` | `["symbol"]` | `{"cmd":"refs","args":["InputError"]}` |
| `recent` | `[limit]` | `{"cmd":"recent","args":[10]}` |
| `guard` | `[]` | `{"cmd":"guard","args":[]}` |
| `check` | `[]` | `{"cmd":"check","args":[]}` (health check: auto-refresh, auto-start server) |
| `chain` | `[{cmd,args,as?,stopOnError?},...]` | `{"cmd":"chain","args":[{"cmd":"search","args":["foo"],"as":"results"},{"cmd":"grep","args":["$prev.output"]}]}` (multi-step with context passing) |
| `task` | `["list"\|"create",{cmd,...}\|"get","id"\|"clear"]` | `{"cmd":"task","args":["create",{"cmd":"search","args":["test"]}]}` (background task queue) |
| `proactive` | `["file.js"?]` | `{"cmd":"proactive","args":["lib/indexer.js"]}` (context-aware memory surfacing — no need to search, memories come to you) |
| `synth` | `["--dry-run"?,"--date=YYYY-MM-DD"?]` | `{"cmd":"synth","args":["--dry-run"]}` (auto-synthesize session episode from audit.log) |
| `decay` | `["--apply"?]` | `{"cmd":"decay","args":["--apply"]}` (compress old episodes, detect recurring patterns) |
| `assoc` | `["--apply"?]` | `{"cmd":"assoc","args":["--apply"]}` (build "see also" links between memories) |
| `promote` | `["--apply"?]` | `{"cmd":"promote","args":["--apply"]}` (promote recurring mistakes→patterns, referenced patterns→rules) |
| `capture` | `["--apply"?]` | `{"cmd":"capture","args":["--apply"]}` (detect edit→run→error→edit patterns in audit.log, auto-write to mistakes.md) |

### Patch modes: `after`, `before`, `replace`, `replace-line`, `delete`, `preview`

Patch returns diff + context. Auto-backup to `.lex/trash/` before writing. Use `undo` to revert.

- **`delete`**: removes the anchor (no insertion needed). If anchor is the only thing on its line, removes the whole line.
- **`rename`**: word-boundary find-replace across entire file. Use for renaming functions, variables, classes.

**Non-unique anchors**: If anchor matches multiple locations, patch shows all matches with numbered context. Add `"occurrence": N` to target match #N, or `"line": N` to target by line number.

```json
{"cmd":"patch","args":{"file":"src/app.js","anchor":"catch (e) {","insertion":"// handler","mode":"after","occurrence":2}}
```

**Short anchors**: Anchors as short as 5 chars work if they're unique. Use longer anchors (20+ chars) for best results.

**Batch mode**: Send multiple commands in one request to save the ~58 token per-call overhead. Results are separated by `---`.

```json
{"cmd":"batch","args":[{"cmd":"search","args":["InputError"]},{"cmd":"symbols","args":["src/app.js"]}]}
```

**Diff**: Shows files changed since last `lex refresh` (modified, added, deleted). Use before committing.

## Proactive Memory System

Lex has a multi-layer memory system that works without agent intervention:

### At session start
```
lex proactive              # surface memories based on current context (wip.md, recent files)
lex proactive lib/indexer.js  # surface memories for a specific file
```
Gateway: `{"cmd":"proactive","args":["lib/indexer.js"]}`

This is **context-aware retrieval** — it detects what you're working on and surfaces relevant past mistakes, patterns, design decisions, and session episodes. Ranked by recency × relevance × frequency × success_rate. Also shows related memories via association links.

### At session end (auto-synthesis)
```
lex synth --dry-run        # preview auto-generated session episode
lex synth                  # write episode to .lex/sessions/
lex synth --date=2026-07-15  # synthesize for a specific date
```
Gateway: `{"cmd":"synth","args":["--dry-run"]}`

Reads audit.log (file edits), wip.md (task), mistakes.md (new bugs) and auto-generates a structured episode. No need to manually call `lex episode`.

### Periodic maintenance
```
lex decay                  # preview which episodes would be compressed
lex decay --apply          # compress old episodes (backups in sessions/archive/)
lex assoc                  # preview "see also" links between memories
lex assoc --apply          # save links to .lex/links.json
lex promote                # preview which mistakes→patterns, patterns→rules
lex promote --apply        # write promotions to patterns.md and rules.md
lex capture                # detect edit→run→error→edit patterns, preview
lex capture --apply        # auto-write detected mistakes to mistakes.md
```

Decay tiers: < 7d full detail, 7-30d summary, 30-90d key decisions, > 90d minimal. Also detects recurring patterns in mistakes.

Promotion pipeline: mistakes seen 3+ times with similar root causes → auto-promoted to patterns.md. Patterns referenced in 3+ sessions → auto-promoted to rules.md. Original entries stay, `promoted_from` field traces the chain.

Real-time capture: watches audit.log for edit→run→error→edit sequences and auto-writes to mistakes.md with `auto_captured: true` flag. TODO fields left for agent to fill in the fix and rule.

## MANDATORY after completing work

1. Run `lex synth` to auto-synthesize session episode from audit.log
2. Delete `.lex/wip.md`
3. Rewrite `.lex/status.md` with current state (~30 lines max)
4. Extract learnings to `pages/mistakes.md`, `pages/patterns.md`, `pages/design.md`, or `pages/approaches.md`
5. Run `lex assoc --apply` to rebuild memory association links
6. Run `lex guard` before committing - never commit exposed secrets

## MANDATORY post-build verification (pages, UI, frontend)

After building or modifying any HTML/page/UI, you MUST verify before answering the user:

1. **Run `lex audit`** on the page URL (or `lex errors` if server is already running)
2. **Run `lex integrity`** on the HTML file(s) — checks for orphan CSS classes, undefined CSS variables, orphaned JS selectors, broken resource references, duplicate selectors
3. **Check console errors** — zero errors allowed. If errors exist, fix them before responding.
4. **Verify production build** — if using a dev build for debugging, switch back to production build and re-verify. The page must work with production React (no development-only warnings, no StrictMode double-invoke masking).
5. **Visual check** — confirm the page renders without blank sections, broken layouts, or missing content.
6. **Only then provide your answer.** Do not tell the user "hard refresh and check" — YOU verify first.

```
lex audit http://127.0.0.1:8093/landing-react.html
lex integrity landing-react.html
lex errors
# If errors > 0: fix, re-audit, repeat until clean
# If integrity score < 80: fix orphan classes, undefined vars, broken refs
# If using React dev build: switch to production build, re-verify
# Then respond to user
```

This protocol exists because agents frequently ship broken pages — missing parens, orphaned intervals, dev-only builds — and tell the user to "just refresh." The agent has the tools to verify. Use them.

## Enforcement (hooks enforce, instructions suggest)

- PostToolUse hook WARNS you if you edit without wip.md - you WILL see the warning.
- PostToolUse hook AUTO-LOGS every edit to audit.log - no manual logging needed.
- Git pre-commit hook runs `lex guard` and BLOCKS commits with CRITICAL violations.
- `.lex/agent.json` controls enforcement rules. Run `lex check` before starting work.
