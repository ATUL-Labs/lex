#!/usr/bin/env node
'use strict';
process.removeAllListeners('warning');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openDb, openDbAt, refresh, refreshDocs, updateFile, ftsRows } = require('../lib/indexer');
const { normalizeUrl } = require('../lib/extract');

function serveWithPortFallback(server, port, maxPort) {
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
  });
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

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    let content = '';
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { re, name } of SECRET_PATTERNS) {
        if (re.test(line)) {
          findings.push({ severity: 'CRITICAL', file: rel, line: i + 1, rule: name, snippet: line.trim().substring(0, 80) });
        }
      }
      for (const { re, name } of INLINE_SECRET_PATTERNS) {
        if (re.test(line)) {
          const isEnv = rel.endsWith('.env') || rel.endsWith('.env.example') || rel.endsWith('.env.template');
          if (!isEnv) {
            findings.push({ severity: 'CRITICAL', file: rel, line: i + 1, rule: name, snippet: line.trim().substring(0, 80) });
          }
        }
      }
      for (const { re, name } of DB_ANTI_PATTERNS) {
        if (re.test(line)) {
          findings.push({ severity: 'IMPORTANT', file: rel, line: i + 1, rule: name, snippet: line.trim().substring(0, 80) });
        }
      }
    }
  }

  if (!findings.length) {
    process.stdout.write('lex guard: no violations found - codebase is clean\n');
    return;
  }

  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const important = findings.filter(f => f.severity === 'IMPORTANT');

  if (critical.length) {
    process.stdout.write(`\nCRITICAL (${critical.length}) - secrets exposed in code:\n`);
    for (const f of critical) {
      process.stdout.write(`  ${f.file}:${f.line} - ${f.rule}\n    ${f.snippet}\n`);
    }
  }

  if (important.length) {
    process.stdout.write(`\nIMPORTANT (${important.length}) - database anti-patterns:\n`);
    for (const f of important) {
      process.stdout.write(`  ${f.file}:${f.line} - ${f.rule}\n    ${f.snippet}\n`);
    }
  }

  process.stdout.write(`\nlex guard: ${findings.length} violation(s) found\n`);
  if (critical.length) process.exit(1);
}

function docsCmd(args) {
  const docsDir = process.env.LEX_DOCS_DIR || path.join(os.homedir(), '.lex', 'docs');
  const dbFile = process.env.LEX_DOCS_DB || path.join(os.homedir(), '.lex', 'docs.db');
  if (!fs.existsSync(docsDir)) {
    process.stdout.write('no docs cache yet - distilled sheets live in ' + docsDir + '\n');
    return;
  }
  const db = openDbAt(dbFile);
  refreshDocs(db, docsDir);
  if (!args.length) {
    const rows = db.prepare('SELECT path FROM files ORDER BY path LIMIT 40').all();
    for (const r of rows) process.stdout.write(r.path + '\n');
    if (!rows.length) process.stdout.write('cache is empty - no sheets distilled yet\n');
    return;
  }
  const rows = ftsRows(db, args, 10);
  for (const r of rows) process.stdout.write(`${r.path}: ${r.snip.replace(/\s+/g, ' ')}\n`);
  if (!rows.length) process.stdout.write('no matches\n');
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'hook-update') return hookUpdate();
  if (cmd === 'docs') return docsCmd(args);
  if (cmd === 'init') return initCmd(args[0] || process.cwd());
  if (cmd === 'guard') return guardCmd(findRoot(process.cwd()) || process.cwd());
  const root = findRoot(process.cwd());
  if (!root) { process.stderr.write('no .lex folder found - initialize lex first\n'); process.exit(1); }
  const db = openDb(root);
  if (cmd === 'refresh') {
    const r = refresh(db, root);
    process.stdout.write(`indexed ${r.indexed}, removed ${r.removed}\n`);
  } else if (cmd === 'search' && args.length) {
    refresh(db, root);
    const rows = ftsRows(db, args, 10);
    for (const r of rows) process.stdout.write(`${r.path}: ${r.snip.replace(/\s+/g, ' ')}\n`);
    if (!rows.length) process.stdout.write('no matches\n');
  } else if (cmd === 'symbols' && args[0]) {
    refresh(db, root);
    const rel = args[0].split(path.sep).join('/');
    const rows = db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 40').all(rel);
    for (const r of rows) process.stdout.write(`${r.line} ${r.kind} ${r.name}\n`);
    if (!rows.length) process.stdout.write('no symbols indexed for ' + rel + '\n');
  } else if (cmd === 'links' && args[0]) {
    refresh(db, root);
    const arg = args[0].startsWith('/') ? args[0] : '/' + args[0];
    const url = normalizeUrl(arg);
    const rows = db.prepare('SELECT side, method, url, path, line FROM links WHERE url = ? OR url LIKE ? ORDER BY side, path LIMIT 40').all(url, url + '/%');
    for (const r of rows) process.stdout.write(`${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}\n`);
    if (!rows.length) process.stdout.write('no links match ' + url + '\n');
  } else if (cmd === 'update' && args[0]) {
    updateFile(db, root, path.relative(root, path.resolve(root, args[0])));
  } else if (cmd === 'serve') {
    const port = parseInt(args[0], 10) || 4747;
    serveWithPortFallback(require('../lib/serve').createServer(root), port, port + 8);
    return;
  } else {
    process.stderr.write('usage: lex <init [dir]|guard|refresh|search <terms>|symbols <file>|links <url>|docs [terms]|update <file>|serve [port]|hook-update>\n');
    process.exit(1);
  }
}

function detectStack(dir) {
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

  const composer = readJson(path.join(dir, 'composer.json'));
  if (composer) {
    const req = (composer.require || {});
    const reqDev = (composer['require-dev'] || {});
    const all = { ...req, ...reqDev };
    if (all['laravel/framework']) return { language: 'php', framework: 'laravel', overlay: 'php', version: all['laravel/framework'] };
    if (all['symfony/framework-bundle']) return { language: 'php', framework: 'symfony', overlay: 'php' };
    return { language: 'php', framework: '', overlay: 'php' };
  }

  const cargo = readText(path.join(dir, 'Cargo.toml'));
  if (cargo) {
    const m = cargo.match(/^name\s*=\s*"([^"]+)"/m);
    return { language: 'rust', framework: '', overlay: 'rust', package: m ? m[1] : '' };
  }

  const pyproject = readText(path.join(dir, 'pyproject.toml'));
  if (pyproject) {
    if (/fastapi/i.test(pyproject)) return { language: 'python', framework: 'fastapi', overlay: 'python' };
    if (/django/i.test(pyproject)) return { language: 'python', framework: 'django', overlay: 'python' };
    if (/flask/i.test(pyproject)) return { language: 'python', framework: 'flask', overlay: 'python' };
    return { language: 'python', framework: '', overlay: 'python' };
  }

  const reqText = readText(path.join(dir, 'requirements.txt'));
  if (reqText) {
    if (/django/i.test(reqText)) return { language: 'python', framework: 'django', overlay: 'python' };
    if (/fastapi/i.test(reqText)) return { language: 'python', framework: 'fastapi', overlay: 'python' };
    if (/flask/i.test(reqText)) return { language: 'python', framework: 'flask', overlay: 'python' };
    return { language: 'python', framework: '', overlay: 'python' };
  }

  const goMod = readText(path.join(dir, 'go.mod'));
  if (goMod) {
    const m = goMod.match(/^module\s+(\S+)/m);
    return { language: 'go', framework: '', overlay: 'go', module: m ? m[1] : '' };
  }

  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps['next']) return { language: 'typescript', framework: 'nextjs', overlay: 'typescript' };
    if (deps['@angular/core']) return { language: 'typescript', framework: 'angular', overlay: 'typescript' };
    if (deps['vue']) return { language: 'typescript', framework: 'vue', overlay: 'typescript' };
    if (deps['svelte']) return { language: 'typescript', framework: 'svelte', overlay: 'typescript' };
    if (deps['react']) return { language: 'typescript', framework: 'react', overlay: 'typescript' };
    if (deps['express']) return { language: 'typescript', framework: 'express', overlay: 'typescript' };
    if (deps['fastify']) return { language: 'typescript', framework: 'fastify', overlay: 'typescript' };
    return { language: 'typescript', framework: '', overlay: 'typescript' };
  }

  return null;
}

function initCmd(dir) {
  const pluginRoot = path.join(__dirname, '..');
  const templates = path.join(pluginRoot, 'templates');
  const lex = path.join(dir, '.lex');
  const created = [];
  const skipped = [];
  const missing = [];

  fs.mkdirSync(lex, { recursive: true });
  fs.mkdirSync(path.join(lex, 'pages'), { recursive: true });
  const sessionsDir = path.join(lex, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, '.gitkeep'), '');
    created.push('.lex/sessions/');
  }

  const copyIfMissing = (src, dest, label) => {
    if (fs.existsSync(dest)) { skipped.push(label); return; }
    if (!fs.existsSync(src)) { missing.push(label); return; }
    fs.copyFileSync(src, dest);
    created.push(label);
  };

  copyIfMissing(path.join(templates, 'STATUS.md'), path.join(lex, 'status.md'), '.lex/status.md');
  copyIfMissing(path.join(templates, 'INDEX.md'), path.join(lex, 'INDEX.md'), '.lex/INDEX.md');

  let pageFiles = [];
  try { pageFiles = fs.readdirSync(path.join(templates, 'pages')).filter(f => f.endsWith('.md')); } catch {}
  for (const f of pageFiles) {
    copyIfMissing(path.join(templates, 'pages', f), path.join(lex, 'pages', f), '.lex/pages/' + f);
  }

  const stack = detectStack(dir);
  if (stack) {
    const stackPath = path.join(lex, 'pages', 'stack.md');
    let stackContent = '';
    try { stackContent = fs.readFileSync(stackPath, 'utf8'); } catch {}
    if (stackContent) {
      const lines = stackContent.split('\n');
      const updated = lines.map(line => {
        if (line.startsWith('- Language:') || line.startsWith('- Language: ')) return '- Language: ' + stack.language;
        if (line.startsWith('- Framework:') || line.startsWith('- Framework: ')) return '- Framework: ' + (stack.framework || '');
        return line;
      });
      if (!updated.some(l => l.startsWith('- Language:'))) {
        const techIdx = updated.findIndex(l => l.startsWith('## Tech'));
        if (techIdx >= 0) updated.splice(techIdx + 1, 0, '- Language: ' + stack.language, '- Framework: ' + (stack.framework || ''));
      }
      const overlayLine = '\n## Stack Overlay\n- Detected overlay: ' + stack.overlay + '\n- Load skills/<skill>/overlays/' + stack.overlay + '.md alongside each skill SKILL.md\n';
      if (!stackContent.includes('## Stack Overlay')) {
        updated.push('', overlayLine.trim());
      }
      fs.writeFileSync(stackPath, updated.join('\n'));
      created.push('stack.md (detected: ' + stack.language + (stack.framework ? '/' + stack.framework : '') + ')');
    }
  }

  const giPath = path.join(dir, '.gitignore');
  const needed = ['.lex/index.db*', '.lex/live.json', '.env', '.env.*', '!.env.example', '!.env.template'];
  let gi = '';
  try { gi = fs.readFileSync(giPath, 'utf8'); } catch {}
  let giChanged = false;
  for (const line of needed) {
    if (!gi.split('\n').some(l => l.trim() === line)) {
      gi += (gi.endsWith('\n') || gi === '' ? '' : '\n') + line + '\n';
      giChanged = true;
    }
  }
  if (giChanged) { fs.writeFileSync(giPath, gi); created.push('.gitignore entries (incl. .env protection)'); }

  if (created.length) process.stdout.write('created: ' + created.join(', ') + '\n');
  if (skipped.length) process.stdout.write('already present (untouched): ' + skipped.join(', ') + '\n');
  if (missing.length) process.stderr.write('warning: plugin templates missing (reinstall lex?): ' + missing.join(', ') + '\n');
  process.stdout.write('next: run "node ' + pluginRoot + '/bin/lex.js serve" for the live viewer\n');
}

function hookUpdate() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch {}
  try {
    const input = JSON.parse(raw);
    const file = input.tool_input && input.tool_input.file_path;
    const tool = input.tool_name || 'edit';
    if (file) {
      const root = findRoot(path.dirname(file)) || findRoot(process.cwd());
      if (root) {
        const rel = path.relative(root, file);
        if (rel && !rel.startsWith('..')) {
          updateFile(openDb(root), root, rel);
          try {
            const relPosix = rel.split(path.sep).join('/');
            fs.writeFileSync(path.join(root, '.lex', 'live.json'), JSON.stringify({ file: relPosix, tool, ts: Date.now() }));
          } catch (e) { process.stderr.write('lex hook: live.json write failed: ' + e.message + '\n'); }
        }
      }
    }
  } catch (e) { process.stderr.write('lex hook: index update failed: ' + e.message + '\n'); }
  process.stdout.write('{}\n');
}

main();
