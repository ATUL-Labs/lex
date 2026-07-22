'use strict';

const TEXT_EXT = new Set([
  '.php', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.md', '.css', '.scss', '.vue', '.sh', '.yml', '.yaml', '.blade.php',
  '.sql', '.html', '.htm', '.json', '.xml', '.toml', '.ini', '.cfg', '.conf', '.env', '.txt',
  '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.scala', '.clj',
  '.ex', '.exs', '.erl', '.lua', '.r', '.dart', '.graphql', '.gql', '.prisma',
  '.sass', '.less', '.svelte', '.astro', '.twig', '.ejs', '.hbs', '.pug', '.jade',
  '.dockerfile', '.makefile', '.rake', '.gemspec',
]);
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv', 'storage', 'bootstrap', '.git', '.next', '.nuxt', 'target', 'bin', 'obj', '.svelte-kit', '.gradle', '.idea', '.vscode', '.terraform', '.cache', '.parcel-cache', 'tmp', '__snapshots__', '.angular', '.dart_tool', '.flutter-plugins']);

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
  /@(app|router|blueprint)\.(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"]+)[`'"]/i,
  /app\.(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"]+)[`'"]/i,
];

const CONSUMER_PATTERNS = [
  { re: /\bfetch\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: null },
  { re: /\baxios\.(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /\brouter\.(get|post|put|patch|delete|visit)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /\buseSWR\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: null },
  { re: /\buseQuery\s*\(\s*\[?[`'"](\/[^`'"\s]*)/, methodGroup: null },
  { re: /\buseMutation\s*\(\s*\[?[`'"](\/[^`'"\s]*)/, methodGroup: null },
  { re: /\$\.(get|post|put|delete)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /\$http\.(get|post|put|delete)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /XMLHttpRequest[\s\S]*?\.open\s*\(\s*[`'"](\w+)[`'"]\s*,\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /\brequests\.(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /\bhttpx\.(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: 1 },
  { re: /\burllib\.request\.urlopen\s*\(\s*[`'"](\/[^`'"\s]*)/, methodGroup: null },
];

function extractLinks(relPath, text) {
  const out = [];
  const lines = text.split('\n');
  const isBackend = BACKEND_EXT.test(relPath);
  const isFrontend = FRONTEND_EXT.test(relPath);
  const isPython = relPath.endsWith('.py');
  for (let i = 0; i < lines.length; i++) {
    if (isBackend) {
      for (const re of ROUTE_PATTERNS) {
        const m = re.exec(lines[i]);
        if (m) out.push({ side: 'route', method: m[1].toLowerCase(), url: normalizeUrl(m[2]), line: i + 1 });
      }
    }
    if (isFrontend || isPython) {
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

const SCHEMA_CREATE_RE = /Schema::(?:create|table)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/;
const COLUMN_RE = /\$table->([a-zA-Z]+)\(\s*['"]([a-zA-Z0-9_]+)['"]/;
const FOREIGN_ID_RE = /\$table->foreignId\(\s*['"]([a-zA-Z0-9_]+)['"]\)/;
const FOREIGN_ID_CONSTRAINED_RE = /\$table->foreignId\(\s*['"]([a-zA-Z0-9_]+)['"]\)\s*(?:->\w+\([^)]*\))*\s*->constrained\(\s*['"]([a-zA-Z0-9_]+)['"]\s*(?:,\s*['"]([a-zA-Z0-9_]+)['"]\s*)?\)/;
const CONSTRAINED_ARG_RE = /->constrained\(\s*['"]([a-zA-Z0-9_]+)['"]\s*(?:,\s*['"]([a-zA-Z0-9_]+)['"]\s*)?\)/;
const FOREIGN_REF_RE = /\$table->foreign\(\s*['"]([a-zA-Z0-9_]+)['"]\)\s*->references\(\s*['"]([a-zA-Z0-9_]+)['"]\)\s*->on\(\s*['"]([a-zA-Z0-9_]+)['"]/;

// PHP migration modifiers
const PHP_PK_RE = /\$table->primary\(/;
const PHP_UNIQUE_RE = /\$table->unique\(/;
const PHP_INDEX_RE = /\$table->index\(/;
const PHP_ID_RE = /\$table->id\s*\(\s*\)/;
const PHP_NULLABLE_RE = /->nullable\s*\(\s*\)/;
const PHP_DEFAULT_RE = /->default\(\s*([^)]+?)\s*\)/;
const PHP_ENUM_RE = /->enum\(\s*['"]([a-zA-Z0-9_]+)['"]\s*,\s*\[([^\]]+)\]/;
const PHP_TIMESTAMP_RE = /\$table->(timestamps|timestampsTz|softDeletes|rememberToken)\s*\(/;
const PHP_COL_MODIFIERS_RE = /->(nullable|default|unique|index|primary|autoIncrement|change|after|first|comment|useCurrent|useCurrentOnUpdate)\s*\(/g;

// SQL patterns
const SQL_CREATE_RE = /CREATE TABLE\s+[`"]?([a-zA-Z0-9_]+)[`"]?\s*\(/i;
const SQL_COLUMN_RE = /^\s*[`"]?([a-zA-Z0-9_]+)[`"]?\s+([A-Z]+[A-Z0-9(),\s]*)/i;
const SQL_FK_RE = /FOREIGN KEY\s*\(\s*[`"]?([a-zA-Z0-9_]+)[`"]?\s*\)\s*REFERENCES\s+[`"]?([a-zA-Z0-9_]+)[`"]?\s*\(\s*[`"]?([a-zA-Z0-9_]+)[`"]?\s*\)/i;
const SQL_PK_RE = /PRIMARY\s+KEY\s*\(\s*[`"]?([a-zA-Z0-9_]+)[`"]?\s*\)/i;
const SQL_PK_INLINE_RE = /\bPRIMARY\s+KEY\b/i;
const SQL_UNIQUE_RE = /UNIQUE\s*\(\s*[`"]?([a-zA-Z0-9_]+)[`"]?\s*\)/i;
const SQL_UNIQUE_INLINE_RE = /\bUNIQUE\b/i;
const SQL_NOT_NULL_RE = /\bNOT\s+NULL\b/i;
const SQL_DEFAULT_RE = /\bDEFAULT\s+([^\s,]+)/i;
const SQL_INDEX_RE = /\bINDEX\s*\(\s*[`"]?([a-zA-Z0-9_]+)[`"]?\s*\)/i;
const SQL_ENUM_RE = /\bENUM\s*\(\s*('[^']+'(?:\s*,\s*'[^']+')*)\)/i;
const SQL_AUTOINCREMENT_RE = /\bAUTOINCREMENT\b|\bAUTO_INCREMENT\b/i;

function inferFk(columnName) {
  if (!columnName.endsWith('_id')) return null;
  const base = columnName.slice(0, -3);
  return { fkTable: base + 's', fkColumn: 'id' };
}

function peekConstrainedArg(lines, i) {
  for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
    const m = CONSTRAINED_ARG_RE.exec(lines[j]);
    if (m) return [m[0], null, m[1], m[2]];
    // stop peeking once the statement ends without a constrained() call
    if (/;/.test(lines[j])) break;
  }
  return null;
}

function extractSchemaPhp(relPath, lines) {
  const tables = [];
  const columns = [];
  let currentTable = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cm = SCHEMA_CREATE_RE.exec(line);
    if (cm) {
      currentTable = cm[1];
      tables.push({ name: currentTable, line: i + 1 });
      depth = 0;
      continue;
    }
    if (currentTable) {
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      const fr = FOREIGN_REF_RE.exec(line);
      if (fr) {
        const existing = columns.find(c => c.table === currentTable && c.name === fr[1]);
        if (existing) { existing.fkTable = fr[3]; existing.fkColumn = fr[2]; }
        continue;
      }
      // Standalone primary/unique/index calls
      if (PHP_PK_RE.test(line)) {
        const m = /\$table->primary\(\s*[`'"]?([a-zA-Z0-9_]+)[`'"]?/.exec(line);
        if (m) {
          const col = columns.find(c => c.table === currentTable && c.name === m[1]);
          if (col) col.isPk = 1;
        }
        continue;
      }
      if (PHP_UNIQUE_RE.test(line)) {
        const m = /\$table->unique\(\s*[`'"]?([a-zA-Z0-9_]+)[`'"]?/.exec(line);
        if (m) {
          const col = columns.find(c => c.table === currentTable && c.name === m[1]);
          if (col) col.isUnique = 1;
        }
        continue;
      }
      if (PHP_INDEX_RE.test(line)) {
        const m = /\$table->index\(\s*[`'"]?([a-zA-Z0-9_]+)[`'"]?/.exec(line);
        if (m) {
          const col = columns.find(c => c.table === currentTable && c.name === m[1]);
          if (col) col.isIndex = 1;
        }
        continue;
      }
      // $table->id() is PK + autoIncrement
      if (PHP_ID_RE.test(line)) {
        columns.push({ table: currentTable, name: 'id', type: 'bigIncrements', fkTable: null, fkColumn: null, isPk: 1, isUnique: 0, isNullable: 0, isIndex: 0, defaultVal: null, enumValues: null, line: i + 1 });
        continue;
      }
      // Enum columns
      const enumM = PHP_ENUM_RE.exec(line);
      if (enumM) {
        const vals = enumM[2].split(',').map(v => v.trim().replace(/['"]/g, ''));
        const isNullable = PHP_NULLABLE_RE.test(line);
        columns.push({ table: currentTable, name: enumM[1], type: 'enum', fkTable: null, fkColumn: null, isPk: 0, isUnique: 0, isNullable: isNullable ? 1 : 0, isIndex: 0, defaultVal: null, enumValues: vals.join(','), line: i + 1 });
        if (depth <= 0 && i > 0 && /\}\s*\)\s*;/.test(line)) currentTable = null;
        continue;
      }
      const fid = FOREIGN_ID_RE.exec(line);
      const cm2 = COLUMN_RE.exec(line);
      if (cm2) {
        const name = cm2[2];
        let fkTable = null;
        let fkColumn = null;
        if (fid) {
          const explicit = FOREIGN_ID_CONSTRAINED_RE.exec(line) || (/;/.test(line) ? null : peekConstrainedArg(lines, i));
          if (explicit) {
            fkTable = explicit[2];
            fkColumn = explicit[3] || 'id';
          } else {
            const inferred = inferFk(name);
            if (inferred) { fkTable = inferred.fkTable; fkColumn = inferred.fkColumn; }
          }
        }
        const isNullable = PHP_NULLABLE_RE.test(line) ? 1 : 0;
        const isUnique = /->unique\s*\(\s*\)/.test(line) ? 1 : 0;
        const isPk = /->primary\s*\(\s*\)/.test(line) ? 1 : 0;
        const isIndex = /->index\s*\(\s*\)/.test(line) ? 1 : 0;
        const isAutoInc = /->autoIncrement\s*\(\s*\)/.test(line) ? 1 : 0;
        let defaultVal = null;
        const dm = PHP_DEFAULT_RE.exec(line);
        if (dm) defaultVal = dm[1].replace(/['"]/g, '').trim();
        // foreignId columns are PK by default if named 'id'
        const pkFlag = isPk || (name === 'id' && fid) || isAutoInc;
        columns.push({ table: currentTable, name, type: cm2[1], fkTable, fkColumn, isPk: pkFlag ? 1 : 0, isUnique, isNullable, isIndex, defaultVal, enumValues: null, line: i + 1 });
      }
      if (depth <= 0 && i > 0 && /\}\s*\)\s*;/.test(line)) currentTable = null;
    }
  }
  return { tables, columns };
}

function extractSchemaSql(relPath, lines) {
  const tables = [];
  const columns = [];
  let currentTable = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cm = SQL_CREATE_RE.exec(line);
    if (cm) { currentTable = cm[1]; tables.push({ name: currentTable, line: i + 1 }); continue; }
    if (currentTable) {
      const fk = SQL_FK_RE.exec(line);
      if (fk) {
        const existing = columns.find(c => c.table === currentTable && c.name === fk[1]);
        if (existing) { existing.fkTable = fk[2]; existing.fkColumn = fk[3]; }
        else columns.push({ table: currentTable, name: fk[1], type: null, fkTable: fk[2], fkColumn: fk[3], isPk: 0, isUnique: 0, isNullable: 0, isIndex: 0, defaultVal: null, enumValues: null, line: i + 1 });
        continue;
      }
      // Standalone PK/UNIQUE/INDEX constraints
      const pkM = SQL_PK_RE.exec(line);
      if (pkM) {
        const col = columns.find(c => c.table === currentTable && c.name === pkM[1]);
        if (col) col.isPk = 1;
        continue;
      }
      const uqM = SQL_UNIQUE_RE.exec(line);
      if (uqM) {
        const col = columns.find(c => c.table === currentTable && c.name === uqM[1]);
        if (col) col.isUnique = 1;
        continue;
      }
      const idxM = SQL_INDEX_RE.exec(line);
      if (idxM) {
        const col = columns.find(c => c.table === currentTable && c.name === idxM[1]);
        if (col) col.isIndex = 1;
        continue;
      }
      const colm = SQL_COLUMN_RE.exec(line);
      if (colm && !/^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|KEY|INDEX|CHECK|CREATE|ENGINE|DEFAULT)$/i.test(colm[1])) {
        const name = colm[1];
        const rawType = colm[2].trim();
        const isNotNull = SQL_NOT_NULL_RE.test(line);
        const isPk = SQL_PK_INLINE_RE.test(line) ? 1 : 0;
        const isUnique = SQL_UNIQUE_INLINE_RE.test(line) ? 1 : 0;
        const isAutoInc = SQL_AUTOINCREMENT_RE.test(line) ? 1 : 0;
        const isNullable = isNotNull ? 0 : 1;
        let defaultVal = null;
        const dm = SQL_DEFAULT_RE.exec(line);
        if (dm) defaultVal = dm[1].replace(/['"]/g, '').replace(/,$/, '').trim();
        let enumValues = null;
        const em = SQL_ENUM_RE.exec(line);
        if (em) enumValues = em[1].split(',').map(v => v.trim().replace(/'/g, '')).join(',');
        const cleanType = enumValues ? 'enum' : rawType.replace(/\s*(NOT NULL|NULL|PRIMARY KEY|UNIQUE|AUTOINCREMENT|AUTO_INCREMENT|DEFAULT\s+\S+)/gi, '').replace(/,.*$/, '').trim();
        columns.push({
          table: currentTable, name, type: cleanType,
          fkTable: null, fkColumn: null,
          isPk: isPk || isAutoInc, isUnique, isNullable, isIndex: 0, defaultVal, enumValues,
          line: i + 1
        });
      }
      if (/\)\s*;/.test(line)) currentTable = null;
    }
  }
  return { tables, columns };
}

function extractSchema(relPath, text) {
  const lines = text.split('\n');
  if (relPath.endsWith('.php')) return extractSchemaPhp(relPath, lines);
  if (relPath.endsWith('.sql')) return extractSchemaSql(relPath, lines);
  return { tables: [], columns: [] };
}

module.exports = { isTextFile, shouldSkipDir, extractSymbols, extractLinks, extractSchema, normalizeUrl };
