'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const { createServer } = require('../lib/serve');
const { shouldSkipFile } = require('../lib/skip');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexapi-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export function greet(name) { return name }\n');
  fs.writeFileSync(path.join(root, '.lex', 'status.md'), 'phase: testing API\n');
  fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
    '## 1. SQLite binding error',
    '- when: 2025-01-15',
    '- what: DatabaseSync could not bind null values',
    '- fix: Use empty strings instead of null',
  ].join('\n'));
  fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Always validate input\n- what: check all inputs\n');
  fs.writeFileSync(path.join(root, '.lex', 'sessions', '2025-01-15.md'), '# Session: API test\n## Summary\nTested API endpoints\n');
  fs.writeFileSync(path.join(root, '.lex', 'audit.log'), '2025-01-15 10:00 | claude | claude | edit | src/app.js\n');
  return root;
}

let server, root, baseUrl;

async function setup() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexapi-'));
  fs.mkdirSync(path.join(root, '.lex', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, '.lex', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export function greet(name) { return name }\n');
  fs.writeFileSync(path.join(root, '.lex', 'status.md'), 'phase: testing API\n');
  fs.writeFileSync(path.join(root, '.lex', 'pages', 'mistakes.md'), [
    '## 1. SQLite binding error',
    '- when: 2025-01-15',
    '- what: DatabaseSync could not bind null values',
    '- fix: Use empty strings instead of null',
  ].join('\n'));
  fs.writeFileSync(path.join(root, '.lex', 'pages', 'rules.md'), '## Always validate input\n- what: check all inputs\n');
  fs.writeFileSync(path.join(root, '.lex', 'sessions', '2025-01-15.md'), '# Session: API test\n## Summary\nTested API endpoints\n');
  fs.writeFileSync(path.join(root, '.lex', 'audit.log'), '2025-01-15 10:00 | claude | claude | edit | src/app.js\n');
  server = createServer(root, {});
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
}

function teardown() {
  if (server) {
    if (server._gwWatcher) try { server._gwWatcher.close(); } catch {}
    if (server._taskProc) {
      try { server._taskProc.watcher.close(); } catch {}
      try { clearInterval(server._taskProc.timer); } catch {}
    }
    if (server._watcher) try { server._watcher.close(); } catch {}
    try { server._db.close(); } catch {}
    try { server.close(); } catch {}
    server = null;
  }
  if (root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(baseUrl + urlPath, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    }).on('error', reject);
  });
}

function post(urlPath, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const url = new URL(baseUrl + urlPath);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

before(setup);
after(teardown);

test('GET / serves viewer.html', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.ok(res.body.includes('<html') || res.body.includes('<!doctype'));
});

test('GET /public/css/viewer.css serves CSS', async () => {
  const res = await get('/public/css/viewer.css');
  assert.equal(res.status, 200);
  assert.ok(res.body.includes('--accent'));
  assert.equal(res.headers['content-type'], 'text/css; charset=utf-8');
});

test('GET /public/js/utils.js serves JS', async () => {
  const res = await get('/public/js/utils.js');
  assert.equal(res.status, 200);
  assert.ok(res.body.includes('function qs'));
  assert.equal(res.headers['content-type'], 'application/javascript; charset=utf-8');
});

test('GET /public/ with path traversal returns 403 or 404', async () => {
  const res = await get('/public/../lib/serve.js');
  assert.ok(res.status === 403 || res.status === 404);
});

test('shouldSkipFile skips data dumps', () => {
  assert.ok(shouldSkipFile('rag-contexts/data.json', 50000), 'rag dir skipped');
  assert.ok(shouldSkipFile('embeddings/vectors.json', 50000), 'embeddings dir skipped');
  assert.ok(shouldSkipFile('embeddings/data.bin', 50000), 'embeddings dir skipped');
  assert.ok(shouldSkipFile('large.json', 200 * 1024), 'large JSON skipped');
  assert.ok(shouldSkipFile('app.js.map', 100), 'source map skipped');
  assert.ok(shouldSkipFile('package.lock', 100), 'lock file skipped');
  assert.ok(!shouldSkipFile('src/app.js', 500), 'code file not skipped');
  assert.ok(!shouldSkipFile('config.json', 500), 'small JSON not skipped');
  assert.ok(!shouldSkipFile('schema.sql', 5000), 'SQL file not skipped');
  assert.ok(!shouldSkipFile('database/migrations/users.sql', 5000), 'database dir not skipped');
  assert.ok(!shouldSkipFile('data-migration/transform.js', 500), 'data-migration dir not skipped');
});

test('GET /api/overview returns project metadata', async () => {
  const res = await get('/api/overview');
  assert.equal(res.status, 200);
  assert.ok(res.json.project);
  assert.ok(res.json.status);
  assert.ok(res.json.index);
  assert.ok(typeof res.json.index.files === 'number');
});

test('GET /api/overview includes audit log entries', async () => {
  const res = await get('/api/overview');
  assert.ok(res.json.audit.length >= 1);
  assert.ok(res.json.audit[0].includes('src/app.js'));
});

test('GET /api/search with query returns results', async () => {
  const res = await get('/api/search?q=greet');
  assert.equal(res.status, 200);
  assert.ok(res.json.rows.length >= 1);
  assert.ok(res.json.rows[0].path.includes('app.js'));
});

test('GET /api/search with empty query returns empty rows', async () => {
  const res = await get('/api/search?q=');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.rows, []);
});

test('GET /api/page returns page content', async () => {
  const res = await get('/api/page?name=mistakes.md');
  assert.equal(res.status, 200);
  assert.ok(res.json.text.includes('SQLite binding'));
});

test('GET /api/page with bad name returns 400', async () => {
  const res = await get('/api/page?name=../etc/passwd');
  assert.equal(res.status, 400);
});

test('GET /api/page with missing file returns 404', async () => {
  const res = await get('/api/page?name=nonexistent.md');
  assert.equal(res.status, 404);
});

test('GET /api/memory returns memory search results', async () => {
  const res = await get('/api/memory?q=SQLite');
  assert.equal(res.status, 200);
  assert.ok(res.json.rows.length >= 1);
});

test('GET /api/memory with empty query returns empty rows', async () => {
  const res = await get('/api/memory?q=');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.rows, []);
});

test('GET /api/memory-stats returns stats', async () => {
  const res = await get('/api/memory-stats');
  assert.equal(res.status, 200);
  assert.ok(typeof res.json.total === 'number');
  assert.ok(typeof res.json.links === 'number');
  assert.ok(res.json.byType);
});

test('GET /api/proactive without file returns context and memories', async () => {
  const res = await get('/api/proactive');
  assert.equal(res.status, 200);
  assert.ok(res.json.context);
  assert.ok(typeof res.json.memories === 'number');
});

test('GET /api/proactive with file param returns context with file', async () => {
  const res = await get('/api/proactive?file=src/app.js');
  assert.equal(res.status, 200);
  assert.ok(res.json.context.files.includes('src/app.js'));
});

test('GET /api/links returns link rows', async () => {
  const res = await get('/api/links');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.rows));
});

test('GET /api/file returns file content for indexed file', async () => {
  const res = await get('/api/file?path=src/app.js');
  assert.equal(res.status, 200);
  assert.ok(res.json.text.includes('greet'));
});

test('GET /api/file with unindexed path returns 404', async () => {
  const res = await get('/api/file?path=nonexistent.js');
  assert.equal(res.status, 404);
});

test('GET /api/mcps returns MCP suggestions array', async () => {
  const res = await get('/api/mcps');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.rows));
});

test('GET /api/ls returns directory listing', async () => {
  const res = await get('/api/ls?dir=');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.dirs));
  assert.ok(Array.isArray(res.json.files));
  assert.ok(res.json.dirs.includes('src') || res.json.files.includes('app.js'));
});

test('GET /api/symbols returns symbols for a file', async () => {
  const res = await get('/api/symbols?path=src/app.js');
  assert.equal(res.status, 200);
  assert.ok(res.json.rows.length >= 1);
  assert.ok(res.json.rows.some(r => r.name === 'greet'));
});

test('GET /api/activity returns activity data', async () => {
  const res = await get('/api/activity');
  assert.equal(res.status, 200);
  assert.ok(typeof res.json === 'object');
});

test('GET /api/schema returns schema tables', async () => {
  const res = await get('/api/schema');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.tables));
});

test('GET /api/session returns session content', async () => {
  const res = await get('/api/session?name=2025-01-15.md');
  assert.equal(res.status, 200);
  assert.ok(res.json.text.includes('API test'));
});

test('GET /api/session with bad name returns 400', async () => {
  const res = await get('/api/session?name=../../../etc/passwd');
  assert.equal(res.status, 400);
});

test('GET /api/session with missing file returns 404', async () => {
  const res = await get('/api/session?name=nonexistent.md');
  assert.equal(res.status, 404);
});

test('GET /api/error-capture.js returns JavaScript', async () => {
  const res = await get('/api/error-capture.js');
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('javascript'));
  assert.ok(res.body.includes('console.error'));
});

test('GET /api/console-errors returns errors array', async () => {
  const res = await get('/api/console-errors');
  assert.equal(res.status, 200);
  assert.ok(res.json.errors !== undefined);
});

test('POST /api/console-errors adds errors', async () => {
  const res = await post('/api/console-errors', {
    errors: [{ type: 'console.error', message: 'test error', url: 'http://localhost', ts: Date.now() }]
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
  assert.equal(res.json.count, 1);
});

test('POST /api/console-errors with single message', async () => {
  const res = await post('/api/console-errors', { message: 'single error' });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
});

test('POST /api/console-errors with bad body returns 400', async () => {
  const res = await post('/api/console-errors', {});
  assert.equal(res.status, 400);
});

test('POST /api/console-errors/clear clears errors', async () => {
  await post('/api/console-errors', { message: 'test' });
  const res = await post('/api/console-errors/clear', {});
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
});

test('GET /api/app-errors returns errors array', async () => {
  const res = await get('/api/app-errors');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.errors));
});

test('POST /api/app-errors adds errors', async () => {
  const res = await post('/api/app-errors', {
    errors: [{ message: 'app error', stack: 'Error: test' }]
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
  assert.equal(res.json.count, 1);
});

test('POST /api/app-errors/clear clears errors', async () => {
  await post('/api/app-errors', { message: 'test' });
  const res = await post('/api/app-errors/clear', {});
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
});

test('POST /api/gateway processes a search command', async () => {
  const res = await post('/api/gateway', { cmd: 'search', args: ['greet'] });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
});

test('POST /api/gateway processes a memory command', async () => {
  const res = await post('/api/gateway', { cmd: 'memory', args: ['SQLite'] });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
});

test('POST /api/gateway processes a proactive command', async () => {
  const res = await post('/api/gateway', { cmd: 'proactive', args: [] });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok);
});

test('POST /api/gateway with missing cmd returns 400', async () => {
  const res = await post('/api/gateway', { foo: 'bar' });
  assert.equal(res.status, 400);
});

test('GET /api/cli search returns results', async () => {
  const res = await get('/api/cli?cmd=search&arg=greet');
  assert.equal(res.status, 200);
  assert.ok(res.json.output.includes('app.js'));
});

test('GET /api/cli memory returns memory results', async () => {
  const res = await get('/api/cli?cmd=memory&arg=SQLite');
  assert.equal(res.status, 200);
  assert.ok(res.json.output.length > 0);
});

test('GET /api/cli symbols returns symbols', async () => {
  const res = await get('/api/cli?cmd=symbols&arg=src/app.js');
  assert.equal(res.status, 200);
  assert.ok(res.json.output.includes('greet'));
});

test('GET /api/cli ping returns pong', async () => {
  const res = await get('/api/cli?cmd=ping');
  assert.equal(res.status, 200);
  assert.ok(res.json.output.includes('pong'));
});

test('GET /api/cli with bad cmd returns 400', async () => {
  const res = await get('/api/cli?cmd=badcmd');
  assert.equal(res.status, 400);
});

test('GET /nonexistent returns 404', async () => {
  const res = await get('/api/nonexistent');
  assert.equal(res.status, 404);
});

test('GET /api/schema/data without table returns 400', async () => {
  const res = await get('/api/schema/data');
  assert.equal(res.status, 400);
});

test('Security: non-localhost host header is rejected', async () => {
  const res = await new Promise((resolve) => {
    http.get({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: '/api/overview',
      headers: { Host: 'evil.com' },
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
  });
  assert.equal(res.status, 403);
});

test('POST /api/test sends request and returns response with security scan', async () => {
  const port = server.address().port;
  const res = await post('/api/test', {
    url: `http://127.0.0.1:${port}/api/overview`,
    method: 'GET',
    scan: true,
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.status, 'should have status code');
  assert.ok(res.json.headers, 'should have response headers');
  assert.ok(Array.isArray(res.json.findings), 'should have findings array');
});

test('POST /api/test without url returns 400', async () => {
  const res = await post('/api/test', { method: 'GET' });
  assert.equal(res.status, 400);
  assert.ok(res.json.error);
});

test('POST /api/test/xss runs XSS scan against endpoint', async () => {
  const port = server.address().port;
  const res = await post('/api/test/xss', {
    url: `http://127.0.0.1:${port}/api/search?q=test`,
    method: 'GET',
    param: 'q',
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.summary, 'should have summary');
  assert.ok(typeof res.json.testsRun === 'number', 'should have testsRun count');
});

test('POST /api/test/xss without url returns 400', async () => {
  const res = await post('/api/test/xss', { method: 'GET' });
  assert.equal(res.status, 400);
  assert.ok(res.json.error);
});

test('POST /api/gateway with test command returns response', async () => {
  const port = server.address().port;
  const res = await post('/api/gateway', {
    cmd: 'test',
    args: [{ url: `http://127.0.0.1:${port}/api/overview`, method: 'GET' }],
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok, 'gateway test should succeed');
  assert.ok(res.json.output, 'should have output text');
  assert.ok(res.json.output.includes('200'), 'output should contain status code');
});

test('POST /api/devloop tests all indexed endpoints', async () => {
  const res = await post('/api/devloop', {});
  assert.equal(res.status, 200);
  assert.ok(res.json.ok, 'devloop should succeed');
  assert.ok(typeof res.json.totalTests === 'number', 'should have totalTests');
  assert.ok(typeof res.json.passed === 'number', 'should have passed count');
  assert.ok(typeof res.json.failed === 'number', 'should have failed count');
  assert.ok(res.json.summary, 'should have summary text');
  assert.ok(Array.isArray(res.json.endpoints), 'should have endpoints array');
});

test('POST /api/gateway with devloop command returns report', async () => {
  const res = await post('/api/gateway', { cmd: 'devloop', args: [] });
  assert.equal(res.status, 200);
  assert.ok(res.json.ok, 'gateway devloop should succeed');
  assert.ok(res.json.output, 'should have formatted output');
  assert.ok(res.json.report, 'should have structured report');
  assert.ok(res.json.report.summary, 'report should have summary');
});
