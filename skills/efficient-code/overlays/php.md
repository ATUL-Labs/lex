# Efficient Code Overlay - PHP

Stack-specific efficiency patterns. Load alongside efficient-code/SKILL.md
when language is PHP.

## PHP Efficiency Ladder

1. **Built-in functions**: `array_map`, `array_filter`, `array_reduce` over
   manual loops. `str_contains`, `str_starts_with` (PHP 8+) over `strpos`.
2. **Eloquent vs raw**: Eloquent is convenient but heavy. For bulk operations,
   `DB::table()->insert()` or raw queries are 10x faster. Use Eloquent for
   single records, raw for batches.
3. **Collections**: `collect($arr)->map()->filter()->toArray()` is readable
   but allocates intermediate arrays. For large data, chain operations in a
   single loop.
4. **N+1 elimination**: `with('relation')` or `load('relation')` for eager
   loading. `whereHas` triggers a subquery, not N+1, but is still expensive
   on large tables.
5. **Avoid array_merge in loops**: `array_merge` in a loop is O(n^2). Use
   `array_push` with spread or build a single array and merge once.
6. **Cache expensive calls**: `Cache::remember('key', 300, fn() => ...)` for
   DB queries or computations that don't change often.
7. **Lazy collections**: `LazyCollection` for large datasets. Processes one
   item at a time instead of loading everything into memory.
8. **Regex**: `preg_match` is expensive. For simple checks, use `str_contains`
   or `str_starts_with` first, regex only if needed.

## Laravel-Specific

- **Query scopes**: reusable query constraints as scopes instead of repeating
  `where` chains.
- **Mass operations**: `Model::whereIn('id', $ids)->update([...])` instead of
  looping `Model::find($id)->update()`.
- **Queue heavy work**: dispatch to queue instead of blocking the request.
  `ProcessPodcast::dispatch($podcast)`.
- **Config caching**: `php artisan config:cache` in production. Avoids
  re-reading .env on every request.
- **Route caching**: `php artisan route:cache` in production. Significant
  speedup for apps with many routes.
- **View caching**: precompile views with `php artisan view:cache`.
