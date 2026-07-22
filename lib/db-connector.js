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
  const configPath = path.join(root, '.lex', 'config.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.database && config.database.type) {
      const db = config.database;
      if (db.type === 'sqlite' || db.type === 'sqlite3') {
        if (!db.path || !fs.existsSync(db.path)) return null;
        return { type: 'sqlite', path: db.path };
      }
      if (db.type === 'mysql' || db.type === 'mariadb') {
        return {
          type: 'mysql',
          host: db.host || '127.0.0.1',
          port: db.port || '3306',
          database: db.name || '',
          user: db.user || 'root',
          password: db.password || '',
        };
      }
      if (db.type === 'postgres' || db.type === 'postgresql' || db.type === 'pgsql') {
        return {
          type: 'postgres',
          host: db.host || '127.0.0.1',
          port: db.port || '5432',
          database: db.name || '',
          user: db.user || 'postgres',
          password: db.password || '',
        };
      }
    }
  } catch {}

  const env = parseEnv(root);
  const conn = env.DB_CONNECTION || env.DB_DRIVER;
  if (!conn) return null;

  if (conn === 'sqlite' || conn === 'sqlite3') {
    let dbPath = env.DB_DATABASE || '';
    if (!dbPath) return null;
    if (!path.isAbsolute(dbPath)) dbPath = path.join(root, dbPath);
    if (!fs.existsSync(dbPath)) return null;
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

function queryDbSchema(root) {
  const config = detectDbConfig(root);
  if (!config) return null;

  if (config.type === 'sqlite') return querySqliteSchema(config);
  if (config.type === 'mysql') return queryMysqlSchema(config);
  if (config.type === 'postgres') return queryPostgresSchema(config);
  return null;
}

function querySqliteSchema(config) {
  const tables = [];
  const tableRows = querySqlite(config, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  for (const t of tableRows) {
    const tableName = t.name;
    const cols = querySqlite(config, 'PRAGMA table_info("' + tableName + '")');
    const fkRows = querySqlite(config, 'PRAGMA foreign_key_list("' + tableName + '")');
    const indexRows = querySqlite(config, 'PRAGMA index_list("' + tableName + '")');

    const fkMap = {};
    for (const fk of fkRows) fkMap[fk.from] = { table: fk.table, column: fk.to };

    const indexMap = {};
    for (const idx of indexRows) {
      const idxCols = querySqlite(config, 'PRAGMA index_info("' + idx.name + '")');
      for (const ic of idxCols) {
        if (!indexMap[ic.name]) indexMap[ic.name] = { unique: idx.unique ? 1 : 0 };
        else if (idx.unique) indexMap[ic.name].unique = 1;
      }
    }

    const columns = cols.map(c => ({
      name: c.name,
      type: c.type || null,
      isPk: c.pk ? 1 : 0,
      isUnique: 0,
      isNullable: c.notnull ? 0 : 1,
      isIndex: indexMap[c.name] ? 1 : 0,
      defaultVal: c.dflt_value !== null ? c.dflt_value.replace(/^['"]|['"]$/g, '') : null,
      enumValues: null,
      fkTable: fkMap[c.name] ? fkMap[c.name].table : null,
      fkColumn: fkMap[c.name] ? fkMap[c.name].column : null,
    }));

    tables.push({ name: tableName, columns });
  }
  return { type: 'sqlite', tables };
}

function queryMysqlSchema(config) {
  const tableRows = queryMysql(config, 'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = "' + config.database + '" ORDER BY TABLE_NAME');
  const tables = [];
  for (const t of tableRows) {
    const tableName = t.TABLE_NAME || t.table_name;
    const colRows = queryMysql(config,
      'SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = "' + config.database + '" AND TABLE_NAME = "' + tableName + '" ORDER BY ORDINAL_POSITION'
    );
    const fkRows = queryMysql(config,
      'SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = "' + config.database + '" AND TABLE_NAME = "' + tableName + '" AND REFERENCED_TABLE_NAME IS NOT NULL'
    );
    const fkMap = {};
    for (const fk of fkRows) fkMap[fk.COLUMN_NAME || fk.column_name] = { table: fk.REFERENCED_TABLE_NAME || fk.referenced_table_name, column: fk.REFERENCED_COLUMN_NAME || fk.referenced_column_name };

    const columns = colRows.map(c => {
      const colName = c.COLUMN_NAME || c.column_name;
      const dataType = c.DATA_TYPE || c.data_type || '';
      const colType = c.COLUMN_TYPE || c.column_type || dataType;
      const colKey = c.COLUMN_KEY || c.column_key || '';
      const extra = c.EXTRA || c.extra || '';
      let enumValues = null;
      const enumM = /enum\((.*)\)/i.exec(colType);
      if (enumM) enumValues = enumM[1].split(',').map(v => v.trim().replace(/'/g, '')).join(',');
      return {
        name: colName,
        type: enumValues ? 'enum' : (colType || dataType),
        isPk: colKey === 'PRI' ? 1 : 0,
        isUnique: colKey === 'UNI' ? 1 : 0,
        isNullable: (c.IS_NULLABLE || c.is_nullable) === 'YES' ? 1 : 0,
        isIndex: colKey === 'MUL' ? 1 : 0,
        defaultVal: c.COLUMN_DEFAULT !== null && c.COLUMN_DEFAULT !== undefined ? String(c.COLUMN_DEFAULT) : null,
        enumValues,
        fkTable: fkMap[colName] ? fkMap[colName].table : null,
        fkColumn: fkMap[colName] ? fkMap[colName].column : null,
      };
    });
    tables.push({ name: tableName, columns });
  }
  return { type: 'mysql', tables };
}

function queryPostgresSchema(config) {
  const tableRows = queryPostgres(config,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const tables = [];
  for (const t of tableRows) {
    const tableName = t.table_name;
    const colRows = queryPostgres(config,
      "SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '" + tableName + "' ORDER BY ordinal_position"
    );
    const pkRows = queryPostgres(config,
      "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '\"' || '\"' || '" + tableName + "' || '\"' || '\"'::regclass AND i.indisprimary"
    );
    const pkSet = new Set(pkRows.map(r => r.attname));

    const fkRows = queryPostgres(config,
      "SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = '" + tableName + "'"
    );
    const fkMap = {};
    for (const fk of fkRows) fkMap[fk.column_name] = { table: fk.foreign_table, column: fk.foreign_column };

    const idxRows = queryPostgres(config,
      "SELECT a.attname, i.indisunique FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '\"' || '\"' || '" + tableName + "' || '\"' || '\"'::regclass AND NOT i.indisprimary"
    );
    const idxMap = {};
    for (const idx of idxRows) {
      if (!idxMap[idx.attname]) idxMap[idx.attname] = { unique: idx.indisunique ? 1 : 0 };
      else if (idx.indisunique) idxMap[idx.attname].unique = 1;
    }

    const columns = colRows.map(c => {
      const dataType = c.data_type;
      const udt = c.udt_name;
      let enumValues = null;
      let type = dataType;
      if (dataType === 'USER-DEFINED' && udt) {
        const enumValRows = queryPostgres(config,
          "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = '" + udt + "' ORDER BY e.enumsortorder"
        );
        if (enumValRows.length) {
          enumValues = enumValRows.map(r => r.enumlabel).join(',');
          type = 'enum';
        }
      }
      let defaultVal = null;
      if (c.column_default) {
        defaultVal = c.column_default.replace(/^['"]|['"]$/g, '').replace(/::.*$/, '').trim();
      }
      return {
        name: c.column_name,
        type,
        isPk: pkSet.has(c.column_name) ? 1 : 0,
        isUnique: idxMap[c.column_name] && idxMap[c.column_name].unique ? 1 : 0,
        isNullable: c.is_nullable === 'YES' ? 1 : 0,
        isIndex: idxMap[c.column_name] ? 1 : 0,
        defaultVal,
        enumValues,
        fkTable: fkMap[c.column_name] ? fkMap[c.column_name].table : null,
        fkColumn: fkMap[c.column_name] ? fkMap[c.column_name].column : null,
      };
    });
    tables.push({ name: tableName, columns });
  }
  return { type: 'postgres', tables };
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

module.exports = { detectDbConfig, queryDbSchema, queryTableData, parseEnv };
