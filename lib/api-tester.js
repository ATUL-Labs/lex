'use strict';

/**
 * API Endpoint Tester
 *
 * Sends HTTP requests to any URL from the server (bypasses browser CORS).
 * Analyzes responses for security issues:
 * - Missing security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
 * - Reflected XSS (input reflected in response without encoding)
 * - SQL injection error signatures
 * - Open redirect vulnerability
 * - Information disclosure (stack traces, server version, debug info)
 * - CORS misconfiguration (wildcard origin with credentials)
 *
 * Usable by both the viewer UI and AI agents via the gateway.
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const SECURITY_HEADERS = [
  'content-security-policy',
  'x-frame-options',
  'strict-transport-security',
  'x-content-type-options',
  'x-xss-protection',
  'referrer-policy',
  'permissions-policy',
];

const SQL_ERROR_SIGNATURES = [
  /SQLSTATE\[/i,
  /ORA-\d{5}/i,
  /mysql_fetch\w*\(/i,
  /MySQL.*error/i,
  /mysqli?_\w+\([^)]*\).*:(?:\s*error|warning)/i,
  /You have an error in your SQL syntax/i,
  /Unclosed quotation mark after the character string/i,
  /PG::\w+Error/i,
  /SQLite3::\w+Error/i,
  /sqlite3\.OperationalError/i,
  /near "[^"]*": syntax error/i,
  /unterminated quoted string/i,
  /SQL.*syntax.*error/i,
  /PDOException/i,
  /Doctrine\\\\DBAL\\\\Exception/i,
];

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  "';alert(1);//",
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '<svg onload=alert(1)>',
];

const INFO_DISCLOSURE = [
  /stack trace/i,
  /at\s+[\w.]+\s+\([^)]+:\d+:\d+\)/i,
  /node_modules/i,
  /php(?:_sapi_name|version)/i,
  /x-powered-by/i,
  /server:\s*(?:Apache|nginx|Microsoft-IIS)/i,
  /debug\s*(?:mode|info|enabled)/i,
  /laravel\s+\d/i,
  /django\s+version/i,
];

function makeRequest(targetUrl, method, headers, body, timeout) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(targetUrl); } catch { return reject(new Error('invalid URL')); }
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const options = {
      method: (method || 'GET').toUpperCase(),
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: headers || {},
      timeout: timeout || 10000,
    };

    if (body && !options.headers['content-type']) {
      options.headers['content-type'] = 'application/json';
    }

    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage || '',
          headers: res.headers,
          body: data,
          responseTime: 0,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });

    const start = Date.now();
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
    const origResolve = resolve;
    resolve = (r) => { r.responseTime = Date.now() - start; origResolve(r); };
  });
}

function analyzeResponse(response, requestInfo) {
  const findings = [];
  const headers = response.headers || {};
  const body = response.body || '';
  const headerKeys = Object.keys(headers).map(k => k.toLowerCase());

  // 1. Missing security headers
  for (const h of SECURITY_HEADERS) {
    if (!headerKeys.includes(h)) {
      findings.push({
        type: 'missing-header',
        severity: h === 'content-security-policy' ? 'high' : 'medium',
        message: `Missing ${h} header`,
      });
    }
  }

  // 2. Reflected XSS detection
  if (requestInfo.injectedParams) {
    for (const [param, value] of Object.entries(requestInfo.injectedParams)) {
      if (value && body.includes(value)) {
        const isEncoded = body.includes(encodeURIComponent(value)) || body.includes(value.replace(/</g, '&lt;'));
        if (!isEncoded) {
          findings.push({
            type: 'xss-reflection',
            severity: 'high',
            message: `Parameter "${param}" reflected in response without encoding — possible XSS`,
            evidence: value.substring(0, 80),
          });
        }
      }
    }
  }

  // 3. SQL injection error signatures
  for (const sig of SQL_ERROR_SIGNATURES) {
    if (sig.test(body)) {
      findings.push({
        type: 'sql-error',
        severity: 'high',
        message: `SQL error signature detected in response: ${sig.source.substring(0, 60)}`,
      });
      break;
    }
  }

  // 4. Information disclosure
  for (const sig of INFO_DISCLOSURE) {
    if (sig.test(body)) {
      findings.push({
        type: 'info-disclosure',
        severity: 'medium',
        message: `Possible information disclosure: ${sig.source.substring(0, 60)}`,
      });
      break;
    }
  }

  // 5. CORS misconfiguration
  const acao = headers['access-control-allow-origin'];
  if (acao === '*' && headers['access-control-allow-credentials'] === 'true') {
    findings.push({
      type: 'cors-misconfig',
      severity: 'high',
      message: 'CORS allows wildcard origin with credentials — credential leakage risk',
    });
  }

  // 6. Server header leaks version
  const serverHeader = headers['server'];
  if (serverHeader && /\d/.test(serverHeader)) {
    findings.push({
      type: 'server-version',
      severity: 'low',
      message: `Server header reveals version: ${serverHeader}`,
    });
  }

  // 7. X-Powered-By leaks framework
  const xpb = headers['x-powered-by'];
  if (xpb) {
    findings.push({
      type: 'framework-leak',
      severity: 'low',
      message: `X-Powered-By reveals: ${xpb}`,
    });
  }

  // 8. Open redirect test
  if (requestInfo.testRedirect && response.status >= 300 && response.status < 400) {
    const loc = headers['location'] || '';
    if (loc.includes(requestInfo.testRedirect)) {
      findings.push({
        type: 'open-redirect',
        severity: 'medium',
        message: `Redirect to untrusted URL: ${loc.substring(0, 100)}`,
      });
    }
  }

  return findings;
}

async function sendRequest(opts) {
  const url = opts.url;
  const method = opts.method || 'GET';
  const headers = opts.headers || {};
  const body = opts.body;
  const timeout = opts.timeout || 10000;
  const runSecurityScan = opts.scan !== false;

  if (!url) throw new Error('url is required');

  const response = await makeRequest(url, method, headers, body, timeout);

  const result = {
    status: response.status,
    statusText: response.statusText,
    responseTime: response.responseTime,
    headers: response.headers,
    body: response.body,
    bodyTruncated: response.body.length > 50000,
  };

  if (result.bodyTruncated) {
    result.body = response.body.substring(0, 50000);
  }

  if (runSecurityScan) {
    const scanResponse = { ...response, body: result.body };
    result.findings = analyzeResponse(scanResponse, {
      injectedParams: opts.injectedParams,
      testRedirect: opts.testRedirect,
    });
  }

  return result;
}

function buildXssTest(url, method, param) {
  const payloads = XSS_PAYLOADS;
  const tests = [];
  for (const payload of payloads) {
    let testUrl = url;
    let testBody = null;
    const injected = {};

    if (method === 'GET') {
      const u = new URL(url);
      u.searchParams.set(param || 'q', payload);
      testUrl = u.toString();
    } else {
      testBody = JSON.stringify({ [param || 'q']: payload });
    }
    injected[param || 'q'] = payload;

    tests.push({
      url: testUrl,
      method,
      body: testBody,
      injectedParams: injected,
      scan: true,
    });
  }
  return tests;
}

async function runXssTests(url, method, param) {
  const tests = buildXssTest(url, method, param);
  const results = [];
  for (const t of tests) {
    try {
      const res = await sendRequest(t);
      const xssFindings = (res.findings || []).filter(f => f.type === 'xss-reflection');
      if (xssFindings.length) {
        results.push({
          payload: t.injectedParams[param || 'q'],
          vulnerable: true,
          findings: xssFindings,
        });
      }
    } catch (e) {
      results.push({ payload: t.injectedParams[param || 'q'], vulnerable: false, error: e.message });
    }
  }
  return {
    url,
    method,
    param: param || 'q',
    testsRun: tests.length,
    vulnerabilities: results.filter(r => r.vulnerable),
    safe: results.filter(r => !r.vulnerable && !r.error),
    errors: results.filter(r => r.error),
    summary: results.filter(r => r.vulnerable).length > 0
      ? `VULNERABLE: ${results.filter(r => r.vulnerable).length}/${tests.length} payloads reflected without encoding`
      : `SAFE: 0/${tests.length} payloads reflected`,
  };
}

module.exports = { sendRequest, runXssTests, analyzeResponse, buildXssTest, XSS_PAYLOADS };
