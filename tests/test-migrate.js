'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { migrate, formatReport, detectOldFolder } = require('../lib/migrate');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lex-migrate-'));
}

function makeOldCtx(root) {
  const ctx = path.join(root, '.ctx');
  fs.mkdirSync(ctx, { recursive: true });
  fs.mkdirSync(path.join(ctx, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(ctx, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(ctx, 'skills', 'my-custom-skill'), { recursive: true });
  fs.writeFileSync(path.join(ctx, 'status.md'), '# Old Status\nproject: test\n');
  fs.writeFileSync(path.join(ctx, 'wip.md'), '# Old WIP\nworking on migration\n');
  fs.writeFileSync(path.join(ctx, 'INDEX.md'), '# Old Index\n');
  fs.writeFileSync(path.join(ctx, 'audit.log'), '2026-01-01 test entry\n');
  fs.writeFileSync(path.join(ctx, 'pages', 'mistakes.md'), '# Old Mistakes\n');
  fs.writeFileSync(path.join(ctx, 'pages', 'custom-page.md'), '# My Custom Page\n');
  fs.writeFileSync(path.join(ctx, 'skills', 'my-custom-skill', 'SKILL.md'), '# My Custom Skill\n');
  return ctx;
}

test('detectOldFolder finds .ctx', () => {
  const root = makeTempDir();
  makeOldCtx(root);
  const found = detectOldFolder(root);
  assert.ok(found);
  assert.equal(found.name, '.ctx');
  fs.rmSync(root, { recursive: true, force: true });
});

test('detectOldFolder returns null when no old folder', () => {
  const root = makeTempDir();
  const found = detectOldFolder(root);
  assert.equal(found, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate adopts pages, wip, status, audit from .ctx', () => {
  const root = makeTempDir();
  makeOldCtx(root);
  const pluginRoot = path.join(__dirname, '..');

  const report = migrate(root, { pluginRoot });

  assert.ok(report.migrated);
  assert.ok(report.adopted.includes('.lex/wip.md'));
  assert.ok(report.adopted.includes('.lex/status.md'));
  assert.ok(report.adopted.includes('.lex/INDEX.md'));
  assert.ok(report.adopted.includes('.lex/audit.log'));
  assert.ok(report.adopted.some(a => a.includes('pages/mistakes.md')));
  assert.ok(report.adopted.some(a => a.includes('pages/custom-page.md')));

  assert.ok(fs.existsSync(path.join(root, '.lex', 'wip.md')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'status.md')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'pages', 'mistakes.md')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'pages', 'custom-page.md')));

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate backs up old folder and cleans it up', () => {
  const root = makeTempDir();
  makeOldCtx(root);
  const pluginRoot = path.join(__dirname, '..');

  const report = migrate(root, { pluginRoot });

  assert.ok(report.backed, 'should have a backup path');
  assert.ok(fs.existsSync(report.backed), 'backup folder should exist');
  assert.equal(report.cleaned, '.ctx');
  assert.ok(!fs.existsSync(path.join(root, '.ctx')), 'old folder should be removed');

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate --keep-old preserves old folder', () => {
  const root = makeTempDir();
  makeOldCtx(root);
  const pluginRoot = path.join(__dirname, '..');

  const report = migrate(root, { pluginRoot, keepOld: true });

  assert.ok(fs.existsSync(path.join(root, '.ctx')), 'old folder should still exist');
  assert.ok(fs.existsSync(report.backed), 'backup should still exist');
  assert.ok(report.warnings.some(w => w.includes('--keep-old')));

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate adopts user-created skills', () => {
  const root = makeTempDir();
  makeOldCtx(root);
  const pluginRoot = path.join(__dirname, '..');

  const report = migrate(root, { pluginRoot });

  assert.ok(report.adopted.some(a => a.includes('my-custom-skill')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'skills', 'my-custom-skill', 'SKILL.md')));

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate creates required dirs and template files', () => {
  const root = makeTempDir();
  makeOldCtx(root);
  const pluginRoot = path.join(__dirname, '..');

  const report = migrate(root, { pluginRoot });

  assert.ok(fs.existsSync(path.join(root, '.lex', 'sessions')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'in')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'out')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'trash')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'snapshots')));
  assert.ok(fs.existsSync(path.join(root, '.lex', 'agent.json')));

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate does not overwrite existing .lex files', () => {
  const root = makeTempDir();
  makeOldCtx(root);

  fs.mkdirSync(path.join(root, '.lex'), { recursive: true });
  fs.writeFileSync(path.join(root, '.lex', 'wip.md'), '# NEW WIP\n');

  const pluginRoot = path.join(__dirname, '..');
  const report = migrate(root, { pluginRoot });

  assert.ok(report.skipped.some(s => s.includes('wip.md')));
  const content = fs.readFileSync(path.join(root, '.lex', 'wip.md'), 'utf8');
  assert.ok(content.includes('NEW WIP'), 'existing wip.md should not be overwritten');

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate is idempotent — second run is safe', () => {
  const root = makeTempDir();
  makeOldCtx(root);
  const pluginRoot = path.join(__dirname, '..');

  migrate(root, { pluginRoot });
  const report2 = migrate(root, { pluginRoot });

  assert.ok(!report2.migrated, 'second run should not migrate');
  assert.ok(report2.warnings.length > 0, 'should warn about no old folder');

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate handles no old folder and no .lex', () => {
  const root = makeTempDir();
  const pluginRoot = path.join(__dirname, '..');

  const report = migrate(root, { pluginRoot });

  assert.ok(!report.migrated);
  assert.ok(report.warnings.some(w => w.includes('lex init')));

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate handles .lex already existing without old folder', () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, '.lex'), { recursive: true });
  const pluginRoot = path.join(__dirname, '..');

  const report = migrate(root, { pluginRoot });

  assert.ok(!report.migrated);
  assert.ok(report.warnings.some(w => w.includes('structure check')));

  fs.rmSync(root, { recursive: true, force: true });
});

test('formatReport produces readable output', () => {
  const report = {
    migrated: true,
    backed: '/tmp/backup',
    cleaned: '.ctx',
    adopted: ['.lex/wip.md', '.lex/pages/mistakes.md'],
    created: ['.lex/sessions/', '.lex/agent.json'],
    skipped: ['.lex/status.md (already exists)'],
    errors: [],
    warnings: [],
  };
  const text = formatReport(report);
  assert.ok(text.includes('Migration complete'));
  assert.ok(text.includes('Adopted'));
  assert.ok(text.includes('Created'));
  assert.ok(text.includes('Skipped'));
});

test('formatReport handles no-op migration', () => {
  const report = { migrated: false, adopted: [], created: [], skipped: [], errors: [], warnings: [] };
  const text = formatReport(report);
  assert.ok(text.includes('No migration needed'));
});

test('migrate relocates root-level skills/ to .lex/skills/', () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, '.lex'), { recursive: true });
  const rootSkills = path.join(root, 'skills', 'my-custom-skill');
  fs.mkdirSync(rootSkills, { recursive: true });
  fs.writeFileSync(path.join(rootSkills, 'SKILL.md'), '# My Skill\n');

  const pluginRoot = path.join(__dirname, '..');
  const report = migrate(root, { pluginRoot });

  assert.ok(report.migrated, 'should mark as migrated');
  assert.ok(fs.existsSync(path.join(root, '.lex', 'skills', 'my-custom-skill', 'SKILL.md')), 'skill should be in .lex/skills/');
  assert.ok(!fs.existsSync(path.join(root, 'skills')), 'root skills/ should be removed');
  assert.ok(report.adopted.some(a => a.includes('relocated')), 'should report relocation');

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate relocates root-level AGENTS.md to .lex/AGENTS.md', () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, '.lex'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Old AGENTS\n');

  const pluginRoot = path.join(__dirname, '..');
  const report = migrate(root, { pluginRoot });

  assert.ok(fs.existsSync(path.join(root, '.lex', 'AGENTS.md')), 'AGENTS.md should be in .lex/');
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')), 'root AGENTS.md should be removed');
  assert.ok(report.adopted.some(a => a.includes('AGENTS.md')), 'should report adoption');

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate does not overwrite .lex/skills/ when relocating root skills/', () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, '.lex', 'skills', 'existing-skill'), { recursive: true });
  fs.writeFileSync(path.join(root, '.lex', 'skills', 'existing-skill', 'SKILL.md'), '# Existing\n');

  const rootSkills = path.join(root, 'skills', 'my-custom-skill');
  fs.mkdirSync(rootSkills, { recursive: true });
  fs.writeFileSync(path.join(rootSkills, 'SKILL.md'), '# My Custom\n');

  const pluginRoot = path.join(__dirname, '..');
  const report = migrate(root, { pluginRoot });

  assert.ok(fs.existsSync(path.join(root, '.lex', 'skills', 'existing-skill', 'SKILL.md')), 'existing skill preserved');
  assert.ok(fs.existsSync(path.join(root, '.lex', 'skills', 'my-custom-skill', 'SKILL.md')), 'user skill merged');

  fs.rmSync(root, { recursive: true, force: true });
});

test('migrate --keep-old preserves root-level skills/ during relocation', () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, '.lex'), { recursive: true });
  const rootSkills = path.join(root, 'skills', 'my-skill');
  fs.mkdirSync(rootSkills, { recursive: true });
  fs.writeFileSync(path.join(rootSkills, 'SKILL.md'), '# My Skill\n');

  const pluginRoot = path.join(__dirname, '..');
  const report = migrate(root, { pluginRoot, keepOld: true });

  assert.ok(fs.existsSync(path.join(root, '.lex', 'skills', 'my-skill', 'SKILL.md')), 'skill copied to .lex/');
  assert.ok(fs.existsSync(path.join(root, 'skills')), 'root skills/ preserved with --keep-old');

  fs.rmSync(root, { recursive: true, force: true });
});
