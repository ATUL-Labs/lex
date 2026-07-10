'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLI = path.join(__dirname, '..', 'bin', 'lex.js');

function run(cwd, args) {
  return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('init scaffolds .lex from templates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxinit-'));
  const out = run(dir, ['init']);
  assert.match(out, /next: run/);
  assert.ok(fs.existsSync(path.join(dir, '.lex', 'status.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lex', 'INDEX.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lex', 'pages', 'mistakes.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lex', 'pages', 'design.md')));
  assert.ok(fs.existsSync(path.join(dir, '.lex', 'sessions')));
  const gi = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  assert.match(gi, /\.lex\/index\.db\*/);
  assert.match(gi, /\.lex\/live\.json/);
});

test('init is idempotent and never overwrites existing content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxinit2-'));
  run(dir, ['init']);
  fs.writeFileSync(path.join(dir, '.lex', 'status.md'), 'MY_CUSTOM_STATUS\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  run(dir, ['init']);
  const status = fs.readFileSync(path.join(dir, '.lex', 'status.md'), 'utf8');
  assert.match(status, /MY_CUSTOM_STATUS/);
  const gi = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  assert.match(gi, /node_modules\//);
  assert.match(gi, /\.lex\/index\.db\*/);
});

test('init works when .gitignore does not exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxinit3-'));
  run(dir, ['init']);
  assert.ok(fs.existsSync(path.join(dir, '.gitignore')));
});

test('init does not crash when templates are missing', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxinit4-'));
  const fakePluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxfake-'));
  const binDir = path.join(fakePluginRoot, 'bin');
  const libDir = path.join(fakePluginRoot, 'lib');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });

  // Copy bin/lex.js and lib/* to fake plugin, but NO templates/
  fs.copyFileSync(CLI, path.join(binDir, 'lex.js'));
  const realLibDir = path.join(__dirname, '..', 'lib');
  for (const f of fs.readdirSync(realLibDir)) {
    const src = path.join(realLibDir, f);
    const dest = path.join(libDir, f);
    if (fs.lstatSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  // Run lex init with fake plugin root (missing templates)
  const out = execFileSync('node', [path.join(binDir, 'lex.js'), 'init', targetDir], {
    encoding: 'utf8',
    cwd: fakePluginRoot,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Should succeed with warning, not crash
  assert.match(out, /next: run/);
  assert.ok(fs.existsSync(path.join(targetDir, '.lex')));
  assert.ok(fs.existsSync(path.join(targetDir, '.lex', 'pages')));
  assert.ok(fs.existsSync(path.join(targetDir, '.lex', 'sessions')));
  assert.ok(fs.existsSync(path.join(targetDir, '.gitignore')));
});
