# Code Review Overlay - Rust

Stack-specific review checks. Load alongside code-review/SKILL.md when
language is Rust.

## Rust-Specific Checks

1. **unwrap() / expect()**: every one is a potential panic in production.
   Replace with `?`, `match`, or `if let` in non-test code. `expect()` is
   acceptable at startup, never in hot paths.
2. **unsafe blocks**: must have a safety comment explaining the invariant.
   `unsafe` without a comment is a review block. Audit pointer arithmetic,
   FFI calls, and union access.
3. **Clone in hot paths**: `.clone()` on large structures in loops. Use
   borrows or `Cow<str>` instead. Clone is fine for small values or
   one-time setup.
4. **Integer overflow**: `as` casts between integer types silently truncate.
   Use `try_from()` / `try_into()` for safe conversions. Check arithmetic
   near type bounds.
5. **Send / Sync correctness**: types crossing thread boundaries must be
   `Send`. `Arc<Mutex<T>>` for shared mutable. `Arc<T>` for shared immutable.
   Check for `Rc` / `RefCell` in async or threaded code.
6. **Error handling**: `Box<dyn Error>` is lazy. Use `thiserror` for library
   errors, `anyhow` for application errors. Error types should be specific.
7. **Lifetime annotations**: unnecessary explicit lifetimes when elision
   works. Missing lifetimes when the compiler forces `'static`. Both are
   smells.
8. **Iterator chains**: `.collect()` into intermediate Vec when a lazy
   iterator would work. `.map().filter().collect()` is fine,
   `.collect().into_iter().map().collect()` is not.
9. **clippy**: `cargo clippy -- -D warnings` should pass. Clippy lints are
   correctness signals, not style preferences.
10. **Dead code**: `#[allow(dead_code)]` hides unused code. Remove the code
    or use it. `#[allow(...)]` in general is a review flag.

## Performance Checks

- `String` where `&str` suffices: unnecessary allocation.
- `Vec::new()` without `with_capacity()` when size is known: reallocations.
- `HashMap` without size hint for known-size data.
- `format!()` in hot paths: use `write!()` into a buffer.
- `to_owned()` on static strings: `&'static str` is free.
