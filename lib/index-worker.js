'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractSymbols, extractLinks, extractSchema } = require('./extract');
const { shouldSkipFile } = require('./skip');

const SCHEMA_EXT = /\.(php|sql)$/;

function extractFromFile(root, rel) {
  let st;
  try { st = fs.statSync(path.join(root, rel)); } catch { return null; }
  if (shouldSkipFile(rel, st.size)) return null;

  let text;
  try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }

  const symbols = extractSymbols(rel, text);
  const links = extractLinks(rel, text);
  let schemaTables = [];
  let schemaColumns = [];
  if (SCHEMA_EXT.test(rel)) {
    const schema = extractSchema(rel, text);
    schemaTables = schema.tables;
    schemaColumns = schema.columns;
  }

  return {
    path: rel,
    mtimeMs: Math.trunc(st.mtimeMs),
    size: st.size,
    symbols,
    links,
    schemaTables,
    schemaColumns,
  };
}

const { parentPort, workerData } = require('node:worker_threads');

const { root, files } = workerData;
const BATCH = 50;
let sent = 0;

for (let i = 0; i < files.length; i++) {
  const result = extractFromFile(root, files[i]);
  if (result) {
    parentPort.postMessage({ type: 'file', data: result });
  }
  sent++;
  if (sent % BATCH === 0) {
    parentPort.postMessage({ type: 'progress', done: sent, total: files.length });
  }
}

parentPort.postMessage({ type: 'progress', done: sent, total: files.length });
parentPort.postMessage({ type: 'done' });
