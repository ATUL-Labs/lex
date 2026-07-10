# TDD Overlay - Rust

Stack-specific TDD patterns. Load alongside tdd/SKILL.md when language is Rust.

## Test Frameworks

- **Built-in**: `#[test]` attribute. `cargo test` runs all tests.
- **Run single test**: `cargo test test_name`
- **Run single module**: `cargo test -- module_name`
- **Show output**: `cargo test -- --nocapture` (println! visible)
- **Property testing**: `proptest` crate for generating test inputs.
  `quickcheck` for simpler property tests.

## Test Patterns

- **Unit tests in module**: `#[cfg(test)] mod tests { use super::*; ... }` at
  the bottom of the file. Tests the private API directly.
- **Integration tests**: `tests/` directory at crate root. Tests the public
  API through `use my_crate::...`.
- **Arrange-Act-Assert**: same as core TDD skill.
  ```rust
  #[test]
  fn it_returns_404_for_unknown_slug() {
      let app = TestApp::new();           // arrange
      let res = app.get("/posts/unknown"); // act
      assert_eq!(res.status(), 404);       // assert
  }
  ```
- **Assertions**: `assert_eq!(actual, expected)`, `assert!(condition)`,
  `assert_ne!(a, b)`. Use `assert!(cond, "context: {:#?}", state)` for
  debugging context.
- **Should panic**: `#[test] #[should_panic(expected = "msg")]` for error
  paths.
- **Result tests**: `#[test] fn it_works() -> Result<(), Box<dyn Error>>`.
  Use `?` instead of unwrap. Fails on Err automatically.
- **Tokio async**: `#[tokio::test] async fn it_fetches() { ... }`.

## Rules

- Test module inline (`#[cfg(test)] mod tests`) for unit tests. No separate
  file needed. The test has access to private items.
- Use `#[cfg(test)]` on test-only helpers so they compile out of release.
- For async: `#[tokio::test]` not `#[test]`. Missing this is a common
  mistake.
- `cargo test` compiles in debug mode. Tests run fast. Do not optimize test
  code.
- Use `assert_eq!` with `Debug` types for readable failure output.
- For property tests: `proptest!` generates edge cases you would not think
  of. Use for parsers, math, data transformations.
