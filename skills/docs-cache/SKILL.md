---
name: docs-cache
description: Global distilled docs cache. Use BEFORE writing code against any unfamiliar API, any library version newer than your training data, or any signature you are not certain of. Check the cache, fetch and distill on miss, never guess.
---

# Docs Cache

Training data goes stale; the cache does not. Signatures come from the cache or
from docs fetched this session - never from memory alone.

<HARD-GATE>
If the API is unfamiliar, version-sensitive, or newer than your knowledge, you
may NOT write code using it until you have either a cache hit or freshly
fetched documentation in this session. "It probably still works like X" is a
guess, not a source.
</HARD-GATE>

## Protocol

1. Query: `node <plugin-root>/bin/lex.js docs <term>` (one distinctive term;
   terms are ANDed with an OR fallback). Hit: use it, done.
2. Miss: fetch the real documentation - a docs MCP if available, otherwise the
   official docs on the web. Read what you need for the task at hand.
3. Distill while it is fresh: write or update a sheet at
   `~/.lex/docs/<stack>-<major.minor>/<topic>.md` using
   `templates/docs-sheet.md`. Exact signatures, version gotchas, near-misses.
   Under 300 lines. Never paste raw docs pages.
4. Re-run the query to confirm the sheet is indexed, then write the code.

## Rules

- One sheet per topic, updated in place - never duplicate sheets per project.
- The version in frontmatter is the version you verified, not the one you hope.
- Project on a different MAJOR version than a cached sheet: re-verify and
  re-distill; do not silently reuse.
- The cache is global (shared across all projects) and compounds: every miss
  you fill makes every future session on every project faster.
- Sheets are plain markdown - safe to read directly when the CLI is unavailable.

## Red Flags - Stop If You Think This

| Thought | Reality |
|---|---|
| "I remember this API" | Your memory has a cutoff. The cache does not |
| "Fetching docs is slow" | One fetch now beats a debugging session later |
| "I'll distill it later" | Later never comes. Distill while it is open |
| "The whole docs page is useful" | 300 distilled lines beat 10,000 raw ones |
