#!/usr/bin/env node
'use strict';

/**
 * Standalone file watcher for platforms without PostToolUse hooks (Windsurf, Cursor, Copilot).
 * Watches the project for file changes and auto-indexes them into the Lex SQLite index.
 *
 * Usage:
 *   node hooks/standalone-watcher.js [project-root]
 *
 * If no root is given, uses current working directory.
 * Runs until Ctrl+C.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2] || process.cwd();
const lexDir = path.join(root, '.lex');

if (!fs.existsSync(lexDir)) {
  process.stderr.write('No .lex directory found in ' + root + '. Run: lex init\n');
  process.exit(1);
}

let indexer;
try {
  indexer = require('../lib/indexer');
} catch (e) {
  process.stderr.write('Failed to load indexer: ' + e.message + '\n');
  process.exit(1);
}

const { openDb, updateFile } = indexer;
const { isTextFile } = require('../lib/extract');
const db = openDb(root);

const DEBOUNCE_MS = 500;
const pending = new Map();
let timer = null;

function flush() {
  timer = null;
  let count = 0;
  for (const [rel] of pending) {
    try {
      updateFile(db, root, rel);
      count++;
    } catch {}
  }
  if (count > 0) {
    process.stdout.write('[' + new Date().toISOString().slice(11, 19) + '] indexed ' + count + ' file(s)\n');
  }
  pending.clear();
}

function schedule(rel) {
  pending.set(rel, true);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

// Also write live.json for activity tracking
function writeLive(rel) {
  try {
    fs.writeFileSync(path.join(lexDir, 'live.json'), JSON.stringify({ file: rel, tool: 'watcher', ts: Date.now() }));
  } catch {}
}

let watcher;
try {
  watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const rel = String(filename).replace(/\\/g, '/');
    if (rel.startsWith('.lex/')) return;
    if (rel.startsWith('node_modules/')) return;
    if (rel.startsWith('.git/')) return;
    if (!isTextFile(rel)) return;
    schedule(rel);
    writeLive(rel);
  });
} catch (e) {
  process.stderr.write('Failed to start watcher: ' + e.message + '\n');
  process.exit(1);
}

process.stdout.write('Lex standalone watcher running on: ' + root + '\n');
process.stdout.write('Watching for file changes (recursive). Ctrl+C to stop.\n');

// Also process gateway requests from .lex/in/ (same as server but without HTTP)
const inDir = path.join(lexDir, 'in');
const outDir = path.join(lexDir, 'out');
fs.mkdirSync(inDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

function processGatewayFile(file) {
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
    const gateway = require('../lib/gateway');
    result = gateway.processRequest(root, request);
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  try { fs.writeFileSync(path.join(outDir, file), JSON.stringify(result)); } catch {}
  try { fs.unlinkSync(fullPath); } catch {}
}

// Process existing pending gateway files
try {
  for (const f of fs.readdirSync(inDir)) {
    if (f.endsWith('.json')) processGatewayFile(f);
  }
} catch {}

// Watch for new gateway files
let gwWatcher;
try {
  gwWatcher = fs.watch(inDir, (eventType, filename) => {
    if (filename && filename.endsWith('.json')) {
      processGatewayFile(filename);
    }
  });
} catch {}

// Process pending tasks
const taskDir = path.join(lexDir, 'tasks');
fs.mkdirSync(taskDir, { recursive: true });

function processPendingTasks() {
  let files;
  try { files = fs.readdirSync(taskDir); } catch { return; }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const tPath = path.join(taskDir, f);
    let task;
    try { task = JSON.parse(fs.readFileSync(tPath, 'utf8')); } catch { continue; }
    if (task.status !== 'pending') continue;
    task.status = 'running';
    task.startedAt = Date.now();
    try { fs.writeFileSync(tPath, JSON.stringify(task, null, 2)); } catch {}
    try {
      const gateway = require('../lib/gateway');
      const result = gateway.processRequest(root, task.request || { cmd: task.cmd, args: task.args || [] });
      task.status = result.ok ? 'done' : 'failed';
      task.result = result;
      task.completed = Date.now();
    } catch (e) {
      task.status = 'error';
      task.error = e.message;
      task.completed = Date.now();
    }
    try { fs.writeFileSync(tPath, JSON.stringify(task, null, 2)); } catch {}
  }
}

processPendingTasks();
const taskPoll = setInterval(processPendingTasks, 5000);

// Cleanup
const cleanup = () => {
  if (watcher) watcher.close();
  if (gwWatcher) gwWatcher.close();
  if (taskPoll) clearInterval(taskPoll);
  if (timer) clearTimeout(timer);
  try { db.close(); } catch {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
