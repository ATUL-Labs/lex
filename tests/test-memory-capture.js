'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { runCapture, detectMistakePatterns, getAuditEntries } = require('../lib/memory-capture');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexcap-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

function writeAuditLog(root, entries) {
  const lines = entries.map(e => `2025-01-15 10:0${e.i} | claude | claude | ${e.action} | ${e.file}`);
  fs.writeFileSync(path.join(root, '.lex', 'audit.log'), lines.join('\n') + '\n');
}

test('detectMistakePatterns finds edit-run-edit pattern', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      { i: 1, action: 'edit', file: 'src/app.js' },
      { i: 2, action: 'run', file: 'npm test' },
      { i: 3, action: 'edit', file: 'src/app.js' },
    ]);
    const entries = getAuditEntries(root);
    const detected = detectMistakePatterns(entries);
    assert.ok(detected.length >= 1);
    assert.equal(detected[0].type, 'edit-run-edit');
  } finally { cleanup(root); }
});

test('detectMistakePatterns finds edit-error-edit pattern', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      { i: 1, action: 'edit', file: 'src/app.js' },
      { i: 2, action: 'error', file: 'TypeError: x is not a function' },
      { i: 3, action: 'edit', file: 'src/app.js' },
    ]);
    const entries = getAuditEntries(root);
    const detected = detectMistakePatterns(entries);
    assert.ok(detected.length >= 1);
    assert.equal(detected[0].type, 'edit-error-edit');
  } finally { cleanup(root); }
});

test('detectMistakePatterns ignores single edits (no pattern)', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      { i: 1, action: 'edit', file: 'src/app.js' },
    ]);
    const entries = getAuditEntries(root);
    const detected = detectMistakePatterns(entries);
    assert.equal(detected.length, 0);
  } finally { cleanup(root); }
});

test('runCapture with dry-run does not write to mistakes.md', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      { i: 1, action: 'edit', file: 'src/app.js' },
      { i: 2, action: 'run', file: 'npm test' },
      { i: 3, action: 'edit', file: 'src/app.js' },
    ]);
    const result = runCapture(root, {});
    assert.ok(result.dryRun);
    assert.ok(result.detections >= 1);
    assert.ok(!fs.existsSync(path.join(root, '.lex', 'pages', 'mistakes.md')));
  } finally { cleanup(root); }
});

test('runCapture with apply writes to mistakes.md', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      { i: 1, action: 'edit', file: 'src/app.js' },
      { i: 2, action: 'run', file: 'npm test' },
      { i: 3, action: 'edit', file: 'src/app.js' },
    ]);
    const result = runCapture(root, { apply: true });
    assert.ok(!result.dryRun);
    const content = fs.readFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), 'utf8');
    assert.ok(content.includes('Auto-captured'));
    assert.ok(content.includes('auto_captured: true'));
  } finally { cleanup(root); }
});

test('runCapture skips already captured mistakes', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      { i: 1, action: 'edit', file: 'src/app.js' },
      { i: 2, action: 'run', file: 'npm test' },
      { i: 3, action: 'edit', file: 'src/app.js' },
    ]);
    runCapture(root, { apply: true });
    const result2 = runCapture(root, { apply: true });
    assert.ok(result2.results.every(r => r.action === 'skip'));
  } finally { cleanup(root); }
});

test('detectMistakePatterns finds repeated-edits pattern (4+ edits same file)', () => {
  const root = makeProject();
  try {
    writeAuditLog(root, [
      { i: 1, action: 'edit', file: 'src/app.js' },
      { i: 2, action: 'edit', file: 'src/app.js' },
      { i: 3, action: 'edit', file: 'src/app.js' },
      { i: 4, action: 'edit', file: 'src/app.js' },
    ]);
    const entries = getAuditEntries(root);
    const detected = detectMistakePatterns(entries);
    assert.ok(detected.some(d => d.type === 'repeated-edits'));
  } finally { cleanup(root); }
});
