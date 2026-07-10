---
name: brainstorming
description: Explore ideas before building. Use when the user wants to create a feature, build something new, or add functionality. Asks questions, proposes approaches, gets design approval before any code.
argument-hint: "[topic]"
---

# Brainstorming

Turn ideas into designs through collaborative dialogue. No code until the design is approved.

<HARD-GATE>
No code, no file edits, no scaffolding until the user approves the design. This
applies to EVERY task regardless of perceived simplicity. "Simple" projects are
where unexamined assumptions waste the most work.
</HARD-GATE>

## Red Flags - Stop If You Think This

| Thought | Reality |
|---|---|
| "Too simple to need a design" | Simple things grow complex. A 3-sentence design costs nothing |
| "I'll prototype while we talk" | Prototypes become the product. Design first |
| "The user clearly knows what they want" | Then approval takes one message. Ask anyway |
| "I need to write code to explore" | Reading code is fine. Writing it is not |

## Process

1. **Understand context** - check `.lex/status.md`, recent sessions, project patterns
2. **Ask one question at a time** - prefer multiple choice. Understand purpose, constraints, success criteria
3. **Propose 2-3 approaches** - with trade-offs and your recommendation. Lead with the recommended option
4. **Present design section by section** - get approval after each section. Scale detail to complexity
5. **Write spec** - save to `docs/specs/YYYY-MM-DD-<topic>.md`. Commit it
6. **Transition** - invoke the planning skill to create an implementation plan

## Rules

- One question per message
- Multiple choice when possible
- Never write code before design approval
- YAGNI ruthlessly - remove unnecessary features from all designs
- Design for isolation: each unit has one clear purpose, communicates through defined interfaces
- In existing codebases: follow existing patterns, don't propose unrelated refactoring
- Check `.lex/pages/design.md` and `.lex/pages/patterns.md` for project-specific conventions

## Design Sections

Cover as needed (scale each to its complexity):
- Architecture and components
- Data flow
- Error handling
- Testing approach
- UI/UX direction (if applicable - never boring, never template-looking)

## After Approval

Write the spec document. Then invoke the `planning` skill to create the implementation plan.
