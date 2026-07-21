'use strict';

/**
 * Gateway watcher - processes .lex/in/ request files and writes results to .lex/out/
 * Used by serve.js and standalone-watcher.js
 */

const fs = require('node:fs');
const path = require('node:path');

function startGatewayWatcher(root) {
  const inDir = path.join(root, '.lex', 'in');
  const outDir = path.join(root, '.lex', 'out');
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  function processFile(file) {
    const fullPath = path.join(inDir, file);
    if (!file.endsWith('.json')) return;
    let content;
    try { content = fs.readFileSync(fullPath, 'utf8').trim(); } catch { return; }
    let request;
    if (!content) {
      request = { cmd: path.basename(file, '.json'), args: [] };
    } else if (content.startsWith('{')) {
      try { request = JSON.parse(content); } catch { return; }
    } else {
      const sp = content.split(/\s+/);
      request = { cmd: sp[0], args: sp.slice(1) };
    }
    let result;
    try {
      const gateway = require('./gateway');
      result = gateway.processRequest(root, request);
    } catch (e) {
      result = { ok: false, error: e.message };
    }
    try { fs.writeFileSync(path.join(outDir, file), JSON.stringify(result)); } catch {}
    try { fs.unlinkSync(fullPath); } catch {}
  }

  // Process existing pending files
  try {
    for (const f of fs.readdirSync(inDir)) {
      if (f.endsWith('.json')) processFile(f);
    }
  } catch {}

  // Watch for new files
  let gwWatcher;
  try {
    gwWatcher = fs.watch(inDir, (eventType, filename) => {
      if (filename && filename.endsWith('.json')) {
        processFile(filename);
      }
    });
  } catch {}

  return gwWatcher;
}

module.exports = { startGatewayWatcher };
