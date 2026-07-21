'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { scanEpisodes, runDecay, compressEpisode, findRecurringPatterns } = require('../lib/memory-decay');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexdec-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

function makeOldSession(root, filename, lines) {
  fs.writeFileSync(path.join(root, '.lex', 'sessions', filename), lines.join('\n') + '\n');
}

test('scanEpisodes returns episodes with correct age tiers', () => {
  const root = makeProject();
  try {
    const today = new Date();
    const oldDate = new Date(today.getTime() - 100 * 86400000).toISOString().substring(0, 10);
    const recentDate = new Date(today.getTime() - 3 * 86400000).toISOString().substring(0, 10);

    makeOldSession(root, oldDate + '.md', ['# Session old', '## Summary', 'old content']);
    makeOldSession(root, recentDate + '.md', ['# Session recent', '## Summary', 'recent content']);

    const episodes = scanEpisodes(root);
    assert.equal(episodes.length, 2);
    const old = episodes.find(e => e.date === oldDate);
    const recent = episodes.find(e => e.date === recentDate);
    assert.equal(old.tier, 'minimal');
    assert.equal(recent.tier, 'full');
  } finally { cleanup(root); }
});

test('compressEpisode removes non-essential sections for old episodes', () => {
  const content = [
    '# Session old',
    '- date: 2025-01-01',
    '## Summary',
    'Did some work',
    '## Files modified',
    '- src/app.js',
    '## Next steps',
    '- do more things',
    '## Decisions',
    '- chose option A',
  ].join('\n');

  const compressed = compressEpisode(content, 100);
  assert.ok(compressed.includes('# Session old'));
  assert.ok(compressed.includes('## Summary'));
  assert.ok(compressed.includes('## Decisions'));
  assert.ok(!compressed.includes('## Next steps'));
  assert.ok(!compressed.includes('## Files modified'));
});

test('compressEpisode keeps everything for recent episodes (< 7 days)', () => {
  const content = [
    '# Session recent',
    '## Summary',
    'Did some work',
    '## Files modified',
    '- src/app.js',
    '## Next steps',
    '- do more things',
  ].join('\n');

  const compressed = compressEpisode(content, 3);
  assert.ok(compressed.includes('## Next steps'));
  assert.ok(compressed.includes('## Files modified'));
});

test('runDecay with dry-run does not modify files', () => {
  const root = makeProject();
  try {
    const oldDate = new Date(Date.now() - 100 * 86400000).toISOString().substring(0, 10);
    const content = ['# Session old', '## Summary', 'did work', '## Next steps', '- todo', '## Decisions', '- chose A', '## Files modified', '- src/app.js', '## Learnings', '- learned stuff'];
    makeOldSession(root, oldDate + '.md', content);

    const result = runDecay(root, {});
    assert.ok(result.wouldCompress >= 1);
    assert.equal(result.compressed, 0);
    const original = fs.readFileSync(path.join(root, '.lex', 'sessions', oldDate + '.md'), 'utf8');
    assert.ok(original.includes('## Next steps'));
  } finally { cleanup(root); }
});

test('runDecay with apply compresses and creates backup', () => {
  const root = makeProject();
  try {
    const oldDate = new Date(Date.now() - 100 * 86400000).toISOString().substring(0, 10);
    const content = ['# Session old', '## Summary', 'did work', '## Next steps', '- todo', '## Decisions', '- chose A', '## Files modified', '- src/app.js', '## Learnings', '- learned stuff'];
    makeOldSession(root, oldDate + '.md', content);

    const result = runDecay(root, { apply: true });
    assert.ok(result.compressed >= 1);
    assert.ok(fs.existsSync(path.join(root, '.lex', 'sessions', 'archive', oldDate + '.md')));
    const compressed = fs.readFileSync(path.join(root, '.lex', 'sessions', oldDate + '.md'), 'utf8');
    assert.ok(!compressed.includes('## Next steps'));
  } finally { cleanup(root); }
});

test('findRecurringPatterns detects repeated mistake themes', () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
      '## 1. SQLite binding error',
      '- what: null binding',
      '',
      '## 2. SQLite constructor error',
      '- what: wrong constructor',
    ].join('\n'));
    const patterns = findRecurringPatterns(root);
    assert.ok(patterns.length >= 1);
    assert.ok(patterns.some(p => p.term === 'sqlite'));
  } finally { cleanup(root); }
});

test('episodes < 7 days are not compressed', () => {
  const root = makeProject();
  try {
    const recentDate = new Date(Date.now() - 3 * 86400000).toISOString().substring(0, 10);
    makeOldSession(root, recentDate + '.md', ['# Session', '## Summary', 'content', '## Next steps', '- todo']);
    const result = runDecay(root, { apply: true });
    assert.equal(result.wouldCompress, 0);
  } finally { cleanup(root); }
});
