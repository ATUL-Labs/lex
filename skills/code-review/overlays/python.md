# Code Review Overlay - Python

Stack-specific review checks. Load alongside code-review/SKILL.md when
language is Python.

## Python-Specific Checks

1. **Mutable default arguments**: `def f(items=[])` - shared across calls.
   Use `None` sentinel and create inside.
2. **Bare except**: `except:` catches everything including KeyboardInterrupt
   and SystemExit. Use `except Exception:` or specific exceptions.
3. **Type hints**: functions have type hints? `mypy` or `pyright` passes?
   Missing hints on public API is a review flag.
4. **SQL injection**: f-strings or `.format()` in SQL queries. Use
   parameterized queries: `cursor.execute("SELECT * WHERE id = %s", (id,))`.
5. **Pickle deserialization**: `pickle.loads()` on untrusted data is RCE.
   Use `json` or a safe serializer.
6. **Path traversal**: `os.path.join(user_input)` without normalization.
   Use `pathlib.Path.resolve()` and verify it stays within the allowed root.
7. **Resource leaks**: `open()` without `with`. Database connections without
   context managers. Use `with` / `contextlib.closing`.
8. **Global state**: module-level mutable state modified at runtime. Makes
   tests flaky and concurrency unsafe.
9. **async/await correctness**: `async def` called without `await` returns a
   coroutine that never runs. Mixing `asyncio.run()` in already-running loops.
10. **String formatting**: `%` or `.format()` in new code. Use f-strings
    (Python 3.6+) for readability and speed.

## Framework-Specific

- **Django**: `DEBUG=True` in production settings. `ALLOWED_HOSTS` not set.
  `SECRET_KEY` hardcoded. CSRF middleware disabled.
- **FastAPI**: input validation via Pydantic models, not raw dict access.
  `Depends()` for shared logic. No direct DB access in route handlers.
- **Flask**: `app.debug = True` in production. `app.run(host='0.0.0.0')`
  without auth. SQL injection in raw queries.
