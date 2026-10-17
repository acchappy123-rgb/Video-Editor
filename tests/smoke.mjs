// Browser test runner: serves app/ over HTTP and drives it with Playwright (headless Chromium).
// Runs tests/flows.mjs and every tests/regress-*.mjs module, each in a fresh page that starts on Home.
// Usage: node tests/smoke.mjs                    (all modules)
//        EXTRA=path/to/a.mjs,b.mjs node tests/smoke.mjs   (only those modules)
// Env: PORT (default 8765), OUT (screenshot dir, default tests/out), GP (global node_modules path)
// A module default-exports async ({ page, step, shot, OUT, ctx, url }) => {}.
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
const url = `http://localhost:${PORT}/index.html`;
// Detached so the whole process group (npx + http-server) can be killed at the end.
const srv = spawn('npx', ['--yes', 'http-server', 'app', '-p', String(PORT), '-c-1', '-s'], { stdio: 'ignore', detached: true });
const stopServer = () => { try { process.kill(-srv.pid, 'SIGTERM'); } catch (e) {} };
process.on('exit', stopServer);
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const modules = process.env.EXTRA
  ? process.env.EXTRA.split(',').filter(Boolean)
  : ['tests/flows.mjs', ...fs.readdirSync('tests').filter((f) => /^regress-.*\.mjs$/.test(f)).sort().map((f) => 'tests/' + f)];
let failed = 0;
const errors = [];
try {
  for (const mod of modules) {
    console.log(`\n# ${mod}`);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${mod}] pageerror: ${e.message}\n${e.stack}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`[${mod}] console: ${m.text()}`));
    const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
    const step = async (name, fn) => {
      try { await fn(); console.log('ok  ', name); }
      catch (e) { failed++; console.log('FAIL', name, '-', e.message.split('\n')[0]); }
    };
    await page.goto(url + '#/home');
    await page.waitForSelector('.hero');
    if (mod === modules[0]) await step('home renders', async () => { await shot('01-home'); });
    try {
      await (await import(path.resolve(mod))).default({ page, step, shot, OUT, ctx, url });
    } catch (e) {
      failed++;
      console.log('FAIL', mod, 'crashed -', e.message.split('\n')[0]);
    }
    await page.close();
  }
} finally {
  if (errors.length) { console.log('\nErrors:\n' + errors.join('\n')); failed += errors.length; }
  await browser.close();
  stopServer();
  console.log(failed ? `\n${failed} problem(s)` : '\nAll good');
  process.exit(failed ? 1 : 0);
}
