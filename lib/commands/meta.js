'use strict';

/**
 * CLI commands: guard, check, status, diff, tokens, recent
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAgentConfig } = require('../indexer');
const tokensLib = require('../tokens');
const { pingServer } = require('../cli-utils');

const SECRET_PATTERNS = [
  { re: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API key' },
  { re: /pk_[a-zA-Z0-9]{20,}/, name: 'Stripe public key' },
  { re: /sk_[a-zA-Z0-9]{20,}/, name: 'Stripe secret key' },
  { re: /AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
  { re: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub personal access token' },
  { re: /gho_[a-zA-Z0-9]{36}/, name: 'GitHub OAuth token' },
  { re: /xox[baprs]-[a-zA-Z0-9-]+/, name: 'Slack token' },
  { re: /AIza[0-9A-Za-z\-_]{35}/, name: 'Google API key' },
  { re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, name: 'JWT token' },
  { re: /postgres:\/\/[^:\s]+:[^@\s]+@/, name: 'Postgres connection string with credentials' },
  { re: /mysql:\/\/[^:\s]+:[^@\s]+@/, name: 'MySQL connection string with credentials' },
  { re: /mongodb(\+srv)?:\/\/[^:\s]+:[^@\s]+@/, name: 'MongoDB connection string with credentials' },
  { re: /redis:\/\/[^:\s]+:[^@\s]+@/, name: 'Redis connection string with credentials' },
];

const INLINE_SECRET_PATTERNS = [
  { re: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{4,}['"]/i, name: 'Hardcoded password' },
  { re: /(?:api_key|apikey|api-key)\s*[:=]\s*['"][^'"\s]{10,}['"]/i, name: 'Hardcoded API key' },
  { re: /(?:secret|token)\s*[:=]\s*['"][^'"\s]{10,}['"]/i, name: 'Hardcoded secret/token' },
  { re: /(?:private_key|privatekey)\s*[:=]\s*['"][^'"\s]{20,}['"]/i, name: 'Hardcoded private key' },
];

const DB_ANTI_PATTERNS = [
  { re: /create_table\s+['"](\w+_profiles?)['"]|Schema::create\s*\(\s*['"](\w+_profiles?)['"]/, name: '1-to-1 profile table - merge into parent table instead' },
  { re: /create_table\s+['"](\w+_settings?)['"]|Schema::create\s*\(\s*['"](\w+_settings?)['"]/, name: 'Settings table - use a JSON column on the parent table instead' },
  { re: /['"](?:key|name|attribute)['"]\s*,\s*['"](?:value|val)['"]/, name: 'EAV pattern detected - use JSON/JSONB column instead' },
];

const SCAN_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.cs', '.vue', '.svelte', '.json', '.yml', '.yaml', '.env', '.sh', '.bash', '.ps1', '.sql', '.toml', '.cfg', '.conf', '.ini', '.xml']);
const SCAN_SKIP = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', 'storage', '.lex', '.superpowers', '__pycache__', '.next', '.nuxt', 'target', 'deps', '_build']);

function walkFiles(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SCAN_SKIP.has(e.name) && !e.name.startsWith('.')) walkFiles(path.join(dir, e.name), out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (SCAN_EXTS.has(ext) || e.name === '.env' || e.name.startsWith('.env.')) {
        out.push(path.join(dir, e.name));
      }
    }
  }
}

function guardCmd(root) {
  const findings = [];
  const files = [];
  walkFiles(root, files);
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    if (rel.startsWith('.lex/') || rel.startsWith('node_modules/')) continue;
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(lines[i])) findings.push(`[CRITICAL] ${rel}:${i + 1} - ${p.name}`);
      }
      for (const p of INLINE_SECRET_PATTERNS) {
        if (p.re.test(lines[i])) findings.push(`[IMPORTANT] ${rel}:${i + 1} - ${p.name}`);
      }
      for (const p of DB_ANTI_PATTERNS) {
        if (p.re.test(lines[i])) findings.push(`[IMPORTANT] ${rel}:${i + 1} - ${p.name}`);
      }
    }
  }
  if (!findings.length) {
    process.stdout.write('lex guard: no violations found - codebase is clean\n');
    return;
  }
  for (const f of findings) process.stdout.write(f + '\n');
  const critical = findings.filter(f => f.includes('[CRITICAL]'));
  if (critical.length) process.exit(1);
}

function statusCmd(root, db) {
  const lex = path.join(root, '.lex');
  const status = (() => { try { return fs.readFileSync(path.join(lex, 'status.md'), 'utf8'); } catch { return null; } })();
  const wip = (() => { try { return fs.readFileSync(path.join(lex, 'wip.md'), 'utf8'); } catch { return null; } })();
  const fileCount = db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c;
  const symCount = db.prepare('SELECT COUNT(*) c FROM symbols').get().c;
  const linkCount = db.prepare('SELECT COUNT(*) c FROM links').get().c;
  const project = path.basename(root);
  process.stdout.write(`project: ${project}\n`);
  process.stdout.write(`files: ${fileCount} indexed, ${symCount} symbols, ${linkCount} links\n`);
  process.stdout.write(`wip: ${wip ? 'yes' : 'no'}\n`);
  if (status) {
    const phaseLine = status.split('\n').find(l => l.toLowerCase().startsWith('## phase') || l.toLowerCase().startsWith('phase:'));
    if (phaseLine) process.stdout.write(`phase: ${phaseLine.replace(/^#+\s*/, '').replace(/^phase:\s*/i, '')}\n`);
  }
  const sessionsDir = path.join(lex, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const sessions = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.md')).sort().reverse();
    if (sessions.length) process.stdout.write(`last session: ${sessions[0].replace('.md', '')}\n`);
  }
  try {
    const memdb = require('../memory-db');
    const stats = memdb.getStats(root);
    process.stdout.write(`memory: ${stats.total} entries, ${stats.links} links\n`);
    const typeParts = Object.entries(stats.byType).map(([t, c]) => `${t}: ${c}`);
    if (typeParts.length) process.stdout.write(`  by type: ${typeParts.join(', ')}\n`);
  } catch {}
}

function diffCmd(root, db) {
  const { walk } = require('../indexer');
  const indexedFiles = db.prepare('SELECT path, mtime_ms, size FROM files').all();
  const indexedMap = new Map();
  for (const f of indexedFiles) indexedMap.set(f.path, f);
  const onDisk = new Set();
  const diskFiles = walk(root);
  const modified = [];
  const added = [];
  const deleted = [];
  for (const rel of diskFiles) {
    onDisk.add(rel);
    let st;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
    const row = indexedMap.get(rel);
    if (!row) added.push(rel);
    else if (row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) modified.push(rel);
  }
  for (const f of indexedFiles) {
    if (!onDisk.has(f.path) && !f.path.startsWith('.lex/')) deleted.push(f.path);
  }
  if (!modified.length && !added.length && !deleted.length) {
    process.stdout.write('no changes - index is in sync\n');
    return;
  }
  for (const f of modified) process.stdout.write(`M  ${f}\n`);
  for (const f of added) process.stdout.write(`A  ${f}\n`);
  for (const f of deleted) process.stdout.write(`D  ${f}\n`);
  process.stdout.write(`${modified.length}M ${added.length}A ${deleted.length}D\n`);
}

function tokensCmd(root) {
  const s = tokensLib.summarize(root);
  process.stdout.write('session token estimate\n');
  process.stdout.write('=======================\n');
  process.stdout.write(`started: ${s.started}\n`);
  process.stdout.write(`entries: ${s.entries}\n\n`);
  process.stdout.write('SENT (input to LLM):\n');
  for (const [cat, val] of Object.entries(s.sent || {})) {
    process.stdout.write(`  ${cat}: ${val}\n`);
  }
  process.stdout.write(`  ----\n  input subtotal:   ~${s.sentTotal || 0} tokens\n\n`);
  process.stdout.write('RECEIVED (agent output):\n');
  for (const [cat, val] of Object.entries(s.received || {})) {
    process.stdout.write(`  ${cat}: ${val}\n`);
  }
  process.stdout.write(`  ----\n  output subtotal:  ~${s.receivedTotal || 0} tokens\n\n`);
  process.stdout.write(`TOTAL tracked:     ~${s.total || 0} tokens (${Math.round((s.total || 0) / 4)} KB)\n`);
  process.stdout.write('\nnote: estimates use ~4 chars/token. Actual API tokens may differ.\n');
  process.stdout.write('untracked: user messages, agent text responses, system prompt.\n');
}

function recentCmd(root, limit) {
  const auditPath = path.join(root, '.lex', 'audit.log');
  let lines = [];
  try { lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n'); } catch {}
  if (!lines.length || !lines[0]) { process.stdout.write('no recent activity\n'); return; }
  const seen = new Set();
  const results = [];
  for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
    const parts = lines[i].split('|').map(s => s.trim());
    if (parts.length < 5) continue;
    const file = parts[4];
    if (seen.has(file)) continue;
    seen.add(file);
    results.push(`${parts[0]}  ${parts[3].padEnd(8)} ${file}`);
  }
  for (const r of results) process.stdout.write(r + '\n');
}

function checkCmd(root, db) {
  const config = loadAgentConfig(root);
  const failures = [];
  const warnings = [];
  const fixed = [];
  const lex = path.join(root, '.lex');

  const { refresh, updateFile, walk } = require('../indexer');

  const indexedFiles = db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c;
  if (indexedFiles === 0) {
    try {
      refresh(db, root);
      fixed.push('indexed ' + db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c + ' files (was empty)');
    } catch (e) {
      warnings.push('index empty, refresh failed: ' + e.message);
    }
  } else {
    const diskFiles = walk(root);
    const indexedMap = new Map();
    for (const f of db.prepare('SELECT path, mtime_ms, size FROM files').all()) indexedMap.set(f.path, f);
    let stale = 0;
    const staleFiles = [];
    for (const rel of diskFiles) {
      let st;
      try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
      const row = indexedMap.get(rel);
      if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) { stale++; staleFiles.push(rel); }
    }
    if (stale > 0 && stale <= 50) {
      for (const rel of staleFiles) { try { updateFile(db, root, rel); } catch {} }
      fixed.push('reindexed ' + stale + ' stale file(s)');
    } else if (stale > 50) {
      try { refresh(db, root); fixed.push('full refresh (' + stale + ' stale files)'); } catch (e) { warnings.push(stale + ' files stale, refresh failed: ' + e.message); }
    }
    const onDisk = new Set(diskFiles);
    let deletedCount = 0;
    for (const f of db.prepare('SELECT path FROM files').all()) {
      if (!onDisk.has(f.path) && !f.path.startsWith('.lex/')) { try { updateFile(db, root, f.path); } catch {} deletedCount++; }
    }
    if (deletedCount > 0) fixed.push('cleaned ' + deletedCount + ' deleted file(s)');
  }

  if (config.require_wip && !fs.existsSync(path.join(lex, 'wip.md'))) {
    failures.push('no .lex/wip.md - create one before starting work');
  }
  if (!fs.existsSync(path.join(lex, 'status.md'))) {
    warnings.push('no .lex/status.md - project state unknown');
  }

  let serverRunning = false;
  let serverPort = null;
  let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
  try {
    const info = JSON.parse(fs.readFileSync(path.join(lex, 'server.json'), 'utf8'));
    if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
  } catch {}
  for (const port of ports) {
    if (pingServer(port)) { serverRunning = true; serverPort = port; break; }
  }

  if (!serverRunning) {
    try {
      const { execFileSync } = require('child_process');
      const nodeBin = process.execPath;
      const lexJs = path.join(__dirname, '..', '..', 'bin', 'lex.js');
      execFileSync(nodeBin, [lexJs, 'serve'], { detached: true, stdio: 'ignore', shell: false });
      const { execFileSync: execSync } = require('child_process');
      const delayScript = 'setTimeout(()=>{},1500)';
      execFileSync(nodeBin, ['-e', delayScript], { shell: false, timeout: 3000 });
      for (const port of ports) {
        if (pingServer(port)) { serverRunning = true; serverPort = port; fixed.push('started lex server on port ' + port); break; }
      }
    } catch (e) {
      warnings.push('failed to auto-start server: ' + e.message);
    }
  }

  if (fixed.length) {
    for (const f of fixed) process.stdout.write('FIXED: ' + f + '\n');
  }
  if (failures.length) {
    for (const f of failures) process.stdout.write('FAIL: ' + f + '\n');
  }
  if (warnings.length) {
    for (const w of warnings) process.stdout.write('WARN: ' + w + '\n');
  }

  if (!failures.length && !warnings.length) {
    process.stdout.write('OK: all checks passed - ready to work\n');
  }
  if (fixed.length) {
    process.stdout.write('  (auto-fixed ' + fixed.length + ' issue(s))\n');
  }
  if (serverRunning) {
    process.stdout.write('server: running on port ' + serverPort + '\n');
  } else {
    process.stdout.write('server: not running\n');
  }

  if (failures.length) process.exit(1);
}

function decayCmd(root, args) {
  const { decayCmd: decay } = require('../memory-decay');
  decay(root, args);
}

function assocCmd(root, args) {
  const { linksCmd } = require('../memory-links');
  linksCmd(root, args);
}

function promoteCmd(root, args) {
  const { promoteCmd: promote } = require('../memory-promotion');
  promote(root, args);
}

function captureCmd(root, args) {
  const { captureCmd: capture } = require('../memory-capture');
  capture(root, args);
}

module.exports = { guardCmd, statusCmd, diffCmd, tokensCmd, recentCmd, checkCmd, walkFiles, decayCmd, assocCmd, promoteCmd, captureCmd };
