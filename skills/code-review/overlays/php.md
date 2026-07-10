# Code Review Overlay - PHP

Stack-specific review checks. Load alongside code-review/SKILL.md when
language is PHP.

## PHP-Specific Checks

1. **Type safety**: `===` over `==`. Strict comparison everywhere. Check for
   implicit type coercion in comparisons.
2. **SQL injection**: raw queries with user input. Use parameterized queries
   or Eloquent. `DB::raw()` with unescaped input is a hole.
3. **Mass assignment**: model `$fillable` / `$guarded` set correctly? A model
   without `$fillable` accepts all input if `Model::create($request->all())`
   is used.
4. **N+1 queries**: loop with lazy-loaded relation. Use `with()` eager
   loading. Check with Telescope or Debugbar query count.
5. **CSRF**: forms include `@csrf`. API routes use Sanctum or token auth.
   `VerifyCsrfToken` middleware not disabled for routes that handle state
   changes.
6. **Auth checks**: controller methods use `auth` middleware or policies.
   `Gate::authorize()` / `$this->authorize()` before sensitive actions.
7. **File uploads**: validate mime, size, extension. Store outside public
   root unless intentionally public. Never trust `$_FILES['name']`.
8. **Session fixation**: `Auth::login()` regenerates session ID? Laravel does
   this by default, but custom auth flows may not.
9. **PHPStan level**: project target level met? `vendor/bin/phpstan analyse
   --level=8`. Type coverage is a correctness signal.
10. **PSR-12**: formatting, naming. Use `php-cs-fixer` or `pint` to enforce.

## Laravel-Specific Checks

- **Service container abuse**: resolving everything from the container instead
  of dependency injection. Use constructor injection.
- **Job retries**: `$tries` and `$backoff` set on jobs. Unbounded retries
  cause queue thrash.
- **Observer side effects**: model observers firing on unexpected events
  (e.g. saving during a seed). Use `$model->saveQuietly()` to skip.
- **Middleware order**: auth before rate limiting. Rate limiting before
  expensive operations.
- **Config caching**: `config()` calls outside config files break when
  `config:cache` runs. Never call `config()` inside config files.
