# Debugging Overlay - Python

Stack-specific debugging techniques. Load alongside debugging/SKILL.md when
language is Python.

## Tools

- **pdb / breakpoint()**: `breakpoint()` in code drops into pdb. Commands:
  `n` next, `s` step, `c` continue, `p <var>` print, `l` list, `w` where
  (backtrace), `q` quit.
- **ipdb** (if installed): `pip install ipdb`, same as pdb with syntax
  highlighting and tab completion.
- **print()**: fastest first pass. Use `print(f"{var=}")` (Python 3.8+) to
  print name and value in one shot.
- **logging**: `import logging; logging.basicConfig(level=logging.DEBUG)`.
  Prefer over print for anything beyond a quick check.
- **traceback**: `import traceback; traceback.print_exc()` in except blocks
  to see the full trace.
- **pytest --tb=long**: full traceback on test failures. `--tb=short` for
  concise. `--pdb` to drop into debugger on failure.
- **mypy / pyright**: static type checking catches None returns, wrong types,
  missing arguments before runtime.

## Common Python Bug Patterns

- **Mutable default arguments**: `def f(items=[])` shares the list across
  calls. Use `def f(items=None): items = items or []`.
- **is vs ==**: `is` checks identity, `==` checks equality. `None` comparison
  must use `is None`, never `== None`. Small integers are cached so `is`
  appears to work by accident.
- **Late binding in closures**: `[lambda: i for i in range(3)]` - all return 2.
  Use `[lambda i=i: i for i in range(3)]`.
- **Import circular**: module A imports B, B imports A. Restructure or move
  the import inside the function.
- **__init__.py missing**: package not found, relative imports fail. Check
  the directory has `__init__.py` (unless using namespace packages).
- **Async not awaited**: `async def` function called without `await` returns a
  coroutine that never runs. No error, just nothing happens.
- **Float comparison**: `0.1 + 0.2 != 0.3`. Use `math.isclose()` or
  `abs(a - b) < epsilon`.
- **Shallow copy**: `copy.copy()` shares nested objects. Use `copy.deepcopy()`
  for nested structures.

## Debugging Flow

1. Read the traceback bottom-up: last line is the error, frames above show
   how it got there.
2. If it is a test failure: `pytest --tb=long --pdb` to inspect state at
   failure point.
3. If it is a silent wrong result: add `print(f"{var=}")` at computation
   boundaries. Narrow down where the value diverges.
4. If it is a type error: run `mypy file.py` or `pyright` to catch it
   statically.
5. If it is an import error: check `sys.path`, virtualenv activation, and
   whether the package is installed (`pip list | grep <name>`).
