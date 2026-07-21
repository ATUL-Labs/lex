'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { runPromotion, parseMistakes, findClusters, findPatternSessionRefs } = require('../lib/memory-promotion');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexprom-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

test('parseMistakes reads mistake sections', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- when: 2025-01-15',
      '- what: DatabaseSync null binding',
      '- fix: use empty strings',
      '',
      '## 2. Constructor error',
      '- when: 2025-01-16',
      '- what: wrong constructor name',
      '- fix: use DatabaseSync',
    ].join('\n'));
    const mistakes = parseMistakes(root);
    assert.equal(mistakes.length, 2);
    assert.equal(mistakes[0].title, 'SQLite binding error');
    assert.equal(mistakes[1].num, 2);
  } finally { cleanup(root); }
});

test('findClusters groups similar mistakes', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite columns',
      '',
      '## 2. SQLite constructor error',
      '- what: DatabaseSync constructor sqlite import',
      '',
      '## 3. Unrelated apple error',
      '- what: fruit basket problem',
    ].join('\n'));
    const mistakes = parseMistakes(root);
    const clusters = findClusters(mistakes);
    assert.ok(clusters.length >= 1);
    assert.ok(clusters[0].count >= 2);
  } finally { cleanup(root); }
});

test('findPatternSessionRefs counts session references', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'patterns.md'), '## Transaction pattern\n- what: wrap sqlite inserts in transactions\n');
    fs.writeFileSync(path.join(root, '.lex', 'sessions', '2025-01-15.md'), '# Session\n## Learnings\n- sqlite transactions important\n');
    fs.writeFileSync(path.join(root, '.lex', 'sessions', '2025-01-16.md'), '# Session\n## Learnings\n- sqlite transactions pattern\n');
    const { parsePatterns, parseSessions } = require('../lib/memory-promotion');
    const patterns = parsePatterns(root);
    const sessions = parseSessions(root);
    const refs = findPatternSessionRefs(patterns, sessions);
    assert.ok(refs.length >= 1);
    assert.ok(refs[0].refCount >= 2);
  } finally { cleanup(root); }
});

test('runPromotion with dry-run does not write files', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite columns',
      '',
      '## 2. SQLite constructor error',
      '- what: DatabaseSync constructor sqlite import',
    ].join('\n'));
    const result = runPromotion(root, {});
    assert.ok(result.dryRun);
    assert.ok(!fs.existsSync(path.join(root, '.lex', 'pages', 'patterns.md')) || !fs.readFileSync(path.join(root, '.lex', 'pages', 'patterns.md'), 'utf8').includes('Auto-promoted'));
  } finally { cleanup(root); }
});

test('runPromotion with apply writes to patterns.md', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: DatabaseSync null binding sqlite columns',
      '',
      '## 2. SQLite constructor error',
      '- what: DatabaseSync constructor sqlite import',
    ].join('\n'));
    const result = runPromotion(root, { apply: true });
    assert.ok(!result.dryRun);
    assert.ok(result.mistakePromotions.length >= 1);
    const patternsContent = fs.readFileSync(path.join(root, '.lex', 'pages', 'patterns.md'), 'utf8');
    assert.ok(patternsContent.includes('Auto-promoted'));
  } finally { cleanup(root); }
});

test('runPromotion skips TODO mistakes', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. TODO: Fix this later',
      '- what: something TODO',
      '',
      '## 2. Another TODO',
      '- what: also TODO',
    ].join('\n'));
    const result = runPromotion(root, {});
    assert.equal(result.stats.mistakesTodo, 2);
    assert.equal(result.stats.clustersFound, 0);
  } finally { cleanup(root); }
});
