---
name: code-review
description: Review code for correctness, security, and quality. Use after writing or modifying code, and before merging. Catches bugs, security issues, and style problems.
argument-hint: "[low|medium|high]"
---

# Code Review

Review code with technical rigor. Not performative agreement.

## Effort Levels

- **low/medium**: High-confidence findings only. Real bugs, security holes, correctness issues
- **high**: Broader coverage. Style, efficiency, reuse opportunities. May include uncertain findings

## What to Check

1. **Secrets** - scan for hardcoded API keys, passwords, tokens, connection
   strings. String patterns: `sk-`, `pk_`, `AKIA`, `ghp_`, `xoxb-`, `eyJ`,
   `AIza`, long hex/base64 literals. Config files with values where env vars
   should be. Test fixtures with real credentials. Docker compose with real
   passwords. This is a CRITICAL finding - not a suggestion.
2. **Correctness** - does the code do what it claims? Edge cases? Off-by-one? Null handling?
3. **Security** - injection, XSS, CSRF, exposed secrets, unsafe deserialization, auth bypass
4. **Database design** - does the schema follow wide-table principles? 1-to-1
   tables that should be merged? Bounded 1-to-few relationships split into
   tables instead of columns? EAV pattern instead of JSON? Unnecessary joins
   for data that is always read together? See database-architecture skill.
5. **Efficiency** - N+1 queries, unnecessary allocations, O(n^2) where O(n) works
6. **Simplification** - can anything be shorter? Can duplicated code be shared? Is there a stdlib alternative?
7. **Consistency** - does it match project patterns? Check `.lex/pages/patterns.md`
8. **Known mistakes** - does this repeat anything from `.lex/pages/mistakes.md`?

## Output Format

For each finding:
```
[severity] file:line - description
  Why: explanation
  Fix: suggested fix (or "verify manually")
```

Severity: CRITICAL (must fix), IMPORTANT (should fix), MINOR (nice to have)

## Fix-and-Re-Review Loop

CRITICAL and IMPORTANT findings are not suggestions:
1. Fix them
2. Re-review the fix itself (fresh eyes on the fix diff)
3. Repeat until a review pass returns no CRITICAL or IMPORTANT findings
4. Only then report the work as clean

Verify fixes against the actual code, never against the claim that they were fixed.

## Rules

- Technical rigor over politeness. If something is wrong, say so directly
- If feedback seems wrong after investigation, push back. Do not blindly implement suggestions
- Review the actual diff, not what you think changed
- Check `.lex/pages/mistakes.md` - does this change repeat a known anti-pattern?
- **Secret scan is mandatory** - even if the code looks clean, scan for secret
  patterns. A leaked key is worse than a bug. Use `git log -p --all -S
  "pattern"` to check history if a secret is found.
- **Database schema review** - if migrations or schema changes are in the diff,
  check against the database-architecture skill: wide tables, no 1-to-1 tables,
  no EAV, denormalize fields read together.
