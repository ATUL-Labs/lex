# Efficient Code Overlay - TypeScript

Stack-specific efficiency patterns. Load alongside efficient-code/SKILL.md
when language is TypeScript or JavaScript.

## TypeScript Efficiency Ladder

1. **Array methods**: `.map()`, `.filter()`, `.reduce()` over manual loops.
   Chaining creates intermediate arrays; for large data, use a single
   `.reduce()` or `for...of` loop.
2. **Object spread**: `{...obj, key: value}` is O(n) in keys. For single
   property updates, direct mutation is faster (if immutability is not
   required).
3. **Set for uniqueness**: `new Set(array)` over `array.filter((x, i, a) =>
   a.indexOf(x) === i)`. O(n) vs O(n^2).
4. **Map over object for dynamic keys**: `Map` preserves insertion order,
   handles non-string keys, and has better performance for frequent
   add/remove.
5. **Optional chaining short-circuit**: `a?.b?.c` stops at first nullish.
   Cheaper than `a && a.b && a.b.c`.
6. **Avoid JSON.parse(JSON.stringify)**: for deep clone. Use
   `structuredClone()` (built-in, handles more types, faster).
7. **Debounce / throttle**: for event handlers (scroll, resize, input).
   `lodash.debounce` or a simple `setTimeout` wrapper.
8. **Lazy imports**: `const mod = await import('./heavy')` for code
   splitting. Load heavy dependencies only when needed.
9. **Buffer over string for binary**: `Buffer.from()` for binary data, not
   string encoding. String operations on binary data corrupt and are slow.
10. **Object.entries / Object.fromEntries**: for key-value transforms.
    `Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v * 2]))`.

## React-Specific

- **useMemo / useCallback**: only for expensive computations or stable
  references passed to memoized children. Not for every value.
- **React.memo**: wrap components that re-render unnecessarily. Check with
  React DevTools profiler first.
- **Virtualization**: `react-window` or `@tanstack/react-virtual` for lists
  over 100 items. DOM nodes are the bottleneck.
- **Key prop**: stable, unique keys for list items. Index as key causes
  re-render bugs when items reorder.
