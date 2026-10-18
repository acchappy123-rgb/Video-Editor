// Canvas navigation (wave 2): Space and middle-button panning, wheel scroll and anchored Ctrl+wheel zoom,
// Shift+0/1/2, the bottom-bar zoom menu, touch panning with long-press / Select-mode selection boxes and
// double-tap to fit, and a steady view when switching pages.
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  // Opens a new design of `type` whose first page holds `els` (partial element objects for the A.M factories).
  const open = async (type, els = [], { pages = 1 } = {}, p = page) => {
    await p.evaluate(() => A.app.go('#/home'));
    await p.waitForSelector('.hero');
    // a failed step can leave Space or a mouse button held
    await p.keyboard.up('Space');
    await p.mouse.up();
    await p.evaluate(async ([type, els, pages]) => {
      const M = A.M;
      const mk = (o) => {
        const el = o.type === 'text' ? M.newText(o) : M.newShape(o.shape || 'rect', o);
        if (el.type === 'text') el.h = A.R.textHeight(el);
        return el;
      };
      await A.Home.newDesign({ type, pages: Array.from({ length: pages }, (_, i) => M.newPage({ elements: i ? [] : els.map(mk) })) });
    }, [type, els, pages]);
    await p.waitForFunction(() => A.E.d && A.E.blocks[A.E.pi]?.svg.isConnected);
    await p.waitForTimeout(300);
    await p.evaluate(() => document.activeElement?.blur?.());
  };
  // client point of a page point on the active page
  const at = (x, y, p = page) => p.evaluate(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  // zoom to z and scroll so page point (x, y) is in the middle of the canvas (test setup)
  const view = (z, x, y, p = page) => p.evaluate(([z, x, y]) => {
    A.E.setZoom(z);
    const w = A.E.scrollEl, r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(), s = w.getBoundingClientRect();
    w.scrollLeft += r.left + x * A.E.zoom - s.left - w.clientWidth / 2;
    w.scrollTop += r.top + y * A.E.zoom - s.top - w.clientHeight / 2;
  }, [z, x, y]);
  const st = (p = page) => p.evaluate(() => ({
    l: A.E.scrollEl.scrollLeft, t: A.E.scrollEl.scrollTop, zoom: A.E.zoom, sel: A.E.sel.join(), n: A.E.hist.length, hi: A.E.hi,
    els: JSON.stringify(A.E.els().map((e) => [e.id, e.x, e.y, e.w, e.h])), marquee: !!document.querySelector('.marquee'),
  }));
  const middle = () => ev(() => { const w = A.E.scrollEl, s = w.getBoundingClientRect(); return { x: s.left + w.clientWidth / 2, y: s.top + w.clientHeight / 2 }; });
  const els = [{ id: 's1', x: 800, y: 400, w: 300, h: 200 }, { id: 's2', x: 1300, y: 700, w: 200, h: 150 }, { id: 't', type: 'text', text: 'Hello', x: 200, y: 150, w: 500, size: 60 }];

  await step('nav: holding Space turns a drag into a pan (over elements too): no marquee, no move, same selection', async () => {
    await open('presentation', els);
    await view(2, 950, 500);
    await ev(() => A.E.select(['s1']));
    const c = await middle(), s0 = await st();
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Space');
    const held = await ev(([x, y]) => ({ cls: document.body.classList.contains('tool-pan'), cur: getComputedStyle(document.elementFromPoint(x, y)).cursor }), [c.x, c.y]);
    ok(held.cls && held.cur === 'grab', 'no hand cursor while Space is held', held);
    await page.mouse.down();
    await page.mouse.move(c.x + 100, c.y + 75, { steps: 4 });
    const mid = await st();
    const grabbing = await ev(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [c.x + 100, c.y + 75]);
    ok(grabbing === 'grabbing', 'no grabbing cursor while panning', grabbing);
    await page.mouse.move(c.x + 200, c.y + 150, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const s1 = await st();
    ok(!mid.marquee && !s1.marquee, 'a marquee appeared');
    ok(Math.abs(s0.l - s1.l - 200) <= 2 && Math.abs(s0.t - s1.t - 150) <= 2, 'Space-drag did not pan by the drag', { s0, s1 });
    ok(s1.sel === 's1' && s1.els === s0.els && s1.n === s0.n && s1.hi === s0.hi, 'Space-drag changed the design or the selection', { s0, s1 });
    ok(!(await ev(() => document.body.classList.contains('tool-pan'))), 'hand cursor stays after Space is released');
    // without Space the same drag on empty canvas draws a selection box again (the view now centres on 850, 425)
    const e0 = await at(620, 290), e1 = await at(760, 380);
    await page.mouse.move(e0.x, e0.y);
    await page.mouse.down();
    await page.mouse.move(e1.x, e1.y, { steps: 5 });
    const m = await st();
    await page.mouse.up();
    ok(m.marquee && Math.abs(m.l - s1.l) < 1, 'plain drag no longer makes a selection box', m);
    // a double-click with Space held doesn't open the shape's text editor
    const s = await at(900, 450);
    await page.keyboard.down('Space');
    await page.mouse.dblclick(s.x, s.y);
    await page.keyboard.up('Space');
    ok(!(await ev(() => A.E.editingId)), 'Space + double-click edited the shape');
  });

  await step('nav: middle-button drag pans, also from a resize handle and while editing text', async () => {
    await open('presentation', els);
    await view(2, 950, 500);
    await ev(() => A.E.select(['s1']));
    const h = await page.locator('.handle.se').boundingBox(), s0 = await st();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(h.x - 150, h.y - 100, { steps: 6 });
    ok(!(await st()).marquee, 'marquee while middle-dragging');
    await page.mouse.up({ button: 'middle' });
    const s1 = await st();
    ok(Math.abs(s1.l - s0.l - 157) <= 3 && Math.abs(s1.t - s0.t - 107) <= 3, 'middle-drag did not pan', { s0, s1 });
    ok(s1.els === s0.els && s1.sel === 's1' && s1.n === s0.n, 'middle-drag resized or changed the selection', { s0, s1 });
    // the text editor stays open while the canvas pans under it
    await view(1, 450, 300);
    const t = await at(250, 180);
    await page.mouse.dblclick(t.x, t.y);
    await page.waitForSelector('textarea');
    const c = await middle();
    await page.mouse.move(c.x, c.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(c.x + 60, c.y + 40, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    const e = await ev(() => ({ id: A.E.editingId, focus: document.activeElement === A.E.textArea }));
    ok(e.id === 't', 'middle-drag closed the text editor', e);
    // Space types into the text instead of panning
    await page.keyboard.press('End');
    await page.keyboard.press('Space');
    await page.keyboard.type('there');
    await page.keyboard.press('Escape');
    const txt = await ev(() => ({ text: A.E.byId('t').text, pan: document.body.classList.contains('tool-pan') }));
    ok(txt.text === 'Hello there' && !txt.pan, 'Space while typing', txt);
  });

  await step('nav: Space on a focused button away from the canvas presses it; over the canvas it pans', async () => {
    await open('presentation', els);
    await view(1.5, 950, 500);
    const bar = await page.locator('.ed-top').boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.focus('.ed-bottom button[title="Zoom in"]');
    const z0 = (await st()).zoom;
    await page.keyboard.press('Space');
    const z1 = (await st()).zoom;
    ok(z1 > z0 * 1.1 && !(await ev(() => document.body.classList.contains('tool-pan'))), 'Space did not press the focused button', { z0, z1 });
    const c = await middle();
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Space');
    ok(await ev(() => document.body.classList.contains('tool-pan')), 'Space over the canvas did not start panning');
    await page.keyboard.up('Space');
    ok((await st()).zoom === z1, 'Space over the canvas also pressed the button');
    // the window losing focus with Space held ends the pan mode
    await page.keyboard.down('Space');
    await ev(() => dispatchEvent(new Event('blur')));
    ok(!(await ev(() => document.body.classList.contains('tool-pan') || A.E.spaceDown)), 'pan mode survived a window blur');
    await page.keyboard.up('Space');
  });

  await step('nav: a plain wheel scrolls; Ctrl+wheel zooms about the cursor (a shape corner stays put)', async () => {
    await open('presentation', els);
    await view(1, 950, 500);
    const s0 = await st();
    const c = await middle();
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, 200);
    await page.waitForFunction((t) => A.E.scrollEl.scrollTop > t + 100, s0.t);
    const s1 = await st();
    ok(s1.zoom === s0.zoom && s1.t > s0.t + 100, 'plain wheel', { s0, s1 });
    const k = await at(800, 400);
    await page.mouse.move(k.x, k.y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -60); await wait(60); }
    await page.keyboard.up('Control');
    const k1 = await at(800, 400), z = (await st()).zoom;
    ok(z > 1.3, 'Ctrl+wheel did not zoom in', z);
    ok(Math.hypot(k1.x - k.x, k1.y - k.y) < 2, 'the corner under the cursor moved', { k, k1, z });
    ok((await st()).n === s0.n, 'zooming added an undo step');
  });

  await step('nav: Shift+0 is 100%, Shift+1 fits the page, Shift+2 zooms to the selection', async () => {
    await open('presentation', els);
    await page.keyboard.press('Shift+0');
    ok((await st()).zoom === 1, 'Shift+0', await st());
    await page.keyboard.press('Shift+1');
    const f = await ev(() => ({ z: A.E.zoom, fit: A.E.fitZoom() }));
    ok(Math.abs(f.z - f.fit) < 1e-9 && f.z < 1, 'Shift+1', f);
    // nothing selected: a hint, no zoom
    await page.keyboard.press('Shift+2');
    ok((await st()).zoom === f.z && (await page.locator('.toast:has-text("Select something")').count()), 'Shift+2 without a selection');
    const s2 = await at(1400, 775);
    await page.mouse.click(s2.x, s2.y);
    ok((await st()).sel === 's2', 'click did not select s2');
    const n0 = (await st()).n;
    await page.keyboard.press('Shift+2');
    const g = await ev(() => {
      const w = A.E.scrollEl, s = w.getBoundingClientRect(), b = document.querySelector('.sel-box').getBoundingClientRect();
      return { dx: b.left + b.width / 2 - (s.left + w.clientWidth / 2), dy: b.top + b.height / 2 - (s.top + w.clientHeight / 2), fw: b.width / w.clientWidth, fh: b.height / w.clientHeight, zoom: A.E.zoom };
    });
    ok(Math.abs(g.dx) <= 4 && Math.abs(g.dy) <= 4 && Math.max(g.fw, g.fh) >= 0.6 && g.fw <= 1 && g.fh <= 1, 'zoom to selection', g);
    ok((await st()).n === n0 && (await st()).sel === 's2', 'zoom to selection changed history or selection');
    // Ctrl+0 still fits
    await page.keyboard.press('Control+0');
    ok(Math.abs((await st()).zoom - f.fit) < 1e-9, 'Ctrl+0 no longer fits');
  });

  await step('nav: the bottom-bar zoom menu offers 25-200%, Fit page, Fill width and Zoom to selection', async () => {
    await open('presentation', els);
    await page.click('.ed-bottom .zoom-label');
    const items = await page.locator('.zoom-menu .menu-item .menu-label').allTextContents();
    ok(JSON.stringify(items) === JSON.stringify(['25%', '50%', '100%', '200%', 'Fit page', 'Fill width', 'Zoom to selection']), 'menu items', items);
    ok(await page.locator('.zoom-menu .menu-item.disabled:has-text("Zoom to selection")').count(), 'Zoom to selection enabled with nothing selected');
    await page.click('.zoom-menu .menu-item:has-text("50%")');
    ok((await st()).zoom === 0.5 && (await page.textContent('.zoom-label')) === '50%' && !(await page.locator('.zoom-menu').count()), 'picking 50%');
    await page.click('.ed-bottom .zoom-label');
    ok(await page.locator('.zoom-menu .menu-item:has-text("50%") svg').count(), '50% not ticked');
    await page.click('.zoom-menu .menu-item:has-text("Fill width")');
    const fw = await ev(() => { const w = A.E.scrollEl, cs = getComputedStyle(A.E.pagesEl); return { frame: A.E.blocks[A.E.pi].frame.getBoundingClientRect().width, room: w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), sw: w.scrollWidth, cw: w.clientWidth }; });
    ok(Math.abs(fw.frame - fw.room) <= 2 && fw.sw <= fw.cw + 1, 'fill width', fw);
    await page.click('.ed-bottom .zoom-label');
    await page.click('.zoom-menu .menu-item:has-text("Fit page")');
    ok(await ev(() => Math.abs(A.E.zoom - A.E.fitZoom()) < 1e-9), 'fit page');
    const c = await at(950, 500);
    await page.mouse.click(c.x, c.y);
    await page.click('.ed-bottom .zoom-label');
    await page.click('.zoom-menu .menu-item:has-text("Zoom to selection")');
    const g = await ev(() => { const w = A.E.scrollEl, s = w.getBoundingClientRect(), b = document.querySelector('.sel-box').getBoundingClientRect(); return [b.left + b.width / 2 - (s.left + w.clientWidth / 2), b.top + b.height / 2 - (s.top + w.clientHeight / 2), A.E.zoom]; });
    ok(Math.abs(g[0]) <= 4 && Math.abs(g[1]) <= 4 && g[2] > 1, 'menu zoom to selection', g);
  });

  await step('nav: the zoom menu works from the keyboard without editing or nudging the selection', async () => {
    await open('presentation', els);
    await ev(() => A.E.select(['t']));
    const s0 = await st();
    await page.focus('.ed-bottom .zoom-label');
    await page.keyboard.press('Enter');
    ok((await ev(() => document.activeElement?.textContent)) === '25%', 'menu did not take the focus');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    ok((await ev(() => document.activeElement?.textContent)).startsWith('100%'), 'arrow keys did not move through the menu');
    await page.keyboard.press('Enter');
    const s1 = await st();
    const f = await ev(() => ({ label: document.activeElement?.classList.contains('zoom-label'), editing: A.E.editingId, menu: !!document.querySelector('.zoom-menu') }));
    ok(s1.zoom === 1 && f.label && !f.editing && !f.menu, 'keyboard pick', { zoom: s1.zoom, ...f });
    ok(s1.els === s0.els && s1.sel === 't' && s1.n === s0.n, 'keys reached the canvas', { s0, s1 });
    // Space opens it too, Escape closes it and gives the focus back
    await page.keyboard.press('Space');
    ok(await page.locator('.zoom-menu').count(), 'Space did not open the menu');
    await page.keyboard.press('Escape');
    ok(!(await page.locator('.zoom-menu').count()) && (await ev(() => document.activeElement?.classList.contains('zoom-label'))), 'Escape');
  });

  await step('nav: panning and zooming work on a locked page without changing it', async () => {
    await open('presentation', els);
    await ev(() => { A.E.page().locked = true; A.E.changed({ structure: true }); });
    await view(2, 950, 500);
    const s0 = await st(), c = await middle();
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(c.x - 120, c.y - 80, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await page.keyboard.press('Shift+1');
    const s1 = await st();
    ok(s1.els === s0.els && s1.n === s0.n && !(await page.locator('.toast:has-text("locked")').count()), 'locked page changed or warned', { s0, s1 });
    ok(s1.zoom < 1, 'Shift+1 on a locked page', s1);
  });

  await step('nav: switching pages keeps the view steady (strip keeps its scroll, pages line up)', async () => {
    await open('presentation', els, { pages: 3 });
    await view(1.5, 700, 400);
    const s0 = await st();
    const b = await page.locator('.tl-block').nth(2).boundingBox();
    await page.mouse.click(b.x + 10, b.y + 10);
    await wait(300);
    const s1 = await st();
    ok((await ev(() => A.E.pi)) === 2 && s1.l === s0.l && s1.t === s0.t && s1.zoom === s0.zoom, 'timeline switch moved the view', { s0, s1 });
    await page.keyboard.press('ArrowLeft');
    await wait(300);
    const s2 = await st();
    ok((await ev(() => A.E.pi)) === 1 && s2.l === s0.l && s2.t === s0.t, 'arrow-key switch moved the view', { s0, s2 });
    await page.click('.ed-timeline .tl-add');
    await wait(300);
    const s3 = await st();
    ok((await ev(() => A.E.d.pages.length)) === 4 && s3.l === s0.l && s3.t === s0.t, 'adding a page moved the view', { s0, s3 });
    // pages under each other: the new page takes the old page's place on screen
    await open('social', [], { pages: 5 });
    await ev(() => { A.E.setZoom(1); const w = A.E.scrollEl; w.scrollTop += A.E.blocks[0].frame.getBoundingClientRect().top - w.getBoundingClientRect().top + 300; w.scrollLeft = 40; });
    const top = (i) => ev((i) => A.E.blocks[i].frame.getBoundingClientRect().top - A.E.scrollEl.getBoundingClientRect().top, i);
    const t0 = await top(0), l0 = (await st()).l;
    await page.click('.ed-bottom .page-info');
    await page.click('.pg-card >> nth=3');
    await page.waitForFunction(() => A.E.pi === 3);
    await wait(900);
    const t3 = await top(3);
    ok(Math.abs(t3 - t0) <= 2 && (await st()).l === l0, 'grid view switch', { t0, t3, l0, l: (await st()).l });
    // a page that is already wholly in view doesn't move
    await page.keyboard.press('Shift+1');
    await wait(100);
    const v = await ev(() => { const s = A.E.scrollEl.getBoundingClientRect(); return [0, 1, 2, 3, 4].map((i) => { const r = A.E.blocks[i].el.getBoundingClientRect(); return r.top >= s.top && r.bottom <= s.top + A.E.scrollEl.clientHeight; }); });
    const shown = v.indexOf(true);
    ok(shown >= 0, 'no page wholly in view at fit', v);
    const before = await st();
    await page.click('.ed-bottom .page-info');
    await page.click(`.pg-card >> nth=${shown}`);
    await wait(600);
    ok((await st()).t === before.t, 'switching to a page in view scrolled', { before: before.t, after: (await st()).t });
  });

  await step('nav: with nothing selected the arrow keys scroll pages under each other; a selection still nudges', async () => {
    await open('social', [{ id: 's1', x: 100, y: 100, w: 200, h: 200 }], { pages: 3 });
    await ev(() => A.E.setZoom(1.5));
    await ev(() => { A.E.scrollEl.scrollLeft = 100; A.E.scrollEl.scrollTop = 100; });
    const s0 = await st();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(([l, t]) => A.E.scrollEl.scrollTop >= t + 59 && A.E.scrollEl.scrollLeft >= l + 59, [s0.l, s0.t]);
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForFunction((t) => A.E.scrollEl.scrollTop >= t + 459, s0.t);
    const s1 = await st();
    ok(s1.els === s0.els && s1.n === s0.n && s1.zoom === 1.5, 'arrow scrolling changed the design', { s0, s1 });
    await ev(() => A.E.select(['s1']));
    await page.keyboard.press('ArrowRight');
    await wait(500);
    const s2 = await st();
    ok(s2.l === s1.l && s2.t === s1.t && JSON.parse(s2.els)[0][1] === 101, 'with a selection the arrows should nudge', { s1, s2 });
  });

  await step('nav: Safari pinch gestures zoom about the pinch (gesture events)', async () => {
    await open('presentation', els);
    await view(1, 950, 500);
    const k = await at(800, 400);
    // no real Safari gestures in Chromium: dispatch the events WebKit sends
    await ev(([x, y]) => {
      const fire = (type, scale) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { scale, clientX: x, clientY: y }); A.E.scrollEl.dispatchEvent(e); return e.defaultPrevented; };
      window.__gp = [fire('gesturestart', 1), fire('gesturechange', 1.3), fire('gesturechange', 1.6), fire('gestureend', 1.6)];
    }, [k.x, k.y]);
    const k1 = await at(800, 400), z = (await st()).zoom;
    ok(Math.abs(z - 1.6) < 1e-6 && Math.hypot(k1.x - k.x, k1.y - k.y) < 2 && (await ev(() => window.__gp.every(Boolean))), 'gesture zoom', { z, k, k1 });
  });

  await step('nav: desktop hides the touch Select toggle', async () => {
    await open('social', els);
    ok(!(await page.isVisible('.ed-bottom .touch-only')), 'Select toggle shown with a mouse');
  });

  // ---------- touch ----------
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
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 1, radiusY: 1, force: 1 })) });
      // one finger from a to b; `hold` ms still before moving, `rest` ms still before lifting
      const drag = async (a, b, { steps = 8, hold = 0, rest = 120, gap = 16 } = {}) => {
        await touch('touchStart', [[a.x, a.y]]);
        if (hold) await p.waitForTimeout(hold);
        for (let k = 1; k <= steps; k++) {
          await touch('touchMove', [[a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps]]);
          if (k < steps || rest) await p.waitForTimeout(gap);
        }
        if (rest) await p.waitForTimeout(rest);
        await touch('touchEnd', []);
        await p.waitForTimeout(80);
      };
      await fn(p, { touch, drag });
      ok(!errs.length, 'page errors', errs);
    } finally {
      await ctx.close();
    }
  };
  const tels = [{ id: 's1', x: 100, y: 100, w: 200, h: 150 }, { id: 's2', x: 400, y: 150, w: 150, h: 100 }];

  await step('touch: at fit a finger on empty page still draws a selection box', () => phone(390, 844, async (p, { drag }) => {
    await open('presentation', tels, {}, p);
    const s0 = await st(p);
    await drag(await at(30, 40, p), await at(700, 400, p));
    const s1 = await st(p);
    ok(s1.sel === 's1,s2' && s1.l === s0.l && s1.t === s0.t, 'marquee at fit', { s0, s1 });
  }));

  await step('touch: zoomed in, a finger on empty page pans (selection kept, no undo step); a tap deselects', () => phone(390, 844, async (p, { drag }) => {
    await open('presentation', tels, {}, p);
    await p.evaluate(() => { A.E.setZoom(1); A.E.scrollEl.scrollLeft = 300; A.E.scrollEl.scrollTop = 300; A.E.select(['s1']); });
    const s0 = await st(p);
    const a = await at(450, 500, p);
    await drag(a, { x: a.x + 120, y: a.y + 100 });
    const s1 = await st(p);
    ok(Math.abs(s0.l - s1.l - 120) <= 2 && Math.abs(s0.t - s1.t - 100) <= 2, 'one-finger pan', { s0, s1 });
    ok(s1.sel === 's1' && s1.els === s0.els && s1.n === s0.n && !s1.marquee, 'pan changed the design or selection', { s0, s1 });
    ok(await p.locator('.toast:has-text("press and hold")').count(), 'no hint about selecting while zoomed in');
    const e = await at(450, 500, p);
    await p.touchscreen.tap(e.x, e.y);
    await p.waitForTimeout(100);
    ok((await st(p)).sel === '', 'tap on empty page did not deselect');
    // a flick keeps gliding after the finger lifts
    const f = await at(500, 520, p);
    await drag(f, { x: f.x - 160, y: f.y - 120 }, { steps: 5, rest: 0, gap: 12 });
    const g0 = await st(p);
    await p.waitForTimeout(500);
    const g1 = await st(p);
    ok(g1.l - g0.l > 15 && g1.t - g0.t > 10, 'no glide after a flick', { g0, g1 });
    // a new touch stops the glide
    await drag(f, { x: f.x - 160, y: f.y - 120 }, { steps: 5, rest: 0, gap: 12 });
    await p.touchscreen.tap(20, 20 + (await p.evaluate(() => A.E.scrollEl.getBoundingClientRect().top)));
    const h0 = await st(p);
    await p.waitForTimeout(300);
    const h1 = await st(p);
    ok(Math.abs(h1.l - h0.l) < 1 && Math.abs(h1.t - h0.t) < 1, 'glide went on after a new touch', { h0, h1 });
  }));

  await step('touch: press and hold, then drag, draws a selection box on a zoomed-in page', () => phone(390, 844, async (p, { drag, touch }) => {
    await open('presentation', tels, {}, p);
    await p.evaluate(() => { A.E.setZoom(0.5); A.E.scrollEl.scrollLeft = 0; A.E.scrollEl.scrollTop = 0; });
    ok(await p.evaluate(() => A.E.touchPans()), 'not zoomed in past fit');
    const s0 = await st(p), a = await at(50, 400, p), b = await at(600, 60, p);
    const ring = p.waitForSelector('.hold-ring', { timeout: 2000 });
    await drag(a, b, { hold: 800 });
    await ring;
    const s1 = await st(p);
    ok(s1.sel === 's1,s2' && Math.abs(s1.l - s0.l) < 1 && Math.abs(s1.t - s0.t) < 1 && s1.n === s0.n, 'long-press marquee', { s0, s1 });
    // the browser's long-press contextmenu (no CDP gesture for it: dispatched as Chrome does) opens no menu over it
    await p.evaluate(() => A.E.deselect());
    await touch('touchStart', [[a.x, a.y]]);
    await p.waitForTimeout(700);
    await p.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })), [a.x, a.y]);
    await touch('touchMove', [[b.x, b.y]]);
    await touch('touchEnd', []);
    await p.waitForTimeout(100);
    ok(!(await p.locator('.popover .menu').count()) && (await st(p)).sel === 's1,s2', 'long-press menu opened over the selection box');
  }));

  await step('touch: the Select toggle makes a finger draw selection boxes on a zoomed-in page', () => phone(390, 844, async (p, { drag }) => {
    await open('presentation', tels, {}, p);
    await p.evaluate(() => { A.E.setZoom(0.5); A.E.scrollEl.scrollLeft = 0; A.E.scrollEl.scrollTop = 0; });
    ok(await p.isVisible('.ed-bottom .touch-only'), 'Select toggle hidden on a touch screen');
    await p.tap('.ed-bottom .touch-only');
    ok((await p.getAttribute('.ed-bottom .touch-only', 'aria-pressed')) === 'true' && (await p.evaluate(() => A.E.selectMode)), 'toggle did not turn on');
    const s0 = await st(p);
    await drag(await at(50, 400, p), await at(600, 60, p));
    const s1 = await st(p);
    ok(s1.sel === 's1,s2' && Math.abs(s1.l - s0.l) < 1 && Math.abs(s1.t - s0.t) < 1, 'Select mode marquee', { s0, s1 });
    await p.tap('.ed-bottom .touch-only');
    ok((await p.getAttribute('.ed-bottom .touch-only', 'aria-pressed')) === 'false', 'toggle did not turn off');
    const a = await at(300, 500, p);
    await drag(a, { x: a.x - 60, y: a.y - 60 });
    const s2 = await st(p);
    ok(s2.l > s1.l + 40 && s2.t > s1.t + 40 && s2.sel === s1.sel, 'pan did not come back with Select off', { s1, s2 });
  }));

  await step('touch: double-tap on empty canvas fits the page; on an element it does not', () => phone(390, 844, async (p) => {
    await open('presentation', tels, {}, p);
    await p.evaluate(() => { A.E.setZoom(1); A.E.scrollEl.scrollLeft = 0; A.E.scrollEl.scrollTop = 0; });
    const s = await at(200, 175, p);
    await p.touchscreen.tap(s.x, s.y);
    await p.waitForTimeout(60);
    await p.touchscreen.tap(s.x, s.y);
    await p.waitForTimeout(150);
    ok((await st(p)).zoom === 1, 'double-tap on an element changed the zoom');
    const e = await at(330, 330, p);
    await p.touchscreen.tap(e.x, e.y);
    await p.waitForTimeout(400);
    await p.touchscreen.tap(e.x, e.y);
    await p.waitForTimeout(400);
    const s0 = await st(p);
    ok(s0.zoom === 1, 'two slow taps fitted');
    await p.touchscreen.tap(e.x, e.y);
    await p.waitForTimeout(60);
    await p.touchscreen.tap(e.x, e.y);
    await p.waitForTimeout(150);
    const f = await p.evaluate(() => ({ z: A.E.zoom, fit: A.E.fitZoom(), n: A.E.hist.length }));
    ok(Math.abs(f.z - f.fit) < 1e-9 && f.n === s0.n, 'double-tap did not fit', f);
    // the canvas around the page too
    await p.evaluate(() => { A.E.setZoom(0.5); A.E.scrollEl.scrollTop = 0; A.E.scrollEl.scrollLeft = 0; });
    const g = await p.evaluate(() => { const r = A.E.blocks[0].frame.getBoundingClientRect(), s = A.E.scrollEl.getBoundingClientRect(); return { x: s.left + 5, y: (Math.max(r.top, s.top) + Math.min(r.bottom, s.bottom)) / 2 }; });
    await p.touchscreen.tap(g.x, g.y);
    await p.waitForTimeout(60);
    await p.touchscreen.tap(g.x, g.y);
    await p.waitForTimeout(150);
    ok(await p.evaluate(() => Math.abs(A.E.zoom - A.E.fitZoom()) < 1e-9), 'double-tap beside the page did not fit');
  }));

  await step('touch: two fingers still pinch-zoom on a phone, and the bottom bar fits 320-390px', () => phone(390, 844, async (p, { touch }) => {
    await open('presentation', tels, {}, p);
    const s0 = await st(p), c = await p.evaluate(() => { const r = A.E.blocks[0].frame.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', [[c.x - 30, c.y]]);
    await touch('touchStart', [[c.x - 30, c.y], [c.x + 30, c.y]]);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[c.x - 30 - k * 12, c.y], [c.x + 30 + k * 12, c.y]]); await p.waitForTimeout(20); }
    await touch('touchEnd', []);
    await p.waitForTimeout(150);
    const s1 = await st(p);
    ok(s1.zoom > s0.zoom * 1.5 && s1.n === s0.n && s1.els === s0.els, 'pinch', { s0, s1 });
    for (const w of [390, 320]) {
      await p.setViewportSize({ width: w, height: 700 });
      await p.waitForTimeout(150);
      const bar = await p.evaluate(() => {
        const b = A.EU.bottom, r = b.getBoundingClientRect();
        const bad = [...b.querySelectorAll('button')].filter((x) => x.offsetParent).filter((x) => { const q = x.getBoundingClientRect(); return q.left < r.left || q.right > r.right || q.width < 24; }).map((x) => x.title || x.textContent);
        return { bad, over: b.scrollWidth - b.clientWidth, page: document.documentElement.scrollWidth - innerWidth };
      });
      ok(!bar.bad.length && bar.over <= 0 && bar.page <= 0, w + 'px bottom bar', bar);
    }
  }));
}
