// Regression checks (present): present mode, the editor animation preview and the phone editor layout.
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  // a design whose page k shows 'PAGE k'; s: { n, dur, pages: [page fields], els: [[element specs]] }
  const open = async (type, s = {}, p = page) => {
    await p.evaluate(([type, s]) => {
      if (document.querySelector('.present')) A.Present.stop(); // left open by a failed step
      const pages = Array.from({ length: s.n || 1 }, (_, k) => {
        const pg = Object.assign(A.M.newPage({ duration: s.dur || 5 }), s.pages?.[k]);
        pg.elements.push(A.M.newText({ text: 'PAGE ' + (k + 1), x: 100, y: 100, w: 700, h: 110, size: 80 }));
        for (const e of s.els?.[k] || []) pg.elements.push(e.type === 'text' ? A.M.newText(e) : A.M.newShape(e.shape || 'rect', e));
        return pg;
      });
      return A.Home.newDesign({ type, ...s.size, pages });
    }, [type, s]);
    await p.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await p.waitForTimeout(300);
  };
  const present = (opts) => ev((o) => { A.Present.start({ fullscreen: false, autoplay: false, ...o }); }, opts);
  const count = (p = page) => p.evaluate(() => document.querySelector('.pr-count')?.textContent);
  const slideText = () => ev(() => [...document.querySelectorAll('.pr-layer')].pop().textContent);
  // centre of the last match (animated slides replace their nodes every frame, so measure in one go)
  const center = (sel, p = page) => p.evaluate((sel) => { const r = [...document.querySelectorAll(sel)].pop().getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  // a press held like a human click
  const press = async ([x, y]) => { await page.mouse.move(x, y); await page.mouse.down(); await wait(80); await page.mouse.up(); };
  const exit = async () => { await ev(() => A.Present.stop?.()); await page.waitForSelector('.present', { state: 'detached' }); };

  await step('present: a video autoplay ends once and gives the editor back (present-1)', async () => {
    await open('video', { n: 3, dur: 0.6 });
    await ev(() => { window.__setPage = A.E.setPage; window.__sp = 0; A.E.setPage = (...a) => (window.__sp++, window.__setPage(...a)); });
    try {
      await ev(() => A.E.setPage(0));
      await present({ autoplay: true });
      await page.waitForSelector('.present', { state: 'detached', timeout: 5000 });
      const n1 = await ev(() => window.__sp);
      await wait(400);
      const s = await ev(() => ({ n: window.__sp, active: A.Present.active, pi: A.E.pi }));
      ok(s.n === n1 && !s.active && s.pi === 2, 'stop() keeps running after the end', { n1, ...s });
    } finally {
      await ev(() => { A.E.setPage = window.__setPage; });
    }
    const b = await page.locator('.tl-block').first().boundingBox();
    await page.mouse.click(b.x + 20, b.y + 20);
    ok((await ev(() => A.E.pi)) === 0, 'timeline click did not change page');
    // a second presentation keeps the editor shortcuts off
    await present();
    const n0 = await ev(() => A.E.els().length);
    await page.keyboard.press('r');
    const s2 = await ev(() => ({ active: A.Present.active, n: A.E.els().length }));
    ok(s2.active && s2.n === n0, 'editor shortcut ran during the second presentation', { n0, ...s2 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.present', { state: 'detached' });
  });

  await step('present: clicks advance and follow links on animated slides (present-2)', async () => {
    await open('presentation', { n: 4, pages: [{ anim: 'fade' }], els: [[{ id: 'lnk', x: 1300, y: 600, w: 400, h: 300, link: '#3', anim: { emph: 'pulse' } }]] });
    await ev(() => A.E.setPage(0));
    await present();
    await wait(1200);
    // blank part of the slide
    await press([150, 820]);
    ok((await count()) === '2 / 4', 'click on an animated slide did not advance', await count());
    await page.keyboard.press('ArrowLeft');
    await wait(300);
    await press(await center('.pr-layer [data-id="lnk"]'));
    ok((await count()) === '3 / 4', 'link on an animated slide did not go to page 3', await count());
    await exit();
  });

  await step('present: a soundtrack uploaded in this session plays (present-5)', async () => {
    await open('presentation', { n: 1 });
    await ev(async () => {
      // 0.1 s of silence as a WAV file
      const n = 800, v = new DataView(new ArrayBuffer(44 + n * 2));
      const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
      const a = await A.S.addAsset(new Blob([v.buffer], { type: 'audio/wav' }), { name: 'beep.wav' });
      A.E.d.audio = a.id;
      A.E.changed({ all: true });
      window.__Audio = window.Audio;
      window.__audio = [];
      window.Audio = function (src) { const x = new window.__Audio(src); window.__audio.push(x); return x; };
    });
    try {
      await page.click('.ed-top .top-btn:has-text("Present")');
      await page.waitForFunction(() => window.__audio.length && (window.__audio[0].readyState > 0 || window.__audio[0].error), null, { timeout: 3000 });
      const a = await ev(() => ({ src: window.__audio[0].src.slice(0, 5), error: window.__audio[0].error?.code ?? null }));
      ok(a.src === 'blob:' && a.error === null, 'soundtrack did not load', a);
    } finally {
      await ev(() => { window.Audio = window.__Audio; });
      await exit();
      await ev(() => document.fullscreenElement && document.exitFullscreen());
    }
  });

  // the page's markup equals a fresh static render
  const isStatic = (i) => ev((i) => { const s = A.E.blocks[i].svg, h = s.innerHTML; A.E.renderPage(i); return h === s.innerHTML; }, i);
  await step('present: changing page during the animation preview stops it and leaves both pages static (present-9)', async () => {
    await open('social', { n: 2, pages: [{ anim: 'fade' }] });
    await ev(() => A.E.setPage(0));
    await page.locator('.page-block[data-pi="1"] .page-frame').scrollIntoViewIfNeeded();
    const f = await page.locator('.page-block[data-pi="1"] .page-frame').boundingBox();
    await ev(() => A.Present.preview());
    await wait(60);
    await page.mouse.click(f.x + 10, f.y + f.height - 10);
    await page.waitForFunction(() => !A.Present.previewing, null, { timeout: 1000 });
    ok((await ev(() => A.E.pi)) === 1 && (await isStatic(0)) && (await isStatic(1)), 'a page was left mid-animation');
    // one page at a time: the rebuilt page is static too
    await open('presentation', { n: 2, pages: [{ anim: 'fade' }, { anim: 'fade' }] });
    await ev(() => A.Present.preview());
    await wait(60);
    const b = await page.locator('.tl-block').nth(1).boundingBox();
    await page.mouse.click(b.x + 20, b.y + 20);
    await page.waitForFunction(() => !A.Present.previewing, null, { timeout: 1000 });
    ok((await ev(() => A.E.pi)) === 1 && (await isStatic(1)), 'the new page was left mid-animation');
  });

  await step('present: a "#3" link goes to design page 3 when an earlier page is hidden (present-10)', async () => {
    await open('presentation', { n: 4, pages: [{}, { hidden: true }], els: [[{ id: 'lnk3', x: 1300, y: 600, w: 400, h: 300, link: '#3' }]] });
    await ev(() => A.E.setPage(0));
    await present();
    await page.mouse.click(...(await center('.pr-layer [data-id="lnk3"]')));
    const s = { count: await count(), text: await slideText() };
    ok(s.count === '2 / 3' && s.text.includes('PAGE 3'), 'link went to the wrong page', s);
    await exit();
  });

  await step('present: Present from a full-screen editor fills the screen and gives it back on exit (present-12)', async () => {
    await open('presentation', { n: 2 });
    await page.click('.ed-bottom button[title="Full screen"]');
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
    await page.click('.ed-top .top-btn:has-text("Present")');
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('present'), null, { timeout: 2000 });
    await page.click('.pr-btn[title^="Exit"]');
    await page.waitForSelector('.present', { state: 'detached' });
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement, null, { timeout: 2000 });
    await ev(() => document.exitFullscreen());
  });

  await step('present: turning Autoplay on mid-slide does not replay the slide (present-13)', async () => {
    await open('presentation', { n: 2, els: [[{ type: 'text', id: 'ttl', text: 'Title', x: 200, y: 400, w: 800, h: 120, size: 90, anim: { in: 'rise' } }]] });
    await ev(() => A.E.setPage(0));
    await present();
    await wait(1500);
    const op = () => ev(() => [...document.querySelectorAll('.pr-layer [data-id="ttl"]')].pop().getAttribute('opacity'));
    ok((await op()) === null, 'title not settled before the toggle', await op());
    await page.click('.pr-btn[title="Autoplay"]');
    await wait(50);
    const s = { opacity: await op(), count: await count(), on: await ev(() => document.querySelector('.pr-btn[title="Autoplay"]').classList.contains('on')) };
    ok(s.opacity === null && s.count === '1 / 2' && s.on, 'the slide replayed', s);
    await exit();
  });

  await step('present: Ctrl/Cmd shortcuts are left to the browser (present-17)', async () => {
    await open('presentation', { n: 3 });
    await ev(() => A.E.setPage(0));
    await present({ presenter: true });
    const st = () => ev(() => ({ count: document.querySelector('.pr-count').textContent, presenter: document.querySelector('.present').classList.contains('presenter') }));
    await page.keyboard.press('Control+p');
    await page.keyboard.press('Control+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    const a = await st();
    ok(a.count === '1 / 3' && a.presenter, 'modified keys ran present commands', a);
    await page.keyboard.press('p');
    await page.keyboard.press('ArrowRight');
    const b = await st();
    ok(b.count === '2 / 3' && !b.presenter, 'plain keys stopped working', b);
    await exit();
  });

  // ---------- phones ----------
  const phone = async (w, hgt, fn) => {
    const ctx = await page.context().browser().newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    try {
      await p.goto(page.url().split('#')[0] + '#/home');
      await p.waitForSelector('.hero');
      const cdp = await ctx.newCDPSession(p);
      const pts = ([x, y]) => [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
      // one-finger touch drag
      const drag = async (from, to, steps = 8) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
        for (let k = 1; k <= steps; k++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts([from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps]) });
          await p.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p.waitForTimeout(150);
      };
      await fn(p, drag);
      ok(!errs.length, 'page errors', errs);
    } finally {
      await ctx.close();
    }
  };
  // every top-bar control is on screen, uncovered and not squeezed
  const topBar = (p) => p.evaluate(() => {
    const bad = [...document.querySelectorAll('.ed-top button')].filter((b) => b.offsetParent).filter((b) => {
      const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.left < 0 || r.right > innerWidth || r.width < 28 || !b.contains(hit);
    }).map((b) => b.title || b.textContent.trim());
    return { bad, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  const layout = (p) => p.evaluate(() => {
    const s = A.E.scrollEl, tb = A.EU.toolbar.getBoundingClientRect(), b = A.E.blocks[A.E.pi].el;
    s.scrollTop = 0;
    const head = b.querySelector('.page-head').getBoundingClientRect(), frame = b.querySelector('.page-frame').getBoundingClientRect();
    const tools = [...b.querySelectorAll('.page-tools button')].filter((x) => { const r = x.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; }).map((x) => x.title);
    return { topBottom: document.querySelector('.ed-top').getBoundingClientRect().bottom, tbTop: tb.top, tbBottom: tb.bottom, headTop: head.top, headRight: head.right, frameRight: frame.right, tools, sw: s.scrollWidth, cw: s.clientWidth, sh: s.scrollHeight, ch: s.clientHeight };
  });

  await step('phone: the top bar, toolbar and first page stay reachable and the canvas scrolls (touch-1, plan 3)', () => phone(390, 844, async (p, drag) => {
    await open('social', { n: 2 }, p);
    const l = await layout(p);
    ok(l.tbTop >= l.topBottom && l.headTop >= l.tbBottom && l.sh > l.ch, 'canvas spills over the bars', l);
    // drag the canvas by the second page's head (the page itself takes touches)
    const [hx, hy] = await center('.page-block[data-pi="1"] .page-num', p);
    await drag([hx, hy], [hx, hy - 250]);
    ok((await p.evaluate(() => A.E.scrollEl.scrollTop)) > 100, 'canvas did not scroll by touch');
    ok(!(await topBar(p)).bad.length, 'top bar controls covered', await topBar(p));
    await p.evaluate(() => { A.E.add(A.M.newShape('rect', { w: 200, h: 200 })); A.E.deselect(); });
    const n = await p.evaluate(() => A.E.els().length);
    await p.tap('.ed-top button[title^="Undo"]');
    ok((await p.evaluate(() => A.E.els().length)) === n - 1, 'tapping Undo did nothing');
  }));

  await step('phone: small and landscape screens keep the toolbar below the top bar (touch-1)', async () => {
    for (const [w, hgt] of [[320, 640], [667, 375]]) await phone(w, hgt, async (p) => {
      await open('presentation', { n: 3 }, p);
      const l = await layout(p);
      ok(l.tbTop >= l.topBottom && l.ch > 100, w + 'x' + hgt + ' toolbar or canvas', l);
    });
  });

  await step('phone: the page head fits the page and nothing overflows sideways (touch-9)', async () => {
    for (const w of [390, 320]) await phone(w, 700, async (p) => {
      for (const type of ['presentation', 'social']) {
        await open(type, { n: 1 }, p);
        const l = await layout(p);
        ok(l.headRight <= l.frameRight + 1 && !l.tools.length && l.sw <= l.cw, w + ' ' + type, l);
      }
    });
  });

  await step('phone: the top bar fits 320-360px screens (touch-13)', async () => {
    for (const w of [320, 360]) await phone(w, 640, async (p) => {
      for (const type of ['presentation', 'whiteboard']) {
        await open(type, {}, p);
        const t = await topBar(p);
        ok(!t.bad.length && t.overflow <= 0, w + ' ' + type, t);
      }
    });
  });

  await step('phone: panels open below the canvas, so added elements and the whole page stay reachable (touch-3)', () => phone(390, 844, async (p, drag) => {
    await open('custom', { size: { w: 1080, h: 1920 } }, p);
    await p.tap('.rail-btn[data-p="text"]');
    await p.waitForTimeout(400);
    await p.tap('.text-add.heading');
    await p.waitForTimeout(300);
    const a = await p.evaluate(() => {
      const r = document.querySelector(`.page-block.active .page-svg [data-id="${A.E.sel[0]}"]`).getBoundingClientRect(), sheet = document.querySelector('.panel-wrap').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { inFrame: !!hit?.closest('.page-frame'), bottom: r.bottom, sheetTop: sheet.top, sheetH: sheet.height };
    });
    ok(a.inFrame && a.bottom <= a.sheetTop && a.sheetH > 200, 'new heading is under the sheet', a);
    // drawing reaches the bottom of a tall page with the sheet open
    await p.tap('.rail-btn[data-p="draw"]');
    await p.waitForTimeout(400);
    const d = await p.evaluate(() => {
      const s = A.E.scrollEl;
      s.scrollTop = s.scrollHeight;
      const f = A.E.blocks[A.E.pi].frame.getBoundingClientRect(), sheet = document.querySelector('.panel-wrap').getBoundingClientRect();
      return { tool: A.E.tool, frame: [f.left, f.bottom], scrollBottom: s.getBoundingClientRect().bottom, sheetTop: sheet.top, n: A.E.els().length };
    });
    ok(d.tool === 'draw' && d.frame[1] <= d.sheetTop && d.scrollBottom <= d.sheetTop + 1, 'page bottom unreachable', d);
    await drag([d.frame[0] + 60, d.frame[1] - 40], [d.frame[0] + 200, d.frame[1] - 20]);
    ok((await p.evaluate(() => A.E.els().length)) === d.n + 1, 'no stroke drawn at the page bottom');
  }));

  await step('phone: dragging a timeline duration grip by touch ends cleanly (touch-5)', () => phone(390, 844, async (p, drag) => {
    await open('presentation', { n: 4 }, p);
    await p.evaluate(() => A.E.setPage(0));
    const [x, y] = await center('.tl-block:first-child .tl-grip', p);
    await drag([x, y], [x + 80, y]);
    const d1 = await p.evaluate(() => A.E.d.pages[0].duration);
    ok(d1 >= 8, 'grip drag was cut short', d1);
    const [cx, cy] = await center('.page-block.active .page-frame', p);
    await drag([cx, cy], [cx - 120, cy + 40]);
    const d2 = await p.evaluate(() => A.E.d.pages[0].duration);
    ok(d2 === d1, 'a later drag changed the duration', { d1, d2 });
  }));

  await step('phone: resize handles have a finger-sized hit area (touch-7)', () => phone(390, 844, async (p, drag) => {
    await open('presentation', { els: [[{ id: 'box', x: 600, y: 300, w: 600, h: 400 }]] }, p);
    await p.tap('.page-block.active .page-svg [data-id="box"]');
    await p.waitForSelector('.handle.se');
    const [x, y] = await center('.handle.se', p);
    await drag([x + 7, y + 7], [x + 47, y + 37]);
    const s = await p.evaluate(() => ({ w: A.E.byId('box').w, sel: A.E.sel.join() }));
    ok(s.w > 600 && s.sel === 'box', 'touch near the handle did not resize', s);
  }));

  await step('phone: present-mode controls come back on tap, and swipes change slides (touch-8)', () => phone(390, 844, async (p, drag) => {
    await open('presentation', { n: 4 }, p);
    await p.evaluate(() => { A.E.setPage(0); A.Present.start({ fullscreen: false }); });
    const bar = await p.evaluate(() => { const r = document.querySelector('.pr-bar').getBoundingClientRect(); return [r.left, r.right, r.height]; });
    ok(bar[0] >= 0 && bar[1] <= 390 && bar[2] < 60, 'bar squeezed', bar);
    await p.waitForSelector('.present.idle', { timeout: 4000 });
    const exitAt = await center('.pr-btn[title^="Exit"]', p);
    ok(!(await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y).closest('.pr-btn'), exitAt)), 'hidden buttons still take taps');
    await p.touchscreen.tap(195, 300);
    await p.waitForTimeout(150);
    const s1 = { count: await count(p), idle: await p.evaluate(() => document.querySelector('.present').classList.contains('idle')) };
    ok(s1.count === '1 / 4' && !s1.idle, 'tap on hidden controls advanced instead of showing them', s1);
    await p.touchscreen.tap(195, 300);
    await p.waitForTimeout(150);
    ok((await count(p)) === '2 / 4', 'tap did not advance', await count(p));
    await drag([300, 300], [100, 310]);
    ok((await count(p)) === '3 / 4', 'swipe left did not go forward', await count(p));
    await drag([100, 300], [300, 290]);
    ok((await count(p)) === '2 / 4', 'swipe right did not go back', await count(p));
    await p.tap('.pr-btn[title^="Exit"]');
    await p.waitForSelector('.present', { state: 'detached' });
  }));
}
