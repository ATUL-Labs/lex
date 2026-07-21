'use strict';

const MAX_SIZE = 1024 * 1024;

const DATA_DUMP_DIRS = /^(rag[-\w]*|corpus|datasets?|embeddings?|vectors?|data-dumps?|training-data|raw-data)\//i;
const DATA_DUMP_FILES = /\.(embeddings|vectors?|rag)\.(json|txt|bin)$/i;
const LARGE_JSON_THRESHOLD = 100 * 1024;

function shouldSkipFile(rel, size) {
  if (size > MAX_SIZE) return true;
  if (DATA_DUMP_DIRS.test(rel)) return true;
  if (DATA_DUMP_FILES.test(rel)) return true;
  if (rel.endsWith('.json') && size > LARGE_JSON_THRESHOLD) return true;
  if (rel.endsWith('.map') || rel.endsWith('.lock')) return true;
  return false;
}

function isDataDumpDir(rel) {
  return DATA_DUMP_DIRS.test(rel + '/');
}

module.exports = { shouldSkipFile, isDataDumpDir, MAX_SIZE, DATA_DUMP_DIRS, DATA_DUMP_FILES, LARGE_JSON_THRESHOLD };
