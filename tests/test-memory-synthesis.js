'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { synthesize, autoEpisode, getAuditEntries } = require('../lib/memory-synthesis');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexsyn-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

function writeAuditLog(root, lines) {
  fs.writeFileSync(path.join(root, '.lex', 'audit.log'), lines.join('\n') + '\n');
}

test('synthesize generates episode from audit log', () => {
  const root = makeProject();
  try {
    const today = new Date().toISOString().substring(0, 10);
    writeAuditLog(root, [
      `${today} 10:00 | claude | claude | edit | src/app.js`,
      `${today} 10:05 | claude | claude | edit | lib/indexer.js`,
      `${today} 10:10 | claude | claude | run | npm test`,
    ]);
    fs.writeFileSync(path.join(root, '.lex', 'wip.md'), '# Fix SQLite binding\n1. Update memory-db\n2. Test changes\n');
    
    const result = synthesize(root, {});
    assert.ok(result.date);
    assert.ok(result.title);
    assert.ok(result.files.includes('src/app.js'));
    assert.ok(result.files.includes('lib/indexer.js'));
    assert.ok(!result.empty);
  } finally { cleanup(root); }
});

test('synthesize with no activity returns empty result', () => {
  const root = makeProject();
  try {
    const result = synthesize(root, {});
    assert.ok(result.empty);
    assert.equal(result.files.length, 0);
  } finally { cleanup(root); }
});

test('synthesize with --date targets specific date', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      '2025-01-15 10:00 | claude | claude | edit | src/app.js',
      '2025-01-16 10:00 | claude | claude | edit | lib/other.js',
    ]);
    const result = synthesize(root, { date: '2025-01-15' });
    assert.ok(result.files.includes('src/app.js'));
    assert.ok(!result.files.includes('lib/other.js'));
  } finally { cleanup(root); }
});

test('synthesize detects new mistakes from mistakes.md', () => {
  const root = makeProject();
  try {
    const today = new Date().toISOString().substring(0, 10);
    writeAuditLog(root, [
      `${today} 10:00 | claude | claude | edit | src/app.js`,
    ]);
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      `## 1. Some error`,
      `- when: ${today}`,
      `- what: something broke`,
    ].join('\n'));
    
    const result = synthesize(root, {});
    assert.ok(result.bugs.length >= 1);
  } finally { cleanup(root); }
});

test('synthesize extracts next steps from wip.md', () => {
  const root = makeProject();
  try {
    const today = new Date().toISOString().substring(0, 10);
    writeAuditLog(root, [
      `${today} 10:00 | claude | claude | edit | src/app.js`,
    ]);
    fs.writeFileSync(path.join(root, '.lex', 'wip.md'), [
      '# Fix bugs',
      '1. [x] Done step',
      '2. Pending step',
      '3. Another pending step',
    ].join('\n'));
    
    const result = synthesize(root, {});
    assert.ok(result.nextSteps.length >= 1);
    assert.ok(result.nextSteps.some(s => s.includes('Pending')));
  } finally { cleanup(root); }
});

test('autoEpisode with dry run (empty) returns null', () => {
  const root = makeProject();
  try {
    const result = autoEpisode(root, {});
    assert.equal(result, null);
  } finally { cleanup(root); }
});

test('autoEpisode with force writes episode file', () => {
  const root = makeProject();
  try {
    const result = autoEpisode(root, { force: true });
    assert.ok(result);
    assert.ok(result.filename);
    assert.ok(fs.existsSync(path.join(root, '.lex', 'sessions', result.filename)));
  } finally { cleanup(root); }
});

test('getAuditEntries parses audit log correctly', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      '2025-01-15 10:00 | claude | windsurf | edit | src/app.js',
      '2025-01-15 10:05 | claude | windsurf | run | npm test',
    ]);
    const entries = getAuditEntries(root);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].agent, 'claude');
    assert.equal(entries[0].platform, 'windsurf');
    assert.equal(entries[0].action, 'edit');
    assert.equal(entries[0].file, 'src/app.js');
  } finally { cleanup(root); }
});

test('synthesize generates correct summary with task and files', () => {
  const root = makeProject();
  try {
    const today = new Date().toISOString().substring(0, 10);
    writeAuditLog(root, [
      `${today} 10:00 | claude | claude | edit | src/app.js`,
      `${today} 10:05 | claude | claude | edit | lib/indexer.js`,
    ]);
    fs.writeFileSync(path.join(root, '.lex', 'wip.md'), '# Fix memory DB\n');
    
    const result = synthesize(root, {});
    assert.ok(result.summary.includes('Fix memory DB'));
    assert.ok(result.summary.includes('2 file'));
  } finally { cleanup(root); }
});
