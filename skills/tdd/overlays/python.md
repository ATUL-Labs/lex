# TDD Overlay - Python

Stack-specific TDD patterns. Load alongside tdd/SKILL.md when language is Python.

## Test Frameworks

- **pytest**: `pytest` or `python -m pytest`. Default test runner for most
  projects.
- **unittest**: stdlib. `python -m unittest discover`. Built-in, no install.
- **Run single test**: `pytest tests/test_file.py::test_name`
- **Run with output**: `pytest -s` (no capture) or `pytest --tb=long`
- **Watch mode**: `pytest-watch` (if installed) reruns on file change.

## Test Patterns

- **Fixtures**: `@pytest.fixture` for setup/teardown. Scope: function (default),
  class, module, session. Use `yield` for teardown:
  ```python
  @pytest.fixture
  def db_session():
      session = create_session()
      yield session
      session.close()
  ```
- **Parametrize**: `@pytest.mark.parametrize("input,expected", [(1, 2), (3,
  6)])` runs the test once per tuple.
- **Mocking**: `from unittest.mock import patch, MagicMock`.
  `@patch('module.Class.method')` replaces during test. Use `patch` as
  decorator or context manager.
- **Django**: `from django.test import TestCase`. `self.client.get('/path')`.
  `setUp` / `tearDown` for per-test state. Use `pytest-django` for pytest
  integration.
- **FastAPI**: `from fastapi.testclient import TestClient`.
  `client = TestClient(app); response = client.get('/path')`.
- **Factory Boy**: `import factory; class UserFactory(factory.Factory): ...`
  for test data generation. Prefer over hand-written dicts.

## Rules

- One test function per behavior. Name describes behavior:
  `test_returns_404_for_unknown_slug`.
- Use fixtures for shared setup, not setUp/tearDown (pytest style).
- Mock at the boundary: patch the HTTP call, not the function that calls it.
- Use `pytest.raises(ExceptionType)` for error path tests.
- Never test with production data. Use factories or fixtures.
- For async: `@pytest.mark.asyncio` with `pytest-asyncio` installed.
