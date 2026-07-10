# Debugging Overlay - TypeScript

Stack-specific debugging techniques. Load alongside debugging/SKILL.md when
language is TypeScript or JavaScript.

## Tools

- **console.log / console.dir**: `console.log(value)` for primitives,
  `console.dir(value, { depth: null })` for nested objects.
- **console.trace()**: prints stack trace at current point.
- **debugger statement**: `debugger;` in code pauses execution if devtools
  or inspector is attached.
- **Node inspector**: `node --inspect script.js` then open
  `chrome://inspect`. Breakpoints, watch, repl in browser devtools.
- **VS Code debugger**: F5 with launch.json. Breakpoints, conditional
  breakpoints, log points (no code change needed).
- **tsc --noEmit**: type-check without emitting. Catches type errors before
  runtime.
- **eslint**: `npx eslint file.ts` catches common patterns (no-unused-vars,
  no-explicit-any, etc).

## Common TypeScript Bug Patterns

- **undefined vs null**: both exist. `??` catches null and undefined, `||`
  catches all falsy (0, "", false). Know which you need.
- **Type assertion hides bugs**: `as MyType` bypasses the compiler. If the
  runtime type differs, it crashes far from the assertion. Prefer type guards:
  `if (typeof x === 'string')`.
- **any poisoning**: `any` disables checking. One `any` in a chain makes the
  whole chain untyped. Use `unknown` and narrow.
- **Array vs not-array**: `arr.map` on a non-array throws. Check
  `Array.isArray(arr)` before array methods.
- **async without await**: forgetting `await` on an async call returns a
  Promise, not the value. The code continues without the result. No error,
  just wrong behavior.
- **this binding**: callback loses `this`. Use arrow functions or `.bind()`.
- **=== vs ==**: always use `===`. `==` does type coercion (`"1" == 1` is
  true).
- **Optional chaining short-circuits**: `a?.b.c` - if `a` is nullish, the
  entire chain stops. `c` is never evaluated. This is usually correct but can
  hide that `.c` was expected to run.

## Debugging Flow

1. Check the error in browser console or terminal output.
2. If it is a type error at runtime: run `tsc --noEmit` to find the mismatch.
3. If it is a logic bug: add `console.log(JSON.stringify(value, null, 2))` at
   computation boundaries.
4. If it is in Node: `node --inspect-brk script.js` and step through in
   devtools.
5. If it is in browser: set breakpoint in Sources tab, reload, inspect scope
   variables.
6. If it is async: check that every `async` call has `await`. Missing `await`
   is the #1 source of silent async bugs.
