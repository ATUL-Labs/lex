---
name: subagent-dispatch
description: Dispatch independent tasks to parallel agents. Use when facing 2+ tasks that can be worked on without shared state or sequential dependencies.
---

# Subagent Dispatch

Split independent work across parallel agents for speed.

## When to Use

- 2+ tasks with no shared state or sequential dependencies
- Tasks that each have clear inputs, outputs, and verification criteria
- The plan already identifies which tasks are independent

## Process

1. **Identify independent tasks** from the plan
2. **Write a brief for each agent** - self-contained context:
   - What to build
   - Which files to create/modify
   - How to verify
   - Relevant `.lex/` knowledge (copy the relevant pages into the brief, do not reference paths the agent cannot access)
3. **Dispatch agents** - use your platform's subagent/task dispatch mechanism
4. **Collect results** - review each agent's work
5. **Integrate** - merge results, resolve any conflicts
6. **Verify** - run the full test suite after integration

## Agent Brief Template

```
Task: [title]
Context: [what this is part of, what already exists]
Deliverable: [specific files and their purpose]
Conventions: [from .lex/pages/patterns.md - paste relevant lines]
Mistakes to avoid: [from .lex/pages/mistakes.md - paste relevant lines]
Verification: [how to confirm this task is complete]
```

## Rules

- Each agent gets a self-contained brief. They start cold with no conversation context
- Do NOT reference `.lex/` paths in briefs - paste the relevant knowledge directly
- After dispatch, verify each result independently before integrating
- Log each agent's work to `.lex/audit.log` with the agent's model and platform
- If a platform has no subagent capability, do the tasks sequentially instead
