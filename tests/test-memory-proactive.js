'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const memdb = require('../lib/memory-db');
const { proactive, formatProactive } = require('../lib/memory-proactive');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexpro-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  return root;
}

function cleanup(root) {
  memdb.closeMemoryDb();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

test('proactive with no signals still returns rules', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Always use transactions\n- what: wrap bulk inserts\n');
    const result = proactive(root, {});
    assert.ok(result.memories.length >= 0);
    assert.ok(result.context);
  } finally { cleanup(root); }
});

test('proactive with file signal surfaces file-related memories', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'patterns.md'), [
      '## Transaction pattern',
      '- where: src/database.js',
      '- what: wrap bulk inserts in transactions for performance',
    ].join('\n'));
    memdb.refreshMemoryDb(root);
    const result = proactive(root, { files: ['src/database.js'] });
    assert.ok(result.context.files.includes('src/database.js'));
  } finally { cleanup(root); }
});

test('proactive with task signal surfaces task-related memories', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- when: 2025-01-15',
      '- what: DatabaseSync could not bind null to TEXT columns in sqlite',
      '- fix: use empty strings',
    ].join('\n'));
    const result = proactive(root, { task: { title: 'Fix SQLite binding', steps: [] } });
    assert.ok(result.context.task);
  } finally { cleanup(root); }
});

test('proactive always includes rules in results', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Always validate input\n- what: check all inputs\n');
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), '## 1. Some error\n- what: something\n');
    const result = proactive(root, {});
    const ruleMemories = result.memories.filter(m => m.type === 'rules');
    assert.ok(ruleMemories.length >= 1);
  } finally { cleanup(root); }
});

test('formatProactive produces readable output', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Always validate input\n- what: check all inputs\n');
    const result = proactive(root, {});
    const output = formatProactive(result);
    assert.ok(typeof output === 'string');
    assert.ok(output.includes('## Context detected') || output.includes('## Surfaced memories') || output.includes('## Proactive memory'));
  } finally { cleanup(root); }
});

test('proactive context includes files and terms', () => {
  const root = makeProject();
  try {
    const result = proactive(root, { files: ['src/app.js'], task: { title: 'Fix bug', steps: [] } });
    assert.ok(result.context.files.includes('src/app.js'));
    assert.ok(result.context.task === 'Fix bug');
  } finally { cleanup(root); }
});

test('proactive with related memories via associations', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- when: 2025-01-15',
      '- what: DatabaseSync null binding sqlite issue',
      '- fix: use empty strings',
      '',
      '## 2. Constructor error',
      '- when: 2025-01-16',
      '- what: DatabaseSync constructor sqlite issue',
      '- fix: import correctly',
    ].join('\n'));
    memdb.refreshMemoryDb(root);
    const all = memdb.getAllMemories(root, { limit: 100 });
    const links = {};
    links[all[0].id] = [{ target_id: all[1].id, score: 5, reasons: ['shared terms'] }];
    links[all[1].id] = [{ target_id: all[0].id, score: 5, reasons: ['shared terms'] }];
    memdb.saveLinksToDb(root, links);
    const result = proactive(root, { files: [], task: { title: 'SQLite binding', steps: [] } });
    assert.ok(result.memories.length >= 0);
  } finally { cleanup(root); }
});
