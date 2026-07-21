#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const scriptDir = __dirname;
const hookName = process.argv[2] || '';

if (!hookName) {
  process.stderr.write('{"error": "No hook name provided"}\n');
  process.exit(1);
}

const hookScript = path.join(scriptDir, hookName);
if (!fs.existsSync(hookScript)) {
  process.stdout.write('{}\n');
  process.exit(0);
}

const pluginRoot = path.resolve(scriptDir, '..');
const cwd = process.cwd();

function readHead(p, n) {
  try {
    return fs.readFileSync(p, 'utf8').split('\n').slice(0, n).join('\n');
  } catch { return ''; }
}

function jsonEscape(s) {
  return JSON.stringify(s);
}

function detectPlatform() {
  if (process.env.CURSOR_PLUGIN_ROOT) return 'cursor';
  if (process.env.CLAUDE_PLUGIN_ROOT && !process.env.COPILOT_CLI) return 'claude';
  if (process.env.COPILOT_CLI) return 'copilot';
  if (process.env.WINDSURF_PROJECT_DIR) return 'windsurf';
  return 'unknown';
}

function detectAgent() {
  if (process.env.CLAUDE_PLUGIN_ROOT && !process.env.COPILOT_CLI) return 'claude';
  if (process.env.CURSOR_PLUGIN_ROOT) return 'cursor';
  if (process.env.COPILOT_CLI) return 'copilot';
  if (process.env.WINDSURF_PROJECT_DIR) return 'windsurf';
  return 'unknown';
}

function runSessionStart() {
  const bootstrap = path.join(pluginRoot, 'skills', 'using-lex', 'BOOTSTRAP.md');
  if (!fs.existsSync(bootstrap)) {
    process.stdout.write('{}\n');
    return;
  }
  const content = fs.readFileSync(bootstrap, 'utf8');
  let state = '';
  const statusPath = path.join(cwd, '.lex', 'status.md');
  const wipPath = path.join(cwd, '.lex', 'wip.md');
  if (fs.existsSync(statusPath)) {
    state += '\n\n## CURRENT PROJECT STATE (.lex/status.md)\n' + readHead(statusPath, 40);
  }
  if (fs.existsSync(wipPath)) {
    state += '\n\n## INTERRUPTED WORK - RESUME THIS (.lex/wip.md)\n' + readHead(wipPath, 150);
  }
  const wrapped = '<EXTREMELY_IMPORTANT>\nYou have lex - the universal coding companion.\n\nBelow is your condensed bootstrap. For the full protocol, read skills/using-lex/SKILL.md. For other skills, use the Skill tool or read skills/<skill-name>/SKILL.md:\n\n---\n' + content + state + '\n</EXTREMELY_IMPORTANT>';
  const escaped = jsonEscape(wrapped);

  try {
    const tokens = require('../lib/tokens');
    tokens.resetLedger(cwd);
    tokens.trackInjection(cwd, 'session-start (bootstrap + state)', wrapped);
  } catch {}

  const platform = detectPlatform();
  if (platform === 'claude') {
    process.stdout.write('{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":' + escaped + '}}\n');
  } else {
    process.stdout.write('{"additionalContext":' + escaped + '}\n');
  }
}

function runPreCompact() {
  const lexDir = path.join(cwd, '.lex');
  if (fs.existsSync(lexDir)) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    try { fs.appendFileSync(path.join(lexDir, 'audit.log'), now + ' | claude-code | PreCompact | context compaction\n'); } catch {}
  }
  process.stdout.write('{}\n');
}

function runPostToolUse() {
  const lexDir = path.join(cwd, '.lex');
  if (!fs.existsSync(lexDir)) {
    process.stdout.write('{}\n');
    return;
  }
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch {}
  let file = null, tool = 'edit', root = null, toolInput = null, toolOutput = null;
  try {
    const input = JSON.parse(raw);
    file = input.tool_input && input.tool_input.file_path;
    tool = input.tool_name || 'edit';
    toolInput = input.tool_input || {};
    toolOutput = input.tool_response || input.tool_output || '';
    if (file) {
      let dir = path.dirname(file);
      for (;;) {
        if (fs.existsSync(path.join(dir, '.lex'))) { root = dir; break; }
        const up = path.dirname(dir);
        if (up === dir) break;
        dir = up;
      }
    }
  } catch {}
  if (!root) root = cwd;

  // --- Gateway: process .lex/in/ requests ---
  if (file && tool !== 'run_command') {
    try {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      if (rel.startsWith('.lex/in/') && rel.endsWith('.json')) {
        const gateway = require('../lib/gateway');
        const content = fs.readFileSync(file, 'utf8').trim();
        let request;

        if (!content) {
          // Empty file: command = filename without .json
          const cmd = path.basename(rel, '.json');
          request = { cmd, args: [] };
        } else if (content.startsWith('{')) {
          // JSON format (backward compatible)
          request = JSON.parse(content);
        } else {
          // Plain text: "cmd arg1 arg2" or "cmd|arg1|arg2"
          // First word is always the command, rest are args
          const sp = content.split(/\s+/);
          const cmd = sp[0];
          const rest = sp.slice(1).join(' ');
          const args = rest.includes('|') ? rest.split('|').map(s => s.trim()) : sp.slice(1);
          request = { cmd, args };
        }

        const result = gateway.processRequest(root, request);

        // Track token usage for gateway commands
        try {
          const tokens = require('../lib/tokens');
          tokens.trackWrite(root, file || 'unknown', content || '');
          tokens.trackInjection(root, 'gateway:' + request.cmd, result.ok ? result.output : ('ERROR: ' + result.error));
        } catch {}

        // Write result to .lex/out/ for fallback
        const outDir = path.join(root, '.lex', 'out');
        fs.mkdirSync(outDir, { recursive: true });
        const outName = path.basename(rel);
        fs.writeFileSync(path.join(outDir, outName), JSON.stringify(result));

        // Clean up input file
        try { fs.unlinkSync(file); } catch {}

        // Inject result as additionalContext
        const output = result.ok ? result.output : 'ERROR: ' + result.error;
        const escaped = JSON.stringify(output);
        process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":' + escaped + '}}\n');
        return;
      }
    } catch (e) {
      // Gateway error - write to out and inject error
      try {
        const outDir = path.join(root, '.lex', 'out');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, path.basename(file)), JSON.stringify({ ok: false, error: e.message }));
      } catch {}
      const escaped = JSON.stringify('lex gateway error: ' + e.message);
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":' + escaped + '}}\n');
      return;
    }
  }

  try {
    const tokens = require('../lib/tokens');

    if (tool === 'read_file' || tool === 'Read' || tool === 'view_file' || tool === 'read') {
      let content = '';
      if (typeof toolOutput === 'string') content = toolOutput;
      else if (toolOutput && toolOutput.content) content = typeof toolOutput.content === 'string' ? toolOutput.content : JSON.stringify(toolOutput.content);
      else if (file) { try { content = fs.readFileSync(file, 'utf8'); } catch {} }
      tokens.trackRead(root, file || 'unknown', content);
    }

    if (tool === 'edit' || tool === 'Edit' || tool === 'write_to_file' || tool === 'Write' || tool === 'create_file') {
      const content = toolInput.new_string || toolInput.content || toolInput.code_content || '';
      if (content) tokens.trackWrite(root, file || 'unknown', content);
    }

    if (tool === 'run_command' || tool === 'Run' || tool === 'execute_command' || tool === 'bash') {
      const cmd = toolInput.command || toolInput.commandLine || '';
      const output = typeof toolOutput === 'string' ? toolOutput : (toolOutput?.output || toolOutput?.stdout || '');
      tokens.trackCommand(root, cmd, output);
    }

    if (tool === 'grep_search' || tool === 'Grep' || tool === 'search' || tool === 'code_search') {
      const query = toolInput.query || toolInput.pattern || '';
      const output = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput || '');
      tokens.trackSearch(root, query, output);
    }
  } catch {}

  try {
    if (file) {
      const rel = path.relative(root, file);
      if (rel && !rel.startsWith('..')) {
        const { updateFile, openDb } = require('../lib/indexer');
        updateFile(openDb(root), root, rel.split(path.sep).join('/'));
        try {
          fs.writeFileSync(path.join(root, '.lex', 'live.json'), JSON.stringify({ file: rel.split(path.sep).join('/'), tool, ts: Date.now() }));
        } catch {}
      }
    }
  } catch {}

  const { loadAgentConfig } = require('../lib/indexer');
  const config = loadAgentConfig(root);

  if (config.auto_audit_log && file) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const agent = detectAgent();
    const platform = detectPlatform();
    try { fs.appendFileSync(path.join(root, '.lex', 'audit.log'), now + ' | ' + agent + ' | ' + platform + ' | ' + tool + ' | ' + file + '\n'); } catch {}
  }

  if (config.warn_no_wip_on_edit && !fs.existsSync(path.join(root, '.lex', 'wip.md'))) {
    process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"WARNING: You are editing files but .lex/wip.md does not exist. Create it NOW with your plan and steps. Crash recovery depends on it. Run: node bin/lex.js status to see project state."}}\n');
    return;
  }

  process.stdout.write('{}\n');
}

switch (hookName) {
  case 'session-start': runSessionStart(); break;
  case 'session-start-codex': runSessionStart(); break;
  case 'pre-compact': runPreCompact(); break;
  case 'post-tool-use': runPostToolUse(); break;
  default: process.stdout.write('{}\n');
}
