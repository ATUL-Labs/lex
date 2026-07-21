'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const memdb = require('../lib/memory-db');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexmem-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  return root;
}

function cleanup(root) {
  memdb.closeMemoryDb();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

test('refreshMemoryDb indexes pages and returns counts', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. FTS5 binding error',
      '- when: 2025-01-15',
      '- what: DatabaseSync could not bind null values',
      '- fix: Use empty strings instead of null for TEXT columns',
      '',
      '## 2. Missing constructor',
      '- when: 2025-01-16',
      '- what: Used new Database instead of DatabaseSync',
      '- fix: Import DatabaseSync from node:sqlite',
    ].join('\n'));

    const result = memdb.refreshMemoryDb(root);
    assert.ok(result.pagesUpdated >= 1);
    const stats = memdb.getStats(root);
    assert.ok(stats.total >= 2);
    assert.ok(stats.byType.mistakes >= 2);
  } finally { cleanup(root); }
});

test('searchMemoryDb returns results for matching terms', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- when: 2025-01-15',
      '- what: DatabaseSync could not bind null values to TEXT columns',
      '- fix: Use empty strings instead of null',
    ].join('\n'));

    memdb.refreshMemoryDb(root);
    const rows = memdb.searchMemoryDb(root, ['SQLite', 'binding'], { limit: 10 });
    assert.ok(rows.length >= 1);
    assert.ok(rows[0].title.includes('SQLite') || rows[0].preview.includes('SQLite'));
  } finally { cleanup(root); }
});

test('searchMemoryDb returns empty for non-matching terms', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Some error\n- what: something\n');
    memdb.refreshMemoryDb(root);
    const rows = memdb.searchMemoryDb(root, ['nonexistentterm'], { limit: 10 });
    assert.equal(rows.length, 0);
  } finally { cleanup(root); }
});

test('searchMemoryDb with type filter only returns matching type', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Database error\n- what: sqlite issue\n');
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Always validate input\n- what: check inputs\n');
    memdb.refreshMemoryDb(root);
    const rows = memdb.searchMemoryDb(root, ['Database'], { type: 'mistakes', limit: 10 });
    assert.ok(rows.length >= 1);
    assert.ok(rows.every(r => r.type === 'mistakes'));
  } finally { cleanup(root); }
});

test('getMemoriesByFile returns memories linked to a file path', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'patterns.md'), [
      '## Use transactions for bulk inserts',
      '- where: src/database.js,lib/indexer.js',
      '- what: wrap bulk inserts in transactions',
    ].join('\n'));
    memdb.refreshMemoryDb(root);
    const rows = memdb.getMemoriesByFile(root, 'src/database.js', { limit: 10 });
    assert.ok(rows.length >= 1);
  } finally { cleanup(root); }
});

test('getAllMemories respects type filter and limit', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Error A\n- what: a\n');
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Rule A\n- what: rule\n');
    memdb.refreshMemoryDb(root);
    const all = memdb.getAllMemories(root, { limit: 100 });
    assert.ok(all.length >= 2);
    const mistakes = memdb.getAllMemories(root, { type: 'mistakes', limit: 100 });
    assert.ok(mistakes.every(m => m.type === 'mistakes'));
  } finally { cleanup(root); }
});

test('saveLinksToDb and getRelatedFromDb work together', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- when: 2025-01-15',
      '- what: DatabaseSync null binding issue in sqlite columns',
      '- fix: use empty strings',
      '',
      '## 2. Constructor error',
      '- when: 2025-01-16',
      '- what: DatabaseSync constructor sqlite issue',
      '- fix: import correctly',
    ].join('\n'));
    memdb.refreshMemoryDb(root);
    const all = memdb.getAllMemories(root, { limit: 100 });
    assert.ok(all.length >= 2);
    const links = {};
    links[all[0].id] = [{ target_id: all[1].id, score: 5, reasons: ['shared terms'] }];
    links[all[1].id] = [{ target_id: all[0].id, score: 5, reasons: ['shared terms'] }];
    memdb.saveLinksToDb(root, links);
    const related = memdb.getRelatedFromDb(root, all[0].id, 5);
    assert.ok(related.length >= 1);
    assert.equal(related[0].id, all[1].id);
  } finally { cleanup(root); }
});

test('getStats returns correct counts', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Error A\n- what: a\n');
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Rule A\n- what: rule\n');
    memdb.refreshMemoryDb(root);
    const stats = memdb.getStats(root);
    assert.ok(stats.total >= 2);
    assert.ok(stats.byType.mistakes >= 1);
    assert.ok(stats.byType.rules >= 1);
    assert.equal(stats.links, 0);
  } finally { cleanup(root); }
});

test('cleanupDeletedMemories removes entries for deleted files', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Error A\n- what: a\n');
    memdb.refreshMemoryDb(root);
    assert.ok(memdb.getStats(root).total >= 1);

    fs.rmSync(path.join(root, '.lex', 'pages', 'mistakes.md'));
    memdb.refreshMemoryDb(root);
    assert.equal(memdb.getStats(root).total, 0);
  } finally { cleanup(root); }
});

test('incremental refresh: second call with no changes is fast and returns 0', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Error A\n- what: a\n');
    const r1 = memdb.refreshMemoryDb(root);
    assert.ok(r1.pagesUpdated >= 1);
    const r2 = memdb.refreshMemoryDb(root);
    assert.equal(r2.pagesUpdated, 0);
  } finally { cleanup(root); }
});

test('FTS5 sanitization: special characters do not crash search', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Error\n- what: something\n');
    memdb.refreshMemoryDb(root);
    const rows = memdb.searchMemoryDb(root, ['"quotes"', '(parens)', '*star'], { limit: 10 });
    assert.ok(Array.isArray(rows));
  } finally { cleanup(root); }
});

test('indexSessions indexes session files with episode type', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'sessions', '2025-01-15.md'), [
      '# Session: Database fixes',
      '- date: 2025-01-15',
      '## Summary',
      'Fixed SQLite binding issues',
      '## Files modified',
      '- lib/memory-db.js',
      '- lib/indexer.js',
    ].join('\n'));
    memdb.refreshMemoryDb(root);
    const episodes = memdb.getAllMemories(root, { type: 'episode', limit: 10 });
    assert.ok(episodes.length >= 1);
    assert.ok(episodes[0].title.includes('Database'));
  } finally { cleanup(root); }
});

test('getLastBuiltId and setLastBuiltId work correctly', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Error\n- what: a\n');
    memdb.refreshMemoryDb(root);
    assert.equal(memdb.getLastBuiltId(root), 0);
    memdb.setLastBuiltId(root, 42);
    assert.equal(memdb.getLastBuiltId(root), 42);
  } finally { cleanup(root); }
});
