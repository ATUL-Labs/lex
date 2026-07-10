# TDD Overlay - PHP

Stack-specific TDD patterns. Load alongside tdd/SKILL.md when language is PHP.

## Test Frameworks

- **Pest** (Laravel default): `pest` or `php artisan test`. Expressive syntax:
  `it('returns 404', fn() => get('/x')->assertNotFound());`
- **PHPUnit**: `vendor/bin/phpunit`. Classic: `$this->get('/x')->assertStatus(404);`
- **Run single test**: `php artisan test --filter=test_name` or
  `vendor/bin/phpunit --filter=test_name`
- **Run single file**: `vendor/bin/phpunit tests/Unit/ExampleTest.php`

## Test Patterns

- **RefreshDatabase**: `use RefreshDatabase;` trait resets DB between tests.
  Migrations run once per test class, transactions roll back per test.
- **Factories**: `User::factory()->create()`. Chain states:
  `User::factory()->admin()->create()`. Define states in the factory.
- **Assertions**: `$this->assertDatabaseHas('users', ['email' => $x])`.
  `$response->assertJsonStructure(['data' => ['id', 'name']])`.
  `$response->assertSessionHasErrors(['email'])`.
- **HTTP tests**: `$this->get('/path')`, `$this->post('/path', $data)`,
  `$this->actingAs($user)->get('/admin')`.
- **Mocking**: `Mockery::mock(Class::class)` or Laravel's `Bus::fake()`,
  `Mail::fake()`, `Queue::fake()`, `Event::fake()` to isolate side effects.
- **Dataset / data provider** (Pest): `it('works with n', fn($n) => ...)->with([1, 2, 3]);`

## Rules

- Use `RefreshDatabase` for tests that touch the DB. Never rely on test
  ordering or shared state.
- Use factories, not raw `DB::insert()`. Factories respect model logic
  (castes, mutators, defaults).
- Fake external calls: mail, queue, HTTP. Never hit real APIs in tests.
- Test the public API of a class, not private methods. If private logic
  needs testing, extract it to a testable class.
- For Pest: one `it()` per behavior. Name describes behavior:
  `it('rejects expired tokens', ...)`.
