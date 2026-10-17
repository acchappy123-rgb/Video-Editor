// Smoke test: serves app/ over HTTP, drives it with Playwright (headless Chromium) and
// checks the main flows + every export format. Usage: node tests/smoke.mjs
import { createRequire } from 'module';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
const GP = process.env.GP || execSync('npm root -g').toString().trim();
const require = createRequire(GP + '/');
const { chromium } = require('playwright');
const OUT = process.env.OUT || 'tests/out';
fs.mkdirSync(OUT, { recursive: true });
const PORT = +process.env.PORT || 8765;
const srv = spawn('npx', ['--yes', 'http-server', 'app', '-p', String(PORT), '-c-1', '-s'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '-', e.message); }
};
try {
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForSelector('.hero');
  await step('home renders', async () => { await shot('01-home'); });
  globalThis.__steps = step;
  const extra = process.env.EXTRA || 'tests/flows.mjs';
  if (extra) await (await import(path.resolve(extra))).default({ page, step, shot, OUT });
} finally {
  if (errors.length) { console.log('\nErrors:\n' + errors.join('\n')); failed += errors.length; }
  await browser.close();
  srv.kill();
  console.log(failed ? `\n${failed} problem(s)` : '\nAll good');
  process.exit(failed ? 1 : 0);
}
