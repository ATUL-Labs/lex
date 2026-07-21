'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Integrity check for AI-built websites.
 * Detects: orphan CSS classes, dead CSS, undefined CSS variables,
 * orphaned JS selectors, broken resource references, duplicate CSS rules,
 * inline style overload, dead JS functions.
 */

// ── HTML parsing ──────────────────────────────────────────────

function extractHtmlClasses(html) {
  const classes = new Set();
  // Match class="..." and class='...' in HTML
  const re = /class\s*=\s*["'`]([^"'`]+)["'`]/gi;
  let m;
  while ((m = re.exec(html))) {
    for (const c of m[1].split(/\s+/)) {
      if (c) classes.add(c);
    }
  }
  // Match className:'...' and className:"..." in JS (React createElement)
  const re2 = /className\s*:\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = re2.exec(html))) {
    for (const c of m[1].split(/\s+/)) {
      if (c) classes.add(c);
    }
  }
  // Match className:'...' with template literals containing only static text
  const re3 = /className\s*:\s*`([^`]+)`/gi;
  while ((m = re3.exec(html))) {
    // Extract static parts from template literals (skip ${...} expressions)
    const staticParts = m[1].replace(/\$\{[^}]+\}/g, ' ').split(/\s+/);
    for (const c of staticParts) {
      if (c && c.length > 1 && !c.includes('$')) classes.add(c);
    }
  }
  return classes;
}

function extractHtmlIds(html) {
  const ids = new Set();
  const re = /id\s*=\s*["'`]([^"'`]+)["'`]/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) ids.add(m[1]);
  }
  // Match id:'...' in JS (React createElement)
  const re2 = /['"`]id['"`]\s*:\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = re2.exec(html))) {
    if (m[1]) ids.add(m[1]);
  }
  return ids;
}

function extractInlineStyles(html) {
  let count = 0;
  const re = /style\s*=\s*["'`]/gi;
  let m;
  while ((m = re.exec(html))) count++;
  return count;
}

function extractStyleBlocks(html) {
  const blocks = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) {
    blocks.push(m[1]);
  }
  return blocks;
}

function extractScriptBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1].trim()) blocks.push(m[1]);
  }
  return blocks;
}

function extractResourceRefs(html, baseUrl) {
  const refs = [];
  const re = /(?:src|href)\s*=\s*["'`]([^"'`]+)["'`]/gi;
  let m;
  while ((m = re.exec(html))) {
    const ref = m[1];
    if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//') || ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('data:')) continue;
    // Skip root-absolute paths (e.g. /landing-react.html) — they resolve on a web server, not filesystem
    if (ref.startsWith('/')) continue;
    refs.push(ref);
  }
  return refs;
}

function isLocalRef(ref) {
  return ref && !ref.startsWith('http://') && !ref.startsWith('https://') && !ref.startsWith('//') && !ref.startsWith('data:') && !ref.startsWith('mailto:');
}

function extractExternalCssLinks(html) {
  const links = [];
  const re = /<link[^>]+rel\s*=\s*["']stylesheet["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const hrefMatch = m[0].match(/href\s*=\s*["'`]([^"'`]+)["'`]/i);
    if (hrefMatch && isLocalRef(hrefMatch[1])) links.push(hrefMatch[1]);
  }
  return links;
}

function extractExternalScriptLinks(html) {
  const links = [];
  const re = /<script[^>]+src\s*=\s*["'`]([^"'`]+)["'`][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (isLocalRef(m[1])) links.push(m[1]);
  }
  return links;
}

// ── CSS parsing ───────────────────────────────────────────────

function extractCssClasses(css) {
  const classes = new Set();
  // Match all .classname patterns in the CSS
  // Use a simple approach: find all .word patterns that are in selector context
  // (not inside property values like 0.5em which have digits before the dot)
  const re = /\.([a-zA-Z_][\w-]*)/g;
  let m;
  while ((m = re.exec(css))) {
    // Check the character before the dot — if it's a digit, it's likely a property value (e.g. 0.5em)
    const before = m.index > 0 ? css[m.index - 1] : '';
    if (/[0-9]/.test(before)) continue;
    classes.add(m[1]);
  }
  return classes;
}

function extractCssIds(css) {
  const ids = new Set();
  const re = /#([a-zA-Z_][\w-]*)/g;
  let m;
  while ((m = re.exec(css))) {
    // Filter out hex colors
    if (!/^[0-9a-fA-F]{3,8}$/.test(m[1])) {
      ids.add(m[1]);
    }
  }
  return ids;
}

function extractCssVariablesDefined(css) {
  const vars = new Set();
  const re = /--([\w-]+)\s*:/g;
  let m;
  while ((m = re.exec(css))) {
    vars.add(m[1]);
  }
  return vars;
}

function extractCssVariablesUsed(css) {
  const vars = new Set();
  const re = /var\(\s*--([\w-]+)/g;
  let m;
  while ((m = re.exec(css))) {
    vars.add(m[1]);
  }
  return vars;
}

function extractDuplicateSelectors(css) {
  const selectorMap = new Map();
  // Split CSS into rules
  const re = /([^{}]+)\{[^}]*\}/g;
  let m;
  while ((m = re.exec(css))) {
    let selector = m[1].trim();
    if (!selector || selector.startsWith('@') || selector.startsWith('/*')) continue;
    // Normalize whitespace
    selector = selector.replace(/\s+/g, ' ').trim();
    if (!selector) continue;
    if (selectorMap.has(selector)) {
      selectorMap.set(selector, selectorMap.get(selector) + 1);
    } else {
      selectorMap.set(selector, 1);
    }
  }
  const duplicates = [];
  for (const [selector, count] of selectorMap) {
    if (count > 1) duplicates.push({ selector, count });
  }
  return duplicates;
}

// ── JS parsing ────────────────────────────────────────────────

function extractJsGetElementById(js) {
  const ids = new Set();
  const re = /getElementById\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let m;
  while ((m = re.exec(js))) ids.add(m[1]);
  return ids;
}

function extractJsQuerySelector(js) {
  const selectors = new Set();
  const re = /querySelector(?:All)?\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let m;
  while ((m = re.exec(js))) {
    // Extract ID from selector if it's a simple #id
    const idMatch = m[1].match(/^#([a-zA-Z_][\w-]*)$/);
    if (idMatch) {
      selectors.add({ type: 'id', value: idMatch[1], raw: m[1] });
    } else {
      selectors.add({ type: 'selector', value: m[1], raw: m[1] });
    }
  }
  return selectors;
}

function extractJsFunctionDefs(js) {
  const funcs = new Set();
  // function foo(
  const re1 = /function\s+([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re1.exec(js))) funcs.add(m[1]);
  // const foo = function
  const re2 = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*function/g;
  while ((m = re2.exec(js))) funcs.add(m[1]);
  // const foo = () =>
  const re3 = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
  while ((m = re3.exec(js))) funcs.add(m[1]);
  return funcs;
}

function extractJsFunctionCalls(js) {
  const calls = new Set();
  const re = /([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(js))) {
    // Skip keywords
    if (!['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'delete', 'void', 'this'].includes(m[1])) {
      calls.add(m[1]);
    }
  }
  return calls;
}

// ── Main integrity check ──────────────────────────────────────

function runIntegrityCheck(filePath, options = {}) {
  const root = options.root || path.dirname(filePath);
  const html = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  const issues = [];
  const stats = {};

  // Extract from HTML
  const htmlClasses = extractHtmlClasses(html);
  const htmlIds = extractHtmlIds(html);
  const inlineStyleCount = extractInlineStyles(html);
  const styleBlocks = extractStyleBlocks(html);
  const scriptBlocks = extractScriptBlocks(html);
  const resourceRefs = extractResourceRefs(html);
  const externalCssLinks = extractExternalCssLinks(html);
  const externalScriptLinks = extractExternalScriptLinks(html);

  // Collect all CSS (inline + external)
  let allCss = styleBlocks.join('\n');
  const externalCssFiles = [];
  for (const link of externalCssLinks) {
    const cssPath = path.resolve(path.dirname(filePath), link);
    try {
      if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        allCss += '\n' + cssContent;
        externalCssFiles.push({ link, found: true });
      } else {
        externalCssFiles.push({ link, found: false });
        issues.push({
          severity: 'critical',
          type: 'broken-css-link',
          message: `CSS file not found: ${link}`,
          file: fileName,
        });
      }
    } catch {
      externalCssFiles.push({ link, found: false });
    }
  }

  // Collect all JS (inline + external)
  let allJs = scriptBlocks.join('\n');
  const externalJsFiles = [];
  for (const link of externalScriptLinks) {
    const jsPath = path.resolve(path.dirname(filePath), link);
    try {
      if (fs.existsSync(jsPath)) {
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        allJs += '\n' + jsContent;
        externalJsFiles.push({ link, found: true });
      } else {
        externalJsFiles.push({ link, found: false });
        issues.push({
          severity: 'critical',
          type: 'broken-script-link',
          message: `JS file not found: ${link}`,
          file: fileName,
        });
      }
    } catch {
      externalJsFiles.push({ link, found: false });
    }
  }

  // ── 1. CSS orphan scan ──
  const cssClasses = extractCssClasses(allCss);
  const orphanClasses = [...htmlClasses].filter(c => !cssClasses.has(c));
  const deadCssClasses = [...cssClasses].filter(c => !htmlClasses.has(c));

  // Filter out common utility/framework classes that may be dynamically applied
  const dynamicClassPatterns = /^(is-|has-|js-|was-|active|selected|open|closed|hidden|visible|loading|disabled|enabled|collapsed|expanded|fade|show|hide|scroll|sticky|fixed)/;
  const trueOrphans = orphanClasses.filter(c => !dynamicClassPatterns.test(c));
  const likelyDynamic = orphanClasses.filter(c => dynamicClassPatterns.test(c));

  for (const c of trueOrphans) {
    issues.push({
      severity: 'important',
      type: 'orphan-css-class',
      message: `HTML class "${c}" has no CSS definition`,
      file: fileName,
    });
  }
  for (const c of likelyDynamic) {
    issues.push({
      severity: 'info',
      type: 'orphan-css-class-dynamic',
      message: `HTML class "${c}" has no CSS definition (likely JS-applied, verify)`,
      file: fileName,
    });
  }
  for (const c of deadCssClasses.slice(0, 50)) {
    issues.push({
      severity: 'info',
      type: 'dead-css',
      message: `CSS class ".${c}" is defined but not used in HTML`,
      file: fileName,
    });
  }

  // ── 2. CSS variable check ──
  const cssVarsDefined = extractCssVariablesDefined(allCss);
  const cssVarsUsed = extractCssVariablesUsed(allCss);
  const undefinedVars = [...cssVarsUsed].filter(v => !cssVarsDefined.has(v));
  for (const v of undefinedVars) {
    issues.push({
      severity: 'important',
      type: 'undefined-css-var',
      message: `CSS variable --${v} is used but never defined`,
      file: fileName,
    });
  }

  // ── 3. JS reference check ──
  const jsGetByIds = extractJsGetElementById(allJs);
  const jsQuerySelectors = extractJsQuerySelector(allJs);
  for (const id of jsGetByIds) {
    if (!htmlIds.has(id)) {
      issues.push({
        severity: 'important',
        type: 'orphan-js-id',
        message: `JS calls getElementById("${id}") but no element has id="${id}"`,
        file: fileName,
      });
    }
  }
  for (const sel of jsQuerySelectors) {
    if (sel.type === 'id' && !htmlIds.has(sel.value)) {
      issues.push({
        severity: 'important',
        type: 'orphan-js-selector',
        message: `JS calls querySelector("#${sel.value}") but no element has id="${sel.value}"`,
        file: fileName,
      });
    }
  }

  // ── 4. Broken resource check ──
  for (const ref of resourceRefs) {
    // Skip protocol-relative, anchors, data URIs
    if (ref.startsWith('//') || ref.startsWith('#') || ref.startsWith('data:')) continue;
    const refPath = path.resolve(path.dirname(filePath), ref);
    if (!fs.existsSync(refPath)) {
      issues.push({
        severity: 'important',
        type: 'broken-resource',
        message: `Resource not found: ${ref}`,
        file: fileName,
      });
    }
  }

  // ── 5. Duplicate CSS selectors ──
  const duplicates = extractDuplicateSelectors(allCss);
  for (const dup of duplicates.slice(0, 20)) {
    issues.push({
      severity: 'info',
      type: 'duplicate-css-selector',
      message: `CSS selector "${dup.selector}" defined ${dup.count} times (last one wins)`,
      file: fileName,
    });
  }

  // ── 6. Dead JS functions ──
  const jsFuncDefs = extractJsFunctionDefs(allJs);
  const jsFuncCalls = extractJsFunctionCalls(allJs);
  const deadFuncs = [...jsFuncDefs].filter(f => !jsFuncCalls.has(f));
  for (const f of deadFuncs.slice(0, 20)) {
    // Skip common entry points
    if (['init', 'main', 'start', 'render', 'mount', 'createApp'].includes(f)) continue;
    issues.push({
      severity: 'info',
      type: 'dead-js-function',
      message: `JS function "${f}" is defined but never called`,
      file: fileName,
    });
  }

  // ── 7. Inline style audit ──
  if (inlineStyleCount > 10) {
    issues.push({
      severity: 'info',
      type: 'inline-style-overload',
      message: `${inlineStyleCount} inline style attributes found (consider extracting to CSS)`,
      file: fileName,
    });
  }

  // ── Stats ──
  stats.htmlClasses = htmlClasses.size;
  stats.cssClasses = cssClasses.size;
  stats.orphanClasses = trueOrphans.length;
  stats.deadCssClasses = deadCssClasses.length;
  stats.cssVarsDefined = cssVarsDefined.size;
  stats.cssVarsUsed = cssVarsUsed.size;
  stats.undefinedVars = undefinedVars.length;
  stats.htmlIds = htmlIds.size;
  stats.jsGetByIds = jsGetByIds.size;
  stats.jsQuerySelectors = jsQuerySelectors.size;
  stats.orphanJsRefs = [...jsGetByIds].filter(id => !htmlIds.has(id)).length;
  stats.resourceRefs = resourceRefs.length;
  stats.brokenResources = resourceRefs.filter(ref => {
    if (ref.startsWith('//') || ref.startsWith('#') || ref.startsWith('data:')) return false;
    return !fs.existsSync(path.resolve(path.dirname(filePath), ref));
  }).length;
  stats.duplicateSelectors = duplicates.length;
  stats.deadJsFunctions = deadFuncs.length;
  stats.inlineStyles = inlineStyleCount;
  stats.externalCssFiles = externalCssFiles.length;
  stats.externalJsFiles = externalJsFiles.length;
  stats.fileSize = fs.statSync(filePath).size;
  stats.fileLines = html.split('\n').length;

  // Severity counts
  const critical = issues.filter(i => i.severity === 'critical').length;
  const important = issues.filter(i => i.severity === 'important').length;
  const info = issues.filter(i => i.severity === 'info').length;

  // Integrity score 0-100
  let score = 100;
  score -= critical * 20;
  score -= important * 5;
  score -= info * 1;
  score = Math.max(0, score);

  return {
    ok: true,
    file: fileName,
    filePath,
    score,
    issues,
    stats,
    summary: {
      critical,
      important,
      info,
      total: issues.length,
    },
  };
}

// ── Formatting ────────────────────────────────────────────────

function formatIntegrityResult(result) {
  if (!result.ok) {
    return 'INTEGRITY CHECK FAILED: ' + result.error;
  }

  let out = `INTEGRITY CHECK: ${result.file} (score: ${result.score}/100)\n`;
  out += `Critical: ${result.summary.critical} | Important: ${result.summary.important} | Info: ${result.summary.info} | Total: ${result.summary.total}\n`;

  const s = result.stats;
  out += `\nStats:\n`;
  out += `  HTML classes: ${s.htmlClasses} | CSS classes: ${s.cssClasses} | Orphans: ${s.orphanClasses} | Dead CSS: ${s.deadCssClasses}\n`;
  out += `  CSS vars: ${s.cssVarsDefined} defined | ${s.cssVarsUsed} used | ${s.undefinedVars} undefined\n`;
  out += `  HTML IDs: ${s.htmlIds} | JS getElementById: ${s.jsGetByIds} | Orphaned JS refs: ${s.orphanJsRefs}\n`;
  out += `  Resources: ${s.resourceRefs} refs | ${s.brokenResources} broken\n`;
  out += `  Duplicates: ${s.duplicateSelectors} CSS selectors | ${s.deadJsFunctions} dead JS functions\n`;
  out += `  Inline styles: ${s.inlineStyles} | External CSS: ${s.externalCssFiles} | External JS: ${s.externalJsFiles}\n`;
  out += `  File size: ${(s.fileSize / 1024).toFixed(1)}KB | ${s.fileLines} lines\n`;

  if (result.issues.length === 0) {
    out += '\n✓ CLEAN — no integrity issues found\n';
    return out;
  }

  // Group by severity
  const groups = { critical: [], important: [], info: [] };
  for (const issue of result.issues) {
    groups[issue.severity].push(issue);
  }

  if (groups.critical.length) {
    out += `\n🔴 CRITICAL (${groups.critical.length}):\n`;
    for (const i of groups.critical) {
      out += `  [${i.type}] ${i.message}\n`;
    }
  }

  if (groups.important.length) {
    out += `\n🟡 IMPORTANT (${groups.important.length}):\n`;
    for (const i of groups.important.slice(0, 30)) {
      out += `  [${i.type}] ${i.message}\n`;
    }
    if (groups.important.length > 30) {
      out += `  ... and ${groups.important.length - 30} more\n`;
    }
  }

  if (groups.info.length) {
    out += `\nℹ️  INFO (${groups.info.length}):\n`;
    for (const i of groups.info.slice(0, 15)) {
      out += `  [${i.type}] ${i.message}\n`;
    }
    if (groups.info.length > 15) {
      out += `  ... and ${groups.info.length - 15} more\n`;
    }
  }

  return out;
}

module.exports = { runIntegrityCheck, formatIntegrityResult };
