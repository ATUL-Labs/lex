# Debugging Overlay - Go

Stack-specific debugging techniques. Load alongside debugging/SKILL.md when
language is Go.

## Tools

- **fmt.Println / fmt.Printf**: `fmt.Printf("%+v\n", struct)` prints struct
  with field names. `fmt.Printf("%#v\n", value)` prints Go syntax
  representation.
- **delve (dlv)**: `dlv debug` or `dlv test`. Breakpoints (`b main.go:42`),
  step (`s`), next (`n`), print (`p var`), continue (`c`), stack (`bt`).
- **GoLand / VS Code debugger**: built-in delve integration. Visual
  breakpoints, variable inspection.
- **go vet**: `go vet ./...` catches common mistakes (printf format
  mismatches, unreachable code, struct tag issues).
- **pprof**: `import _ "net/http/pprof"` then `go tool pprof
  http://localhost:6060/debug/pprof/`. For CPU and memory profiling.
- **runtime/trace**: `go test -trace=trace.out` then `go tool trace
  trace.out`. For concurrency and latency analysis.

## Common Go Bug Patterns

- **nil interface**: an interface is nil only if both type and value are nil.
  A typed nil (`var p *MyType; var i interface{} = p`) is NOT nil. Check with
  `if p == nil` before assigning to interface, or use explicit nil checks.
- **goroutine leak**: goroutine started but never exits. Blocks on channel
  that never sends. Use context.WithCancel or context.WithTimeout. Check with
  `runtime.NumGoroutine()`.
- **Map concurrency**: concurrent read+write to a map panics. Use
  `sync.RWMutex` or `sync.Map`.
- **Defer in loop**: `defer` in a loop accumulates, resources freed only when
  function returns. Move to a named function or call explicitly.
- **Slice aliasing**: `sub := slice[1:3]` shares backing array. Modifying
  `sub` modifies `slice`. Use `copy()` for independence.
- **Error swallowed**: `err` assigned but not checked. `if err != nil` is not
  optional. Go vet can catch some of these.
- **Stringer / fmt.Stringer**: printing a type without Stringer() shows
  internal struct. Implement `String() string` for readable debug output.
- **Goroutine race**: use `go test -race` to detect data races. Fix all
  races, do not suppress with mutexes around the symptom.

## Debugging Flow

1. `go vet ./...` first - catches the easy stuff.
2. If it is a panic: read the goroutine dump. It shows the exact line and
   goroutine state.
3. If it is a logic bug: add `fmt.Printf("%+v\n", value)` at computation
   boundaries.
4. If it is a concurrency bug: `go test -race ./...` to find the data race.
5. If it is a performance bug: pprof CPU profile, look for hot spots.
6. If it is a deadlock: `kill -QUIT <pid>` dumps all goroutine stacks. Look
   for goroutines blocked on channels or mutexes.
