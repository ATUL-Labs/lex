'use strict';

/**
 * CLI utility functions shared across command modules
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

function tryServer(cmd, arg, expectedRoot) {
  return new Promise((resolve) => {
    let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
    try {
      const info = JSON.parse(fs.readFileSync(path.join(expectedRoot, '.lex', 'server.json'), 'utf8'));
      if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
    } catch {}
    let idx = 0;
    const tryNext = () => {
      if (idx >= ports.length) { resolve(null); return; }
      const port = ports[idx++];
      const req = http.get({
        hostname: '127.0.0.1', port,
        path: '/api/cli?cmd=ping&arg=',
        timeout: 100,
      }, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          try {
            const ping = JSON.parse(body);
            if (ping.output === 'pong' && ping.root && expectedRoot &&
                path.resolve(ping.root) === path.resolve(expectedRoot)) {
              const req2 = http.get({
                hostname: '127.0.0.1', port,
                path: '/api/cli?cmd=' + encodeURIComponent(cmd) + '&arg=' + encodeURIComponent(arg),
                timeout: 500,
              }, (res2) => {
                let body2 = '';
                res2.on('data', (d) => body2 += d);
                res2.on('end', () => {
                  try {
                    const json = JSON.parse(body2);
                    if (json.output !== undefined) resolve(json.output);
                    else resolve(null);
                  } catch { resolve(null); }
                });
              });
              req2.on('error', () => resolve(null));
              req2.on('timeout', () => { req2.destroy(); resolve(null); });
            } else { tryNext(); }
          } catch { tryNext(); }
        });
      });
      req.on('error', () => tryNext());
      req.on('timeout', () => { req.destroy(); tryNext(); });
    };
    tryNext();
  });
}

function serveWithPortFallback(server, port, maxPort, root) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < maxPort) {
      port += 1;
      server.listen(port, '127.0.0.1');
    } else {
      process.stderr.write('lex serve: ' + err.message + '\n');
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write('lex viewer: http://127.0.0.1:' + port + '\n');
    if (root) {
      try { fs.writeFileSync(path.join(root, '.lex', 'server.json'), JSON.stringify({ port, root, pid: process.pid, started: Date.now() })); } catch {}
    }
  });
  const cleanup = () => {
    if (root) { try { fs.unlinkSync(path.join(root, '.lex', 'server.json')); } catch {} }
    server.close();
    if (server._watcher) server._watcher.close();
    if (server._gwWatcher) server._gwWatcher.close();
    if (server._taskProc) { if (server._taskProc.watcher) server._taskProc.watcher.close(); if (server._taskProc.timer) clearInterval(server._taskProc.timer); }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function findRoot(from) {
  let dir = from;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.lex'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function isGlobalInstall(pluginRoot) {
  const normalized = pluginRoot.replace(/\\/g, '/').toLowerCase();
  return normalized.includes('/node_modules/@atul-labs/lex') ||
         normalized.includes('/appdata/roaming/npm/node_modules/@atul-labs/lex') ||
         normalized.includes('/usr/local/lib/node_modules/@atul-labs/lex') ||
         normalized.includes('/usr/lib/node_modules/@atul-labs/lex');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countFiles(p);
    else n++;
  }
  return n;
}

function pingServer(port) {
  try {
    const { execFileSync } = require('child_process');
    const nodeBin = process.execPath;
    const script = `const http=require('http');const r=http.get({hostname:'127.0.0.1',port:${port},path:'/api/cli?cmd=ping&arg=',timeout:300},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>{try{const j=JSON.parse(b);process.stdout.write(j.output||'')}catch{}})});r.on('error',()=>{});r.on('timeout',()=>r.destroy())`;
    const out = execFileSync(nodeBin, ['-e', script], { encoding: 'utf8', timeout: 2000, shell: false });
    return out === 'pong';
  } catch { return false; }
}

module.exports = { tryServer, serveWithPortFallback, findRoot, isGlobalInstall, copyDir, countFiles, pingServer };
