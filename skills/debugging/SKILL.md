---
name: debugging
description: Systematic debugging. Use when encountering any bug, test failure, or unexpected behavior. Traces root causes before proposing fixes. Never guess-and-check.
---

# Systematic Debugging

Find the root cause. Do not guess.

<HARD-GATE>
No fix may be written before the root cause is stated in one sentence: "the bug is X
because Y". If you cannot say it, you are still investigating, not fixing.
</HARD-GATE>

## Red Flags - Stop If You Think This

| Thought | Reality |
|---|---|
| "Let me just try changing X" | Guess-and-check hides causes and burns sessions |
| "A null check will stop the crash" | It hides the symptom. Find WHY it is null |
| "It's probably the framework/library" | It is almost never the framework |
| "I'll wrap it in try/catch for now" | Silencing an error is not fixing it |

## Process

1. **Reproduce** - confirm the bug exists. Get the exact error message, stack trace, or unexpected output
2. **Locate** - narrow down where the bug is. Binary search through the code path:
   - What's the last known-good state?
   - What's the first known-bad state?
   - What changed between them?
3. **Understand** - read the code at the failure point. Understand what it's supposed to do vs what it does
4. **Root cause** - identify the actual cause, not the symptom. Ask: why does this code behave this way?
5. **Fix** - write the minimum fix for the root cause. Not a workaround. Not a band-aid
6. **Verify** - run the failing test/scenario. It should pass now. Run the full suite to check for regressions
7. **Learn** - if this was a new kind of mistake, add it to `.lex/pages/mistakes.md`

## Rules

- NEVER propose a fix before understanding the root cause
- NEVER add defensive code to hide the symptom (try/catch around the mystery, null checks everywhere)
- Check `.lex/pages/mistakes.md` first - this bug might match a known pattern
- If the bug is in test isolation, fix isolation, not the test
- If the bug is in a mock, check if the mock diverges from reality
- One fix per bug. Do not refactor while debugging
- Log the debugging outcome to `.lex/audit.log`
