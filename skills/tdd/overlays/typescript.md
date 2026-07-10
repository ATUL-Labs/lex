# TDD Overlay - TypeScript

Stack-specific TDD patterns. Load alongside tdd/SKILL.md when language is
TypeScript or JavaScript.

## Test Frameworks

- **Vitest**: `npx vitest` or `npx vitest run` (single pass). Vite-native,
  fast, Jest-compatible API.
- **Jest**: `npx jest` or `npx jest path/to/test.test.ts`.
- **Run single test**: `npx vitest -t "test name"` or
  `npx jest -t "test name"`.
- **Watch mode**: `npx vitest` (watches by default) or `npx jest --watch`.

## Test Patterns

- **describe/it**: `describe('UserController', () => { it('returns 404',
  () => {}) })`. Group related tests.
- **beforeEach / afterEach**: setup and teardown per test.
  `beforeAll` / `afterAll` for per-suite.
- **Mocking**: `vi.fn()` or `jest.fn()` for mock functions.
  `vi.mock('./module')` or `jest.mock('./module')` for module mocks.
- **Assertion**: `expect(value).toBe(expected)` (strict equality).
  `toEqual()` for deep object comparison. `toThrow()` for errors.
- **Async**: `await expect(fetchData()).resolves.toEqual(expected)` or
  test with async/await inside `it`.
- **React Testing Library**: `render(<Component />)`,
  `screen.getByText('Hello')`, `fireEvent.click(button)`. Test behavior, not
  implementation.
- **Supertest** (Express): `request(app).get('/path').expect(200)`.

## Rules

- Use `toBe` for primitives, `toEqual` for objects/arrays.
- Mock modules at the boundary: mock the API client, not the component that
  uses it.
- For React: query by role or text, not by className or test-id unless
  necessary. Test what the user sees.
- One `it()` per behavior. Name describes behavior:
  `it('returns 404 for unknown slug')`.
- Always assert. A test that runs code without asserting proves nothing.
- For timers: `vi.useFakeTimers()` or `jest.useFakeTimers()` to control
  setTimeout/setInterval in tests.
