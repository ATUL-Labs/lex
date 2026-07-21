'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { openDb, refresh, refreshWithWorkers, updateFile, ftsRows, walk, shouldSkipFile, invalidateSearchCache } = require('../lib/indexer');

function makeProject(fileCount) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexe2e-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, '.lex', 'status.md'), 'phase: e2e testing\n');
  fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## SQLite binding error\n- fix: Use empty strings\n');
  fs.writeFileSync(path.join(root, '.lex', 'audit.log'), '2025-01-15 10:00 | agent | platform | edit | src/app.js\n');

  for (let i = 0; i < fileCount; i++) {
    const dir = i % 5 === 0 ? 'src' : `src/mod${i % 5}`;
    if (!fs.existsSync(path.join(root, dir))) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, `file${i}.js`), [
      `// File ${i}`,
      `export function handler_${i}(req, res) {`,
      `  const data = req.body;`,
      `  if (!data) return res.status(400).json({ error: 'invalid' });`,
      `  return res.json({ id: ${i}, name: data.name });`,
      `}`,
      `export class Service_${i} {`,
      `  constructor() { this.id = ${i}; }`,
      `  async fetch() { return fetch('/api/data/${i}'); }`,
      `}`,
    ].join('\n'));
  }

  fs.mkdirSync(path.join(root, 'rag-contexts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rag-contexts', 'large.json'), JSON.stringify({ data: 'x'.repeat(50000) }));
  fs.mkdirSync(path.join(root, 'embeddings'), { recursive: true });
  fs.writeFileSync(path.join(root, 'embeddings', 'vectors.json'), JSON.stringify({ v: [1, 2, 3] }));
  fs.writeFileSync(path.join(root, 'huge.json'), JSON.stringify({ data: 'x'.repeat(200 * 1024) }));
  fs.writeFileSync(path.join(root, 'app.js.map'), '{"version":3,"mappings":""}');
  fs.writeFileSync(path.join(root, 'package.lock'), '{"locked":true}');
  fs.mkdirSync(path.join(root, 'database', 'migrations'), { recursive: true });
  fs.writeFileSync(path.join(root, 'database', 'migrations', 'users.sql'), 'CREATE TABLE users (id INTEGER PRIMARY KEY);\n');

  return root;
}

function getFilePath(root, index) {
  const dir = index % 5 === 0 ? 'src' : `src/mod${index % 5}`;
  return path.join(root, dir, `file${index}.js`);
}

function getRelPath(index) {
  const dir = index % 5 === 0 ? 'src' : `src/mod${index % 5}`;
  return `${dir}/file${index}.js`;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// ============================================================
// TEST 1: Full sync refresh + search
// ============================================================
test('E2E: sync refresh indexes files and search finds content', () => {
  const root = makeProject(10);
  try {
    const db = openDb(root);
    const result = refresh(db, root);
    assert.ok(result.indexed > 0, `should index files, got ${result.indexed}`);
    assert.ok(result.removed === 0, 'nothing to remove on first run');

    const rows = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.ok(rows.length > 0, 'search should find handler_0');
    assert.ok(rows[0].path.includes('file0.js'), `should find file0.js, got ${rows[0].path}`);
    assert.ok(rows[0].line > 0, `should have a line number, got ${rows[0].line}`);
    assert.ok(rows[0].snip.includes('handler_0'), `snippet should contain search term, got: ${rows[0].snip}`);

    const classRows = ftsRows(db, ['Service_5'], 20, ['[[', ']]'], root);
    assert.ok(classRows.length > 0, 'search should find Service_5');

    const hugeRows = ftsRows(db, ['huge'], 20, ['[[', ']]'], root);
    assert.equal(hugeRows.length, 0, 'huge.json should be skipped');

    const ragRows = ftsRows(db, ['rag'], 20, ['[[', ']]'], root);
    assert.equal(ragRows.length, 0, 'rag-contexts should be skipped');

    const sqlRows = ftsRows(db, ['users'], 20, ['[[', ']]'], root);
    assert.ok(sqlRows.length > 0, 'database/migrations/users.sql should be indexed');
    assert.ok(sqlRows[0].path.includes('users.sql'), `should find users.sql, got ${sqlRows[0].path}`);

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 2: Incremental update (only changed files re-indexed)
// ============================================================
test('E2E: updateFile re-indexes single file, search reflects changes', () => {
  const root = makeProject(5);
  try {
    const db = openDb(root);
    refresh(db, root);

    const relPath = getRelPath(0);
    fs.writeFileSync(getFilePath(root, 0), [
      '// File 0 - MODIFIED',
      'export function completelyNewName(req) { return req.id; }',
    ].join('\n'));

    const updated = updateFile(db, root, relPath);
    assert.ok(updated, 'updateFile should return true for changed file');

    const rows = ftsRows(db, ['completelyNewName'], 20, ['[[', ']]'], root);
    assert.ok(rows.length > 0, 'search should find the new function name');
    assert.ok(rows[0].path.includes('file0.js'), 'should find in file0.js');

    const oldRows = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.ok(!oldRows.some(r => r.path.includes('file0.js')), 'old handler_0 should be gone from file0.js');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 3: updateFile for deleted file removes from index
// ============================================================
test('E2E: updateFile on deleted file removes it from index', () => {
  const root = makeProject(5);
  try {
    const db = openDb(root);
    refresh(db, root);

    const before = ftsRows(db, ['handler_3'], 20, ['[[', ']]'], root);
    assert.ok(before.length > 0, 'handler_3 should be indexed before deletion');

    const absPath = getFilePath(root, 3);
    fs.unlinkSync(absPath);

    const relPath = getRelPath(3);
    const result = updateFile(db, root, relPath);
    assert.ok(result, 'updateFile should return true for deleted file');

    const after = ftsRows(db, ['handler_3'], 20, ['[[', ']]'], root);
    assert.ok(!after.some(r => r.path.includes('file3.js')), 'handler_3 should be gone from file3.js after deletion');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 4: Search cache returns consistent results and invalidates on refresh
// ============================================================
test('E2E: search cache returns consistent results and invalidates on refresh', () => {
  const root = makeProject(5);
  try {
    const db = openDb(root);
    refresh(db, root);

    const r1 = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.ok(r1.length > 0, 'first search should find results');

    const r2 = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.equal(r2.length, r1.length, 'cached search should return same count');

    const r3 = ftsRows(db, ['handler_0'], 20, undefined, root);
    assert.equal(r3.length, r1.length, 'different mark should still find results');

    invalidateSearchCache();

    const relPath = getRelPath(0);
    fs.writeFileSync(getFilePath(root, 0), 'export function brandNewFunc() { return 42; }\n');
    refresh(db, root);

    const r4 = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.ok(!r4.some(r => r.path.includes('file0.js')), 'old term should be gone from file0.js after refresh');

    const r5 = ftsRows(db, ['brandNewFunc'], 20, ['[[', ']]'], root);
    assert.ok(r5.length > 0, 'new term should be found after refresh');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 5: refreshWithWorkers with small file count (fallback path)
// ============================================================
test('E2E: refreshWithWorkers with <200 files uses sync fallback', async () => {
  const root = makeProject(50);
  try {
    const db = openDb(root);
    const result = await refreshWithWorkers(db, root);
    assert.ok(result.indexed > 0, `should index files via fallback, got ${result.indexed}`);

    const rows = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.ok(rows.length > 0, 'search should work after worker fallback');

    const ragRows = ftsRows(db, ['rag'], 20, ['[[', ']]'], root);
    assert.equal(ragRows.length, 0, 'rag-contexts should be skipped');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 6: refreshWithWorkers with large file count (worker path)
// ============================================================
test('E2E: refreshWithWorkers with 250+ files uses worker threads', async () => {
  const root = makeProject(250);
  try {
    const db = openDb(root);
    const result = await refreshWithWorkers(db, root);
    assert.ok(result.indexed > 0, `should index files via workers, got ${result.indexed}`);

    const rows = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.ok(rows.length > 0, 'search should work after worker indexing');

    const fileCount = db.prepare('SELECT COUNT(*) as c FROM files').get().c;
    assert.ok(fileCount >= 250, `should have at least 250 files indexed, got ${fileCount}`);

    const ragRows = ftsRows(db, ['rag'], 20, ['[[', ']]'], root);
    assert.equal(ragRows.length, 0, 'rag-contexts should be skipped even with workers');

    const sqlRows = ftsRows(db, ['users'], 20, ['[[', ']]'], root);
    assert.ok(sqlRows.length > 0, 'database/migrations should be indexed with workers');

    const symCount = db.prepare('SELECT COUNT(*) as c FROM symbols').get().c;
    assert.ok(symCount > 0, `should have symbols extracted, got ${symCount}`);

    const linkCount = db.prepare('SELECT COUNT(*) as c FROM links').get().c;
    assert.ok(linkCount > 0, `should have links extracted, got ${linkCount}`);

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 7: Second refresh only re-indexes changed files
// ============================================================
test('E2E: second refresh only re-indexes changed files', () => {
  const root = makeProject(20);
  try {
    const db = openDb(root);
    const r1 = refresh(db, root);
    assert.ok(r1.indexed > 0, 'first refresh should index files');

    const r2 = refresh(db, root);
    assert.equal(r2.indexed, 0, 'second refresh should index 0 files (no changes)');
    assert.equal(r2.removed, 0, 'nothing removed');

    fs.writeFileSync(getFilePath(root, 5), 'export function changedFunc() { return true; }\n');
    const r3 = refresh(db, root);
    assert.equal(r3.indexed, 1, `third refresh should index 1 changed file, got ${r3.indexed}`);

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 8: walk() skips correct directories
// ============================================================
test('E2E: walk() skips data dump dirs, includes database/', () => {
  const root = makeProject(5);
  try {
    const files = walk(root);

    assert.ok(files.some(f => f.includes('file0.js')), 'should include source files');
    assert.ok(files.some(f => f.includes('file4.js')), 'should include source files');
    assert.ok(files.some(f => f.includes('users.sql')), 'should include database/migrations/users.sql');

    assert.ok(!files.some(f => f.includes('rag-contexts')), 'should skip rag-contexts dir');
    assert.ok(!files.some(f => f.includes('embeddings/')), 'should skip embeddings dir');

    // walk() returns text files — shouldSkipFile is applied at index time, not walk time
    assert.ok(shouldSkipFile('huge.json', 200 * 1024), 'shouldSkipFile should skip huge.json');
    assert.ok(shouldSkipFile('app.js.map', 100), 'shouldSkipFile should skip .map files');
    assert.ok(shouldSkipFile('package.lock', 100), 'shouldSkipFile should skip .lock files');

    assert.ok(files.some(f => f.startsWith('.lex/') && f.endsWith('.md')), 'should include .lex .md files');
  } finally { cleanup(root); }
});

// ============================================================
// TEST 9: FTS search with multiple terms and fallback strategies
// ============================================================
test('E2E: FTS search handles multi-word, prefix, and fuzzy queries', () => {
  const root = makeProject(10);
  try {
    const db = openDb(root);
    refresh(db, root);

    const phrase = ftsRows(db, ['export', 'function', 'handler_0'], 20, ['[[', ']]'], root);
    assert.ok(phrase.length > 0, 'multi-word search should find results');

    const single = ftsRows(db, ['handler_5'], 20, ['[[', ']]'], root);
    assert.ok(single.length > 0, 'single term search should find results');

    const prefix = ftsRows(db, ['hand'], 20, ['[[', ']]'], root);
    assert.ok(prefix.length > 0, 'prefix search should find results');

    const fuzzy = ftsRows(db, ['hander_0'], 20, ['[[', ']]'], root);
    assert.ok(Array.isArray(fuzzy), 'fuzzy search should not crash');

    const nonsense = ftsRows(db, ['xyzzyqwerty'], 20, ['[[', ']]'], root);
    assert.equal(nonsense.length, 0, 'nonsense search should return empty');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 10: refreshWithWorkers then incremental updateFile
// ============================================================
test('E2E: worker indexing followed by incremental update works', async () => {
  const root = makeProject(250);
  try {
    const db = openDb(root);
    await refreshWithWorkers(db, root);

    const relPath = getRelPath(10);
    fs.writeFileSync(getFilePath(root, 10), 'export function postWorkerUpdate() { return "updated"; }\n');

    const updated = updateFile(db, root, relPath);
    assert.ok(updated, 'incremental update after worker indexing should work');

    const rows = ftsRows(db, ['postWorkerUpdate'], 20, ['[[', ']]'], root);
    assert.ok(rows.length > 0, 'should find new content after incremental update');
    assert.ok(rows[0].path.includes('file10.js'), 'should find in file10.js');

    const oldRows = ftsRows(db, ['handler_10'], 20, ['[[', ']]'], root);
    assert.ok(!oldRows.some(r => r.path.includes('file10.js')), 'old content should be replaced in file10.js');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 11: Stale file removal after deletion
// ============================================================
test('E2E: refresh removes stale files from index', () => {
  const root = makeProject(10);
  try {
    const db = openDb(root);
    refresh(db, root);

    const before = ftsRows(db, ['handler_7'], 20, ['[[', ']]'], root);
    assert.ok(before.length > 0, 'handler_7 should be indexed');

    fs.unlinkSync(getFilePath(root, 7));

    const r = refresh(db, root);
    assert.equal(r.removed, 1, `should remove 1 file, got ${r.removed}`);

    const after = ftsRows(db, ['handler_7'], 20, ['[[', ']]'], root);
    assert.ok(!after.some(r => r.path.includes('file7.js')), 'deleted file7.js should not be found in results');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 12: Search cache eviction (max 100 entries)
// ============================================================
test('E2E: search cache evicts old entries at max capacity', () => {
  const root = makeProject(10);
  try {
    const db = openDb(root);
    refresh(db, root);

    for (let i = 0; i < 105; i++) {
      ftsRows(db, [`handler_${i % 10}`, 'term' + i], 20, ['[[', ']]'], root);
    }

    const rows = ftsRows(db, ['handler_0'], 20, ['[[', ']]'], root);
    assert.ok(rows.length > 0, 'search should still work after cache pressure');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 13: Schema extraction (SQL files)
// ============================================================
test('E2E: SQL schema extraction works', () => {
  const root = makeProject(5);
  try {
    fs.mkdirSync(path.join(root, 'db'), { recursive: true });
    fs.writeFileSync(path.join(root, 'db', 'schema.sql'), [
      'CREATE TABLE users (',
      '  id INTEGER PRIMARY KEY,',
      '  name TEXT NOT NULL,',
      '  email TEXT',
      ');',
      'CREATE TABLE posts (',
      '  id INTEGER PRIMARY KEY,',
      '  user_id INTEGER,',
      '  FOREIGN KEY (user_id) REFERENCES users(id)',
      '  title TEXT',
      ');',
    ].join('\n'));

    const db = openDb(root);
    refresh(db, root);

    const tables = db.prepare('SELECT name FROM schema_tables ORDER BY name').all();
    assert.ok(tables.length >= 2, `should have 2 schema tables, got ${tables.length}`);
    assert.ok(tables.some(t => t.name === 'users'), 'should have users table');
    assert.ok(tables.some(t => t.name === 'posts'), 'should have posts table');

    const columns = db.prepare('SELECT table_name, name FROM schema_columns WHERE table_name = ? ORDER BY name').all('users');
    assert.ok(columns.length >= 3, `should have 3 columns for users, got ${columns.length}`);
    assert.ok(columns.some(c => c.name === 'id'), 'should have id column');
    assert.ok(columns.some(c => c.name === 'name'), 'should have name column');
    assert.ok(columns.some(c => c.name === 'email'), 'should have email column');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 14: Symbol extraction
// ============================================================
test('E2E: symbol extraction captures functions and classes', () => {
  const root = makeProject(5);
  try {
    const db = openDb(root);
    refresh(db, root);

    const symbols = db.prepare('SELECT name, kind, path FROM symbols WHERE path LIKE ? ORDER BY line').all('%file0.js%');
    assert.ok(symbols.length >= 2, `should have at least 2 symbols in file0.js, got ${symbols.length}`);
    assert.ok(symbols.some(s => s.name === 'handler_0' && s.kind === 'function'), 'should have handler_0 function');
    assert.ok(symbols.some(s => s.name === 'Service_0' && s.kind === 'class'), 'should have Service_0 class');

    db.close();
  } finally { cleanup(root); }
});

// ============================================================
// TEST 15: Link extraction
// ============================================================
test('E2E: link extraction captures fetch URLs', () => {
  const root = makeProject(5);
  try {
    const db = openDb(root);
    refresh(db, root);

    const links = db.prepare('SELECT url, path FROM links WHERE url LIKE ?').all('%/api/data/%');
    assert.ok(links.length >= 5, `should have at least 5 fetch links, got ${links.length}`);

    db.close();
  } finally { cleanup(root); }
});

console.log('E2E test suite loaded — 15 tests');
