'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLI = path.join(__dirname, '..', 'bin', 'ctx.js');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxcli-'));
  fs.mkdirSync(path.join(root, '.ctx'), { recursive: true });
  fs.mkdirSync(path.join(root, 'routes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'routes', 'web.php'), "<?php\nRoute::patch('/dashboard/tasks/{task}', 'UserTaskController@update');\n");
  fs.writeFileSync(path.join(root, 'src', 'Tasks.tsx'), "export function moveTask(id) { router.patch(`/dashboard/tasks/${id}`, {}) }\n");
  return root;
}

function run(root, args, input) {
  return execFileSync('node', [CLI, ...args], { cwd: root, input, encoding: 'utf8' });
}

function runDocs(cwd, args, env) {
  return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

test('search finds content and stays within 10 lines', () => {
  const root = makeProject();
  const out = run(root, ['search', 'moveTask']);
  assert.match(out, /src\/Tasks\.tsx/);
  assert.ok(out.trim().split('\n').length <= 10);
});

test('symbols lists a file, links connects route to consumer', () => {
  const root = makeProject();
  run(root, ['refresh']);
  const sym = run(root, ['symbols', 'src/Tasks.tsx']);
  assert.match(sym, /function moveTask/);
  const links = run(root, ['links', '/dashboard/tasks/{task}']);
  assert.match(links, /route\s+patch\s+\/dashboard\/tasks\/\*\s+routes\/web\.php:2/);
  assert.match(links, /consumer\s+patch\s+\/dashboard\/tasks\/\*\s+src\/Tasks\.tsx:1/);
});

test('links accepts slashless form (immune to Git Bash path mangling)', () => {
  const root = makeProject();
  run(root, ['refresh']);
  const withSlash = run(root, ['links', '/dashboard/tasks/{task}']);
  const slashless = run(root, ['links', 'dashboard/tasks/{task}']);
  assert.equal(slashless, withSlash);
  assert.match(slashless, /route\s+patch\s+\/dashboard\/tasks\/\*\s+routes\/web\.php:2/);
  assert.match(slashless, /consumer\s+patch\s+\/dashboard\/tasks\/\*\s+src\/Tasks\.tsx:1/);
});

test('no .ctx folder: polite exit 1', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxbare-'));
  assert.throws(() => run(bare, ['search', 'anything']), (e) => e.status === 1 && /no \.ctx folder/.test(e.stderr));
});

test('hook-update indexes the written file and always exits 0', () => {
  const root = makeProject();
  run(root, ['refresh']);
  fs.writeFileSync(path.join(root, 'src', 'fresh.ts'), 'export const brandNewThing = () => 1\n');
  const payload = JSON.stringify({ tool_input: { file_path: path.join(root, 'src', 'fresh.ts') } });
  const out = run(root, ['hook-update'], payload);
  assert.equal(out.trim(), '{}');
  assert.match(run(root, ['search', 'brandNewThing']), /src\/fresh\.ts/);
  assert.equal(run(root, ['hook-update'], 'not json at all').trim(), '{}');
});

test('docs command searches the global cache via env-overridden dirs', () => {
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxdocs-cli-'));
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxdocsdb-'));
  fs.mkdirSync(path.join(docsDir, 'laravel-12'), { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'laravel-12', 'eloquent.md'), '# Eloquent\nscopeOrdered requires grouped orWhere closures\n');
  const env = { CTX_DOCS_DIR: docsDir, CTX_DOCS_DB: path.join(dbDir, 'docs.db') };
  const anyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxanywhere-'));
  const out = runDocs(anyCwd, ['docs', 'orWhere'], env);
  assert.match(out, /laravel-12\/eloquent\.md/);
  const list = runDocs(anyCwd, ['docs'], env);
  assert.match(list, /laravel-12\/eloquent\.md/);
});

test('docs command without a cache dir exits 0 with guidance', () => {
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxnone-')), 'docs');
  const env = { CTX_DOCS_DIR: missing, CTX_DOCS_DB: missing + '.db' };
  const out = runDocs(process.cwd(), ['docs', 'anything'], env);
  assert.match(out, /no docs cache yet/);
});

test('multi-term search falls back to OR when AND has no hits', () => {
  const root = makeProject();
  run(root, ['refresh']);
  const out = run(root, ['search', 'moveTask', 'zzznonexistenttermzzz']);
  assert.match(out, /src\/Tasks\.tsx/);
});

function spawnServe(root, port) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI, 'serve', String(port)], { cwd: root });
    let out = '';
    const onData = (chunk) => {
      out += chunk;
      const m = out.match(/ctx viewer: http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { child.stdout.removeListener('data', onData); resolve({ child, port: Number(m[1]) }); }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    setTimeout(() => reject(new Error('serve did not print a URL in time')), 5000);
  });
}

test('serve falls back to the next free port when the requested one is taken', async () => {
  const rootA = makeProject();
  const rootB = makeProject();
  const requested = 41000 + Math.floor(Math.random() * 500);
  const first = await spawnServe(rootA, requested);
  try {
    assert.equal(first.port, requested);
    const second = await spawnServe(rootB, requested);
    try {
      assert.equal(second.port, requested + 1);
    } finally {
      second.child.kill();
    }
  } finally {
    first.child.kill();
  }
});
