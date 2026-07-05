'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openDb, refresh, updateFile } = require('../lib/indexer');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxidx-'));
  fs.mkdirSync(path.join(root, '.ctx', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctx', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export function greet(name) { return name }\n');
  fs.writeFileSync(path.join(root, '.ctx', 'status.md'), 'phase: testing ctxindex\n');
  fs.writeFileSync(path.join(root, '.ctx', 'pages', 'mistakes.md'), 'never use ungrouped orWhere\n');
  fs.writeFileSync(path.join(root, '.ctx', 'sessions', 'old.md'), 'SESSION_NOISE\n');
  fs.writeFileSync(path.join(root, 'node_modules', 'x', 'i.js'), 'function hidden() {}\n');
  fs.writeFileSync(path.join(root, 'logo.png'), 'PNGDATA');
  return root;
}

test('refresh indexes code and ctx pages, skips sessions/node_modules/binaries', () => {
  const root = makeProject();
  const db = openDb(root);
  const r = refresh(db, root);
  assert.equal(r.indexed, 3);
  const paths = db.prepare('SELECT path FROM files ORDER BY path').all().map(x => x.path);
  assert.deepEqual(paths, ['.ctx/pages/mistakes.md', '.ctx/status.md', 'src/app.js']);
  assert.ok(db.prepare("SELECT 1 FROM symbols WHERE name='greet' AND path='src/app.js'").get());
  const hit = db.prepare("SELECT path FROM content_fts WHERE content_fts MATCH 'orWhere'").get();
  assert.equal(hit.path, '.ctx/pages/mistakes.md');
});

test('refresh is incremental: unchanged files are not re-indexed', () => {
  const root = makeProject();
  const db = openDb(root);
  refresh(db, root);
  const r2 = refresh(db, root);
  assert.equal(r2.indexed, 0);
  assert.equal(r2.removed, 0);
});

test('deleted files are swept from all tables', () => {
  const root = makeProject();
  const db = openDb(root);
  refresh(db, root);
  fs.rmSync(path.join(root, 'src', 'app.js'));
  const r = refresh(db, root);
  assert.equal(r.removed, 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM symbols WHERE path='src/app.js'").get().c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM content_fts WHERE path='src/app.js'").get().c, 0);
});

test('updateFile indexes one changed file and removes a gone file', () => {
  const root = makeProject();
  const db = openDb(root);
  refresh(db, root);
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export function farewell() {}\n');
  assert.equal(updateFile(db, root, 'src/app.js'), true);
  assert.ok(db.prepare("SELECT 1 FROM symbols WHERE name='farewell'").get());
  assert.equal(db.prepare("SELECT COUNT(*) c FROM symbols WHERE name='greet'").get().c, 0);
  fs.rmSync(path.join(root, 'src', 'app.js'));
  updateFile(db, root, 'src/app.js');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM files WHERE path='src/app.js'").get().c, 0);
  assert.equal(updateFile(db, root, 'logo.png'), false);
});

test('updateFile rejects paths outside the project root', () => {
  const root = makeProject();
  const db = openDb(root);
  refresh(db, root);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxout-'));
  fs.writeFileSync(path.join(outside, 'secret.js'), 'const LEAKED_SECRET = 1\n');
  const relEscape = path.relative(root, path.join(outside, 'secret.js'));
  assert.equal(updateFile(db, root, relEscape), false);
  assert.equal(updateFile(db, root, path.join(outside, 'secret.js')), false);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM content_fts WHERE content_fts MATCH 'LEAKED_SECRET'").get().c, 0);
});
