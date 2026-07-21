'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runIntegrityCheck, formatIntegrityResult } = require('../lib/integrity-check');

function makeTempFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lex-integrity-'));
  const file = path.join(dir, 'test.html');
  fs.writeFileSync(file, content);
  return file;
}

test('integrity-check: detects orphan CSS class (HTML has class, CSS does not)', () => {
  const html = `<html><head><style>.foo { color: red; }</style></head>
  <body><div class="foo bar">Hello</div></body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  const orphanIssues = result.issues.filter(i => i.type === 'orphan-css-class');
  assert.ok(orphanIssues.length > 0);
  assert.ok(orphanIssues.some(i => i.message.includes('"bar"')));
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: detects dead CSS (CSS has class, HTML does not)', () => {
  const html = `<html><head><style>.foo { color: red; } .unused { color: blue; }</style></head>
  <body><div class="foo">Hello</div></body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  const deadIssues = result.issues.filter(i => i.type === 'dead-css');
  assert.ok(deadIssues.length > 0);
  assert.ok(deadIssues.some(i => i.message.includes('.unused')));
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: detects undefined CSS variable', () => {
  const html = `<html><head><style>.foo { color: var(--missing); }</style></head>
  <body><div class="foo">Hello</div></body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  const varIssues = result.issues.filter(i => i.type === 'undefined-css-var');
  assert.ok(varIssues.length > 0);
  assert.ok(varIssues.some(i => i.message.includes('--missing')));
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: detects orphaned JS getElementById', () => {
  const html = `<html><head></head>
  <body><div id="real">Hello</div>
  <script>document.getElementById('real').textContent = 'Hi'; document.getElementById('fake').remove();</script>
  </body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  const jsIssues = result.issues.filter(i => i.type === 'orphan-js-id');
  assert.ok(jsIssues.length > 0);
  assert.ok(jsIssues.some(i => i.message.includes('"fake"')));
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: detects broken resource reference', () => {
  const html = `<html><head><link rel="stylesheet" href="missing.css"></head>
  <body><img src="nonexistent.png"></body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  const brokenIssues = result.issues.filter(i => i.type === 'broken-resource' || i.type === 'broken-css-link');
  assert.ok(brokenIssues.length > 0);
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: detects duplicate CSS selectors', () => {
  const html = `<html><head><style>.foo { color: red; } .foo { color: blue; }</style></head>
  <body><div class="foo">Hello</div></body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  const dupIssues = result.issues.filter(i => i.type === 'duplicate-css-selector');
  assert.ok(dupIssues.length > 0);
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: detects inline style overload', () => {
  let divs = '';
  for (let i = 0; i < 15; i++) {
    divs += `<div style="color:red">Item ${i}</div>`;
  }
  const html = `<html><head></head><body>${divs}</body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  const inlineIssues = result.issues.filter(i => i.type === 'inline-style-overload');
  assert.ok(inlineIssues.length > 0);
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: clean file gets high score', () => {
  const html = `<html><head><style>.foo { color: red; }</style></head>
  <body><div class="foo" id="bar">Hello</div>
  <script>document.getElementById('bar').textContent = 'Hi';</script>
  </body></html>`;
  const file = makeTempFile(html);
  const result = runIntegrityCheck(file);
  assert.ok(result.score >= 90, `Expected score >= 90, got ${result.score}`);
  assert.equal(result.summary.critical, 0);
  fs.rmSync(path.dirname(file), { recursive: true });
});

test('integrity-check: formatIntegrityResult produces readable output', () => {
  const result = {
    ok: true,
    file: 'test.html',
    score: 75,
    issues: [
      { severity: 'critical', type: 'broken-css-link', message: 'CSS file not found: missing.css', file: 'test.html' },
      { severity: 'important', type: 'orphan-css-class', message: 'HTML class "bar" has no CSS definition', file: 'test.html' },
      { severity: 'info', type: 'dead-css', message: 'CSS class ".unused" is defined but not used in HTML', file: 'test.html' },
    ],
    stats: {
      htmlClasses: 2, cssClasses: 2, orphanClasses: 1, deadCssClasses: 1,
      cssVarsDefined: 0, cssVarsUsed: 0, undefinedVars: 0,
      htmlIds: 1, jsGetByIds: 1, jsQuerySelectors: 0, orphanJsRefs: 0,
      resourceRefs: 1, brokenResources: 1,
      duplicateSelectors: 0, deadJsFunctions: 0,
      inlineStyles: 0, externalCssFiles: 1, externalJsFiles: 0,
      fileSize: 500, fileLines: 10,
    },
    summary: { critical: 1, important: 1, info: 1, total: 3 },
  };
  const out = formatIntegrityResult(result);
  assert.ok(out.includes('INTEGRITY CHECK'));
  assert.ok(out.includes('test.html'));
  assert.ok(out.includes('75/100'));
  assert.ok(out.includes('CRITICAL'));
  assert.ok(out.includes('IMPORTANT'));
  assert.ok(out.includes('INFO'));
  assert.ok(out.includes('broken-css-link'));
  assert.ok(out.includes('orphan-css-class'));
});

test('integrity-check: formatIntegrityResult handles clean result', () => {
  const result = {
    ok: true,
    file: 'clean.html',
    score: 100,
    issues: [],
    stats: {
      htmlClasses: 1, cssClasses: 1, orphanClasses: 0, deadCssClasses: 0,
      cssVarsDefined: 0, cssVarsUsed: 0, undefinedVars: 0,
      htmlIds: 0, jsGetByIds: 0, jsQuerySelectors: 0, orphanJsRefs: 0,
      resourceRefs: 0, brokenResources: 0,
      duplicateSelectors: 0, deadJsFunctions: 0,
      inlineStyles: 0, externalCssFiles: 0, externalJsFiles: 0,
      fileSize: 100, fileLines: 5,
    },
    summary: { critical: 0, important: 0, info: 0, total: 0 },
  };
  const out = formatIntegrityResult(result);
  assert.ok(out.includes('CLEAN'));
  assert.ok(out.includes('100/100'));
});

test('gateway: integrity command returns object', () => {
  const gateway = require('../lib/gateway');
  const html = `<html><head><style>.foo { color: red; }</style></head>
  <body><div class="foo bar">Hello</div></body></html>`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lex-gw-'));
  fs.writeFileSync(path.join(dir, 'test.html'), html);
  const r = gateway.processRequest(dir, { cmd: 'integrity', args: ['test.html'] });
  assert.ok(typeof r === 'object');
  assert.ok(r.ok === true || r.ok === false);
  fs.rmSync(dir, { recursive: true });
});
