'use strict';

/**
 * Dev Loop — continuous test-fix cycle for AI agents
 *
 * Workflow:
 *   1. Agent writes/modifies code (e.g. adds an API endpoint)
 *   2. Agent calls `lex devloop` (or `lex devloop src/api/users.js`)
 *   3. Dev loop:
 *      a. Finds all route endpoints from the index (or just routes in the changed file)
 *      b. Tests each endpoint with a quick GET (or the route's defined method)
 *      c. Captures console errors + app errors from the server
 *      d. Runs security scan on each response
 *      e. Returns a structured report: pass/fail per endpoint, errors, findings
 *   4. Agent fixes issues based on the report
 *   5. Repeat
 *
 * Also supports a "watch" mode that continuously monitors for file changes,
 * auto-tests affected endpoints, and writes results to .lex/devloop.json
 * that the agent can read at any time.
 */

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { URL } = require('node:url');
const { sendRequest } = require('./api-tester');

function checkServerAlive(baseUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(baseUrl);
      const port = parseInt(parsed.port || '80', 10);
      const hosts = [parsed.hostname];
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        hosts.push('::1');
      } else if (parsed.hostname === '::1') {
        hosts.push('127.0.0.1');
      }
      let resolved = false;
      let remaining = hosts.length;
      const tryHost = (host) => {
        if (resolved) return;
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
          if (!resolved) { resolved = true; socket.destroy(); resolve(true); }
        });
        socket.on('timeout', () => {
          socket.destroy();
          if (--remaining === 0 && !resolved) { resolved = true; resolve(false); }
        });
        socket.on('error', () => {
          socket.destroy();
          if (--remaining === 0 && !resolved) { resolved = true; resolve(false); }
        });
        socket.connect(port, host);
      };
      hosts.forEach(tryHost);
    } catch { resolve(false); }
  });
}

function getRoutesFromIndex(db, fileFilter) {
  let query = "SELECT DISTINCT url, method FROM links WHERE side = 'route'";
  const params = [];
  if (fileFilter) {
    query += " AND path = ?";
    params.push(fileFilter);
  }
  query += " ORDER BY url LIMIT 100";
  return db.prepare(query).all(...params);
}

function getConsumersFromIndex(db, fileFilter) {
  let query = "SELECT DISTINCT url, method FROM links WHERE side = 'consumer'";
  const params = [];
  if (fileFilter) {
    query += " AND path = ?";
    params.push(fileFilter);
  }
  query += " ORDER BY url LIMIT 50";
  return db.prepare(query).all(...params);
}

function resolveUrl(url, baseUrl) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return baseUrl + url;
  return baseUrl + '/' + url;
}

function detectBaseUrl(root) {
  const detected = detectAppUrl(root);
  if (detected) return detected;
  return `http://127.0.0.1:3000`;
}

function detectAppUrl(root) {
  try {
    const agentJson = JSON.parse(fs.readFileSync(path.join(root, '.lex', 'agent.json'), 'utf8'));
    if (agentJson.appUrl) return agentJson.appUrl;
    if (agentJson.appPort) return `http://127.0.0.1:${agentJson.appPort}`;
  } catch {}

  const runUrl = scanRunMd(root);
  if (runUrl) return runUrl;

  const port = detectAppPort(root);
  if (port) return `http://127.0.0.1:${port}`;
  return null;
}

function resolveAppUrl(root) {
  const url = detectAppUrl(root);
  if (!url) return Promise.resolve(null);
  return probeHost(url);
}

function probeHost(baseUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(baseUrl);
      const port = parseInt(parsed.port || '80', 10);
      const candidates = [];
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        candidates.push('127.0.0.1', '::1');
      } else if (parsed.hostname === '::1') {
        candidates.push('::1', '127.0.0.1');
      } else {
        resolve(baseUrl);
        return;
      }
      let resolved = false;
      let remaining = candidates.length;
      for (const host of candidates) {
        if (resolved) break;
        const socket = new net.Socket();
        socket.setTimeout(1500);
        socket.on('connect', () => {
          if (!resolved) {
            resolved = true;
            socket.destroy();
            const hostPart = host.includes(':') ? `[${host}]` : host;
            resolve(`${parsed.protocol}//${hostPart}:${port}`);
          }
        });
        socket.on('timeout', () => {
          socket.destroy();
          if (--remaining === 0 && !resolved) { resolved = true; resolve(baseUrl); }
        });
        socket.on('error', () => {
          socket.destroy();
          if (--remaining === 0 && !resolved) { resolved = true; resolve(baseUrl); }
        });
        socket.connect(port, host);
      }
    } catch { resolve(baseUrl); }
  });
}

function scanRunMd(root) {
  try {
    const content = fs.readFileSync(path.join(root, '.lex', 'pages', 'run.md'), 'utf8');
    const portPatterns = [
      /--port\s+(\d{4,5})/i,
      /port\s*[:=]\s*['"]?(\d{4,5})['"]?/i,
      /listen\s*\(\s*['"]?(\d{4,5})/i,
      /\b(?:APP_PORT|PORT|SERVER_PORT|API_PORT)\s*=\s*(\d{4,5})/i,
    ];
    for (const re of portPatterns) {
      const m = content.match(re);
      if (m) {
        const port = parseInt(m[1], 10);
        if (port >= 3000 && port <= 9999) return `http://127.0.0.1:${port}`;
      }
    }
    const urlSection = content.match(/##\s*Key URLs[\s\S]*?(?=\n##\s|$)/i);
    if (urlSection) {
      const urlMatch = urlSection[0].match(/https?:\/\/[^\s|)]+/i);
      if (urlMatch) {
        const u = new URL(urlMatch[0]);
        return `${u.protocol}//${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`;
      }
    }
  } catch {}
  return null;
}

function detectAppPort(root) {
  const checks = [
    () => scanEnvForPort(path.join(root, '.env')),
    () => scanEnvForPort(path.join(root, 'pyservices', '.env')),
    () => scanEnvForPort(path.join(root, 'converterv0.0.1', '.env')),
    () => scanEnvForPort(path.join(root, 'v0.0.1', '.env')),
    () => scanDockerComposeForPort(root),
    () => scanDockerComposeForPort(path.join(root, 'pyservices')),
    () => scanSourceForPort(root),
  ];
  for (const check of checks) {
    const port = check();
    if (port) return port;
  }
  return null;
}

function scanEnvForPort(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const patterns = [
      /^(?:APP_PORT|PORT|SERVER_PORT|API_PORT|WEB_PORT)\s*=\s*(\d+)/im,
      /^(?:APP_URL|API_URL|SERVER_URL|BASE_URL)\s*=\s*https?:\/\/[^:]+:(\d+)/im,
    ];
    for (const re of patterns) {
      const m = content.match(re);
      if (m) return parseInt(m[1], 10);
    }
  } catch {}
  return null;
}

function scanDockerComposeForPort(dir) {
  const files = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const portMatches = content.matchAll(/["'](\d+):\1["']/g);
      for (const m of portMatches) {
        const port = parseInt(m[1], 10);
        if (port >= 3000 && port <= 9999) return port;
      }
    } catch {}
  }
  return null;
}

function scanSourceForPort(root) {
  const commonPorts = [3000, 3001, 4000, 5000, 8000, 8080, 8443, 9000, 9001];
  const patterns = [
    /--port\s+(\d{4,5})/,
    /port\s*[:=]\s*['"]?(\d{4,5})['"]?/,
    /listen\s*\(\s*['"]?(\d{4,5})/,
    /PORT\s*=\s*(\d{4,5})/,
    /host:\s*['"]0\.0\.0\.0['"],?\s*port:\s*(\d{4,5})/i,
  ];
  const scanDir = (dir, depth) => {
    if (depth > 2) return null;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.venv' ||
          entry.name === 'venv' || entry.name === '__pycache__' || entry.name === 'dist' ||
          entry.name === 'build' || entry.name === '.lex' || entry.name === 'target') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = scanDir(fullPath, depth + 1);
        if (found) return found;
      } else if (entry.isFile() && /\.(py|js|ts|jsx|tsx|go|rs|rb|php|java|sh|env|yml|yaml|toml|cfg|ini|conf)$/i.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const re of patterns) {
            const m = content.match(re);
            if (m) {
              const port = parseInt(m[1], 10);
              if (commonPorts.includes(port) || (port >= 3000 && port <= 9999)) return port;
            }
          }
        } catch {}
      }
    }
    return null;
  };
  return scanDir(root, 0);
}

async function testEndpoint(url, method, baseUrl, opts) {
  opts = opts || {};
  const fullUrl = resolveUrl(url, baseUrl);
  if (!fullUrl) return { url, method, skipped: true, reason: 'could not resolve URL' };

  const reqOpts = {
    url: fullUrl,
    method: method || 'GET',
    scan: true,
    timeout: 8000,
  };
  if (opts.authCookie) {
    reqOpts.headers = { 'Cookie': opts.authCookie };
  }
  if (opts.authToken) {
    reqOpts.headers = reqOpts.headers || {};
    reqOpts.headers['Authorization'] = opts.authToken.startsWith('Bearer ') ? opts.authToken : 'Bearer ' + opts.authToken;
  }

  try {
    const result = await sendRequest(reqOpts);
    const status = result.status;
    const location = result.headers && result.headers.location ? result.headers.location : '';
    const isHttps = fullUrl.startsWith('https://');

    const findings = (result.findings || []).filter(f => {
      if (f.type === 'missing-header' && f.message.includes('strict-transport-security') && !isHttps) {
        return false;
      }
      return true;
    });

    let category = 'fail';
    let ok = false;
    if (status >= 200 && status < 300) {
      category = 'pass';
      ok = true;
    } else if (status === 302 || status === 307 || status === 301) {
      if (/\/login|\/signin|\/auth|\/session\/new/i.test(location)) {
        category = 'auth-required';
        ok = true;
      } else {
        category = 'redirect';
        ok = true;
      }
    } else if (status === 401 || status === 403) {
      category = 'auth-required';
      ok = true;
    } else if (status === 404) {
      category = 'not-found';
      ok = false;
    } else if (status === 405) {
      category = 'method-not-allowed';
      ok = true;
    } else if (status === 419) {
      category = 'csrf-required';
      ok = true;
    } else if (status >= 500) {
      category = 'server-error';
      ok = false;
    } else if (status === 429) {
      category = 'rate-limited';
      ok = true;
    }

    return {
      url,
      method: method || 'GET',
      fullUrl,
      status,
      responseTime: result.responseTime,
      ok,
      category,
      location,
      findings,
      bodyPreview: (result.body || '').substring(0, 500),
      bodyLength: (result.body || '').length,
    };
  } catch (err) {
    const msg = err.message || '';
    let friendlyError = msg;
    if (msg.includes('ECONNREFUSED') || msg.includes('connect ECONNREFUSED')) {
      const portMatch = fullUrl.match(/:(\d+)/);
      const port = portMatch ? portMatch[1] : '';
      friendlyError = `App server not running on ${fullUrl.split('/api')[0]} (port ${port}). Start your app server first, or set appUrl in .lex/agent.json to the correct URL.`;
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      friendlyError = `Request timed out — server at ${fullUrl.split('/api')[0]} may be slow or hanging.`;
    }
    return {
      url,
      method: method || 'GET',
      fullUrl,
      error: friendlyError,
      ok: false,
      category: 'connection-error',
      connectionRefused: msg.includes('ECONNREFUSED'),
    };
  }
}

async function runDevLoop(db, root, opts) {
  opts = opts || {};
  const baseUrl = opts.baseUrl || detectBaseUrl(root);
  const fileFilter = opts.file || null;

  const routes = getRoutesFromIndex(db, fileFilter);
  const consumers = fileFilter ? getConsumersFromIndex(db, fileFilter) : [];

  const endpoints = [];
  const seen = new Set();

  for (const r of routes) {
    const key = (r.method || 'GET') + ' ' + r.url;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({ url: r.url, method: r.method || 'GET', source: 'route' });
  }

  for (const c of consumers) {
    const key = (c.method || 'GET') + ' ' + c.url;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({ url: c.url, method: c.method || 'GET', source: 'consumer' });
  }

  if (!endpoints.length) {
    return {
      ok: true,
      summary: 'No API endpoints found' + (fileFilter ? ' in ' + fileFilter : ' in project'),
      endpoints: [],
      errors: [],
      totalTests: 0,
      passed: 0,
      failed: 0,
      findings: 0,
    };
  }

  const serverUp = await checkServerAlive(baseUrl);
  if (!serverUp) {
    const report = {
      ok: false,
      baseUrl,
      fileFilter,
      totalTests: endpoints.length,
      passed: 0,
      failed: endpoints.length,
      findings: 0,
      endpoints: endpoints.map(ep => ({
        url: ep.url,
        method: ep.method,
        source: ep.source,
        ok: false,
        skipped: true,
        error: `App server not running at ${baseUrl}. Start your app server first, or set appUrl in .lex/agent.json to the correct URL.`,
      })),
      errors: [{ endpoint: '*', method: '*', error: `App server not running at ${baseUrl}` }],
      summary: `0/${endpoints.length} endpoints passed — app server at ${baseUrl} is not running`,
      timestamp: new Date().toISOString(),
    };
    const reportPath = path.join(root, '.lex', 'devloop.json');
    try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8'); } catch {}
    return report;
  }

  const results = [];
  for (const ep of endpoints) {
    const result = await testEndpoint(ep.url, ep.method, baseUrl, {
      authCookie: opts.authCookie,
      authToken: opts.authToken,
    });
    result.source = ep.source;
    results.push(result);
  }

  const byCategory = {};
  for (const r of results) {
    const c = r.category || 'fail';
    byCategory[c] = (byCategory[c] || 0) + 1;
  }
  const passed = byCategory['pass'] || 0;
  const authRequired = (byCategory['auth-required'] || 0) + (byCategory['csrf-required'] || 0);
  const redirects = byCategory['redirect'] || 0;
  const notFound = byCategory['not-found'] || 0;
  const serverErrors = byCategory['server-error'] || 0;
  const methodNotAllowed = byCategory['method-not-allowed'] || 0;
  const rateLimited = byCategory['rate-limited'] || 0;
  const connErrors = byCategory['connection-error'] || 0;
  const totalFindings = results.reduce((s, r) => s + (r.findings ? r.findings.length : 0), 0);

  const errors = [];
  for (const r of results) {
    if (r.error) {
      errors.push({ endpoint: r.url, method: r.method, error: r.error });
    } else if (r.status >= 500) {
      errors.push({ endpoint: r.url, method: r.method, error: `Server error ${r.status}`, bodyPreview: r.bodyPreview });
    } else if (r.findings) {
      for (const f of r.findings) {
        if (f.severity === 'high') {
          errors.push({ endpoint: r.url, method: r.method, error: `[${f.severity}] ${f.type}: ${f.message}` });
        }
      }
    }
  }

  const parts = [];
  parts.push(`${passed} OK`);
  if (authRequired) parts.push(`${authRequired} require auth`);
  if (redirects) parts.push(`${redirects} redirect`);
  if (notFound) parts.push(`${notFound} not found`);
  if (methodNotAllowed) parts.push(`${methodNotAllowed} method not allowed`);
  if (rateLimited) parts.push(`${rateLimited} rate limited`);
  if (serverErrors) parts.push(`${serverErrors} server errors`);
  if (connErrors) parts.push(`${connErrors} connection errors`);
  parts.push(`${totalFindings} findings`);
  parts.push(`${errors.length} actionable errors`);

  const summary = `${results.length} endpoints tested: ${parts.join(', ')}`;

  const report = {
    ok: true,
    baseUrl,
    fileFilter,
    totalTests: results.length,
    passed,
    authRequired,
    redirects,
    notFound,
    serverErrors,
    failed: results.filter(r => !r.ok).length,
    findings: totalFindings,
    byCategory,
    endpoints: results,
    errors,
    summary,
    timestamp: new Date().toISOString(),
  };

  const reportPath = path.join(root, '.lex', 'devloop.json');
  const prevReport = (() => { try { return JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { return null; } })();

  if (opts.diff && prevReport) {
    report.diff = computeDiff(prevReport, report);
  }

  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8'); } catch {}

  return report;
}

function computeDiff(prev, curr) {
  const prevMap = {};
  for (const ep of (prev.endpoints || [])) {
    prevMap[ep.method + ' ' + ep.url] = ep;
  }
  const currMap = {};
  for (const ep of (curr.endpoints || [])) {
    currMap[ep.method + ' ' + ep.url] = ep;
  }

  const changed = [];
  const newEndpoints = [];
  const removed = [];

  for (const key of Object.keys(currMap)) {
    const c = currMap[key];
    const p = prevMap[key];
    if (!p) {
      newEndpoints.push(c);
    } else if (c.status !== p.status || c.category !== (p.category || 'fail') || (c.error || '') !== (p.error || '')) {
      changed.push({
        endpoint: key,
        before: { status: p.status, category: p.category || 'fail', error: p.error },
        after: { status: c.status, category: c.category, error: c.error },
      });
    }
  }

  for (const key of Object.keys(prevMap)) {
    if (!currMap[key]) {
      removed.push(prevMap[key]);
    }
  }

  const prevErrors = (prev.errors || []).length;
  const currErrors = (curr.errors || []).length;

  return {
    changed,
    newEndpoints,
    removed,
    errorDelta: currErrors - prevErrors,
    findingDelta: curr.findings - (prev.findings || 0),
    passDelta: curr.passed - (prev.passed || 0),
    summary: `${changed.length} changed, ${newEndpoints.length} new, ${removed.length} removed, ${currErrors - prevErrors >= 0 ? '+' : ''}${currErrors - prevErrors} errors, ${curr.findings - (prev.findings || 0) >= 0 ? '+' : ''}${curr.findings - (prev.findings || 0)} findings`,
  };
}

function formatReport(report) {
  const lines = [];
  lines.push('Dev Loop Report — ' + report.timestamp);
  lines.push('Base URL: ' + report.baseUrl);
  if (report.fileFilter) lines.push('Filtered to: ' + report.fileFilter);
  lines.push('');
  lines.push('Summary: ' + report.summary);
  lines.push('');

  if (report.diff) {
    lines.push('--- Diff vs previous run ---');
    lines.push(report.diff.summary);
    if (report.diff.changed.length) {
      lines.push('');
      lines.push('Changed endpoints:');
      for (const c of report.diff.changed) {
        lines.push(`  ${c.endpoint}: ${c.before.status} ${c.before.category} -> ${c.after.status} ${c.after.category}`);
      }
    }
    if (report.diff.newEndpoints.length) {
      lines.push('');
      lines.push('New endpoints:');
      for (const e of report.diff.newEndpoints) {
        lines.push(`  ${e.method} ${e.url} -> ${e.status} ${e.category}`);
      }
    }
    lines.push('');
  }

  const catIcons = {
    'pass': 'OK',
    'auth-required': 'AUTH',
    'csrf-required': 'CSRF',
    'redirect': 'REDIR',
    'not-found': '404',
    'method-not-allowed': '405',
    'rate-limited': '429',
    'server-error': 'ERR',
    'connection-error': 'CONN',
    'fail': 'FAIL',
  };

  for (const ep of report.endpoints) {
    const icon = catIcons[ep.category] || (ep.ok ? 'OK' : 'FAIL');
    const status = ep.status ? ep.status + ' ' : '';
    const time = ep.responseTime ? ` (${ep.responseTime}ms)` : '';
    lines.push(`  [${icon}] ${ep.method} ${ep.url} -> ${status}${time}`);

    if (ep.error) {
      lines.push(`    ERROR: ${ep.error}`);
    }
    if (ep.findings && ep.findings.length) {
      for (const f of ep.findings) {
        lines.push(`    [${f.severity}] ${f.type}: ${f.message}`);
      }
    }
  }

  if (report.errors.length) {
    lines.push('');
    lines.push('Actionable errors (' + report.errors.length + '):');
    for (const e of report.errors) {
      lines.push(`  ${e.method} ${e.endpoint}: ${e.error}`);
    }
  }

  return lines.join('\n');
}

module.exports = { runDevLoop, formatReport, testEndpoint, detectBaseUrl, detectAppUrl, detectAppPort, checkServerAlive, resolveAppUrl };
