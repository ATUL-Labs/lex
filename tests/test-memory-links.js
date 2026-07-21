'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const memdb = require('../lib/memory-db');
const { buildAssociations, buildLinks, getRelated, linksCmd } = require('../lib/memory-links');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexlink-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  return root;
}

function cleanup(root) {
  memdb.closeMemoryDb();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

test('buildAssociations finds links between memories with shared terms', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- when: 2025-01-15',
      '- what: DatabaseSync could not bind null values to sqlite TEXT columns',
      '- fix: use empty strings',
      '',
      '## 2. Constructor error',
      '- when: 2025-01-16',
      '- what: DatabaseSync constructor sqlite import issue',
      '- fix: import DatabaseSync correctly',
    ].join('\n'));
    const result = buildAssociations(root);
    assert.ok(result.memoryCount >= 2);
    assert.ok(Object.keys(result.links).length >= 2);
  } finally { cleanup(root); }
});

test('buildAssociations respects threshold — no links for dissimilar memories', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Apple error\n- what: fruit basket\n');
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Zebra rule\n- what: animal kingdom\n');
    const result = buildAssociations(root);
    assert.equal(Object.keys(result.links).length, 0);
  } finally { cleanup(root); }
});

test('buildLinks with apply saves to DB', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite TEXT columns',
      '',
      '## 2. Constructor error',
      '- what: DatabaseSync constructor sqlite import issue',
    ].join('\n'));
    const result = buildLinks(root, { apply: true });
    assert.ok(result.memoryCount >= 2);
    const stats = memdb.getStats(root);
    assert.ok(stats.links > 0);
  } finally { cleanup(root); }
});

test('buildLinks without apply does not save', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite TEXT columns',
      '',
      '## 2. Constructor error',
      '- what: DatabaseSync constructor sqlite import issue',
    ].join('\n'));
    const result = buildLinks(root, { apply: false });
    assert.ok(result.memoryCount >= 2);
    const stats = memdb.getStats(root);
    assert.equal(stats.links, 0);
  } finally { cleanup(root); }
});

test('getRelated returns links from DB', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite TEXT columns',
      '',
      '## 2. Constructor error',
      '- what: DatabaseSync constructor sqlite import issue',
    ].join('\n'));
    buildLinks(root, { apply: true });
    const all = memdb.getAllMemories(root, { limit: 100 });
    const related = getRelated(root, all[0].id);
    assert.ok(related.length >= 1);
  } finally { cleanup(root); }
});

test('linksCmd displays without crashing (regression test for substring bug)', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite TEXT columns',
      '',
      '## 2. Constructor error',
      '- what: DatabaseSync constructor sqlite import issue',
    ].join('\n'));
    linksCmd(root, ['--apply']);
    assert.ok(true);
  } finally { cleanup(root); }
});

test('incremental build: second call only processes new memories', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite TEXT columns',
      '',
      '## 2. Constructor error',
      '- what: DatabaseSync constructor sqlite import issue',
    ].join('\n'));
    const r1 = buildLinks(root, { apply: true });
    assert.equal(r1.lastBuiltId, 0);
    assert.ok(r1.newCount >= 2);

    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Validate input rule\n- what: always validate sqlite inputs\n');
    const r2 = buildLinks(root, { apply: true });
    assert.ok(r2.lastBuiltId > 0);
    assert.ok(r2.newCount < r1.newCount);
  } finally { cleanup(root); }
});
