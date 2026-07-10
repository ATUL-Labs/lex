# Efficient Code Overlay - Python

Stack-specific efficiency patterns. Load alongside efficient-code/SKILL.md
when language is Python.

## Python Efficiency Ladder

1. **List/dict comprehensions**: `[x*2 for x in items]` faster than
   `for x in items: result.append(x*2)`. Generator expressions `(x*2 for x
   in items)` for lazy evaluation.
2. **Built-in functions**: `map()`, `filter()`, `sum()`, `any()`, `all()`
   are C-implemented and faster than Python loops.
3. **collections module**: `Counter` for counting, `defaultdict` for
   grouping, `deque` for queue operations (O(1) popleft vs O(n) list.pop(0)).
4. **String joining**: `"".join(parts)` over `+=` in a loop. String
   concatenation in a loop is O(n^2) because strings are immutable.
5. **Slots**: `class Foo: __slots__ = ('x', 'y')` reduces memory and speeds
   up attribute access. Use for data-heavy classes.
6. **dataclass**: `@dataclass(slots=True)` (Python 3.10+) for efficient
   data containers. `frozen=True` for immutable.
7. **Avoid global lookups**: local variable access is faster than global.
   Assign `len = len` at function top if called in a tight loop.
8. **lru_cache**: `@functools.lru_cache(maxsize=128)` for pure function
   results. Free memoization for expensive pure calls.
9. **enumerate over range(len)**: `for i, x in enumerate(items)` is clearer
   and faster than `for i in range(len(items)): x = items[i]`.
10. **zip for parallel iteration**: `for a, b in zip(list_a, list_b)` not
    index-based. Use `itertools.zip_longest` for unequal lengths.

## Async Efficiency

- **asyncio.gather**: run coroutines concurrently. `await gather(*tasks)`
  not sequential `await task1; await task2`.
- **aiofiles / httpx**: async I/O over blocking I/O in async code. Blocking
  calls in async functions freeze the event loop.
- **semaphore**: `asyncio.Semaphore(n)` to limit concurrency. Prevents
  overwhelming external services.
