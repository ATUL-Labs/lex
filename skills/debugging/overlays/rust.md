# Debugging Overlay - Rust

Stack-specific debugging techniques. Load alongside debugging/SKILL.md when
language is Rust.

## Tools

- **println!**: `println!("{:?}", value)` for Debug format. `println!("{:#?}",
  value` for pretty-printed nested structures. Fast, zero-setup, works
  everywhere.
- **dbg!**: `dbg!(&variable)` prints file, line, and value. Better than
  println! for tracing because it shows location. Returns the value so it can
  be inline: `let x = dbg!(compute());`
- **cargo test -- --nocapture**: show println! output from tests (hidden by
  default). Essential for understanding what a failing test actually computed.
- **RUST_BACKTRACE=1**: `RUST_BACKTRACE=1 cargo run` shows full backtrace on
  panic. `RUST_BACKTRACE=full` includes system frames.
- **clippy**: `cargo clippy` catches common bugs (needless collect, iter
  misuse, integer arithmetic overflow). Run before guessing.
- **miri** (if installed): `cargo +nightly miri test` detects undefined
  behavior, use-after-free, data races in unsafe code. Use when debugging
  memory issues.
- **lldb / gdb**: `rust-lldb target/debug/binary` or `rust-gdb`. Breakpoints,
  step, inspect. `layout src` in gdb shows source view.

## Common Rust Bug Patterns

- **Borrow checker fights**: if the compiler rejects a borrow, the issue is
  usually lifetime overlap, not the borrow checker being wrong. Restructure so
  borrows don't overlap. Clone is a valid debugging step, not a failure.
- **Integer overflow**: debug mode panics on overflow, release mode wraps
  silently. Use `checked_add()`, `saturating_add()`, or `i64` if values can
  exceed type bounds.
- **unwrap() on None / Err**: every `unwrap()` is a potential panic. Find the
  source of the None/Err, do not replace with `unwrap_or_default()` to silence
  it. Use `expect("context")` to improve error messages during debugging.
- **Move semantics**: value moved, then used again. The error message says
  exactly where the move happened. Read it, then decide: borrow, clone, or
  restructure ownership.
- **Lifetime mismatch**: "borrowed value does not live long enough". The
  returned reference outlives the borrower. Fix by tying lifetimes explicitly
  or owning the data.
- **Trait object vs generic**: `Box<dyn Trait>` has dynamic dispatch and needs
  object safety. If a trait has generics or associated types without defaults,
  it is not object-safe. Check the trait definition.
- **Send / Sync**: "cannot be sent between threads safely". The type contains
  something not Send (e.g. `Rc`, `RefCell`). Switch to `Arc`, `Mutex`, or
  restructure.
- **Iterator adaptors**: `.collect()` into wrong type. Check the type
  annotation. `collect::<Vec<_>>()` vs `collect::<HashMap<_, _>>()`.

## Debugging Flow

1. Read the compiler error message fully - Rust errors are diagnostic gold.
   They tell you exactly what is wrong and often suggest the fix.
2. If it is a panic: `RUST_BACKTRACE=1 cargo run` and read the backtrace.
3. If it is a logic bug: add `dbg!()` at the computation points. Run with
   `cargo test -- --nocapture` to see values.
4. If it is a concurrency bug: run tests with `cargo test -- --test-threads=1`
   to check for race conditions. Use miri for memory safety.
5. If clippy passes and tests pass but behavior is wrong: the bug is in logic,
   not types. Add assertions `assert!(condition, "context: {:#?}", state)` at
   function boundaries.
