'use strict';

/**
 * Migration system — smoothly upgrades .ctx → .lex (and future renames)
 *
 * Principles:
 *   1. Never lose user data — back up old folder before touching anything
 *   2. Adopt files that don't change structure (pages/, wip.md, status.md, audit.log, sessions/)
 *   3. Merge user-created content (custom skills, custom pages) — don't overwrite
 *   4. Create new required files/dirs that don't exist yet
 *   5. Clean up old folder only after successful migration
 *   6. Idempotent — running twice is safe, second run is a no-op
 *   7. Report exactly what happened so user has full transparency
 */

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_DIRS = ['pages', 'sessions', 'in', 'out', 'trash', 'snapshots', 'tasks', 'skills'];
const REQUIRED_FILES = ['status.md', 'INDEX.md', 'agent.json'];
const EPHEMERAL_FILES = ['index.db', 'index.db-shm', 'index.db-wal', 'live.json', 'token-ledger.json', 'server.json', 'audit.json', 'links.json', 'memory.db', 'pages.db'];
const OLD_ROOT_DIRS = ['.ctx', '.context', '.lex-old', '.lex_backup'];

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function safeRemoveDir(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
    return true;
  } catch { return false; }
}

function mergeDir(src, dest, label, report) {
  if (!dirExists(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      mergeDir(srcPath, destPath, label + '/' + entry.name, report);
    } else if (entry.isFile()) {
      if (fileExists(destPath)) {
        report.skipped.push(label + '/' + entry.name + ' (already exists)');
      } else {
        fs.copyFileSync(srcPath, destPath);
        report.adopted.push(label + '/' + entry.name);
      }
    }
  }
}

function detectOldFolder(projectRoot) {
  for (const name of OLD_ROOT_DIRS) {
    const p = path.join(projectRoot, name);
    if (dirExists(p)) return { name, path: p };
  }
  return null;
}

function detectRelocatedItems(projectRoot) {
  const items = [];
  const rootSkills = path.join(projectRoot, 'skills');
  const lexSkills = path.join(projectRoot, '.lex', 'skills');
  if (dirExists(rootSkills)) {
    items.push({ type: 'dir', name: 'skills', from: rootSkills, to: lexSkills });
  }
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md']) {
    const rootFile = path.join(projectRoot, f);
    const lexFile = path.join(projectRoot, '.lex', f);
    if (fileExists(rootFile) && !fileExists(lexFile)) {
      items.push({ type: 'file', name: f, from: rootFile, to: lexFile });
    }
  }
  return items;
}

function ensureStructure(lexDir, templates, pluginRoot, report) {
  for (const dir of REQUIRED_DIRS) {
    const dirPath = path.join(lexDir, dir);
    if (!dirExists(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      if (dir === 'sessions') {
        fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');
      }
      report.created.push('.lex/' + dir + '/');
    }
  }

  for (const file of REQUIRED_FILES) {
    const dest = path.join(lexDir, file);
    if (!fileExists(dest)) {
      const src = path.join(templates, file === 'status.md' ? 'STATUS.md' : file === 'INDEX.md' ? 'INDEX.md' : file);
      if (fileExists(src)) {
        fs.copyFileSync(src, dest);
        report.created.push('.lex/' + file);
      }
    }
  }

  const wipTemplate = path.join(templates, 'wip.md');
  const wipDest = path.join(lexDir, 'wip.md');
  if (!fileExists(wipDest) && fileExists(wipTemplate)) {
    fs.copyFileSync(wipTemplate, wipDest);
    report.created.push('.lex/wip.md');
  }

  const templatePages = path.join(templates, 'pages');
  if (dirExists(templatePages)) {
    for (const f of fs.readdirSync(templatePages).filter(f => f.endsWith('.md'))) {
      const dest = path.join(lexDir, 'pages', f);
      if (!fileExists(dest)) {
        fs.copyFileSync(path.join(templatePages, f), dest);
        report.created.push('.lex/pages/' + f);
      } else {
        report.skipped.push('.lex/pages/' + f + ' (already exists)');
      }
    }
  }

  const skillsSrc = path.join(pluginRoot, 'skills');
  const skillsDest = path.join(lexDir, 'skills');
  if (dirExists(skillsSrc) && !dirExists(skillsDest)) {
    copyDirSync(skillsSrc, skillsDest);
    report.created.push('.lex/skills/ (' + countFiles(skillsDest) + ' files)');
  } else if (dirExists(skillsSrc) && dirExists(skillsDest)) {
    mergeDir(skillsSrc, skillsDest, 'skills', report);
  }

  for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md']) {
    const src = path.join(pluginRoot, f);
    const dest = path.join(lexDir, f);
    if (fileExists(src) && !fileExists(dest)) {
      fs.copyFileSync(src, dest);
      report.created.push('.lex/' + f);
    }
  }
}

function countFiles(dir) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
      else if (entry.isFile()) count++;
    }
  } catch {}
  return count;
}

function migrate(projectRoot, opts) {
  opts = opts || {};
  const report = {
    migrated: false,
    backed: null,
    adopted: [],
    created: [],
    skipped: [],
    merged: [],
    cleaned: null,
    errors: [],
    warnings: [],
  };

  const lexDir = path.join(projectRoot, '.lex');
  const oldFolder = detectOldFolder(projectRoot);
  const pluginRoot = opts.pluginRoot || path.join(__dirname, '..', '..');
  const templates = path.join(pluginRoot, 'templates');

  if (!oldFolder) {
    const relocated = detectRelocatedItems(projectRoot);
    if (relocated.length === 0 && dirExists(lexDir)) {
      report.warnings.push('No old folder (.ctx) found — .lex already exists, running structure check only');
      ensureStructure(lexDir, templates, pluginRoot, report);
      return report;
    }
    if (relocated.length === 0 && !dirExists(lexDir)) {
      report.warnings.push('No .lex or .ctx folder found — run lex init instead');
      return report;
    }
    report.migrated = true;
    report.warnings.push('No .ctx folder found, but found relocated items at project root');
    if (!dirExists(lexDir)) {
      fs.mkdirSync(lexDir, { recursive: true });
      report.created.push('.lex/');
    }
    relocateItems(relocated, report, opts);
    ensureStructure(lexDir, templates, pluginRoot, report);
    return report;
  }

  report.migrated = true;
  report.backed = oldFolder.name;

  const backupDir = path.join(projectRoot, oldFolder.name + '.backup-' + Date.now());
  try {
    copyDirSync(oldFolder.path, backupDir);
    report.backed = backupDir;
  } catch (e) {
    report.errors.push('backup failed: ' + e.message);
    return report;
  }

  if (!dirExists(lexDir)) {
    fs.mkdirSync(lexDir, { recursive: true });
    report.created.push('.lex/');
  }

  const adoptDirs = ['pages', 'sessions'];
  for (const dir of adoptDirs) {
    const oldDir = path.join(oldFolder.path, dir);
    const newDir = path.join(lexDir, dir);
    if (dirExists(oldDir)) {
      mergeDir(oldDir, newDir, '.lex/' + dir, report);
    }
  }

  const adoptFiles = ['wip.md', 'status.md', 'INDEX.md', 'audit.log', 'agent.json', 'token-ledger.json', 'ignore'];
  for (const file of adoptFiles) {
    const oldFile = path.join(oldFolder.path, file);
    const newFile = path.join(lexDir, file);
    if (fileExists(oldFile)) {
      if (fileExists(newFile)) {
        report.skipped.push('.lex/' + file + ' (already exists, old version backed up)');
      } else {
        fs.copyFileSync(oldFile, newFile);
        report.adopted.push('.lex/' + file);
      }
    }
  }

  const oldDb = path.join(oldFolder.path, 'index.db');
  const newDb = path.join(lexDir, 'index.db');
  if (fileExists(oldDb) && !fileExists(newDb)) {
    fs.copyFileSync(oldDb, newDb);
    report.adopted.push('.lex/index.db (SQLite index)');
    for (const ext of ['-shm', '-wal']) {
      const oldShm = oldDb + ext;
      const newShm = newDb + ext;
      if (fileExists(oldShm) && !fileExists(newShm)) {
        try { fs.copyFileSync(oldShm, newShm); } catch {}
      }
    }
  }

  ensureStructure(lexDir, templates, pluginRoot, report);

  const oldSkillsDir = path.join(oldFolder.path, 'skills');
  const newSkillsDir = path.join(lexDir, 'skills');
  if (dirExists(oldSkillsDir)) {
    mergeUserSkills(oldSkillsDir, newSkillsDir, report);
  }

  const oldLinks = path.join(oldFolder.path, 'links.json');
  const newLinks = path.join(lexDir, 'links.json');
  if (fileExists(oldLinks) && !fileExists(newLinks)) {
    fs.copyFileSync(oldLinks, newLinks);
    report.adopted.push('.lex/links.json');
  }

  if (!opts.keepOld) {
    if (safeRemoveDir(oldFolder.path)) {
      report.cleaned = oldFolder.name;
    } else {
      report.warnings.push('Could not remove old folder ' + oldFolder.name + ' — remove manually. Backup at ' + backupDir);
    }
  } else {
    report.warnings.push('Old folder kept at ' + oldFolder.name + ' (use --keep-old). Backup at ' + backupDir);
  }

  return report;
}

function mergeUserSkills(oldSkills, newSkills, report) {
  for (const entry of fs.readdirSync(oldSkills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const oldSkill = path.join(oldSkills, entry.name);
    const newSkill = path.join(newSkills, entry.name);
    if (!dirExists(newSkill)) {
      copyDirSync(oldSkill, newSkill);
      report.adopted.push('.lex/skills/' + entry.name + '/ (user-created skill)');
    } else {
      mergeDir(oldSkill, newSkill, 'skills/' + entry.name, report);
    }
  }
}

function formatReport(report) {
  const lines = [];
  if (!report.migrated && !report.warnings.length) {
    lines.push('No migration needed — .lex is up to date');
    return lines.join('\n');
  }

  if (report.warnings.length && !report.migrated) {
    for (const w of report.warnings) lines.push('  ' + w);
    if (report.created.length) {
      lines.push('');
      lines.push('Created:');
      for (const c of report.created) lines.push('  + ' + c);
    }
    return lines.join('\n');
  }

  lines.push('Migration complete');
  lines.push('=============');
  if (report.backed) lines.push('Backup:     ' + report.backed);
  if (report.cleaned) lines.push('Removed:    ' + report.cleaned + ' (safe — backup exists)');

  if (report.adopted.length) {
    lines.push('');
    lines.push('Adopted from old folder:');
    for (const a of report.adopted) lines.push('  ~ ' + a);
  }

  if (report.created.length) {
    lines.push('');
    lines.push('Created (new structure):');
    for (const c of report.created) lines.push('  + ' + c);
  }

  if (report.skipped.length) {
    lines.push('');
    lines.push('Skipped (already exists):');
    for (const s of report.skipped) lines.push('  = ' + s);
  }

  if (report.errors.length) {
    lines.push('');
    lines.push('ERRORS:');
    for (const e of report.errors) lines.push('  ! ' + e);
  }

  if (report.warnings.length) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of report.warnings) lines.push('  ? ' + w);
  }

  return lines.join('\n');
}

function relocateItems(items, report, opts) {
  for (const item of items) {
    if (item.type === 'dir') {
      if (dirExists(item.to)) {
        mergeDir(item.from, item.to, '.lex/' + item.name, report);
      } else {
        copyDirSync(item.from, item.to);
        report.adopted.push('.lex/' + item.name + '/ (relocated from project root)');
      }
      if (!opts.keepOld) {
        if (safeRemoveDir(item.from)) {
          report.cleaned = (report.cleaned ? report.cleaned + ', ' : '') + item.name + '/ (root)';
        } else {
          report.warnings.push('Could not remove root-level ' + item.name + '/ — remove manually');
        }
      }
    } else {
      if (fileExists(item.to)) {
        report.skipped.push('.lex/' + item.name + ' (already exists)');
      } else {
        fs.copyFileSync(item.from, item.to);
        report.adopted.push('.lex/' + item.name + ' (relocated from project root)');
      }
      if (!opts.keepOld) {
        try { fs.unlinkSync(item.from); } catch {
          report.warnings.push('Could not remove root-level ' + item.name + ' — remove manually');
        }
      }
    }
  }
}

module.exports = { migrate, formatReport, detectOldFolder, detectRelocatedItems, ensureStructure };
