#!/usr/bin/env node
'use strict';
// Synchronous runner for api-tester — used by gateway to exec and capture JSON result
const { sendRequest, runXssTests } = require('./api-tester');

const opts = JSON.parse(process.argv[2] || '{}');

async function main() {
  try {
    if (opts.mode === 'xss') {
      const result = await runXssTests(opts.url, opts.method || 'GET', opts.param);
      process.stdout.write(JSON.stringify({ ok: true, result }));
    } else {
      const result = await sendRequest(opts);
      process.stdout.write(JSON.stringify({ ok: true, result }));
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message }));
  }
}

main();
