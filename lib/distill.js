'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const http = require('node:http');

const DOCS_DIR = process.env.LEX_DOCS_DIR || path.join(os.homedir(), '.lex', 'docs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve(body));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function distillMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      continue;
    }
    if (inCodeBlock) { out.push(line); continue; }
    if (line.match(/^#{1,4}\s/)) { out.push(line); continue; }
    if (line.match(/^\s*[-*]\s/)) { out.push(line); continue; }
    if (line.match(/^\s*\d+\.\s/)) { out.push(line); continue; }
    if (line.match(/^\|.*\|/)) { out.push(line); continue; }
    if (line.trim() && !line.match(/^\s*[!\\[\\](){}]/)) { out.push(line); continue; }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function distillNpm(pkg) {
  const url = `https://registry.npmjs.org/${pkg}`;
  console.log('fetching', url);
  const body = await fetch(url);
  const data = JSON.parse(body);
  const latest = data['dist-tags']?.latest;
  const version = data.versions?.[latest];
  if (!version) throw new Error('no version found for ' + pkg);

  const sheet = [
    `# ${pkg}@${latest}`,
    '',
    `## Description`,
    version.description || '(no description)',
    '',
  ];

  if (version.dependencies) {
    sheet.push('## Dependencies');
    for (const [dep, ver] of Object.entries(version.dependencies)) {
      sheet.push(`- ${dep}: ${ver}`);
    }
    sheet.push('');
  }

  if (version.main || version.module || version.exports) {
    sheet.push('## Entry Points');
    if (version.main) sheet.push(`- main: ${version.main}`);
    if (version.module) sheet.push(`- module: ${version.module}`);
    if (version.exports) {
      const exports = typeof version.exports === 'object' ? Object.keys(version.exports).slice(0, 10) : [];
      for (const exp of exports) sheet.push(`- exports: ${exp}`);
    }
    sheet.push('');
  }

  if (data.readme) {
    const readme = data.readme;
    const cleaned = readme.includes('<') ? stripHtml(readme) : distillMarkdown(readme);
    sheet.push('## README (distilled)');
    sheet.push(cleaned.substring(0, 5000));
  } else if (version.repository) {
    const repoUrl = typeof version.repository === 'string' ? version.repository : version.repository.url;
    const githubMatch = repoUrl?.match(/github\.com[:/]([\w.-]+\/[\w.-]+)/);
    if (githubMatch) {
      const repo = githubMatch[1].replace(/\.git$/, '');
      for (const branch of ['main', 'master']) {
        for (const filename of ['README.md', 'Readme.md', 'readme.md', 'README.MD', 'README.rst']) {
          try {
            const readmeUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${filename}`;
            console.log('fetching', readmeUrl);
            const readme = await fetch(readmeUrl);
            const cleaned = filename.endsWith('.rst') ? readme : distillMarkdown(readme);
            sheet.push('## README (distilled)');
            sheet.push(cleaned.substring(0, 5000));
            break;
          } catch {}
        }
        if (sheet.some(l => l.startsWith('## README'))) break;
      }
    }
  }

  return { name: pkg + '.md', content: sheet.join('\n') };
}

async function distillComposer(pkg) {
  const url = `https://repo.packagist.org/p2/${pkg}.json`;
  console.log('fetching', url);
  const body = await fetch(url);
  const data = JSON.parse(body);
  const versions = data.packages?.[pkg];
  if (!versions || !versions.length) throw new Error('no version found for ' + pkg);
  const latest = versions[0];

  const sheet = [
    `# ${pkg}@${latest.version}`,
    '',
    `## Description`,
    latest.description || '(no description)',
    '',
  ];

  if (latest.require) {
    sheet.push('## Requirements');
    for (const [dep, ver] of Object.entries(latest.require)) {
      sheet.push(`- ${dep}: ${ver}`);
    }
    sheet.push('');
  }

  if (latest.autoload) {
    sheet.push('## Autoload');
    for (const [type, mapping] of Object.entries(latest.autoload)) {
      sheet.push(`- ${type}: ${JSON.stringify(mapping)}`);
    }
    sheet.push('');
  }

  return { name: pkg.replace('/', '__') + '.md', content: sheet.join('\n') };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('usage: node distill.js <npm:package | composer:vendor/package | url:http...>');
    process.exit(1);
  }

  fs.mkdirSync(DOCS_DIR, { recursive: true });

  for (const arg of args) {
    try {
      let result;
      if (arg.startsWith('npm:')) {
        result = await distillNpm(arg.substring(4));
      } else if (arg.startsWith('composer:')) {
        result = await distillComposer(arg.substring(9));
      } else if (arg.startsWith('http')) {
        console.log('fetching', arg);
        const body = await fetch(arg);
        const cleaned = body.includes('<') ? stripHtml(body) : distillMarkdown(body);
        const name = arg.split('/').pop().replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        result = { name: name + '.md', content: `# ${arg}\n\n${cleaned.substring(0, 8000)}` };
      } else {
        console.error('unknown format:', arg, '- use npm:, composer:, or http(s)://');
        continue;
      }

      const outPath = path.join(DOCS_DIR, result.name);
      fs.writeFileSync(outPath, result.content, 'utf8');
      console.log('distilled:', outPath, '(' + result.content.length + ' chars)');
    } catch (e) {
      console.error('failed:', arg, '-', e.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
