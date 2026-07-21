'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { findBrowser } = require('./browser-detect');

let msgId = 0;

function cdpCall(ws, method, params = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), timeout);
    const handler = (ev) => {
      try {
        const raw = typeof ev === 'string' ? ev : (ev.data || ev.toString());
        const msg = JSON.parse(raw);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          clearTimeout(timer);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function getDebuggingTargets(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/json/list', timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function getBrowserWsUrl(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/json/version', timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          resolve(info.webSocketDebuggerUrl);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function findFreePort(start, end) {
  const net = require('node:net');
  for (let p = start; p <= end; p++) {
    const ok = await new Promise((resolve) => {
      const t = net.createServer();
      t.once('error', () => resolve(false));
      t.once('listening', () => t.close(() => resolve(true)));
      t.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  return 0;
}

async function renderSvgMulti(svgContent, sizes, format) {
  format = format || 'png';
  const browser = findBrowser();
  if (!browser) return { ok: false, error: 'No browser found. Install Chrome, Edge, or Brave.' };

  const port = await findFreePort(9222, 9240);
  if (!port) return { ok: false, error: 'No free debugging port in range 9222-9240' };

  const maxDim = Math.max(...sizes.map(s => Math.max(s.width, s.height)), 64);
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    '--disable-dev-shm-usage', '--remote-debugging-port=' + port,
    '--remote-debugging-address=127.0.0.1', '--window-size=' + maxDim + ',' + maxDim,
    '--hide-scrollbars',
  ];

  const child = spawn(browser.path, args, { stdio: 'ignore', detached: false });

  try {
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300));
      try { await getDebuggingTargets(port); ready = true; break; } catch {}
    }
    if (!ready) return { ok: false, error: 'Browser debugging port never became ready' };

    const browserWsUrl = await getBrowserWsUrl(port);
    const browserWs = new WebSocket(browserWsUrl);
    await new Promise((resolve, reject) => {
      browserWs.addEventListener('open', resolve);
      browserWs.addEventListener('error', reject);
      setTimeout(() => reject(new Error('browser ws timeout')), 5000);
    });

    const createResult = await cdpCall(browserWs, 'Target.createTarget', { url: 'about:blank' });
    const targetId = createResult.targetId;
    browserWs.close();

    const targets = await getDebuggingTargets(port);
    const target = targets.find(t => t.id === targetId);
    if (!target) return { ok: false, error: 'Created target not found' };

    const pageWs = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      pageWs.addEventListener('open', resolve);
      pageWs.addEventListener('error', reject);
      setTimeout(() => reject(new Error('page ws timeout')), 5000);
    });

    await cdpCall(pageWs, 'Page.enable');
    await cdpCall(pageWs, 'Runtime.enable');

    const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svgContent).toString('base64');
    await cdpCall(pageWs, 'Page.navigate', { url: dataUri });
    await new Promise(r => setTimeout(r, 800));

    const results = [];
    for (const { width, height, scale } of sizes) {
      const vpW = Math.max(width, 64);
      const vpH = Math.max(height, 64);
      await cdpCall(pageWs, 'Emulation.setDeviceMetricsOverride', {
        width: vpW, height: vpH, deviceScaleFactor: scale || 1, mobile: false,
      });
      await new Promise(r => setTimeout(r, 300));

      await cdpCall(pageWs, 'Runtime.evaluate', {
        expression: `document.documentElement.style.width='${vpW}px';document.documentElement.style.height='${vpH}px';document.body.style.margin='0';document.body.style.padding='0';const svg=document.querySelector('svg');if(svg){svg.setAttribute('viewBox','0 0 ${width} ${height}');svg.style.width='${width}px';svg.style.height='${height}px';svg.style.display='block';svg.style.margin='0 auto';}`,
      });
      await new Promise(r => setTimeout(r, 300));

      const screenshot = await cdpCall(pageWs, 'Page.captureScreenshot', {
        format, captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: vpW, height: vpH, scale: 1 },
      }, 15000);

      results.push({
        data: Buffer.from(screenshot.data, 'base64'),
        width, height, size: Math.max(width, height),
      });
    }

    pageWs.close();
    return { ok: true, results, browser: browser.name };
  } finally {
    try { child.kill(); } catch {}
  }
}

async function renderSvg(svgContent, options) {
  options = options || {};
  const width = options.width || 1200;
  const height = options.height || 630;
  const format = options.format || 'png';
  const scale = options.scale || 2;

  const result = await renderSvgMulti(svgContent, [{ width, height, scale }], format);
  if (!result.ok) return result;
  const r = result.results[0];
  return { ok: true, data: r.data, width: r.width, height: r.height, format, browser: result.browser };
}

function pngToIco(pngBuf, size) {
  size = size || 32;
  const headerSize = 6;
  const dirEntrySize = 16;
  const imageOffset = headerSize + dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const dir = Buffer.alloc(dirEntrySize);
  dir.writeUInt8(size >= 256 ? 0 : size, 0);
  dir.writeUInt8(size >= 256 ? 0 : size, 1);
  dir.writeUInt8(0, 2);
  dir.writeUInt8(0, 3);
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(pngBuf.length, 8);
  dir.writeUInt32LE(imageOffset, 12);

  return Buffer.concat([header, dir, pngBuf]);
}

function multiSizeIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirSize = 16 * count;
  let offset = headerSize + dirSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirs = [];
  for (const { data, size } of pngBuffers) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);
    dir.writeUInt8(size >= 256 ? 0 : size, 1);
    dir.writeUInt8(0, 2);
    dir.writeUInt8(0, 3);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(data.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirs.push(dir);
    offset += data.length;
  }

  return Buffer.concat([header, ...dirs, ...pngBuffers.map(p => p.data)]);
}

async function convertImage(inputPath, outputPath, options) {
  options = options || {};
  const ext = path.extname(outputPath).toLowerCase();

  if (ext === '.ico') {
    const inputExt = path.extname(inputPath).toLowerCase();
    if (inputExt === '.png') {
      const pngBuf = fs.readFileSync(inputPath);
      const size = options.size || options.width || 32;
      if (options.multi) {
        const sizes = [16, 32, 48, 64, 128, 256];
        const bufs = sizes.map(s => ({ data: pngBuf, size: s }));
        const ico = multiSizeIco(bufs);
        fs.writeFileSync(outputPath, ico);
        return { ok: true, output: outputPath, size: ico.length, sizes };
      }
      const ico = pngToIco(pngBuf, size);
      fs.writeFileSync(outputPath, ico);
      return { ok: true, output: outputPath, size: ico.length, size: `${size}x${size}` };
    } else if (inputExt === '.svg') {
      const svg = fs.readFileSync(inputPath, 'utf8');
      const sizes = options.multi ? [16, 32, 48, 64, 128, 256] : [options.size || 32];
      const renderSpecs = sizes.map(s => ({ width: s, height: s, scale: 1 }));
      const renderResult = await renderSvgMulti(svg, renderSpecs, 'png');
      if (!renderResult.ok) return renderResult;
      if (options.multi) {
        const pngBuffers = renderResult.results.map((r, i) => ({ data: r.data, size: sizes[i] }));
        const ico = multiSizeIco(pngBuffers);
        fs.writeFileSync(outputPath, ico);
        return { ok: true, output: outputPath, size: ico.length, sizes };
      }
      const ico = pngToIco(renderResult.results[0].data, sizes[0]);
      fs.writeFileSync(outputPath, ico);
      return { ok: true, output: outputPath, size: ico.length, size: `${sizes[0]}x${sizes[0]}` };
    }
    return { ok: false, error: 'ICO input must be PNG or SVG' };
  }

  if (ext === '.png' || ext === '.webp' || ext === '.jpeg' || ext === '.jpg') {
    const inputExt = path.extname(inputPath).toLowerCase();
    if (inputExt !== '.svg') {
      return { ok: false, error: 'Raster-to-raster conversion not supported. Input must be SVG.' };
    }
    const svg = fs.readFileSync(inputPath, 'utf8');
    const format = ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg';
    const result = await renderSvg(svg, {
      width: options.width || 1200,
      height: options.height || 630,
      format,
      scale: options.scale || 2,
    });
    if (!result.ok) return result;
    fs.writeFileSync(outputPath, result.data);
    return {
      ok: true,
      output: outputPath,
      size: result.data.length,
      dimensions: `${result.width}x${result.height}`,
      format,
      browser: result.browser,
    };
  }

  return { ok: false, error: 'Unsupported output format: ' + ext };
}

module.exports = { convertImage, renderSvg, pngToIco, multiSizeIco, findBrowser };
