---
name: tdd
description: Test-driven development. Use when implementing any feature or fix. Write the test first, watch it fail, write the minimum code to pass, then refactor.
---

# Test-Driven Development

Red-green-refactor. Every time.

<HARD-GATE>
If implementation code exists before its failing test, DELETE the implementation and
start from the test. Keeping it "since it's already written" defeats the cycle.
</HARD-GATE>

## Red Flags - Stop If You Think This

| Thought | Reality |
|---|---|
| "I'll write tests after, to save time" | Untested code is rework waiting to happen |
| "Too trivial to test" | Trivial code breaks too. It's a 30-second test |
| "The test obviously passes" | Run it anyway. Surprises live exactly here |
| "I'll just verify manually this once" | Manual checks do not survive the next change |

## Process

1. **RED** - Write a test that describes the desired behavior. Run it. It must FAIL.
2. **GREEN** - Write the minimum code to make the test pass. Nothing more.
3. **REFACTOR** - Clean up while tests still pass. Remove duplication. Improve names.
4. **Repeat** for each behavior.

## Rules

- Write the test BEFORE the implementation. No exceptions.
- Run the test and confirm it FAILS before writing implementation code. A test that passes on first run proves nothing.
- Write the MINIMUM code to pass. Not the elegant version. Not the complete version. The minimum.
- One behavior per test. Test names describe behavior: `it_returns_404_for_unknown_slug`
- Use the project's existing test framework and patterns (check `.lex/pages/patterns.md`)
- Use factories/builders for test data, not hand-written arrays
- Fix the implementation, not the test (unless the test is wrong)
- After TDD: run the full test suite to check for regressions

## Test Structure

Arrange-Act-Assert:
```
// Arrange: set up the state
// Act: perform the action
// Assert: verify the outcome
```
