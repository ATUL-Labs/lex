'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createServer } = require('../lib/serve');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxserve-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, '.lex', 'status.md'), 'phase: SERVE_STATUS_MARKER\n');
  fs.writeFileSync(path.join(root, '.lex', 'wip.md'), '# WIP\n1. [x] done step\n2. [ ] SERVE_WIP_MARKER\n');
  fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), 'SERVE_PAGE_MARKER never again\n');
  fs.writeFileSync(path.join(root, '.lex', 'audit.log'), '2026-07-02 10:00 | agent | platform | edit | src/a.js\n');
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export function serveTestFn() {}\n');
  return root;
}

async function withServer(root, fn) {
  const server = createServer(root);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await fn(base); } finally { server.close(); }
}

test('overview returns live state and index stats', async () => {
  await withServer(makeProject(), async (base) => {
    const o = await (await fetch(base + '/api/overview')).json();
    assert.match(o.status, /SERVE_STATUS_MARKER/);
    assert.match(o.wip, /SERVE_WIP_MARKER/);
    assert.deepEqual(o.pages, ['mistakes.md']);
    assert.equal(o.audit.length, 1);
    assert.ok(o.index.files >= 2);
    assert.ok(o.index.symbols >= 1);
  });
});

test('page endpoint serves pages and blocks traversal', async () => {
  await withServer(makeProject(), async (base) => {
    const p = await (await fetch(base + '/api/page?name=mistakes.md')).json();
    assert.match(p.text, /SERVE_PAGE_MARKER/);
    assert.equal((await fetch(base + '/api/page?name=../../etc/passwd')).status, 400);
    assert.equal((await fetch(base + '/api/page?name=..%2Fstatus.md')).status, 400);
    assert.equal((await fetch(base + '/api/page?name=nope.md')).status, 404);
  });
});

test('search endpoint returns marked snippets', async () => {
  await withServer(makeProject(), async (base) => {
    const s = await (await fetch(base + '/api/search?q=serveTestFn')).json();
    assert.ok(s.rows.length >= 1);
    assert.match(s.rows[0].snip, /\[\[serveTestFn\]\]/);
  });
});

test('links endpoint and root html respond', async () => {
  await withServer(makeProject(), async (base) => {
    const l = await (await fetch(base + '/api/links')).json();
    assert.ok(Array.isArray(l.rows));
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /lex viewer/i);
  });
});

test('file endpoint serves only indexed paths', async () => {
  const root = makeProject();
  await withServer(root, async (base) => {
    await fetch(base + '/api/search?q=serveTestFn'); // forces index refresh
    const f = await (await fetch(base + '/api/file?path=src/app.js')).json();
    assert.match(f.text, /serveTestFn/);
    assert.equal((await fetch(base + '/api/file?path=.lex/audit.log')).status, 404);
    assert.equal((await fetch(base + '/api/file?path=../outside.js')).status, 404);
    assert.equal((await fetch(base + '/api/file?path=C:/Windows/win.ini')).status, 404);
    const s = await (await fetch(base + '/api/symbols?path=src/app.js')).json();
    assert.ok(s.rows.some(r => r.name === 'serveTestFn'));
  });
});

test('ls endpoint lists immediate children from the index', async () => {
  const root = makeProject();
  fs.mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'deep', 'inner.js'), 'export function innerFn() {}\n');
  await withServer(root, async (base) => {
    await fetch(base + '/api/search?q=serveTestFn'); // forces index refresh
    const top = await (await fetch(base + '/api/ls?dir=src')).json();
    assert.deepEqual(top.dirs, ['deep']);
    assert.ok(top.files.includes('app.js'));
    assert.ok(!top.files.includes('inner.js'));
    const rootLs = await (await fetch(base + '/api/ls')).json();
    assert.ok(rootLs.dirs.includes('src'));
    const empty = await (await fetch(base + '/api/ls?dir=nope')).json();
    assert.deepEqual(empty, { dirs: [], files: [] });
  });
});

test('mcps endpoint suggests servers matching manifest deps', async () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { react: '^19', 'snowflake-sdk': '^2' } }));
  await withServer(root, async (base) => {
    await fetch(base + '/api/search?q=serveTestFn'); // forces index refresh
    const m = await (await fetch(base + '/api/mcps')).json();
    const techs = m.rows.map(r => r.tech);
    assert.ok(techs.includes('React'));
    assert.ok(techs.includes('Snowflake'));
    assert.ok(!techs.includes('Laravel'));
  });
});

test('mcps endpoint hides suggestions already configured in .mcp.json', async () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { react: '^19', 'snowflake-sdk': '^2' } }));
  fs.writeFileSync(path.join(root, '.mcp.json'),
    JSON.stringify({ mcpServers: { snowflake: { command: 'x' } } }));
  await withServer(root, async (base) => {
    const m = await (await fetch(base + '/api/mcps')).json();
    const techs = m.rows.map(r => r.tech);
    assert.ok(techs.includes('React'));
    assert.ok(!techs.includes('Snowflake'));
  });
});

test('session endpoint reads sessions dir with name guard', async () => {
  const root = makeProject();
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, '.lex', 'sessions', '2026-07-03.md'), 'SESSION_BODY_MARKER\n');
  await withServer(root, async (base) => {
    const s = await (await fetch(base + '/api/session?name=2026-07-03.md')).json();
    assert.match(s.text, /SESSION_BODY_MARKER/);
    assert.equal((await fetch(base + '/api/session?name=..%2Fstatus.md')).status, 400);
    assert.equal((await fetch(base + '/api/session?name=nope.md')).status, 404);
  });
});

test('activity endpoint reflects the live marker', async () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, '.lex', 'live.json'), JSON.stringify({ file: 'src/app.js', tool: 'Edit', ts: Date.now() }));
  await withServer(root, async (base) => {
    const a = await (await fetch(base + '/api/activity')).json();
    assert.equal(a.file, 'src/app.js');
    assert.equal(a.tool, 'Edit');
    assert.ok(typeof a.ts === 'number');
  });
});

test('activity endpoint returns empty object when no marker exists', async () => {
  await withServer(makeProject(), async (base) => {
    const a = await (await fetch(base + '/api/activity')).json();
    assert.deepEqual(a, {});
  });
});

test('schema endpoint returns tables with nested columns and fk info', async () => {
  const root = makeProject();
  fs.mkdirSync(path.join(root, 'database', 'migrations'), { recursive: true });
  fs.writeFileSync(path.join(root, 'database', 'migrations', 'create_items.php'), [
    '<?php',
    "Schema::create('items', function (Blueprint $table) {",
    "  $table->string('name');",
    "  $table->foreignId('owner_id')->constrained();",
    '});',
  ].join('\n'));
  await withServer(root, async (base) => {
    await fetch(base + '/api/overview');
    const s = await (await fetch(base + '/api/schema')).json();
    const items = s.tables.find(t => t.name === 'items');
    assert.ok(items);
    const owner = items.columns.find(c => c.name === 'owner_id');
    assert.equal(owner.fkTable, 'owners');
  });
});

test('schema endpoint returns empty tables when no schema data indexed', async () => {
  await withServer(makeProject(), async (base) => {
    const s = await (await fetch(base + '/api/schema')).json();
    assert.deepEqual(s.tables, []);
  });
});
