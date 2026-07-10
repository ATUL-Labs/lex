---
name: planning
description: Write implementation plans from specs or requirements. Use when you have a design and need to break it into executable steps. Creates task-by-task plans with file paths, dependencies, and verification criteria.
argument-hint: "[spec-path]"
---

# Planning

Turn a spec into an executable step-by-step plan.

## Process

1. **Read the spec** - understand what's being built and why
2. **Check `.lex/`** - load `patterns.md` for conventions, `mistakes.md` for what to avoid
3. **Decompose into tasks** - each task is independently testable, has clear inputs/outputs
4. **Order by dependencies** - what must exist before what
5. **Write the plan** - save to `docs/plans/YYYY-MM-DD-<topic>.md`
6. **Get user approval** - present the plan, let them adjust

## Task Format

Each task in the plan:

```markdown
### Task N: Brief title

**What:** One sentence describing the deliverable
**Files:** List of files to create or modify
**Depends on:** Task numbers that must be done first
**Test:** How to verify this task is complete
**Notes:** Constraints, gotchas, or references to .lex/ knowledge
```

## Rules

- Each task should be completable in one focused session
- Tasks must be independently verifiable (tests, build check, or manual verification)
- Order tasks so the project builds incrementally and is always in a working state
- Reference `.lex/pages/patterns.md` for naming conventions, folder structure
- Flag tasks that touch areas mentioned in `.lex/pages/mistakes.md`
- No speculative tasks. Only what the spec requires

## After Planning

Invoke the `executing` skill to begin implementation, or hand the plan to subagents via `subagent-dispatch`.
