'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isTextFile, shouldSkipDir, extractSymbols, extractLinks, normalizeUrl } = require('../lib/extract');

test('isTextFile accepts code and md, rejects binaries and minified', () => {
  assert.equal(isTextFile('app/Models/User.php'), true);
  assert.equal(isTextFile('src/App.tsx'), true);
  assert.equal(isTextFile('README.md'), true);
  assert.equal(isTextFile('logo.png'), false);
  assert.equal(isTextFile('vendor.min.js'), false);
  assert.equal(isTextFile('Makefile'), false);
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
