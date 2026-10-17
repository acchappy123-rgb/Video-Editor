// Regression checks for exporters and templates (export.js, templates.js): print PDF bleed, website page
// links, GIF length/streaming, PPTX slide size, video dissolve frames, total duration and user template previews.
import fs from 'fs';
import path from 'path';
export default async function ({ page, step, OUT, ctx }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 120) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  // Opens a new design; pages: [{ bg, duration, transition, hidden, els: [[shape, {...}]] }]
  const open = async (type, pages, size = {}) => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev(async ([type, pages, size]) => {
      const M = A.M;
      const ps = pages.map(({ els = [], ...o }) => M.newPage({ ...o, elements: els.map(([s, e]) => M.newShape(s, e)) }));
      await A.Home.newDesign({ type, ...size, pages: ps });
    }, [type, pages, size]);
    await page.waitForFunction(() => A.E.d && Object.keys(A.E.blocks).length && A.E.blocks[0].svg.isConnected);
    await wait(300);
  };
  const near = (a, b, tol = 60) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol);

  await step('export: a user template without a thumbnail renders on Templates and in the Design panel (render-8)', async () => {
    await open('social', [{ bg: { color: '#ffde59' }, els: [['rect', { x: 100, y: 100, w: 300, h: 300, fill: '#5e17eb' }]] }]);
    // a thumbnail that cannot be rendered is stored as ''
    await ev(() => { A.E.d.thumb = ''; A.__thumb = A.R.thumbnail; A.R.thumbnail = async () => ''; });
    await page.click('.top-btn:has-text("File")');
    await page.click('.menu button:has-text("Save as template")');
    await page.waitForSelector('.modal input');
    await page.fill('.modal input', 'No thumb tpl');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => A.app.userTemplates.some((t) => t.name === 'No thumb tpl'));
    await ev(() => { A.R.thumbnail = A.__thumb; delete A.__thumb; });
    try {
      ok((await ev(() => A.app.userTemplates.find((t) => t.name === 'No thumb tpl').thumb)) === '', 'precondition: thumb should be empty');
      // Design panel in the editor
      await page.click('.rail-btn[data-p="design"]');
      const card = page.locator('.tpl-grid .tpl-card[title="No thumb tpl"] img');
      await card.waitFor({ timeout: 5000 });
      ok((await card.getAttribute('src')).startsWith('data:image/svg+xml'), 'Design panel card has no preview');
      // Templates page (through the real sidebar link)
      await ev(() => A.app.go('#/home'));
      await page.waitForSelector('.hero');
      await page.click('a[href="#/templates"] >> nth=0');
      await page.waitForSelector('.tpl-grid.big .tpl-card', { timeout: 5000 });
      const mine = page.locator('.tpl-grid.big .tpl-card', { hasText: 'No thumb tpl (yours)' });
      ok((await mine.count()) === 1, 'user template card missing on the Templates page');
      ok((await mine.locator('img').getAttribute('src')).startsWith('data:image/svg+xml'), 'Templates card has no preview');
      ok((await page.locator('.tpl-grid.big .tpl-card').count()) > (await ev(() => A.TEMPLATES.length)), 'built-in templates missing');
      ok(!(await page.locator('.toast.error').count()), 'error toast shown', await page.locator('.toast.error').allTextContents());
      // its delete button (on the page that used to crash) removes it
      await mine.hover();
      await mine.locator('.tpl-del').click();
      await page.waitForFunction(() => !A.app.userTemplates.some((t) => t.name === 'No thumb tpl'), null, { timeout: 5000 });
    } finally {
      // never leave a broken template behind: later modules share IndexedDB
      await ev(async () => { A.app.userTemplates = A.app.userTemplates.filter((t) => t.name !== 'No thumb tpl'); await A.S.setKv('userTemplates', A.app.userTemplates); });
    }
  });

  await step('export: print PDF bleed extends the edges and keeps the trimmed artwork 1:1 (render-10)', async () => {
    await open('custom', [{ bg: { color: '#ffde59' }, els: [['rect', { x: 40, y: 40, w: 100, h: 100, fill: '#1f4fff' }], ['rect', { x: 200, y: 0, w: 100, h: 20, fill: '#ff0000' }]] }], { w: 336, h: 192 });
    const r = await ev(async () => {
      const info = async (blob) => {
        const u8 = new Uint8Array(await blob.arrayBuffer()), s = new TextDecoder('latin1').decode(u8);
        const box = (k) => s.match(new RegExp('/' + k + ' \\[([^\\]]+)\\]'))?.[1].split(' ').map(Number);
        const cm = s.match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.-]+) ([\d.-]+) cm \/Im0 Do Q/).slice(1).map(Number);
        const im = s.match(/\/Width (\d+) \/Height (\d+)[^>]*\/Length (\d+) >>\nstream\n/);
        const start = im.index + im[0].length;
        const bmp = await createImageBitmap(new Blob([u8.subarray(start, start + +im[3])], { type: 'image/jpeg' }));
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
        const [iw, ih, ix, iy] = cm, trim = box('TrimBox');
        // colour at PDF point (X, Y) through the image placement
        const at = (X, Y) => [...g.getImageData(Math.floor(((X - ix) / iw) * c.width), Math.floor(((iy + ih - Y) / ih) * c.height), 1, 1).data].slice(0, 3);
        // colour at a design pixel (y down from the top of the trim)
        const px = (x, y) => at(trim[0] + x * 0.75, trim[3] - y * 0.75);
        return { cm, trim, bleed: box('BleedBox'), media: box('MediaBox'), w: c.width, h: c.height, at, px };
      };
      const b = await info(await A.X.pdf(A.E.d, A.E.d.pages, { scale: 2, bleed: true, marks: true }));
      const t = b.trim;
      const plain = await info(await A.X.pdf(A.E.d, A.E.d.pages, { scale: 2 }));
      return {
        cm: b.cm, trim: t, bleed: b.bleed, media: b.media, ptPerPx: [b.cm[0] / b.w, b.cm[1] / b.h],
        inside: { left: b.px(43, 90), leftOut: b.px(36, 90), top: b.px(90, 43), topOut: b.px(90, 36), right: b.px(137, 90), rightOut: b.px(144, 90), bottom: b.px(90, 137), bottomOut: b.px(90, 144) },
        band: { left: b.at(t[0] - 5, t[1] + 50), aboveRed: b.at(t[0] + 250 * 0.75, t[3] + 5), aboveYellow: b.at(t[0] + 100 * 0.75, t[3] + 5), corner: b.at(t[2] + 5, t[1] - 5) },
        plain: { cm: plain.cm, bleed: plain.bleed, trim: plain.trim },
      };
    });
    const Y = [255, 222, 89], B = [31, 79, 255], RED = [255, 0, 0];
    ok(Math.abs(r.ptPerPx[0] - r.ptPerPx[1]) < 1e-3, 'artwork is scaled unevenly', r.ptPerPx);
    ok(Math.abs(r.ptPerPx[0] - 0.375) < 1e-3, 'artwork is not drawn at its true size', r.ptPerPx);
    for (const k of ['left', 'top', 'right', 'bottom']) {
      ok(near(r.inside[k], B), `inside the ${k} edge of the square is not blue`, r.inside);
      ok(near(r.inside[k + 'Out'], Y), `outside the ${k} edge of the square is not the background`, r.inside);
    }
    ok(r.bleed && Math.abs(r.bleed[0] - (r.trim[0] - 9)) < 0.01 && Math.abs(r.bleed[3] - (r.trim[3] + 9)) < 0.01, 'BleedBox missing or wrong', { bleed: r.bleed, trim: r.trim });
    ok(r.cm[2] <= r.bleed[0] + 0.01 && r.cm[3] <= r.bleed[1] + 0.01 && r.cm[2] + r.cm[0] >= r.bleed[2] - 0.01 && r.cm[3] + r.cm[1] >= r.bleed[3] - 0.01, 'image does not cover the bleed', r);
    ok(near(r.band.left, Y) && near(r.band.aboveRed, RED) && near(r.band.aboveYellow, Y) && near(r.band.corner, Y), 'bleed band does not extend the page edges', r.band);
    ok(r.plain.cm.join() === '252,144,0,0' && !r.plain.bleed, 'PDF without bleed changed', r.plain);
  });

  await step('export: website page links (#N) jump to that page in the same tab (render-11)', async () => {
    const pages = [1, 2, 3, 4].map((n) => ({ bg: { color: ['#ffffff', '#ffde59', '#38b6ff', '#00bf63'][n - 1] }, hidden: n === 2, els: n === 1 ? [['rect', { x: 200, y: 200, w: 400, h: 300, fill: '#5e17eb', link: '#3' }]] : [] }));
    await open('presentation', pages);
    // like the download dialog: hidden pages are left out
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), ev(() => A.EU.runExport('html', A.E.d.pages.filter((p) => !p.hidden)))]);
    const file = path.join(OUT, 'regress-website.html');
    await d.saveAs(file);
    const html = fs.readFileSync(file, 'utf8');
    const ids = [...html.matchAll(/<section(?: id="(\d+)")?>/g)].map((m) => m[1]);
    ok(ids.join() === '1,3,4', 'sections are not identified by page number', ids);
    const site = await ctx.newPage();
    const errs = [];
    site.on('pageerror', (e) => errs.push(e.message));
    try {
      await site.goto('file://' + path.resolve(file));
      await site.waitForSelector('a[href="#3"]');
      const opened = [];
      const onPage = (p) => opened.push(p);
      ctx.on('page', onPage);
      const box = await site.locator('a[href="#3"]').boundingBox();
      await site.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await site.waitForTimeout(600);
      ctx.off('page', onPage);
      for (const p of opened) await p.close();
      const st = await site.evaluate(() => ({ y: scrollY, top: document.getElementById('3').getBoundingClientRect().top, hash: location.hash }));
      ok(!opened.length, 'an internal link opened a new tab (render.js still writes target="_blank" for "#" links)');
      ok(st.hash === '#3' && Math.abs(st.top) < 2, 'the page did not scroll to page 3', st);
      ok(!errs.length, 'website errors', errs);
    } finally {
      await site.close();
    }
  });

  await step('export: GIF keeps every page of a design longer than 60 s and encodes frame by frame (render-13)', async () => {
    const cols = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#ff0000'];
    await open('video', cols.map((c) => ({ bg: { color: c }, duration: 5 })));
    const r = await ev(async () => {
      // minimal GIF parser: size and frame delays
      const parse = async (blob) => {
        const b = new Uint8Array(await blob.arrayBuffer());
        let i = 13 + 768;
        const delays = [];
        const skipSub = () => { while (b[i]) i += b[i] + 1; i++; };
        while (b[i] !== 0x3b) {
          if (b[i] === 0x21) { if (b[i + 1] === 0xf9) delays.push(b[i + 4] | (b[i + 5] << 8)); i += 2; skipSub(); }
          else if (b[i] === 0x2c) { i += 11; skipSub(); }
          else throw new Error('bad GIF block at ' + i);
        }
        return { delays, w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
      };
      // order of renders (r) and encoder writes (a): streaming means each frame is encoded before the next render
      let order = '';
      const enc = A.X.gifEncoder;
      A.X.gifEncoder = (...a) => { const g = enc(...a), add = g.add; g.add = (f) => { order += 'a'; add(f); }; return g; };
      const ts = [];
      const rf = A.X.renderFrame;
      A.X.renderFrame = (d, p, t, ...rest) => { order += 'r'; ts.push(t); return rf(d, p, t, ...rest); };
      try {
        const long = await parse(await A.X.gifFromDesign(A.E.d, A.E.d.pages, { maxW: 40, maxFrames: 60 }));
        const streamed = order === 'ra'.repeat(long.delays.length);
        ts.length = 0;
        const short = await parse(await A.X.gifFromDesign(A.E.d, A.E.d.pages.slice(0, 2), { maxW: 40 }));
        return { long, short, last: ts[ts.length - 1], streamed };
      } finally {
        A.X.gifEncoder = enc;
        A.X.renderFrame = rf;
      }
    });
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    ok(r.long.delays.length <= 60 && r.long.delays.length >= 55, 'frame budget not respected', r.long.delays.length);
    ok(Math.abs(sum(r.long.delays) / 100 - 65) < 1.2, 'GIF does not play for the whole 65 s design', sum(r.long.delays) / 100);
    ok(r.short.delays.length === 100 && r.short.delays.every((d) => d === 10), 'a short design is no longer 10 fps', { n: r.short.delays.length });
    ok(Math.abs(r.last - 9.9) < 1e-6, 'last frame time of the short GIF is wrong', r.last);
    ok(r.streamed, 'frames are collected before encoding instead of being encoded one by one');
  });

  await step('export: GIF last frame shows the last page of a long design (render-13)', async () => {
    const r = await ev(async () => {
      const t = A.X.totalDuration(A.E.d.pages);
      const seen = [];
      const rf = A.X.renderFrame;
      A.X.renderFrame = async (d, p, tt, canvas, ...rest) => { await rf(d, p, tt, canvas, ...rest); seen.push([...canvas.getContext('2d').getImageData(20, 10, 1, 1).data].slice(0, 3)); };
      try { await A.X.gifFromDesign(A.E.d, A.E.d.pages, { maxW: 40, maxFrames: 60 }); } finally { A.X.renderFrame = rf; }
      return { t, last: seen[seen.length - 1] };
    });
    ok(r.t === 65, 'total duration', r.t);
    ok(near(r.last, [255, 0, 0], 10), 'the last page never reaches the GIF', r.last);
  });

  await step('export: PPTX slide size stays within the PresentationML range (render-26)', async () => {
    const r = await ev(async () => {
      const out = [];
      for (const [w, h] of [[6000, 3000], [50, 50], [20000, 10], [10, 20000], [1920, 1080]]) {
        const d = A.M.newDesign({ type: 'custom', w, h });
        const s = new TextDecoder('latin1').decode(await (await A.X.pptx(d, d.pages, { scale: 100 / Math.max(w, h) })).arrayBuffer());
        const [cx, cy] = s.match(/<p:sldSz cx="(\d+)" cy="(\d+)"\/>/).slice(1).map(Number);
        const [ox, oy, pw, ph] = s.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/).slice(1).map(Number);
        out.push({ w, h, cx, cy, ox, oy, pw, ph });
      }
      return out;
    });
    for (const s of r) {
      ok(s.cx >= 914400 && s.cx <= 51206400 && s.cy >= 914400 && s.cy <= 51206400, 'slide size out of range', s);
      ok(Math.abs(s.pw / s.ph / (s.w / s.h) - 1) < 1e-3, 'picture aspect ratio distorted', s);
      ok(s.ox >= 0 && s.oy >= 0 && s.ox + s.pw <= s.cx + 1 && s.oy + s.ph <= s.cy + 1 && Math.abs(s.ox * 2 + s.pw - s.cx) <= 1 && Math.abs(s.oy * 2 + s.ph - s.cy) <= 1, 'picture not centred on the slide', s);
    }
    const hd = r[r.length - 1];
    ok(hd.cx === 1920 * 9525 && hd.cy === 1080 * 9525 && hd.ox === 0 && hd.oy === 0, 'an in-range slide size changed', hd);
  });

  await step('export: video frames are composed off-screen, so a dissolve never shows the bare outgoing page (present-6)', async () => {
    await open('video', [{ bg: { color: '#000000' }, duration: 2 }, { bg: { color: '#ffffff' }, duration: 1.5, transition: 'dissolve' }]);
    const r = await ev(async () => {
      const d = A.E.d, canvas = document.createElement('canvas');
      const px = () => canvas.getContext('2d').getImageData(5, 5, 1, 1).data[0];
      await A.X.renderFrame(d, d.pages, 1.45, canvas, 0.1, {}, '');
      // every state of the recorded canvas while later frames inside the dissolve are being rendered
      const seen = [];
      const pc = A.R.pageCanvas;
      A.R.pageCanvas = async (...a) => { seen.push(px()); const c = await pc(...a); seen.push(px()); return c; };
      const ramp = [];
      try {
        for (const t of [1.5, 1.6, 1.7, 1.8, 1.9]) {
          await A.X.renderFrame(d, d.pages, t, canvas, 0.1, {}, '');
          ramp.push(px());
        }
      } finally { A.R.pageCanvas = pc; }
      return { seen, ramp };
    });
    ok(r.ramp.every((v, i) => !i || v > r.ramp[i - 1]) && r.ramp[0] > 0 && r.ramp[4] > 200, 'dissolve does not ramp up', r.ramp);
    ok(r.seen.length && r.seen.every((v) => v > 0), 'the recorded canvas showed the un-blended page mid-frame', r.seen);
  });

  await step('export: recorded dissolve brightens steadily without flicker frames (present-6)', async () => {
    await open('video', [{ bg: { color: '#000000' }, duration: 2 }, { bg: { color: '#ffffff' }, duration: 1.5, transition: 'dissolve' }]);
    const r = await ev(async () => {
      const { blob } = await A.X.video(A.E.d, A.E.d.pages, { scale: 0.1 });
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(blob);
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      const g = c.getContext('2d', { willReadFrequently: true });
      const out = [];
      await new Promise((res, rej) => {
        v.onerror = () => rej(new Error('video decode failed'));
        const tick = (_, m) => { g.drawImage(v, 0, 0, 8, 8); out.push([+m.mediaTime.toFixed(2), g.getImageData(4, 4, 1, 1).data[0]]); v.requestVideoFrameCallback(tick); };
        v.requestVideoFrameCallback(tick);
        v.onended = res;
        v.play().catch(rej);
      });
      URL.revokeObjectURL(v.src);
      return out;
    });
    // once the dissolve has started, no frame falls back towards the black outgoing page
    const mid = r.filter(([, v]) => v > 20 && v < 235);
    ok(mid.length >= 6, 'too few blended frames in the 0.6 s dissolve', r);
    const back = r.filter(([, v], i) => i && v < r[i - 1][1] - 20);
    ok(!back.length, 'flicker frames inside the dissolve', { back, r });
  });

  await step('export: total duration is rounded in the timeline (present-11)', async () => {
    await open('video', [0, 1, 2, 3].map(() => ({ bg: { color: '#ffffff' }, duration: 5 })));
    // real drags on the timeline grips: 5 s -> 1.1, 2.2, 0.5, 0.5
    for (const [i, target] of [[0, 1.1], [1, 2.2], [2, 0.5], [3, 0.5]]) {
      const grip = page.locator('.tl-block .tl-grip').nth(i);
      await grip.scrollIntoViewIfNeeded();
      const b = await grip.boundingBox();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (target - 5) * 34, y, { steps: 6 });
      await page.mouse.up();
      await wait(80);
    }
    const durs = await ev(() => A.E.d.pages.map((p) => p.duration));
    ok(durs.join() === '1.1,2.2,0.5,0.5', 'grip drags set other durations', durs);
    const label = await page.locator('.tl-total').textContent();
    ok(label === 'Total 4.3s', 'timeline total shows float noise', label);
  });
}
