'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isTextFile, shouldSkipDir, extractSymbols, extractLinks, extractSchema, normalizeUrl } = require('../lib/extract');

test('isTextFile accepts code and md, rejects binaries and minified', () => {
  assert.equal(isTextFile('app/Models/User.php'), true);
  assert.equal(isTextFile('src/App.tsx'), true);
  assert.equal(isTextFile('README.md'), true);
  assert.equal(isTextFile('logo.png'), false);
  assert.equal(isTextFile('vendor.min.js'), false);
  assert.equal(isTextFile('Makefile'), false);
  assert.equal(isTextFile('page.html'), false);
  assert.equal(isTextFile('dump.sql'), false);
  assert.equal(isTextFile('export.json'), false);
});

test('shouldSkipDir skips heavy dirs', () => {
  assert.equal(shouldSkipDir('node_modules'), true);
  assert.equal(shouldSkipDir('vendor'), true);
  assert.equal(shouldSkipDir('src'), false);
});

test('extractSymbols: PHP class and methods', () => {
  const php = ['<?php', 'final class UserTask extends Model', '{', '    public function isAuto(): bool', '    {', '    }', '    protected static function boot()', '}'].join('\n');
  const syms = extractSymbols('app/Models/UserTask.php', php);
  assert.deepEqual(syms.find(s => s.name === 'UserTask'), { name: 'UserTask', kind: 'class', line: 2 });
  assert.ok(syms.find(s => s.name === 'isAuto' && s.kind === 'function' && s.line === 4));
  assert.ok(syms.find(s => s.name === 'boot'));
});

test('extractSymbols: JS/TS functions, arrows, classes', () => {
  const js = ['export function localDateKey(d) {}', 'const weekDays = () => {}', 'export default class TaskRow {}', 'async function syncAll() {}'].join('\n');
  const syms = extractSymbols('resources/js/util.ts', js);
  assert.ok(syms.find(s => s.name === 'localDateKey' && s.kind === 'function' && s.line === 1));
  assert.ok(syms.find(s => s.name === 'weekDays' && s.line === 2));
  assert.ok(syms.find(s => s.name === 'TaskRow' && s.kind === 'class' && s.line === 3));
  assert.ok(syms.find(s => s.name === 'syncAll' && s.line === 4));
});

test('extractSymbols: Python def and class', () => {
  const py = ['class Distiller:', '    def run(self):', '        pass', 'async def fetch_docs():', '    pass'].join('\n');
  const syms = extractSymbols('tools/distill.py', py);
  assert.ok(syms.find(s => s.name === 'Distiller' && s.kind === 'class'));
  assert.ok(syms.find(s => s.name === 'run' && s.line === 2));
  assert.ok(syms.find(s => s.name === 'fetch_docs' && s.line === 4));
});

test('extractLinks: Laravel routes and FastAPI decorators are route-side', () => {
  const php = ["Route::patch('/dashboard/tasks/{task}', [UserTaskController::class, 'update']);"].join('\n');
  const links = extractLinks('routes/web.php', php);
  assert.deepEqual(links[0], { side: 'route', method: 'patch', url: '/dashboard/tasks/*', line: 1 });
  const py = ['@app.get("/api/items/{item_id}")', 'def read_item(item_id):', '    pass'].join('\n');
  assert.deepEqual(extractLinks('main.py', py)[0], { side: 'route', method: 'get', url: '/api/items/*', line: 1 });
});

test('extractLinks: fetch/axios/inertia router are consumer-side in frontend files', () => {
  const tsx = ["fetch('/api/items?page=2')", "axios.post('/api/items/')", "router.patch(`/dashboard/tasks/${task.id}`, data)"].join('\n');
  const links = extractLinks('resources/js/Pages/Tasks.tsx', tsx);
  assert.deepEqual(links[0], { side: 'consumer', method: null, url: '/api/items', line: 1 });
  assert.deepEqual(links[1], { side: 'consumer', method: 'post', url: '/api/items', line: 2 });
  assert.deepEqual(links[2], { side: 'consumer', method: 'patch', url: '/dashboard/tasks/*', line: 3 });
});

test('normalizeUrl', () => {
  assert.equal(normalizeUrl('/a/{id}/b/'), '/a/*/b');
  assert.equal(normalizeUrl('/a/:slug?x=1'), '/a/*');
  assert.equal(normalizeUrl('/t/${task.id}'), '/t/*');
  assert.equal(normalizeUrl('/'), '/');
});

test('extractSchema: Laravel migration with foreignId convention and explicit FK', () => {
  const php = [
    '<?php',
    'return new class extends Migration {',
    '  public function up()',
    '  {',
    "    Schema::create('manuscripts', function (Blueprint $table) {",
    '      $table->id();',
    "      $table->string('title');",
    "      $table->foreignId('user_id')->constrained();",
    "      $table->unsignedBigInteger('journal_id');",
    "      $table->foreign('journal_id')->references('id')->on('journals');",
    '    });',
    '  }',
    '};',
  ].join('\n');
  const s = extractSchema('database/migrations/2026_01_01_create_manuscripts.php', php);
  assert.ok(s.tables.find(t => t.name === 'manuscripts'));
  assert.ok(s.columns.find(c => c.name === 'title' && c.table === 'manuscripts'));
  const userIdCol = s.columns.find(c => c.name === 'user_id');
  assert.equal(userIdCol.fkTable, 'users');
  assert.equal(userIdCol.fkColumn, 'id');
  const journalIdCol = s.columns.find(c => c.name === 'journal_id');
  assert.equal(journalIdCol.fkTable, 'journals');
  assert.equal(journalIdCol.fkColumn, 'id');
});

test('extractSchema: foreignId with explicit constrained() table argument overrides heuristic', () => {
  const php = [
    '<?php',
    'return new class extends Migration {',
    '  public function up()',
    '  {',
    "    Schema::create('manuscripts', function (Blueprint $table) {",
    '      $table->id();',
    "      $table->foreignId('submitting_user_id')->constrained('users');",
    '    });',
    '  }',
    '};',
  ].join('\n');
  const s = extractSchema('database/migrations/2026_01_02_create_manuscripts.php', php);
  const col = s.columns.find(c => c.name === 'submitting_user_id');
  assert.equal(col.fkTable, 'users');
  assert.equal(col.fkColumn, 'id');
});

test('extractSchema: foreignId with bare constrained() still uses heuristic', () => {
  const php = [
    '<?php',
    'return new class extends Migration {',
    '  public function up()',
    '  {',
    "    Schema::create('posts', function (Blueprint $table) {",
    '      $table->id();',
    "      $table->foreignId('author_id')->constrained();",
    '    });',
    '  }',
    '};',
  ].join('\n');
  const s = extractSchema('database/migrations/2026_01_03_create_posts.php', php);
  const col = s.columns.find(c => c.name === 'author_id');
  assert.equal(col.fkTable, 'authors');
  assert.equal(col.fkColumn, 'id');
});

test('extractSchema: foreignId with constrained(table, key) two-arg form', () => {
  const php = [
    '<?php',
    'return new class extends Migration {',
    '  public function up()',
    '  {',
    "    Schema::create('devices', function (Blueprint $table) {",
    '      $table->id();',
    "      $table->foreignId('owner_id')->constrained('accounts', 'uuid');",
    '    });',
    '  }',
    '};',
  ].join('\n');
  const s = extractSchema('database/migrations/2026_01_04_create_devices.php', php);
  const col = s.columns.find(c => c.name === 'owner_id');
  assert.equal(col.fkTable, 'accounts');
  assert.equal(col.fkColumn, 'uuid');
});

test('extractSchema: bare constrained() does not leak table name from next line', () => {
  const php = [
    '<?php',
    "Schema::create('commits', function (Blueprint $table) {",
    "  $table->foreignId('branch_id')->constrained()->cascadeOnDelete();",
    "  $table->foreignId('author_user_id')->constrained('users')->cascadeOnDelete();",
    '});',
  ].join('\n');
  const s = extractSchema('database/migrations/create_commits.php', php);
  const branchCol = s.columns.find(c => c.name === 'branch_id');
  const authorCol = s.columns.find(c => c.name === 'author_user_id');
  assert.equal(branchCol.fkTable, 'branchs');
  assert.notEqual(branchCol.fkTable, 'users');
  assert.equal(authorCol.fkTable, 'users');
});

test('extractSchema: generic SQL CREATE TABLE with FOREIGN KEY', () => {
  const sql = [
    'CREATE TABLE orders (',
    '  id INT PRIMARY KEY,',
    '  customer_id INT,',
    '  FOREIGN KEY (customer_id) REFERENCES customers(id)',
    ');',
  ].join('\n');
  const s = extractSchema('schema.sql', sql);
  assert.ok(s.tables.find(t => t.name === 'orders'));
  const col = s.columns.find(c => c.name === 'customer_id');
  assert.equal(col.fkTable, 'customers');
  assert.equal(col.fkColumn, 'id');
});

test('extractSchema: non-migration php returns empty', () => {
  const s = extractSchema('app/Models/User.php', '<?php class User {}\n');
  assert.equal(s.tables.length, 0);
  assert.equal(s.columns.length, 0);
});
