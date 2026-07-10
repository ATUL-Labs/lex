# Code Review Overlay - TypeScript

Stack-specific review checks. Load alongside code-review/SKILL.md when
language is TypeScript or JavaScript.

## TypeScript-Specific Checks

1. **any usage**: `any` disables type checking. Use `unknown` and narrow, or
   define a proper type. `as any` is a review block.
2. **Type assertions**: `value as Type` bypasses the compiler. Prefer type
   guards: `if (typeof x === 'string')` or `if (Array.isArray(x))`.
3. **Non-null assertion (!)**: `value!.property` suppresses null check. If
   the value can be null, this crashes at runtime. Use optional chaining
   `value?.property` or explicit null check.
4. **XSS**: `dangerouslySetInnerHTML` in React, `innerHTML` in vanilla.
   Sanitize with DOMPurify if user content must be rendered as HTML.
5. **SQL injection**: template literals in queries. Use parameterized
   queries or a query builder.
6. **Prototype pollution**: `Object.assign({}, userJson)` with deeply nested
   user input. Use `Object.create(null)` or validate keys.
7. **eval / Function constructor**: `eval()`, `new Function()` with user
   input is RCE. Remove entirely.
8. **Async error handling**: `await` without try/catch in a function that
   can throw. Unhandled promise rejection crashes the process (Node 15+).
9. **Import type**: `import type { Type }` for type-only imports. Prevents
   runtime side effects and tree-shaking issues.
10. **Strict mode**: `tsconfig.json` has `"strict": true`? If not, null
    checks and implicit any are disabled. This is a project-level review flag.

## Framework-Specific

- **React**: keys on list items (not array index if items reorder). useEffect
  dependency array complete. No direct DOM manipulation. useState for
  derived state instead of useMemo when possible.
- **Express**: input validation on every route. Helmet for security headers.
  Rate limiting on auth routes. No `express.static` on untrusted paths.
- **Next.js**: server components vs client components marked correctly
  (`"use client"`). No secrets in client-side code. API routes validate input.
