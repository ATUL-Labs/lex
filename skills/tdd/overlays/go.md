# TDD Overlay - Go

Stack-specific TDD patterns. Load alongside tdd/SKILL.md when language is Go.

## Test Frameworks

- **Built-in**: `testing` package. `go test ./...` runs all.
- **testify** (if installed): `github.com/stretchr/testify/assert` for
  richer assertions. `assert.Equal(t, expected, actual)`.
- **Run single test**: `go test -run TestName ./...`
- **Verbose**: `go test -v ./...`
- **Race detector**: `go test -race ./...` (always enable in CI).

## Test Patterns

- **Table-driven tests** (idiomatic Go):
  ```go
  func TestParse(t *testing.T) {
      tests := []struct {
          name     string
          input    string
          expected int
      }{
          {"simple", "42", 42},
          {"negative", "-1", -1},
          {"empty", "", 0},
      }
      for _, tt := range tests {
          t.Run(tt.name, func(t *testing.T) {
              got := Parse(tt.input)
              assert.Equal(t, tt.expected, got)
          })
      }
  }
  ```
- **Test helpers**: `func setupTest(t *testing.T) *TestEnv { t.Helper();
  ... }`. Use `t.Helper()` so failures point to the caller, not the helper.
- **Sub-tests**: `t.Run("case name", func(t *testing.T) { ... })`. Enables
  `-run` filtering and parallel execution.
- **Parallel**: `t.Parallel()` at the start of a test. Use for independent
  tests to speed up the suite.
- **httptest**: `httptest.NewServer(handler)` or
  `httptest.NewRecorder()` for HTTP handler tests.
- **Mocking**: interfaces + mock implementations. Go does not have built-in
  mocks. Use `gomock` or hand-write simple mocks.

## Rules

- Table-driven is the Go way. One test function, many cases via sub-tests.
- File naming: `foo_test.go` next to `foo.go`. Same package for white-box,
  `foo_test` package for black-box.
- `t.Fatal` stops the test, `t.Error` continues. Use `Fatal` for setup
  failures, `Error` for multiple assertions.
- Use `t.Helper()` in test helpers for better error locations.
- Always run with `-race` in CI. Data races are bugs.
- For HTTP: use `httptest` package, never start a real server in tests.
