'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

function parseEnv(root) {
  const envPath = path.join(root, '.env');
  const env = {};
  let text;
  try { text = fs.readFileSync(envPath, 'utf8'); } catch { return env; }
  for (const line of text.split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function detectDbConfig(root) {
  const env = parseEnv(root);
  const conn = env.DB_CONNECTION || env.DB_DRIVER || 'sqlite';
  if (conn === 'sqlite' || conn === 'sqlite3') {
    let dbPath = env.DB_DATABASE || 'database.sqlite';
    if (!path.isAbsolute(dbPath)) dbPath = path.join(root, dbPath);
    return { type: 'sqlite', path: dbPath };
  }
  if (conn === 'mysql' || conn === 'mariadb') {
    return {
      type: 'mysql',
      host: env.DB_HOST || '127.0.0.1',
      port: env.DB_PORT || '3306',
      database: env.DB_DATABASE || '',
      user: env.DB_USERNAME || env.DB_USER || 'root',
      password: env.DB_PASSWORD || '',
    };
  }
  if (conn === 'pgsql' || conn === 'postgres' || conn === 'postgresql') {
    return {
      type: 'postgres',
      host: env.DB_HOST || '127.0.0.1',
      port: env.DB_PORT || '5432',
      database: env.DB_DATABASE || '',
      user: env.DB_USERNAME || env.DB_USER || 'postgres',
      password: env.DB_PASSWORD || '',
    };
  }
  return null;
}

function querySqlite(config, sql, params) {
  let db;
  try {
    db = new DatabaseSync(config.path, { readOnly: true });
    const stmt = db.prepare(sql);
    const rows = stmt.all(...(params || []));
    return rows;
  } finally {
    if (db) try { db.close(); } catch {}
  }
}

function queryMysql(config, sql) {
  const args = [
    '-h', config.host,
    '-P', String(config.port),
    '-u', config.user,
  ];
  if (config.password) args.push('-p' + config.password);
  args.push(config.database, '-e', sql, '--batch', '--raw');
  try {
    const out = execSync('mysql ' + args.map(a => '"' + a.replace(/"/g, '\\"') + '"').join(' '), {
      timeout: 5000,
      encoding: 'utf8',
      shell: true,
    });
    return parseTabular(out);
  } catch (e) {
    throw new Error('mysql query failed: ' + (e.stderr || e.message));
  }
}

function queryPostgres(config, sql) {
  const env = { ...process.env };
  if (config.password) env.PGPASSWORD = config.password;
  const connStr = '-h ' + config.host + ' -p ' + config.port + ' -U ' + config.user + ' -d ' + config.database;
  try {
    const out = execSync('psql ' + connStr + ' -c "COPY (' + sql.replace(/"/g, '\\"') + ') TO STDOUT WITH CSV HEADER"', {
      timeout: 5000,
      encoding: 'utf8',
      env,
      shell: true,
    });
    return parseCsv(out);
  } catch (e) {
    throw new Error('psql query failed: ' + (e.stderr || e.message));
  }
}

function parseTabular(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map(line => {
    const vals = line.split('\t');
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] !== undefined ? vals[i] : null; });
    return row;
  });
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const parseLine = (l) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (inQ) {
        if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ''; }
        else if (c === '"') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] !== undefined ? vals[i] : null; });
    return row;
  });
}

function queryTableData(root, table, page, perPage) {
  const config = detectDbConfig(root);
  if (!config) throw new Error('No database detected. Add DB_CONNECTION to .env');
  const offset = (page - 1) * perPage;
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');

  if (config.type === 'sqlite') {
    if (!fs.existsSync(config.path)) throw new Error('SQLite file not found: ' + config.path);
    const countRow = querySqlite(config, 'SELECT COUNT(*) as cnt FROM "' + safeTable + '"');
    const total = countRow[0] ? countRow[0].cnt : 0;
    const rows = querySqlite(config, 'SELECT * FROM "' + safeTable + '" LIMIT ? OFFSET ?', [String(perPage), String(offset)]);
    return { rows, total, page, perPage, pages: Math.ceil(total / perPage) };
  }

  if (config.type === 'mysql') {
    const countResult = queryMysql(config, 'SELECT COUNT(*) as cnt FROM `' + safeTable + '`');
    const total = countResult[0] ? parseInt(countResult[0].cnt, 10) : 0;
    const rows = queryMysql(config, 'SELECT * FROM `' + safeTable + '` LIMIT ' + perPage + ' OFFSET ' + offset);
    return { rows, total, page, perPage, pages: Math.ceil(total / perPage) };
  }

  if (config.type === 'postgres') {
    const countResult = queryPostgres(config, 'SELECT COUNT(*) as cnt FROM "' + safeTable + '"');
    const total = countResult[0] ? parseInt(countResult[0].cnt, 10) : 0;
    const rows = queryPostgres(config, 'SELECT * FROM "' + safeTable + '" LIMIT ' + perPage + ' OFFSET ' + offset);
    return { rows, total, page, perPage, pages: Math.ceil(total / perPage) };
  }

  throw new Error('Unsupported database type: ' + config.type);
}

module.exports = { detectDbConfig, queryTableData, parseEnv };
