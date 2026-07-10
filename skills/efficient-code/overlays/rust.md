# Efficient Code Overlay - Rust

Stack-specific efficiency patterns. Load alongside efficient-code/SKILL.md
when language is Rust.

## Rust Efficiency Ladder

1. **Borrow over clone**: `&str` over `String`, `&[T]` over `Vec<T>`. Clone
   only when ownership is actually needed. Each clone is an allocation.
2. **Iterator chains**: lazy, zero-cost. `.iter().map().filter().collect()`
   compiles to a tight loop. No intermediate allocations.
3. **Vec::with_capacity**: when size is known or estimable, pre-allocate.
   `Vec::with_capacity(n)` avoids reallocation during `push`.
4. **Cow<str>**: `Cow::Borrowed(&str)` when no modification needed,
   `Cow::Owned(String)` when it is. Avoids cloning strings that might not
   need to be owned.
5. **&str over String in function args**: `fn process(data: &str)` accepts
   both `&String` and `&str` via deref coercion. More flexible, no
   allocation.
6. **Avoid format!() in hot paths**: `format!()` allocates. Use `write!()`
   into a reusable `String` buffer. For logging, use `eprintln!()` or a
   structured logger.
7. **Small enum dispatch**: `enum` + `match` is faster than `Box<dyn Trait>`
   (static vs dynamic dispatch). Use enums when the set of variants is known.
8. **Box large enum variants**: if one variant is large, `Box::new(large_data)`
   inside the variant keeps the enum size small. Affects stack usage.
9. **Avoid Vec<bool>**: use a bitvec or `u64` bitmask. 64x memory reduction.
10. **checked vs wrapping arithmetic**: `wrapping_add` is faster than
    `checked_add` (no branch). Use wrapping when overflow is intended or
    impossible.

## Memory Patterns

- **Slice over Vec for read-only**: `&[u8]` instead of `Vec<u8>` when you
  don't need ownership. Zero allocation.
- **String vs &str in structs**: `&'a str` borrows (needs lifetime), `String`
  owns (allocates). Choose based on ownership semantics, not convenience.
- **Arc vs Rc**: `Arc` for multi-threaded, `Rc` for single-threaded. `Rc` is
  cheaper (no atomics). Never use `Rc` across threads.
- **SmallVec / tinyvec**: stack-allocated until exceeding N, then heap. Good
  for small, frequently-allocated collections.
