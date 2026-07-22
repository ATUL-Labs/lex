'use strict';

/**
 * Skill Evolution — auto-generate and enhance skills from session patterns.
 *
 * Analyzes .lex/sessions/*.md and .lex/pages/mistakes.md to detect:
 * - Repeated workflows that no existing skill covers
 * - Framework-specific patterns that could become a skill overlay
 * - Common error patterns that map to a debugging skill
 *
 * Auto-generated skills go to .lex/skills/ (project-local), marked with
 * auto-generated: true in frontmatter. Humans review via `lex skills:review`.
 *
 * Safeguards:
 * - Max 5 auto-generated skills per project
 * - Never modify global skills/ directory
 * - Mark all auto-generated content clearly
 * - Only create if pattern appears 3+ times across sessions
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_AUTO_SKILLS = 5;
const MIN_PATTERN_OCCURRENCES = 3;

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function listSessions(root) {
  const dir = path.join(root, '.lex', 'sessions');
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep').map(f => path.join(dir, f));
  } catch { return []; }
}

function listExistingSkills(root) {
  const globalDir = path.join(__dirname, '..', 'skills');
  const localDir = path.join(root, '.lex', 'skills');
  const skills = new Set();

  for (const dir of [globalDir, localDir]) {
    try {
      for (const d of fs.readdirSync(dir)) {
        if (fs.statSync(path.join(dir, d)).isDirectory()) skills.add(d);
      }
    } catch {}
  }
  return skills;
}

function countAutoSkills(root) {
  const localDir = path.join(root, '.lex', 'skills');
  let count = 0;
  try {
    for (const d of fs.readdirSync(localDir)) {
      const skillPath = path.join(localDir, d, 'SKILL.md');
      const content = readSafe(skillPath);
      if (content && content.includes('auto-generated: true')) count++;
    }
  } catch {}
  return count;
}

function parseSessionPatterns(root) {
  const sessions = listSessions(root);
  const patterns = {};

  for (const sessionFile of sessions) {
    const content = readSafe(sessionFile) || '';
    const filename = path.basename(sessionFile);

    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : filename;

    const fileSection = content.match(/## Files modified\s*\n([\s\S]*?)(?=\n##|$)/);
    const files = fileSection
      ? fileSection[1].split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)
      : [];

    const summaryMatch = content.match(/## Summary\s*\n([\s\S]*?)(?=\n##|$)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';

    const taskMatch = content.match(/## Task\s*\n([\s\S]*?)(?=\n##|$)/);
    const task = taskMatch ? taskMatch[1].trim() : '';

    const keywords = extractKeywords(task + ' ' + summary + ' ' + title);
    for (const kw of keywords) {
      if (!patterns[kw]) patterns[kw] = { count: 0, sessions: [], files: new Set(), summaries: [] };
      patterns[kw].count++;
      patterns[kw].sessions.push(filename);
      for (const f of files) patterns[kw].files.add(f);
      if (patterns[kw].summaries.length < 3) patterns[kw].summaries.push(summary.substring(0, 200));
    }
  }

  return patterns;
}

function extractKeywords(text) {
  if (!text) return [];
  const stop = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'than', 'then', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'you', 'your', 'our', 'my', 'me', 'and', 'or', 'but', 'not', 'no', 'if', 'else', 'when', 'while', 'for', 'function', 'const', 'let', 'var', 'require', 'module', 'exports', 'return', 'class', 'new', 'try', 'catch', 'error', 'err', 'file', 'path', 'dir', 'root', 'true', 'false', 'null', 'undefined', 'void', 'use', 'strict', 'async', 'await', 'what', 'why', 'fix', 'rule', 'note', 'how', 'which', 'type', 'key', 'data', 'name', 'value', 'str', 'obj', 'arr', 'fn', 'cb', 'idx', 'len', 'num', 'char', 'code', 'change', 'update', 'add', 'remove', 'set', 'get', 'run', 'test', 'build', 'create', 'make', 'new', 'old', 'first', 'last', 'next', 'prev', 'start', 'end', 'begin', 'finish', 'done', 'todo', 'task', 'step', 'line', 'lines', 'block', 'section', 'part', 'component', 'page', 'route', 'api', 'endpoint', 'request', 'response', 'header', 'body', 'status', 'method', 'config', 'option', 'param', 'arg', 'args', 'input', 'output', 'result', 'output', 'log', 'debug', 'info', 'warn', 'error', 'fatal', 'trace', 'print', 'write', 'read', 'open', 'close', 'load', 'save', 'store', 'fetch', 'send', 'receive', 'parse', 'stringify', 'serialize', 'deserialize', 'encode', 'decode', 'encrypt', 'decrypt', 'hash', 'salt', 'token', 'session', 'cookie', 'auth', 'login', 'logout', 'register', 'user', 'pass', 'password', 'email', 'phone', 'address', 'profile', 'account', 'role', 'permission', 'admin', 'guest', 'public', 'private', 'protected', 'internal', 'external', 'local', 'global', 'remote', 'online', 'offline', 'active', 'inactive', 'enabled', 'disabled', 'valid', 'invalid', 'correct', 'wrong', 'right', 'left', 'up', 'down', 'top', 'bottom', 'front', 'back', 'side', 'center', 'middle', 'edge', 'corner', 'border', 'margin', 'padding', 'width', 'height', 'size', 'color', 'font', 'text', 'image', 'icon', 'button', 'link', 'menu', 'nav', 'tab', 'panel', 'modal', 'dialog', 'card', 'table', 'list', 'grid', 'flex', 'box', 'wrap', 'container', 'wrapper', 'inner', 'outer', 'content', 'empty', 'full', 'partial', 'complete', 'incomplete', 'success', 'failure', 'fail', 'pass', 'skip', 'ignore', 'include', 'exclude', 'allow', 'deny', 'accept', 'reject', 'approve', 'pending', 'waiting', 'ready', 'loading', 'processing', 'complete', 'finished', 'stopped', 'paused', 'resumed', 'started', 'ended', 'cancelled', 'aborted', 'failed', 'succeeded', 'completed', 'running', 'queued', 'scheduled', 'delayed', 'timeout', 'expired', 'fresh', 'stale', 'old', 'new', 'current', 'previous', 'next', 'future', 'past', 'present', 'recent', 'latest', 'oldest', 'first', 'last', 'all', 'none', 'some', 'any', 'each', 'every', 'both', 'either', 'neither', 'more', 'less', 'most', 'least', 'many', 'few', 'several', 'multiple', 'single', 'double', 'triple', 'half', 'quarter', 'third', 'full', 'empty', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'hundred', 'thousand', 'million', 'billion', 'count', 'number', 'total', 'sum', 'avg', 'min', 'max', 'range', 'limit', 'offset', 'page', 'per', 'item', 'items', 'entry', 'entries', 'record', 'records', 'row', 'rows', 'column', 'columns', 'field', 'fields', 'table', 'tables', 'schema', 'index', 'indexes', 'key', 'keys', 'value', 'values', 'pair', 'pairs', 'map', 'set', 'list', 'array', 'object', 'string', 'number', 'boolean', 'date', 'time', 'datetime', 'timestamp', 'duration', 'interval', 'frequency', 'rate', 'speed', 'latency', 'throughput', 'bandwidth', 'memory', 'cpu', 'disk', 'network', 'port', 'host', 'domain', 'url', 'uri', 'path', 'route', 'endpoint', 'service', 'server', 'client', 'proxy', 'gateway', 'router', 'switch', 'hub', 'bridge', 'tunnel', 'vpn', 'firewall', 'dns', 'dhcp', 'ip', 'mac', 'tcp', 'udp', 'http', 'https', 'ssl', 'tls', 'ssh', 'ftp', 'smtp', 'imap', 'pop3', 'websocket', 'socket', 'pipe', 'stream', 'buffer', 'cache', 'queue', 'stack', 'heap', 'pool', 'bucket', 'folder', 'directory', 'file', 'filename', 'extension', 'format', 'type', 'kind', 'sort', 'order', 'group', 'category', 'class', 'instance', 'prototype', 'constructor', 'method', 'property', 'attribute', 'field', 'member', 'static', 'dynamic', 'abstract', 'concrete', 'virtual', 'override', 'overload', 'inherit', 'extend', 'implement', 'interface', 'mixin', 'trait', 'decorator', 'annotation', 'metadata', 'reflection', 'proxy', 'factory', 'builder', 'singleton', 'observer', 'strategy', 'command', 'iterator', 'composite', 'adapter', 'facade', 'flyweight', 'bridge', 'mediator', 'memento', 'state', 'template', 'visitor', 'chain', 'responsibility', 'interpreter', 'null', 'undefined', 'void', 'never', 'unknown', 'any', 'all', 'none', 'some', 'every', 'each', 'both', 'either', 'neither', 'more', 'less', 'most', 'least', 'many', 'few', 'several', 'multiple', 'single', 'double', 'triple', 'half', 'quarter', 'third', 'full', 'empty', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'hundred', 'thousand', 'million', 'billion']);

  const words = text.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !stop.has(w.toLowerCase()));
  return [...new Set(words)].slice(0, 15);
}

function parseMistakePatterns(root) {
  const content = readSafe(path.join(root, '.lex', 'pages', 'mistakes.md'));
  if (!content) return [];

  const sections = content.split(/^## /m).slice(1);
  return sections.map(section => {
    const titleMatch = section.match(/^(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const fixMatch = section.match(/fix:\s*(.+)/);
    const whatMatch = section.match(/what:\s*(.+)/);
    return {
      title: title.replace(/^\d+\.\s*/, ''),
      what: whatMatch ? whatMatch[1].trim() : '',
      fix: fixMatch ? fixMatch[1].trim() : '',
      raw: section.trim(),
    };
  });
}

function categorizePattern(keyword, patterns, mistakes) {
  const lower = keyword.toLowerCase();

  if (lower.includes('debug') || lower.includes('error') || lower.includes('bug') || lower.includes('crash')) {
    return { type: 'debugging', title: 'Debugging ' + keyword };
  }
  if (lower.includes('test') || lower.includes('spec') || lower.includes('assert')) {
    return { type: 'testing', title: 'Testing ' + keyword };
  }
  if (lower.includes('deploy') || lower.includes('build') || lower.includes('ci') || lower.includes('cd')) {
    return { type: 'deployment', title: 'Deployment ' + keyword };
  }
  if (lower.includes('migrat') || lower.includes('schema') || lower.includes('database') || lower.includes('sql')) {
    return { type: 'database', title: 'Database ' + keyword };
  }
  if (lower.includes('api') || lower.includes('endpoint') || lower.includes('route')) {
    return { type: 'api', title: 'API ' + keyword };
  }
  if (lower.includes('auth') || lower.includes('login') || lower.includes('password') || lower.includes('token')) {
    return { type: 'auth', title: 'Auth ' + keyword };
  }
  if (lower.includes('perform') || lower.includes('optim') || lower.includes('cache') || lower.includes('speed')) {
    return { type: 'performance', title: 'Performance ' + keyword };
  }
  if (lower.includes('refactor') || lower.includes('clean') || lower.includes('restruct')) {
    return { type: 'refactoring', title: 'Refactoring ' + keyword };
  }

  return { type: 'workflow', title: keyword };
}

function generateSkillContent(name, category, patterns, mistakes) {
  const date = new Date().toISOString().substring(0, 10);
  const sessions = patterns.sessions.slice(0, 5);
  const files = [...patterns.files].slice(0, 10);
  const relatedMistakes = mistakes.filter(m =>
    m.title.toLowerCase().includes(name.toLowerCase()) ||
    (m.what && m.what.toLowerCase().includes(name.toLowerCase()))
  ).slice(0, 3);

  let content = `---
auto-generated: true
generated_at: ${date}
pattern_count: ${patterns.count}
---

# ${category.title}

## When to use
This skill was auto-generated because the pattern "${name}" appeared ${patterns.count} times across sessions.
Activate when working on tasks related to ${name}.

## Detected from sessions
`;
  for (const s of sessions) {
    content += `- ${s}\n`;
  }

  if (files.length) {
    content += '\n## Files commonly involved\n';
    for (const f of files) {
      content += `- ${f}\n`;
    }
  }

  if (relatedMistakes.length) {
    content += '\n## Known mistakes to avoid\n';
    for (const m of relatedMistakes) {
      content += `- **${m.title}**: ${m.fix || m.what || ''}\n`;
    }
  }

  if (patterns.summaries.length) {
    content += '\n## Session summaries (reference)\n';
    for (const s of patterns.summaries) {
      content += `> ${s}\n\n`;
    }
  }

  content += `\n## Steps
1. Identify the specific ${name} task
2. Check known mistakes above
3. Apply framework-specific patterns
4. Verify with tests

## Review
This skill was auto-generated by \`lex skills:evolve\`.
Review and refine before promoting to global skills.
Run \`lex skills:review --approve\` to mark as approved.
`;

  return content;
}

function enhanceExistingSkill(root, skillName, patterns) {
  const localSkillPath = path.join(root, '.lex', 'skills', skillName, 'SKILL.md');
  const globalSkillPath = path.join(__dirname, '..', 'skills', skillName, 'SKILL.md');
  const skillPath = fs.existsSync(localSkillPath) ? localSkillPath : (fs.existsSync(globalSkillPath) ? globalSkillPath : null);

  if (!skillPath) return false;
  if (skillPath === globalSkillPath && !fs.existsSync(path.join(root, '.lex', 'skills', skillName))) {
    return false;
  }

  const content = readSafe(skillPath);
  if (!content) return false;
  if (content.includes('## Project-specific notes (auto)')) return false;

  const date = new Date().toISOString().substring(0, 10);
  const enhancement = `\n## Project-specific notes (auto)\nDetected ${patterns.count} sessions involving this skill (as of ${date}).\nCommon files: ${[...patterns.files].slice(0, 5).join(', ')}\n`;

  const targetPath = localSkillPath || path.join(root, '.lex', 'skills', skillName, 'SKILL.md');
  if (targetPath === localSkillPath) {
    fs.writeFileSync(targetPath, content + enhancement);
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content + enhancement);
  }
  return true;
}

function evolve(root) {
  const result = { created: [], enhanced: [], errors: [] };

  const patterns = parseSessionPatterns(root);
  const mistakes = parseMistakePatterns(root);
  const existing = listExistingSkills(root);
  const autoCount = countAutoSkills(root);

  const sortedPatterns = Object.entries(patterns)
    .filter(([_, p]) => p.count >= MIN_PATTERN_OCCURRENCES)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [keyword, pattern] of sortedPatterns) {
    const category = categorizePattern(keyword, pattern, mistakes);
    const skillName = category.type + '-' + keyword.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);

    if (existing.has(skillName)) {
      if (enhanceExistingSkill(root, skillName, pattern)) {
        result.enhanced.push(skillName);
      }
      continue;
    }

    if (existing.has(category.type)) {
      if (enhanceExistingSkill(root, category.type, pattern)) {
        result.enhanced.push(category.type);
      }
      continue;
    }

    if (autoCount + result.created.length >= MAX_AUTO_SKILLS) break;

    try {
      const skillDir = path.join(root, '.lex', 'skills', skillName);
      fs.mkdirSync(skillDir, { recursive: true });
      const content = generateSkillContent(keyword, category, pattern, mistakes);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
      result.created.push(skillName);
    } catch (e) {
      result.errors.push(skillName + ': ' + e.message);
    }
  }

  return result;
}

module.exports = { evolve, parseSessionPatterns, parseMistakePatterns, listExistingSkills };
