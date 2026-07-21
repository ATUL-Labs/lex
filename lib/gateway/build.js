'use strict';

/**
 * Gateway build commands: audit, integrity, errors
 */

const fs = require('node:fs');
const path = require('node:path');

function handle(cmd, args, root) {
  // --- errors ---
  if (cmd === 'errors') {
    const { execFileSync } = require('child_process');
    const fetchScript = path.join(__dirname, '..', 'fetch.js');
    const nodeBin = process.execPath;
    let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
    try {
      const info = JSON.parse(fs.readFileSync(path.join(root, '.lex', 'server.json'), 'utf8'));
      if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
    } catch {}
    for (const port of ports) {
      try {
        const out = execFileSync(nodeBin, [fetchScript, String(port)], { encoding: 'utf8', timeout: 5000, shell: false });
        const result = JSON.parse(out);
        const parts = [];
        if (result.consoleErrors && result.consoleErrors.length) {
          parts.push('console errors (' + result.consoleErrors.length + '):');
          for (const e of result.consoleErrors) parts.push('  ' + e);
        }
        if (result.appErrors && result.appErrors.length) {
          parts.push('app errors (' + result.appErrors.length + '):');
          for (const e of result.appErrors) parts.push('  ' + e);
        }
        if (!parts.length) return { ok: true, output: 'no console errors captured\nno app errors captured', count: 0 };
        // Auto-persist to mistakes.md
        try {
          const mistakesPath = path.join(root, '.lex', 'pages', 'mistakes.md');
          let existing = '';
          try { existing = fs.readFileSync(mistakesPath, 'utf8'); } catch {}
          let nextNum = (existing.match(/^## (\d+)\./gm) || []).length + 1;
          if (!existing.endsWith('\n')) existing += '\n';
          existing += '\n## ' + nextNum + '. Auto-captured errors\n- when: ' + new Date().toISOString().substring(0, 10) + '\n- errors:\n' + parts.map(p => '  ' + p).join('\n') + '\n';
          fs.writeFileSync(mistakesPath, existing, 'utf8');
        } catch {}
        return { ok: true, output: parts.join('\n'), count: result.consoleErrors.length + result.appErrors.length };
      } catch {}
    }
    return { ok: true, output: 'no lex server running - start one with: lex serve or lex watch', count: 0 };
  }

  // --- audit ---
  if (cmd === 'audit') {
    const { execFileSync } = require('child_process');
    const nodeBin = process.execPath;
    const lexBin = path.join(__dirname, '..', '..', 'bin', 'lex.js');
    const cliArgs = ['audit'];
    const urls = Array.isArray(args) ? args : (typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : []);
    for (const u of urls) {
      if (typeof u === 'string' && u.startsWith('http')) cliArgs.push(u);
    }
    cliArgs.push('--json');
    try {
      const out = execFileSync(nodeBin, [lexBin, ...cliArgs], {
        cwd: root,
        timeout: 30000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      const result = JSON.parse(out);
      if (!result.ok) return { ok: false, error: result.error };
      const { formatAuditResult } = require('../browser-audit');
      return { ok: true, output: formatAuditResult(result), count: result.totalErrors + result.totalNetworkErrors };
    } catch (e) {
      return { ok: false, error: 'audit failed: ' + (e.message || String(e)).substring(0, 200) };
    }
  }

  // --- integrity ---
  if (cmd === 'integrity') {
    const { runIntegrityCheck, formatIntegrityResult } = require('../integrity-check');
    const fileArgs = Array.isArray(args) ? args.filter(a => typeof a === 'string' && !a.startsWith('--')) : (typeof args === 'string' ? args.split(/\s+/).filter(a => a && !a.startsWith('--')) : []);
    let targets = fileArgs.length ? fileArgs : [];
    if (!targets.length) {
      try {
        targets = fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => path.join(root, f));
      } catch {}
    }
    if (!targets.length) {
      return { ok: false, error: 'no HTML files found' };
    }
    const allResults = [];
    for (const target of targets) {
      try {
        const result = runIntegrityCheck(target, { root });
        allResults.push(result);
      } catch (e) {}
    }
    let output = '';
    for (const r of allResults) {
      output += formatIntegrityResult(r) + '\n';
    }
    const totalCritical = allResults.reduce((s, r) => s + (r.summary?.critical || 0), 0);
    const totalImportant = allResults.reduce((s, r) => s + (r.summary?.important || 0), 0);
    return { ok: true, output, count: totalCritical + totalImportant, results: allResults };
  }

  // --- test (API endpoint tester) ---
  if (cmd === 'test') {
    const { execSync } = require('child_process');
    const argObj = Array.isArray(args) ? args[0] : (typeof args === 'string' ? JSON.parse(args) : args);
    if (!argObj || !argObj.url) return { ok: false, error: 'test requires {url, method?, headers?, body?, scan?}' };

    const helperScript = path.join(__dirname, '..', 'api-tester-runner.js');
    try {
      const out = execSync(`"${process.execPath}" "${helperScript}" ${JSON.stringify(JSON.stringify(argObj))}`, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const result = JSON.parse(out);
      if (!result.ok) return result;
      const r = result.result;
      if (argObj.mode === 'xss') {
        const lines = ['XSS Test: ' + r.url + ' (' + r.method + ' param=' + r.param + ')',
          r.summary,
          r.vulnerabilities.length ? '  VULNERABLE PAYLOADS:' : '  No vulnerabilities found.'];
        for (const v of r.vulnerabilities) {
          lines.push('    ' + v.payload);
          for (const f of v.findings) lines.push('      ' + f.message);
        }
        if (r.errors.length) {
          lines.push('  ERRORS:');
          for (const e of r.errors) lines.push('    ' + e.payload + ': ' + e.error);
        }
        return { ok: true, output: lines.join('\n'), result: r };
      }
      const lines = [
        r.status + ' ' + r.statusText + ' (' + r.responseTime + 'ms)',
        'Headers:',
      ];
      for (const [k, v] of Object.entries(r.headers)) lines.push('  ' + k + ': ' + v);
      if (r.findings && r.findings.length) {
        lines.push('Security findings (' + r.findings.length + '):');
        for (const f of r.findings) lines.push('  [' + f.severity + '] ' + f.type + ': ' + f.message);
      } else if (r.findings) {
        lines.push('Security findings: none');
      }
      lines.push('Body (' + (r.bodyTruncated ? 'truncated, ' : '') + r.body.length + ' chars):');
      lines.push(r.body.substring(0, 2000));
      return { ok: true, output: lines.join('\n'), result: r };
    } catch (e) {
      return { ok: false, error: 'test failed: ' + (e.message || String(e)).substring(0, 200) };
    }
  }

  // --- devloop (continuous test-fix cycle) ---
  if (cmd === 'devloop') {
    const argObj = Array.isArray(args) ? (typeof args[0] === 'string' ? { file: args[0] } : args[0]) : (typeof args === 'string' ? { file: args } : args);
    const { runDevLoop, formatReport } = require('../dev-loop');
    const { openDb } = require('../indexer');
    let db;
    try { db = openDb(root); } catch { return { ok: false, error: 'index not found - run lex refresh first' }; }
    return runDevLoop(db, root, argObj || {}).then(report => {
      return { ok: true, output: formatReport(report), report };
    }).catch(err => ({ ok: false, error: 'devloop failed: ' + err.message }));
  }

  // --- convert (image format converter) ---
  if (cmd === 'convert') {
    const argObj = Array.isArray(args) ? (typeof args[0] === 'string' ? { input: args[0], output: args[1] } : args[0]) : (typeof args === 'string' ? { input: args.split(/\s+/)[0], output: args.split(/\s+/)[1] } : args);
    if (!argObj || !argObj.input || !argObj.output) {
      return { ok: false, error: 'convert requires {input, output, width?, height?, size?, multi?, scale?}' };
    }
    const { convertImage } = require('../image-convert');
    return convertImage(argObj.input, argObj.output, argObj).then(result => {
      if (!result.ok) return result;
      const lines = ['Converted ' + argObj.input + ' -> ' + argObj.output];
      if (result.dimensions) lines.push('Dimensions: ' + result.dimensions + ', Format: ' + result.format + ', Browser: ' + result.browser);
      if (result.sizes) lines.push('ICO sizes: ' + result.sizes.join(', '));
      lines.push('Size: ' + (result.size || 0) + ' bytes');
      return { ok: true, output: lines.join('\n'), result };
    }).catch(err => ({ ok: false, error: 'convert failed: ' + err.message }));
  }

  return null;
}

module.exports = { handle };
