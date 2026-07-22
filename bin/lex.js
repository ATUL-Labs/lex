#!/usr/bin/env node
'use strict';
process.removeAllListeners('warning');
const fs = require('node:fs');
const path = require('node:path');
const { openDb, refresh, updateFile, shouldRefresh } = require('../lib/indexer');
const { tryServer, serveWithPortFallback, findRoot } = require('../lib/cli-utils');
const metaCmds = require('../lib/commands/meta');
const searchCmds = require('../lib/commands/search');
const actionCmds = require('../lib/commands/actions');

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === '--version' || cmd === '-v') {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    process.stdout.write('lex v' + pkg.version + '\n');
    return;
  }

  if (cmd === 'hook-update') return actionCmds.hookUpdate();

  if (cmd === 'docs') {
    if (args[0] === 'distill') {
      const distillArgs = args.slice(1);
      if (!distillArgs.length) {
        process.stderr.write('usage: lex docs:distill <npm:package | composer:vendor/package | url:https...>\n');
        process.exit(1);
      }
      const { execSync } = require('child_process');
      try {
        execSync(`node "${path.join(__dirname, '..', 'lib', 'distill.js')}" ${distillArgs.map(a => '"' + a + '"').join(' ')}`, {
          cwd: process.cwd(), stdio: 'inherit', timeout: 30000,
        });
      } catch (e) {
        process.stderr.write('distill failed: ' + e.message + '\n');
        process.exit(1);
      }
      return;
    }
    return searchCmds.docsCmd(args);
  }

  if (cmd === 'init') {
    const migrateMod = require('../lib/migrate');
    const oldFolder = migrateMod.detectOldFolder(args[0] || process.cwd());
    if (oldFolder) {
      process.stdout.write('Found old ' + oldFolder.name + '/ folder — running migration...\n\n');
      const report = migrateMod.migrate(args[0] || process.cwd(), { pluginRoot: path.join(__dirname, '..') });
      process.stdout.write(migrateMod.formatReport(report) + '\n');
      if (report.errors.length) process.exit(1);
      process.stdout.write('\n');
    }
    return actionCmds.initCmd(args[0] || process.cwd());
  }
  if (cmd === 'migrate') {
    const migrateMod = require('../lib/migrate');
    const root = findRoot(process.cwd()) || process.cwd();
    const keepOld = args.includes('--keep-old');
    const report = migrateMod.migrate(root, { pluginRoot: path.join(__dirname, '..'), keepOld });
    process.stdout.write(migrateMod.formatReport(report) + '\n');
    if (report.errors.length) process.exit(1);
    return;
  }
  if (cmd === 'guard') return metaCmds.guardCmd(findRoot(process.cwd()) || process.cwd());

  if (cmd === 'config') {
    const root = findRoot(process.cwd()) || process.cwd();
    const projectConfig = require('../lib/project-config');
    if (args.includes('--detect')) {
      const detected = projectConfig.detectAll(root);
      const existing = projectConfig.loadConfig(root);
      const merged = projectConfig.mergeConfig(existing, detected);
      merged.detected_at = new Date().toISOString();
      merged.detected_by = 'lex-auto';
      projectConfig.saveConfig(root, merged);
      process.stdout.write('config.json updated with detected values\n');
      process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
    } else if (args.includes('--set') && args[1] && args[2]) {
      const config = projectConfig.loadConfig(root) || {};
      const key = args[1];
      let value = args[2];
      try { value = JSON.parse(value); } catch {}
      const parts = key.split('.');
      let obj = config;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      projectConfig.saveConfig(root, config);
      process.stdout.write('set ' + key + ' = ' + JSON.stringify(value) + '\n');
    } else {
      const config = projectConfig.loadConfig(root);
      if (!config) {
        process.stderr.write('no config.json found - run "lex init" or "lex config --detect"\n');
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(config, null, 2) + '\n');
    }
    return;
  }

  if (cmd === 'skills') {
    const root = findRoot(process.cwd()) || process.cwd();
    if (args[0] === 'evolve') {
      const { evolve } = require('../lib/skill-evolve');
      const result = evolve(root);
      if (result.created.length) {
        process.stdout.write('Auto-generated skills:\n');
        for (const s of result.created) process.stdout.write('  ' + s + '\n');
      } else {
        process.stdout.write('No new skills generated.\n');
      }
      if (result.enhanced.length) {
        process.stdout.write('Enhanced existing skills:\n');
        for (const s of result.enhanced) process.stdout.write('  ' + s + '\n');
      }
      if (result.errors.length) {
        process.stderr.write('Errors:\n');
        for (const e of result.errors) process.stderr.write('  ' + e + '\n');
      }
    } else if (args[0] === 'review') {
      const skillsDir = path.join(root, '.lex', 'skills');
      if (!fs.existsSync(skillsDir)) { process.stdout.write('No auto-generated skills found.\n'); return; }
      const skills = fs.readdirSync(skillsDir).filter(d => fs.statSync(path.join(skillsDir, d)).isDirectory());
      for (const s of skills) {
        const skillPath = path.join(skillsDir, s, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;
        const content = fs.readFileSync(skillPath, 'utf8');
        const isAuto = content.includes('auto-generated: true');
        process.stdout.write((isAuto ? '[auto] ' : '[user] ') + s + '\n');
        if (isAuto && args.includes('--approve')) {
          const updated = content.replace(/auto-generated: true/, 'auto-generated: false\napproved: true');
          fs.writeFileSync(skillPath, updated);
          process.stdout.write('  -> approved\n');
        }
      }
    } else {
      process.stderr.write('usage: lex skills <evolve|review [--approve]>\n');
      process.exit(1);
    }
    return;
  }

  if (cmd === 'update' && !args[0]) {
    process.stdout.write('updating lex...\n');
    const { execSync } = require('child_process');
    try {
      execSync('npm install -g @atul-labs/lex@latest --force', { stdio: 'inherit' });
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      process.stdout.write('lex updated to v' + pkg.version + '\n');
    } catch (e) {
      process.stderr.write('update failed: ' + e.message + '\n');
      process.exit(1);
    }
    return;
  }

  const root = findRoot(process.cwd());
  if (!root) { process.stderr.write('no .lex folder found - initialize lex first\n'); process.exit(1); }

  if (cmd === 'run' && args.length) { actionCmds.runCmd(root, args); return; }

  if (cmd === 'watch') {
    const port = parseInt(args[0], 10) || 4747;
    process.stdout.write(`lex watch: server + file watcher on port ${port} (Ctrl+C to stop)\n`);
    serveWithPortFallback(require('../lib/serve').createServer(root, { watch: true }), port, port + 8, root);
    return;
  }

  if (cmd === 'search' && args.length) { await searchCmds.searchCmd(root, args); return; }
  if (cmd === 'symbols' && args[0]) { await searchCmds.symbolsCmd(root, args); return; }

  const db = openDb(root);

  if (cmd === 'refresh') {
    const r = refresh(db, root);
    process.stdout.write(`indexed ${r.indexed}, removed ${r.removed}\n`);
  } else if (cmd === 'links' && args[0]) {
    if (shouldRefresh(db)) refresh(db, root);
    searchCmds.linksCmd(db, root, args);
  } else if (cmd === 'update' && args[0]) {
    updateFile(db, root, path.relative(root, path.resolve(root, args[0])));
  } else if (cmd === 'status') {
    refresh(db, root);
    metaCmds.statusCmd(root, db);
  } else if (cmd === 'diff') {
    metaCmds.diffCmd(root, db);
  } else if (cmd === 'refs' && args[0]) {
    if (shouldRefresh(db)) refresh(db, root);
    searchCmds.refsCmd(db, root, args[0]);
  } else if (cmd === 'check') {
    metaCmds.checkCmd(root, db);
  } else if (cmd === 'tokens') {
    metaCmds.tokensCmd(root);
  } else if (cmd === 'recent') {
    metaCmds.recentCmd(root, args[0] ? parseInt(args[0], 10) : 20);
  } else if (cmd === 'decay') {
    metaCmds.decayCmd(root, args);
  } else if (cmd === 'assoc') {
    metaCmds.assocCmd(root, args);
  } else if (cmd === 'promote') {
    metaCmds.promoteCmd(root, args);
  } else if (cmd === 'capture') {
    metaCmds.captureCmd(root, args);
  } else if (cmd === 'grep' && args[0]) {
    await searchCmds.grepCmd(root, db, args[0], args[1] || null);
  } else if (cmd === 'errors') {
    await actionCmds.errorsCmd(root);
  } else if (cmd === 'note' && args.length) {
    searchCmds.noteCmd(root, args);
  } else if (cmd === 'memory' && args.length) {
    searchCmds.memoryCmd(db, root, args);
  } else if (cmd === 'recall') {
    searchCmds.recallCmd(root, args);
  } else if (cmd === 'episode') {
    searchCmds.episodeCmd(root, args);
  } else if (cmd === 'proactive') {
    searchCmds.proactiveCmd(root, args);
  } else if (cmd === 'synth') {
    actionCmds.synthCmd(root, args);
  } else if (cmd === 'patch') {
    actionCmds.patchCmd(root, args);
  } else if (cmd === 'ls') {
    const fileops = require('../lib/fileops');
    const r = fileops.ls(root, args[0] || '');
    for (const d of r.dirs) process.stdout.write(d + '/\n');
    for (const f of r.files) process.stdout.write(f + '\n');
    if (!r.dirs.length && !r.files.length) process.stdout.write('(empty)\n');
  } else if (cmd === 'read' && args[0]) {
    const fileops = require('../lib/fileops');
    const range = args[1] ? args[1].split('-').map(Number) : [null, null];
    const r = fileops.read(root, args[0], range[0], range[1]);
    if (!r) { process.stderr.write('file not found: ' + args[0] + '\n'); process.exit(1); }
    process.stdout.write(r.content + '\n');
    if (r.shown < r.totalLines) process.stderr.write(`(${r.shown}/${r.totalLines} lines, ${r.start}-${r.end})\n`);
  } else if (cmd === 'write' && args[0]) {
    const fileops = require('../lib/fileops');
    let content = '';
    if (!process.stdin.isTTY) {
      const chunks = [];
      const data = fs.readFileSync(0, 'utf8');
      content = data;
    } else {
      process.stderr.write('reading from stdin - type content, Ctrl+D to finish\n');
      content = fs.readFileSync(0, 'utf8');
    }
    const r = fileops.write(root, args[0], content);
    process.stdout.write(`wrote ${args[0]} (${r.bytes} bytes, ${r.lines} lines)\n`);
  } else if (cmd === 'rm' && args[0]) {
    const fileops = require('../lib/fileops');
    const force = args.includes('--force');
    const target = args.filter(a => a !== '--force')[0];
    const r = fileops.rm(root, target, { force });
    if (!r.ok) { process.stderr.write(r.message + ': ' + target + '\n'); process.exit(1); }
    process.stdout.write(r.message + '\n');
  } else if (cmd === 'mv' && args[0] && args[1]) {
    const fileops = require('../lib/fileops');
    const r = fileops.mv(root, args[0], args[1]);
    if (!r.ok) { process.stderr.write(r.message + '\n'); process.exit(1); }
    process.stdout.write(`moved ${r.from} -> ${r.to}` + (r.backup ? ` (backup: ${r.backup})` : '') + '\n');
  } else if (cmd === 'stat' && args[0]) {
    const fileops = require('../lib/fileops');
    const r = fileops.stat(root, args[0]);
    if (!r) { process.stderr.write('not found: ' + args[0] + '\n'); process.exit(1); }
    process.stdout.write(`path:  ${r.path}\n`);
    process.stdout.write(`size:  ${r.size} bytes (${r.sizeKB} KB)\n`);
    process.stdout.write(`type:  ${r.isDir ? 'directory' : 'file'}\n`);
    process.stdout.write(`mtime: ${r.mtime}\n`);
    if (r.ext) process.stdout.write(`ext:   ${r.ext}\n`);
  } else if (cmd === 'undo') {
    const trashDir = path.join(root, '.lex', 'trash');
    if (!fs.existsSync(trashDir)) { process.stderr.write('no backups found\n'); process.exit(1); }
    const backups = fs.readdirSync(trashDir)
      .filter(f => !f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(trashDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!backups.length) { process.stderr.write('no backups found\n'); process.exit(1); }
    if (args[0] === '--list') {
      for (const b of backups.slice(0, 10)) {
        const origRel = b.name.replace(/^\d+_/, '').replace(/__/g, '/');
        process.stdout.write(`${b.name} -> ${origRel}\n`);
      }
      return;
    }
    const latest = backups[0];
    const origRel = latest.name.replace(/^\d+_/, '').replace(/__/g, '/');
    const origPath = path.join(root, origRel);
    fs.copyFileSync(path.join(trashDir, latest.name), origPath);
    fs.unlinkSync(path.join(trashDir, latest.name));
    process.stdout.write(`restored ${origRel} from .lex/trash/${latest.name}\n`);
  } else if (cmd === 'snapshot') {
    const snapDir = path.join(root, '.lex', 'snapshots');
    const action = args[0] || 'save';
    if (action === 'save') {
      const ts = Date.now();
      const dir = path.join(snapDir, String(ts));
      fs.mkdirSync(dir, { recursive: true });
      const files = args.slice(1).length ? args.slice(1) : actionCmds.findTrackedFiles(root);
      let saved = 0;
      for (const f of files) {
        const full = path.isAbsolute(f) ? f : path.join(root, f);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const rel = path.relative(root, full).replace(/\\/g, '/');
          const dest = path.join(dir, rel.replace(/\//g, '__'));
          fs.copyFileSync(full, dest);
          saved++;
        }
      }
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ts, files: files.map(f => path.relative(root, path.isAbsolute(f) ? f : path.join(root, f)).replace(/\\/g, '/')) }));
      process.stdout.write(`snapshot saved: ${saved} files -> .lex/snapshots/${ts}\n`);
    } else if (action === 'restore') {
      const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
      if (!snaps.length) { process.stderr.write('no snapshots found\n'); process.exit(1); }
      const snapId = args[1] || snaps[0];
      const dir = path.join(snapDir, snapId);
      if (!fs.existsSync(dir)) { process.stderr.write('snapshot not found: ' + snapId + '\n'); process.exit(1); }
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      let restored = 0;
      for (const f of manifest.files) {
        const src = path.join(dir, f.replace(/\//g, '__'));
        const dst = path.join(root, f);
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
          restored++;
        }
      }
      process.stdout.write(`restored ${restored} files from snapshot ${snapId}\n`);
    } else if (action === 'list') {
      const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
      if (!snaps.length) { process.stdout.write('(no snapshots)\n'); return; }
      for (const s of snaps.slice(0, 10)) {
        const manifestPath = path.join(snapDir, s, 'manifest.json');
        let count = '?';
        try { count = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files.length; } catch {}
        process.stdout.write(`${s} (${count} files)\n`);
      }
    } else {
      process.stderr.write('usage: lex snapshot [save|restore|list] [files...]\n');
      process.exit(1);
    }
  } else if (cmd === 'audit') {
    await actionCmds.auditCmd(root, args);
  } else if (cmd === 'integrity') {
    actionCmds.integrityCmd(root, args);
  } else if (cmd === 'convert' && args[0]) {
    const { convertImage } = require('../lib/image-convert');
    const input = args[0];
    const output = args[1];
    if (!output) {
      process.stderr.write('usage: lex convert <input.svg|input.png> <output.png|webp|ico> [--width=1200] [--height=630] [--size=32] [--multi] [--scale=2]\n');
      process.exit(1);
    }
    const opts = {};
    const wArg = args.find(a => a.startsWith('--width='));
    if (wArg) opts.width = parseInt(wArg.split('=')[1], 10);
    const hArg = args.find(a => a.startsWith('--height='));
    if (hArg) opts.height = parseInt(hArg.split('=')[1], 10);
    const sArg = args.find(a => a.startsWith('--size='));
    if (sArg) opts.size = parseInt(sArg.split('=')[1], 10);
    const scaleArg = args.find(a => a.startsWith('--scale='));
    if (scaleArg) opts.scale = parseInt(scaleArg.split('=')[1], 10);
    if (args.includes('--multi')) opts.multi = true;
    const result = await convertImage(input, output, opts);
    if (result.ok) {
      process.stdout.write(`Converted ${input} -> ${output} (${result.size || result.dimensions || ''} bytes)\n`);
      if (result.dimensions) process.stdout.write(`Dimensions: ${result.dimensions}, Format: ${result.format}, Browser: ${result.browser}\n`);
      if (result.sizes) process.stdout.write(`ICO sizes: ${result.sizes.join(', ')}\n`);
    } else {
      process.stderr.write('Error: ' + result.error + '\n');
      process.exit(1);
    }
  } else if (cmd === 'test' && args[0]) {
    const { sendRequest, runXssTests } = require('../lib/api-tester');
    let url = args[0];
    if (!url.startsWith('http')) {
      const { detectAppUrl, detectBaseUrl } = require('../lib/dev-loop');
      const baseUrl = detectAppUrl(root) || detectBaseUrl(root);
      url = baseUrl + (url.startsWith('/') ? url : '/' + url);
    }
    const method = (args[1] || 'GET').toUpperCase();
    if (args.includes('--xss')) {
      const result = await runXssTests(url, method, args.find(a => a.startsWith('--param='))?.split('=')[1] || 'q');
      process.stdout.write(result.summary + '\n');
      for (const v of result.vulnerabilities) {
        process.stdout.write('  VULN: ' + v.payload + '\n');
        for (const f of v.findings) process.stdout.write('    ' + f.message + '\n');
      }
    } else {
      const result = await sendRequest({ url, method, scan: true });
      process.stdout.write(`${result.status} ${result.statusText || ''} (${result.responseTime}ms)\n`);
      if (result.findings && result.findings.length) {
        process.stdout.write(`Security findings (${result.findings.length}):\n`);
        for (const f of result.findings) process.stdout.write(`  [${f.severity}] ${f.type}: ${f.message}\n`);
      } else if (result.findings) {
        process.stdout.write('Security findings: none\n');
      }
      process.stdout.write(`\n${result.body.substring(0, 2000)}\n`);
    }
  } else if (cmd === 'devloop') {
    const { runDevLoop, formatReport, resolveAppUrl, detectAppUrl, detectBaseUrl } = require('../lib/dev-loop');
    const fileFilter = args.find(a => !a.startsWith('-') && a !== '--diff');
    const opts = {};
    if (fileFilter) opts.file = fileFilter;
    if (args.includes('--diff')) opts.diff = true;
    const cookieArg = args.find(a => a.startsWith('--cookie='));
    if (cookieArg) opts.authCookie = cookieArg.split('=')[1];
    const tokenArg = args.find(a => a.startsWith('--token='));
    if (tokenArg) opts.authToken = tokenArg.split('=')[1];
    const resolvedUrl = await resolveAppUrl(root);
    opts.baseUrl = resolvedUrl || detectAppUrl(root) || detectBaseUrl(root);
    const report = await runDevLoop(db, root, opts);
    process.stdout.write(formatReport(report) + '\n');
    if (report.errors.length) process.exit(1);
  } else if (cmd === 'serve') {
    const port = parseInt(args[0], 10) || 4747;
    serveWithPortFallback(require('../lib/serve').createServer(root), port, port + 8, root);
    return;
  } else {
    process.stderr.write('usage: lex <init|config|skills|guard|check|tokens|status|diff|refs|refresh|search|symbols|links|docs|grep|recent|errors|note|memory|recall|episode|proactive|synth|decay|assoc|promote|capture|audit|test|devloop|convert|patch|ls|read|write|rm|mv|stat|undo|snapshot|run|update|watch|serve|hook-update>\n');
    process.exit(1);
  }
}

main();
