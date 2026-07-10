# Efficient Code Overlay - Go

Stack-specific efficiency patterns. Load alongside efficient-code/SKILL.md
when language is Go.

## Go Efficiency Ladder

1. **Pre-allocate slices**: `make([]T, 0, n)` when size is known. Avoids
   reallocation during append. The zero-allocation case: `make([]T, n)` when
   writing by index.
2. **strings.Builder**: for string concatenation in loops. `builder.WriteString(s)`
   is O(n) total. `s += chunk` is O(n^2) because strings are immutable.
3. **Byte slices over strings**: `[]byte` for intermediate manipulation.
   Convert to `string` only at the boundary. Avoids repeated conversions.
4. **sync.Pool**: reuse objects across allocations. For `[]byte` buffers,
   `json.Encoder`, or any short-lived object in a hot path.
5. **Avoid interface{} in hot paths**: boxing into `interface{}` allocates.
   Use generics (Go 1.18+) or concrete types for performance-critical code.
6. **Generics over reflection**: `func Max[T constraints.Ordered](a, b T)`
   is compile-time, zero reflection cost. Reflection is 10-100x slower.
7. **Map pre-allocation**: `make(map[K]V, n)` hints the runtime to size the
   hash table. Reduces rehashing during bulk inserts.
8. **Copy for slice aliasing**: `copy(dst, src)` is memmove, faster than a
   loop. Use when you need an independent copy of a slice's data.
9. **bufio for I/O**: `bufio.NewReader` / `bufio.NewWriter` for buffered I/O.
   Unbuffered `os.Read` / `os.Write` per byte is extremely slow.
10. **Avoid defer in hot paths**: defer has overhead (~35ns). In
    million-iteration loops, inline the cleanup. Fine for normal code.

## Concurrency Efficiency

- **Worker pool**: `chan Job` with N workers over unbounded goroutines.
  Prevents scheduler thrash and memory blowup.
- **sync.Once**: for initialization that must run exactly once. Cheaper than
  mutex + flag.
- **atomic operations**: `sync/atomic` for counters and flags. Faster than
  mutex for simple operations.
- **Batch channel sends**: send a slice of items in one channel message
  instead of one-at-a-time. Reduces channel overhead.
