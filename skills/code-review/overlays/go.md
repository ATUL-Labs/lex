# Code Review Overlay - Go

Stack-specific review checks. Load alongside code-review/SKILL.md when
language is Go.

## Go-Specific Checks

1. **err check**: every function returning error must have its error checked.
   `_ = fn()` or ignoring `err` is a review block unless explicitly justified.
2. **goroutine lifecycle**: every `go func()` must have a termination path.
   Context cancellation, channel close, or done signal. Leaked goroutines
   leak resources.
3. **defer ordering**: defers run LIFO. Resource acquisition + defer close
   must be adjacent. Defer in a loop accumulates.
4. **interface pollution**: interfaces with one implementation add
   indirection without benefit. Define interfaces at the consumer, not the
   producer.
5. **nil checks**: check error before using the value. Go returns zero-value
   on error, using it is a bug. `result, err := fn(); result.Method()` without
   checking err.
6. **Map concurrency**: concurrent map access without sync is a panic. Use
   `sync.RWMutex` or `sync.Map`.
7. **Context propagation**: functions that do I/O should accept `context.Context`
   as first parameter. `context.Background()` in business logic instead of
   passing the request context.
8. **Slice pre-allocation**: `make([]T, 0, knownSize)` when size is known.
   Avoids reallocation in append loops.
9. **String/[]byte conversion**: `string(b)` and `[]byte(s)` copy. In hot
   paths, use `unsafe.String()` or avoid the conversion. In normal code,
   the copy is fine but worth noting.
10. **gofmt / goimports**: code must be formatted. `gofmt -l .` should
    return nothing. Unformatted code is a review block.

## Concurrency Checks

- `go test -race` passes? Data races are correctness bugs, not performance
  issues.
- `sync.Mutex` covers all accesses to the shared field, not just writes.
- `sync.WaitGroup` Add() called before the goroutine, not inside it.
- Channel close: only the sender closes. Closing from the receiver panics.
- `select` with default is non-blocking. Missing default when blocking is
  intended can cause subtle deadlocks.
