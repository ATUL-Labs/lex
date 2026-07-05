'use strict';

const TEXT_EXT = new Set(['.php', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.md', '.json', '.css', '.scss', '.html', '.vue', '.sql', '.sh', '.yml', '.yaml', '.blade.php']);
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv', 'storage', 'bootstrap']);

function isTextFile(relPath) {
  if (relPath.endsWith('.min.js') || relPath.endsWith('.min.css')) return false;
  if (relPath.endsWith('.blade.php')) return true;
  const dot = relPath.lastIndexOf('.');
  if (dot <= relPath.lastIndexOf('/')) return false;
  return TEXT_EXT.has(relPath.slice(dot).toLowerCase());
}

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name);
}

const SYMBOL_PATTERNS = [
  { kind: 'class', re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'function', re: /^\s*(?:public\s+|protected\s+|private\s+|static\s+|abstract\s+|final\s+)*function\s+&?([A-Za-z_]\w*)/ },
  { kind: 'function', re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: 'function', re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/ },
  { kind: 'function', re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
];

function extractSymbols(relPath, text) {
  const out = [];
  const seen = new Set();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { kind, re } of SYMBOL_PATTERNS) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const key = m[1] + '|' + kind + '|' + (i + 1);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: m[1], kind, line: i + 1 });
    }
  }
  return out;
}

const BACKEND_EXT = /\.(php|py)$/;
const FRONTEND_EXT = /\.(js|mjs|ts|tsx|jsx|vue)$/;

const ROUTE_PATTERNS = [
  /Route::(get|post|put|patch|delete|any)\s*\(\s*['"]([^'"]+)['"]/i,
  /@\w+\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/,
];

const CONSUMER_PATTERNS = [
  { re: /\bfetch\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: null },
  { re: /\baxios\.(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /\brouter\.(get|post|put|patch|delete|visit)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
];

function extractLinks(relPath, text) {
  const out = [];
  const lines = text.split('\n');
  const isBackend = BACKEND_EXT.test(relPath);
  const isFrontend = FRONTEND_EXT.test(relPath);
  for (let i = 0; i < lines.length; i++) {
    if (isBackend) {
      for (const re of ROUTE_PATTERNS) {
        const m = re.exec(lines[i]);
        if (m) out.push({ side: 'route', method: m[1].toLowerCase(), url: normalizeUrl(m[2]), line: i + 1 });
      }
    }
    if (isFrontend) {
      for (const { re, methodGroup } of CONSUMER_PATTERNS) {
        const m = re.exec(lines[i]);
        if (!m) continue;
        const method = methodGroup === null ? null : m[1].toLowerCase();
        const url = methodGroup === null ? m[1] : m[2];
        out.push({ side: 'consumer', method, url: normalizeUrl(url), line: i + 1 });
      }
    }
  }
  return out;
}

function normalizeUrl(str) {
  let s = str.split('?')[0]
    .replace(/\$\{[^}]*\}/g, '*')
    .replace(/\{[^}]+\}/g, '*')
    .replace(/:(\w+)/g, '*');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

module.exports = { isTextFile, shouldSkipDir, extractSymbols, extractLinks, normalizeUrl };
