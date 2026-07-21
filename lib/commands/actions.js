'use strict';

/**
 * CLI commands: patch, errors, run, audit, integrity, init, hookUpdate
 */

const fs = require('node:fs');
const path = require('node:path');
const { openDb, updateFile } = require('../indexer');
const { findRoot, isGlobalInstall, copyDir, countFiles } = require('../cli-utils');

function patchCmd(root, args) {
  const { patch } = require('../patch');
  const preview = args.includes('--preview');
  args = args.filter(a => a !== '--preview');

  function runPatch(file, anchor, insertion, mode, opts) {
    const filePath = path.isAbsolute(file) ? file : path.join(root, file);
    const r = patch(filePath, anchor, insertion || '', mode || 'after', { preview, root, occurrence: opts && opts.occurrence, line: opts && opts.line });
    if (r.ok) {
      process.stdout.write('OK  ' + file + '  ' + r.message + '\n');
      if (r.backup) process.stdout.write('backup: ' + r.backup + '\n');
      if (r.diff) {
        process.stdout.write('--- diff ---\n');
        process.stdout.write(r.diff + '\n');
        process.stdout.write('--- context ---\n');
        process.stdout.write(r.context + '\n');
      }
    } else {
      process.stderr.write('FAIL  ' + file + '  ' + r.message + '\n');
      if (r.context) {
        process.stderr.write('--- context ---\n');
        process.stderr.write(r.context + '\n');
      }
      if (r.suggestion) process.stderr.write('hint: ' + r.suggestion + '\n');
      process.exit(1);
    }
  }

  if (!args.length) {
    let data = '';
    try { data = fs.readFileSync(0, 'utf8'); } catch {
      process.stderr.write('no args and no stdin - nothing to do\n'); process.exit(1);
    }
    data = data.trim();
    if (!data) { process.stderr.write('empty stdin\n'); process.exit(1); }
    args = [data];
  }

  const input = args.join(' ').trim();

  if (input.startsWith('{') || input.startsWith('[')) {
    try {
      const parsed = JSON.parse(input);
      const patches = Array.isArray(parsed) ? parsed : [parsed];
      for (const p of patches) runPatch(p.file, p.anchor, p.insertion, p.mode, { occurrence: p.occurrence, line: p.line });
    } catch (e) {
      process.stderr.write('invalid JSON: ' + e.message + '\n'); process.exit(1);
    }
    return;
  }

  if (input.includes('|')) {
    const lines = input.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 3) { process.stderr.write('bad patch line: ' + line + '\n'); process.exit(1); }
      const insertion = parts.slice(3).join('|');
      runPatch(parts[0], parts[2], insertion, parts[1]);
    }
    return;
  }

  if (args.length >= 3) {
    const file = args[0];
    const mode = args[1];
    const anchor = args[2];
    const insertIdx = args.indexOf('--insert');
    let insertion = '';
    if (insertIdx >= 0 && args[insertIdx + 1]) insertion = args[insertIdx + 1];
    runPatch(file, anchor, insertion, mode);
    return;
  }

  process.stderr.write('usage: lex patch <file> <mode> <anchor> [--insert "text"] [--preview]\n');
  process.stderr.write('   or: echo "file|mode|anchor|insertion" | lex patch [--preview]\n');
  process.stderr.write('   or: lex patch \'{"file":...,"anchor":...,"insertion":...,"mode":...}\'\n');
  process.stderr.write('modes: after, before, replace, replace-line\n');
  process.stderr.write('features: auto-anchor, fuzzy match, diff output, context on failure\n');
  process.exit(1);
}

function errorsCmd(root) {
  return new Promise((resolve) => {
    let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
    try {
      const info = JSON.parse(fs.readFileSync(path.join(root, '.lex', 'server.json'), 'utf8'));
      if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
    } catch {}
    const http = require('node:http');
    let idx = 0;
    const tryNext = () => {
      if (idx >= ports.length) {
        process.stdout.write('no lex server running - start one with: lex serve or lex watch\n');
        resolve(); return;
      }
      const port = ports[idx++];
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/cli?cmd=ping&arg=', timeout: 200 }, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          try {
            const ping = JSON.parse(body);
            if (ping.output === 'pong') {
              let done = 0;
              const checkDone = () => { if (++done >= 2) resolve(); };
              const req2 = http.get({ hostname: '127.0.0.1', port, path: '/api/console-errors', timeout: 2000 }, (res2) => {
                let b2 = '';
                res2.on('data', (d) => b2 += d);
                res2.on('end', () => {
                  try {
                    const errors = JSON.parse(b2);
                    if (errors.length) {
                      process.stdout.write('console errors (' + errors.length + '):\n');
                      for (const e of errors) process.stdout.write('  [' + (e.type || 'error') + '] ' + (e.message || '') + '\n');
                    } else {
                      process.stdout.write('no console errors captured\n');
                    }
                  } catch { process.stdout.write('failed to parse console error response\n'); }
                  checkDone();
                });
              });
              req2.on('error', () => checkDone());
              req2.on('timeout', () => { req2.destroy(); checkDone(); });
              const req3 = http.get({ hostname: '127.0.0.1', port, path: '/api/app-errors', timeout: 2000 }, (res3) => {
                let b3 = '';
                res3.on('data', (d) => b3 += d);
                res3.on('end', () => {
                  try {
                    const errors = JSON.parse(b3);
                    if (errors.length) {
                      process.stdout.write('app errors (' + errors.length + '):\n');
                      for (const e of errors) {
                        process.stdout.write(`  [${e.type || 'app-error'}] ${e.message || ''}${e.command ? ' (cmd: ' + e.command + ')' : ''}${e.exitCode !== undefined ? ' exit: ' + e.exitCode : ''}\n`);
                      }
                    } else {
                      process.stdout.write('no app errors captured\n');
                    }
                  } catch {
                    process.stdout.write('failed to parse app error response\n');
                  }
                  checkDone();
                });
              });
              req3.on('error', () => { checkDone(); });
              req3.on('timeout', () => { req3.destroy(); checkDone(); });
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

function runCmd(root, args) {
  const { spawn } = require('child_process');
  const http = require('node:http');
  const command = args.join(' ');
  process.stdout.write('lex run: ' + command + '\n');
  const child = spawn(command, { shell: true, cwd: root, stdio: ['inherit', 'pipe', 'pipe'] });
  let stderrBuf = '';
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => { stderrBuf += d.toString(); process.stderr.write(d); });
  function sendErrors(errors) {
    let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
    try {
      const info = JSON.parse(fs.readFileSync(path.join(root, '.lex', 'server.json'), 'utf8'));
      if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
    } catch {}
    for (const port of ports) {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/app-errors', method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 500 }, (res) => { res.resume(); });
      req.on('error', () => {});
      req.on('timeout', () => req.destroy());
      req.write(JSON.stringify({ errors }));
      req.end();
      break;
    }
  }
  child.on('close', (code) => {
    const appErrors = [];
    for (const line of stderrBuf.split('\n')) {
      if (!line.trim()) continue;
      if (/\b(error|exception|fatal|failed|panic|traceback)\b/i.test(line)) {
        appErrors.push({ type: 'app-error', message: line.trim().substring(0, 500), command, exitCode: code });
      }
    }
    if (appErrors.length) sendErrors(appErrors);
    process.stdout.write('\nlex run: exited with code ' + code + (appErrors.length ? ' (' + appErrors.length + ' errors captured)' : '') + '\n');
  });
}

async function auditCmd(root, args) {
  const { runAudit, formatAuditResult } = require('../browser-audit');
  const { detectUrls } = require('../url-detect');
  const explicitUrls = args.filter(a => a.startsWith('http'));
  const waitArg = args.find(a => a.startsWith('--wait='));
  const waitMs = waitArg ? parseInt(waitArg.split('=')[1], 10) : 3000;
  const jsonOut = args.includes('--json');
  const noCrawl = args.includes('--no-crawl');
  const integrityFlag = args.includes('--integrity');
  const depthArg = args.find(a => a.startsWith('--depth='));
  const maxDepth = depthArg ? parseInt(depthArg.split('=')[1], 10) : undefined;
  const pagesArg = args.find(a => a.startsWith('--max-pages='));
  const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1], 10) : undefined;

  if (integrityFlag) {
    const { runIntegrityCheck, formatIntegrityResult } = require('../integrity-check');
    const fileArgs = args.filter(a => !a.startsWith('--') && !a.startsWith('http'));
    let targets = fileArgs.length ? fileArgs : [];
    if (!targets.length) {
      try { targets = fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => path.join(root, f)); } catch {}
    }
    if (!targets.length) { process.stderr.write('no HTML files found. Usage: lex audit --integrity [file.html ...]\n'); process.exit(1); }
    const allResults = [];
    for (const target of targets) {
      try {
        const result = runIntegrityCheck(target, { root });
        allResults.push(result);
        if (jsonOut) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        else process.stdout.write(formatIntegrityResult(result) + '\n');
      } catch (e) { process.stderr.write('integrity check failed for ' + target + ': ' + e.message + '\n'); }
    }
    const hasCritical = allResults.some(r => r.summary.critical > 0);
    if (hasCritical) process.exit(1);
    return;
  }

  let urls = explicitUrls;
  if (!urls.length) {
    process.stderr.write('detecting dev server URLs...\n');
    urls = await detectUrls(root);
  }
  if (!urls.length) {
    process.stderr.write('no live dev server found. Start your dev server or pass URLs explicitly:\n');
    process.stderr.write('  lex audit http://localhost:3000 http://localhost:5173\n');
    process.stderr.write('  lex audit --integrity index.html  (static integrity check)\n');
    process.exit(1);
  }
  process.stderr.write('auditing: ' + urls.join(', ') + (noCrawl ? ' (no crawl)' : ' (crawling)') + '\n');
  const result = await runAudit(urls, { waitMs, root, crawl: !noCrawl, maxDepth, maxPages });
  if (jsonOut) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(formatAuditResult(result) + '\n');
  if (!result.ok) process.exit(1);
}

function integrityCmd(root, args) {
  const { runIntegrityCheck, formatIntegrityResult } = require('../integrity-check');
  const jsonOut = args.includes('--json');
  const fileArgs = args.filter(a => !a.startsWith('--'));
  let targets = fileArgs.length ? fileArgs : [];
  if (!targets.length) {
    try { targets = fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => path.join(root, f)); } catch {}
  }
  if (!targets.length) { process.stderr.write('no HTML files found. Usage: lex integrity [file.html ...]\n'); process.exit(1); }
  const allResults = [];
  for (const target of targets) {
    try {
      const result = runIntegrityCheck(target, { root });
      allResults.push(result);
      if (jsonOut) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else process.stdout.write(formatIntegrityResult(result) + '\n');
    } catch (e) { process.stderr.write('integrity check failed for ' + target + ': ' + e.message + '\n'); }
  }
  const hasCritical = allResults.some(r => r.summary.critical > 0);
  if (hasCritical) process.exit(1);
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
  const pluginRoot = path.join(__dirname, '..', '..');
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
  const needed = ['.lex/index.db*', '.lex/live.json', '.lex/token-ledger.json', '.lex/trash/', '.lex/snapshots/', '.lex/in/', '.lex/out/', '.lex/server.json', '.lex/audit.json', '.env', '.env.*', '!.env.example', '!.env.template'];
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

  const pluginDirs = ['skills', 'hooks', 'lib', 'bin', 'templates'];
  const present = pluginDirs.filter(d => fs.existsSync(path.join(dir, d)));
  if (present.length >= 3) {
    const ignorePath = path.join(lex, 'ignore');
    let ignore = '';
    try { ignore = fs.readFileSync(ignorePath, 'utf8'); } catch {}
    let ignoreChanged = false;
    for (const d of present) {
      const line = d + '/';
      if (!ignore.split('\n').some(l => l.trim() === line)) {
        ignore += (ignore.endsWith('\n') || ignore === '' ? '' : '\n') + line + '\n';
        ignoreChanged = true;
      }
    }
    if (ignoreChanged) {
      fs.writeFileSync(ignorePath, ignore);
      created.push('.lex/ignore (excludes plugin dirs from index)');
    }
  }

  copyIfMissing(path.join(templates, 'agent.json'), path.join(lex, 'agent.json'), '.lex/agent.json');
  copyIfMissing(path.join(pluginRoot, 'AGENTS.md'), path.join(lex, 'AGENTS.md'), '.lex/AGENTS.md');
  copyIfMissing(path.join(pluginRoot, 'CLAUDE.md'), path.join(lex, 'CLAUDE.md'), '.lex/CLAUDE.md');
  copyIfMissing(path.join(pluginRoot, 'GEMINI.md'), path.join(lex, 'GEMINI.md'), '.lex/GEMINI.md');
  copyIfMissing(path.join(pluginRoot, 'ANTIGRAVITY.md'), path.join(lex, 'ANTIGRAVITY.md'), '.lex/ANTIGRAVITY.md');

  const skillsSrc = path.join(pluginRoot, 'skills');
  const skillsDest = path.join(lex, 'skills');
  if (fs.existsSync(skillsSrc) && !fs.existsSync(skillsDest)) {
    copyDir(skillsSrc, skillsDest);
    created.push('.lex/skills/ (' + countFiles(skillsDest) + ' files)');
  }

  const gitDir = path.join(dir, '.git');
  if (fs.existsSync(gitDir)) {
    const hooksDir = path.join(gitDir, 'hooks');
    try { fs.mkdirSync(hooksDir, { recursive: true }); } catch {}
    const preCommit = path.join(hooksDir, 'pre-commit');
    const lexBin = path.join(pluginRoot, 'bin', 'lex.js').replace(/\\/g, '/');
    const hookContent = '#!/usr/bin/env bash\nset -euo pipefail\nLEX_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"\nif [ -d "$LEX_ROOT/.lex" ] && command -v node >/dev/null 2>&1; then\n  LEX_BIN="$(find "$LEX_ROOT" -maxdepth 3 -path "*/bin/lex.js" -not -path "*/.lex/*" 2>/dev/null | head -1)"\n  if [ -z "$LEX_BIN" ] && command -v lex >/dev/null 2>&1; then\n    LEX_BIN="$(node -e "try{process.stdout.write(require.resolve(\'@atul-labs/lex/bin/lex.js\'))}catch{process.stdout.write(\'\')}")"\n  fi\n  if [ -z "$LEX_BIN" ]; then\n    LEX_BIN="' + lexBin + '"\n  fi\n  if [ -n "$LEX_BIN" ] && [ -f "$LEX_BIN" ]; then\n    node "$LEX_BIN" guard "$LEX_ROOT" 2>&1\n    GUARD_EXIT=$?\n    if [ $GUARD_EXIT -ne 0 ]; then\n      echo "lex guard: CRITICAL violations found - commit blocked"\n      echo "Run: node \\"$LEX_BIN\\" guard for details"\n      exit 1\n    fi\n  fi\nfi\nexit 0\n';
    let existing = '';
    try { existing = fs.readFileSync(preCommit, 'utf8'); } catch {}
    if (!existing.includes('lex guard')) {
      fs.writeFileSync(preCommit, hookContent, { mode: 0o755 });
      created.push('.git/hooks/pre-commit (runs lex guard)');
    }
  }

  if (created.length) process.stdout.write('created: ' + created.join(', ') + '\n');
  if (skipped.length) process.stdout.write('already present (untouched): ' + skipped.join(', ') + '\n');
  if (missing.length) process.stderr.write('warning: plugin templates missing (reinstall lex?): ' + missing.join(', ') + '\n');
  const lexCmd = isGlobalInstall(pluginRoot) ? 'lex' : ('node ' + pluginRoot + '/bin/lex.js');
  process.stdout.write('next: run "' + lexCmd + ' serve" for the live viewer\n');
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

function findTrackedFiles(root) {
  try {
    const db = openDb(root);
    const rows = db.prepare('SELECT DISTINCT path FROM files WHERE path NOT LIKE ? ORDER BY path LIMIT 50').all('node_modules/%');
    db.close();
    if (rows.length) return rows.map(r => r.path);
  } catch {}
  try {
    const { execSync } = require('child_process');
    const out = execSync('git ls-files', { cwd: root, encoding: 'utf8' });
    return out.split('\n').filter(f => f.trim() && /\.(js|ts|py|go|rs|php|rb|java|c|cpp|h|md|json|yaml|yml|sh|vue|jsx|tsx)$/.test(f)).slice(0, 50);
  } catch {}
  return [];
}

function synthCmd(root, args) {
  const { synthesize } = require('../memory-synthesis');
  const { writeEpisode } = require('../memory');
  const force = args.includes('--force');
  const dateArg = args.find(a => a.startsWith('--date='));
  const date = dateArg ? dateArg.split('=')[1] : undefined;
  const dryRun = args.includes('--dry-run');

  const synth = synthesize(root, { date });

  if (synth.empty && !force) {
    process.stdout.write('no activity found for ' + synth.date + ' - use --force to write anyway\n');
    return;
  }

  process.stdout.write('## Synthesized session\n');
  process.stdout.write(`title: ${synth.title}\n`);
  process.stdout.write(`date: ${synth.date}\n`);
  process.stdout.write(`agent: ${synth.agent}\n`);
  process.stdout.write(`platform: ${synth.platform}\n`);
  process.stdout.write(`summary: ${synth.summary}\n`);
  process.stdout.write(`files: ${synth.files.length} modified\n`);
  for (const f of synth.files) process.stdout.write(`  - ${f}\n`);
  process.stdout.write(`bugs: ${synth.bugs.length} new\n`);
  for (const b of synth.bugs) process.stdout.write(`  - ${b}\n`);
  process.stdout.write(`learnings: ${synth.learnings.length}\n`);
  for (const l of synth.learnings) process.stdout.write(`  - ${l}\n`);
  process.stdout.write(`next steps: ${synth.nextSteps.length}\n`);
  for (const s of synth.nextSteps) process.stdout.write(`  - ${s}\n`);

  if (dryRun) {
    process.stdout.write('\n(dry run - no episode written)\n');
    return;
  }

  const filename = writeEpisode(root, {
    title: synth.title,
    summary: synth.summary,
    agent: synth.agent,
    platform: synth.platform,
    files: synth.files,
    decisions: synth.decisions,
    bugs: synth.bugs,
    learnings: synth.learnings,
    nextSteps: synth.nextSteps,
  });

  process.stdout.write('\nepisode written: .lex/sessions/' + filename + '\n');
}

module.exports = { patchCmd, errorsCmd, runCmd, auditCmd, integrityCmd, initCmd, hookUpdate, findTrackedFiles, synthCmd };
