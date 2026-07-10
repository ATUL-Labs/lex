---
name: finishing-branch
description: Finish a development branch - decide how to integrate work. Use when implementation is complete, tests pass, and you need to merge, create a PR, or clean up.
---

# Finishing a Branch

Implementation done, tests pass. Now decide how to integrate.

## Process

1. **Verify** - invoke the `verification` skill if not already done
2. **Review the diff** - `git diff main...HEAD` to see all changes from this branch
3. **Present options to user:**
   - **Merge directly** - if it's a solo project or user has merge rights
   - **Create PR** - with title, summary, and test plan
   - **Squash and merge** - if many small commits should be one clean commit
   - **Clean up only** - user will handle integration themselves
4. **Execute the chosen option**
5. **Update `.lex/`** - status.md, session summary, clean up wip.md

## PR Format

```markdown
## Summary
1-3 bullet points describing what changed and why

## Test plan
- [ ] Verification steps
- [ ] Edge cases checked

Generated with lex
```

## Rules

- Always show the full diff before asking how to integrate
- Never force-push to main/master without explicit user approval
- Never skip hooks (--no-verify) unless user explicitly asks
- If the branch has merge conflicts, resolve them before proceeding
- Log the integration action to `.lex/audit.log`
