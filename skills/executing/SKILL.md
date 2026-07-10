---
name: executing
description: Execute implementation plans with review checkpoints. Use when you have a written plan and need to implement it task by task, verifying each step.
---

# Executing Plans

Work through a plan task by task with verification at each step.

## Process

1. **Read the plan** - understand all tasks and dependencies
2. **Create `.lex/wip.md`** - list all tasks with checkboxes
3. **For each task:**
   a. Mark it in-progress in wip.md
   b. If the task involves new code, consider using the `tdd` skill
   c. Implement the task
   d. Verify it works (run tests, build, or manual check)
   e. Mark it complete in wip.md
   f. Log to `.lex/audit.log`
4. **After all tasks:** invoke `verification` skill for final check

## Rules

- One task at a time. Do not jump ahead
- If a task fails verification, fix it before moving to the next
- If the plan needs adjustment mid-execution, update the plan file and note why
- Update `.lex/wip.md` after EVERY task (crash recovery)
- If blocked on a task, log the blocker and move to the next unblocked task
- After completion: update `.lex/status.md`, write session summary, delete `wip.md`

## Checklist Discipline

Before executing a plan: create one tracked task per plan task (platform todo/task
tool if available, otherwise a checklist in wip.md). Mark in_progress when starting,
completed only when its verification step passed. Never batch-complete items.
