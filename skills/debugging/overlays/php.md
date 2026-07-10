# Debugging Overlay - PHP

Stack-specific debugging techniques. Load alongside debugging/SKILL.md when
language is PHP.

## Tools

- **Xdebug**: breakpoint, stack trace, variable inspection. Enable with
  `xdebug.mode=debug`. Step through in VS Code / PhpStorm.
- **Laravel Telescope** (if installed): `php artisan telescope` - query log,
  exceptions, mail, jobs, HTTP requests in one UI.
- **Laravel Debugbar** (if installed): renders bar in browser - queries, routes,
  views, session, timings.
- **Quick dump**: `dd($var)` dumps and dies. `dump($var)` dumps and continues.
  `ddd($var)` dumps, dies, and shows stack trace. Prefer `dump()` during
  investigation, `dd()` to stop at a point.
- **Error log**: `error_log($message)` to PHP error log. `Log::debug()`,
  `Log::info()`, `Log::error()` via Laravel facade.
- **PHPStan**: `vendor/bin/phpstan analyse path --level=8` catches type bugs
  static analysis can find. Run before guessing.

## Common PHP Bug Patterns

- **Null vs false vs empty string**: PHP's loose comparison. Use `===` always.
  `0 == "0"` is true, `null == false` is true, `"" == 0` is true.
- **Array vs object access**: `$arr['key']` vs `$obj->key`. Mixing these is a
  common source of silent failures. Check the type before accessing.
- **Undefined variable / index**: PHP warns but continues. A bug hidden behind
  an undefined index warning is still a bug. Check error reporting level.
- **Session state**: `session()->flush()` or `Session::flush()` to reset between
  test runs. Stale session causes "it works on my machine" bugs.
- **Eloquent N+1**: enable Telescope or Debugbar, look for repeated identical
  queries. Fix with `with()` eager loading, not a loop optimization.
- **Mass assignment**: fields not in `$fillable` silently dropped. Check the
  model's `$fillable` / `$guarded` when fields mysteriously don't save.
- **Carbon date math**: `Carbon::now()` is mutable by default. Use
  `Carbon::now()->copy()` or `now()->immutable()` to avoid side effects.
- **Env caching**: `php artisan config:cache` caches env. Changes to `.env`
  won't apply until `php artisan config:clear`. Common source of "I changed the
  env but it still uses the old value".

## Debugging Flow for Laravel

1. Check `storage/logs/laravel.log` for the exception and stack trace
2. Read the stack trace bottom-up: first frame is where it threw, caller frames
   show how it got there
3. If the error is a query: check the model, the migration, and the actual DB
   state with `php artisan tinker` - do not assume the schema matches the
   migration
4. If the error is in a job/queue: check the failed_jobs table
   `php artisan queue:failed`, re-run with `php artisan queue:retry <id>`
5. If the error is HTTP: check the route definition, middleware, and controller
   method signature - Laravel's implicit binding fails silently on 404
