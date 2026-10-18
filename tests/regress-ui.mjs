// Regression checks (ui): top bar, context toolbar, dialogs, timeline and wheel zoom in editor-ui.js.
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const open = async (type) => {
    await ev((t) => A.Home.newDesign({ type: t }), type);
    await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await wait(300);
    return ev(() => A.E.d.id);
  };
  const blur = () => ev(() => document.activeElement?.blur?.());
  // add shapes (or photo frames) to the current page and leave them unselected
  const put = (els) => ev((list) => {
    const ids = list.map(([kind, o]) => {
      const el = A.M.newShape(kind, o);
      A.E.page().elements.push(el);
      return el.id;
    });
    A.E.sel = [];
    A.E.changed();
    return ids;
  }, els);
  const center = async (id) => {
    const b = await page.locator(`.page-block.active .page-svg [data-id="${id}"]`).first().boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const clickEl = async (id, shift = false) => {
    const c = await center(id);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(c.x, c.y);
    if (shift) await page.keyboard.up('Shift');
  };
  const toolbar = () => ev(() => [...document.querySelectorAll('.ed-toolbar .tb-hint, .ed-toolbar button')].map((b) => b.title || b.textContent.trim()));
  const flushSave = async () => { await ev(() => A.E.saveNow.flush()); await wait(400); };
  const titles = () => ev(async () => ({ live: A.E.d.title, field: document.querySelector('.title-input').value, db: (await A.S.get('designs', A.E.d.id)).title }));
  const rename = async (t) => {
    await page.click('.title-input', { clickCount: 3 });
    await page.keyboard.type(t);
    await page.keyboard.press('Enter');
  };
  const addAsset = () => ev(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#2b5876'; g.fillRect(0, 0, 400, 300);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return (await A.S.addAsset(blob, { name: 'ui.png' })).id;
  });

  await step('ui: renaming after an undo renames the open design (state-9, ui-3)', async () => {
    await open('social');
    await blur();
    await page.keyboard.press('r');
    await page.keyboard.press('Control+z');
    await rename('Renamed After Undo');
    await flushSave();
    const t = await titles();
    ok(t.live === 'Renamed After Undo' && t.db === 'Renamed After Undo', 'rename lost', t);
  });

  await step('ui: a version restore keeps the name, star and folder, and the title field shows it (state-10, state-16)', async () => {
    const id = await open('social');
    await put([['rect', { x: 100, y: 100, w: 300, h: 200 }]]);
    await ev(() => A.E.snapshot('V1'));
    // organise it from Home while it is closed
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev(async (i) => { const d = await A.S.get('designs', i); Object.assign(d, { starred: true, folderId: 'f_ui' }); await A.S.put('designs', d); }, id);
    await ev((i) => A.app.go('#/design/' + i), id);
    await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await wait(300);
    await rename('Second Title');
    await page.click('.ed-top-left .top-btn:has-text("File")');
    await page.click('.menu-item:has-text("Version history")');
    await page.locator('.modal .version', { hasText: 'V1' }).locator('button').click();
    await page.waitForSelector('.modal', { state: 'detached' });
    await flushSave();
    const s = await ev(async () => { const d = await A.S.get('designs', A.E.d.id); return { title: A.E.d.title, field: document.querySelector('.title-input').value, starred: d.starred, folderId: d.folderId, db: d.title }; });
    ok(s.title === 'Second Title' && s.field === 'Second Title' && s.db === 'Second Title' && s.starred === true && s.folderId === 'f_ui', 'after restore', s);
    await blur();
    await page.keyboard.press('Control+z');
    const t = await titles();
    ok(t.live === 'Second Title' && t.field === 'Second Title', 'after undoing the restore', t);
  });

  await step('ui: top-bar Print prints the live design after an undo (state-11, ui-3)', async () => {
    await open('print');
    await ev(() => { window.__print = A.X.print; A.X.print = (d, pages) => { window.__printed = pages.map((p) => p.elements.map((e) => e.type + ':' + (e.shape || ''))); }; });
    try {
      await blur();
      for (const k of ['r', 'c', 'Control+z', 'r']) await page.keyboard.press(k);
      await page.click('.ed-top-right .top-btn:has-text("Print")');
      const s = await ev(() => ({ printed: window.__printed, live: A.E.d.pages.filter((p) => !p.hidden).map((p) => p.elements.map((e) => e.type + ':' + (e.shape || ''))) }));
      ok(JSON.stringify(s.printed) === JSON.stringify(s.live), 'printed a stale design', s);
    } finally {
      await ev(() => { A.X.print = window.__print; });
    }
  });

  await step('ui: File > Move to trash trashes the design (state-13, home-1)', async () => {
    const id = await open('social');
    await put([['rect', { x: 100, y: 100, w: 300, h: 200 }]]);
    await page.click('.ed-top-left .top-btn:has-text("File")');
    await page.click('.menu-item:has-text("Move to trash")');
    await page.click('.modal-foot button:has-text("Move to trash")');
    await page.waitForSelector('.hero');
    await wait(600);
    const d = await ev((i) => A.S.get('designs', i), id);
    ok(d && d.deletedAt > 0, 'not in the trash', { deletedAt: d?.deletedAt });
    await ev(async (i) => A.S.restoreDesign(i), id);
    // restored from the trash, its newest version does not send it back there
    ok(!(await ev(async (i) => (await A.S.listVersions(i)).some((v) => JSON.parse(v.data).deletedAt), id)), 'a version holds deletedAt');
    await ev(async (i) => { const d = await A.S.get('designs', i); await A.S.addVersion({ ...d, deletedAt: Date.now() - 1000 }, 'Trashed copy'); }, id);
    await ev((i) => A.app.go('#/design/' + i), id);
    await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await page.click('.ed-top-left .top-btn:has-text("File")');
    await page.click('.menu-item:has-text("Version history")');
    await page.locator('.modal .version', { hasText: 'Trashed copy' }).locator('button').click();
    await page.waitForSelector('.modal', { state: 'detached' });
    await flushSave();
    const r = await ev(async () => ({ live: A.E.d.deletedAt, db: (await A.S.get('designs', A.E.d.id)).deletedAt }));
    ok(!r.live && !r.db, 'the restored version trashed the open design', r);
  });

  await step('ui: shape text being typed shows the text tools (text-18)', async () => {
    await open('social');
    const [id] = await put([['rect', { x: 200, y: 200, w: 500, h: 300, fill: '#38b6ff' }]]);
    const c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForSelector('textarea.text-edit');
    await page.keyboard.type('Inside shape');
    const tb = await toolbar();
    ok(tb.includes('Font') && tb.some((t) => t.startsWith('Bold')) && !tb.includes('Add text'), 'toolbar while typing', tb);
    await page.keyboard.press('Escape');
    ok((await ev((i) => A.E.byId(i).text, id)) === 'Inside shape', 'typed text lost');
  });

  await step('ui: Download dialog – Size slider drags, no Compress for PNG, JPG drops a hidden Transparent tick (ui-17, ui-18, render-9)', async () => {
    await open('social');
    await page.click('.btn.share');
    await page.click('.share-act:has-text("Download")');
    const fmt = page.locator('.modal select').first();
    await fmt.selectOption('png');
    const compress = page.locator('.modal label.check', { hasText: 'Compress' });
    ok(!(await compress.count()), 'Compress offered for PNG');
    await page.locator('.modal label.check', { hasText: 'Transparent background' }).locator('input').check();
    const range = page.locator('.modal input[type=range]');
    const r = await range.boundingBox();
    const y = r.y + r.height / 2;
    await page.mouse.move(r.x + 8 + (r.width - 16) * (0.5 / 3.5), y);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.7, y, { steps: 10 });
    await page.mouse.up();
    const v = +(await range.inputValue());
    const label = await page.locator('.modal label.field', { hasText: 'Size ×' }).textContent();
    ok(v >= 2.5 && label.includes('Size ×' + v) && label.includes(Math.round(1080 * v) + ' × '), 'size drag', { v, label });
    await fmt.selectOption('jpg');
    ok(await compress.count(), 'Compress missing for JPG');
    await ev(() => { window.__run = A.EU.runExport; A.EU.runExport = async (f, pages, o) => { window.__exp = { f, transparent: o.transparent, scale: o.scale }; }; });
    try {
      await page.click('.modal-foot button:has-text("Download")');
      await page.waitForSelector('.modal', { state: 'detached' });
      const x = await ev(() => window.__exp);
      ok(x.f === 'jpg' && x.transparent === false && x.scale === v, 'export options', x);
    } finally {
      await ev(() => { A.EU.runExport = window.__run; });
    }
  });

  await step('ui: Resize dialog converts the typed size when the units change (ui-16)', async () => {
    await open('social');
    await page.click('.ed-top-left .top-btn:has-text("Resize")');
    const [w, hh] = [page.locator('.modal .custom-size input').nth(0), page.locator('.modal .custom-size input').nth(1)];
    await w.click({ clickCount: 3 });
    await page.keyboard.type('960');
    await hh.click({ clickCount: 3 });
    await page.keyboard.type('540');
    await page.locator('.modal .custom-size select').selectOption('in');
    const f = { w: await w.inputValue(), h: await hh.inputValue() };
    ok(f.w === '10' && f.h === '5.63', 'fields in inches', f);
    await page.click('.modal-foot button:has-text("Resize this design")');
    await wait(400);
    const d = await ev(() => [A.E.d.width, A.E.d.height]);
    ok(d[0] === 960 && d[1] === 540, 'design size', d);
  });

  await step('ui: Split page is one undo step and keeps the total duration (ui-19, present-8)', async () => {
    await open('presentation');
    const [id] = await put([['rect', { x: 100, y: 100, w: 300, h: 200 }]]);
    await ev(() => { A.E.page().duration = 1.5; A.E.changed({ structure: true }); });
    const h0 = await ev(() => A.E.hi);
    await page.click('.tl-controls button[title="Split page at its midpoint"]');
    const s = await ev(() => ({ durs: A.E.d.pages.map((p) => p.duration), hi: A.E.hi, ids: A.E.d.pages.map((p) => p.elements[0].id), pids: A.E.d.pages.map((p) => p.id) }));
    ok(s.durs.join() === '0.8,0.7' && s.hi === h0 + 1 && s.ids[0] === id && s.ids[1] !== id && s.pids[0] !== s.pids[1], 'after split', s);
    await blur();
    await page.keyboard.press('Control+z');
    const u = await ev(() => A.E.d.pages.map((p) => p.duration));
    ok(u.join() === '1.5', 'after one undo', u);
  });

  await step('ui: dropping an Elements tile on a timeline block leaves the page order alone (ui-14, present-7)', async () => {
    await open('presentation');
    await ev(() => { A.E.addPage(1); A.E.addPage(2); A.E.setPage(0); });
    await wait(200);
    const order = () => ev(() => A.E.d.pages.map((p) => p.id).join());
    const o0 = await order();
    if (!(await page.$('.ed-panel .el-item[title="Circle"]'))) await page.click('.rail-btn[data-p="elements"]');
    await page.locator('.ed-panel .el-item[title="Circle"]').dragTo(page.locator('.tl-block').nth(2));
    await wait(200);
    ok((await order()) === o0, 'pages reordered by a tile drop');
    // a page block dragged onto another still reorders
    await page.locator('.tl-block').nth(0).dragTo(page.locator('.tl-block').nth(2));
    await wait(200);
    const o1 = (await order()).split(','), p0 = o0.split(',');
    ok(o1.join() === [p0[1], p0[2], p0[0]].join(), 'block drag', { o0, o1 });
  });

  await step('ui: Crop closes for a mixed photo + shape selection (ui-10)', async () => {
    await open('social');
    const a = await addAsset();
    const [img, rect] = await ev((aid) => {
      const im = A.M.newImage({ id: aid, w: 400, h: 300 }, { x: 100, y: 100, w: 400, h: 300 });
      const r = A.M.newShape('rect', { x: 600, y: 600, w: 200, h: 150 });
      A.E.page().elements.push(im, r);
      A.E.sel = [];
      A.E.changed();
      return [im.id, r.id];
    }, a);
    await wait(200);
    await clickEl(img);
    await page.click('.ed-toolbar button[title="Crop"]');
    ok((await ev(() => A.EU.panel)) === 'crop', 'crop panel did not open');
    await clickEl(rect, true);
    const s = await ev((r) => ({ panel: A.EU.panel, sel: A.E.selEls().map((e) => e.type), h: A.E.byId(r).h }), rect);
    ok(s.panel !== 'crop' && s.sel.length === 2 && s.h === 150, 'mixed selection', s);
    // an undo that brings the mixed selection back closes Crop too
    await page.keyboard.press('ArrowRight');
    await wait(600);
    await page.keyboard.press('Escape');
    await clickEl(img);
    await page.click('.ed-toolbar button[title="Crop"]');
    await page.keyboard.press('Control+z');
    const u = await ev(() => ({ panel: A.EU.panel, sel: A.E.sel.length }));
    ok(u.sel === 2 && u.panel !== 'crop', 'Crop after an undo', u);
  });

  await step('ui: the Draw tool stays off after its panel is closed and an undo runs (ui-11)', async () => {
    await open('social');
    await page.click('.rail-btn[data-p="draw"]');
    ok((await ev(() => A.E.tool)) === 'draw', 'draw tool not on');
    await page.click('.panel-collapse');
    await blur();
    await page.keyboard.press('r');
    await page.keyboard.press('Control+z');
    const s = await ev(() => ({ tool: A.E.tool, cls: document.body.classList.contains('tool-draw'), rail: [...document.querySelectorAll('.rail-btn.on')].map((b) => b.dataset.p) }));
    ok(s.tool !== 'draw' && !s.cls && !s.rail.includes('draw'), 'after undo', s);
    const f = await page.locator('.page-block.active .page-frame').boundingBox();
    await page.mouse.move(f.x + f.width * 0.3, f.y + f.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(f.x + f.width * 0.6, f.y + f.height * 0.6, { steps: 6 });
    await page.mouse.up();
    ok(!(await ev(() => A.E.els().some((e) => e.type === 'draw'))), 'a drag drew a stroke');
  });

  await step('ui: a locked page shows "Page locked" and blocks toolbar edits; Unlock page frees it (ui-20, rank 8)', async () => {
    await open('social');
    const [id] = await put([['rect', { x: 200, y: 200, w: 300, h: 200, fill: '#38b6ff' }]]);
    await blur();
    await page.click('.ed-toolbar button[title="Lock page"]');
    ok(await ev(() => A.E.page().locked), 'page not locked');
    await clickEl(id);
    let tb = await toolbar();
    ok(tb.some((t) => t.includes('Page locked')) && tb.includes('Unlock page') && !tb.includes('Fill colour'), 'toolbar on a locked page', tb);
    await ev(() => A.EU.apply((x) => (x.fill = '#000000')));
    ok((await ev((i) => A.E.byId(i).fill, id)) === '#38b6ff', 'EU.apply edited a locked page');
    // panels respect the lock too: Position fields, background uploads and swatches, 'Replace current page'
    await ev(() => { A.P.state.posTab = 'arrange'; A.EU.openPanel('position'); });
    const xf = page.locator('.adv-grid label:has(span:text-is("X")) input');
    await xf.fill('0');
    await xf.press('Enter');
    ok((await ev((i) => A.E.byId(i).x, id)) === 200 && (await xf.inputValue()) === '200', 'Position X on a locked page', await xf.inputValue());
    await addAsset();
    const pg0 = await ev(() => JSON.stringify(A.E.page()));
    await ev(() => A.E.deselect());
    await page.click('.ed-toolbar button[title="Background image"]');
    await page.click('.panel-body .img-item >> nth=0');
    await page.click('.rail-btn[data-p="design"]');
    await page.click('.ed-panel .p-tab:text-is("Styles")');
    await page.click('.ed-panel .bg-sw >> nth=3');
    await page.click('.ed-panel .p-tab:text-is("Templates")');
    await page.click('.ed-panel .tpl-card >> nth=0');
    await page.click('.menu-item:has-text("Replace current page")');
    await wait(300);
    ok((await ev(() => JSON.stringify(A.E.page()))) === pg0, 'a panel changed the locked page', await ev(() => ({ bg: A.E.page().bg, n: A.E.els().length, locked: A.E.page().locked })));
    await clickEl(id);
    await page.click('.ed-toolbar button[title="Unlock page"]');
    ok(!(await ev(() => A.E.page().locked)), 'still locked');
    tb = await toolbar();
    ok(tb.includes('Fill colour'), 'toolbar after unlocking', tb);
    const x0 = await ev((i) => A.E.byId(i).x, id);
    await page.keyboard.press('ArrowRight');
    ok((await ev((i) => A.E.byId(i).x, id)) === x0 + 1, 'ArrowRight after unlocking');
  });

  await step("ui: 'Unlock' on a mixed locked/unlocked selection unlocks both (ui-21)", async () => {
    await open('social');
    const [a, b] = await put([['rect', { x: 100, y: 100, w: 300, h: 200 }], ['rect', { x: 600, y: 100, w: 300, h: 200 }]]);
    await ev((i) => { A.E.byId(i).locked = true; A.E.changed(); }, a);
    await clickEl(a);
    await clickEl(b, true);
    ok((await ev(() => A.E.sel.length)) === 2, 'not both selected');
    await page.click('.ed-toolbar button[title="Unlock"]');
    const s = await ev(([x, y]) => [A.E.byId(x).locked, A.E.byId(y).locked], [a, b]);
    ok(!s[0] && !s[1], 'after Unlock', s);
    // the context menu names what E.toggleLock will do
    await ev(([x, y]) => { A.E.byId(x).locked = true; A.E.select([y, x]); A.EU.contextMenu(document.querySelector('.ed-toolbar')); }, [a, b]);
    const labels = await ev(() => [...document.querySelectorAll('.popover .menu-label')].map((l) => l.textContent));
    ok(labels.includes('Unlock') && !labels.includes('Lock'), 'context menu', labels);
    await page.keyboard.press('Escape');
    await ev(() => A.U.closePop());
  });

  await step('ui: the page background picker still works after an undo (ui-23)', async () => {
    await open('social');
    await blur();
    await page.keyboard.press('r');
    await page.keyboard.press('Escape');
    await page.click('.ed-toolbar button[title="Background colour"]');
    await page.waitForSelector('.color-picker');
    await page.keyboard.press('Control+z');
    const h0 = await ev(() => A.E.hi);
    await page.locator('.color-picker .color-sw[title="#ff3131"]').first().click();
    const s = await ev(() => ({ bg: A.E.page().bg?.color, hi: A.E.hi }));
    ok(s.bg === '#ff3131' && s.hi === h0 + 1, 'background after undo', s);
  });

  await step('ui: photo frames offer corner rounding only where it applies (ui-25)', async () => {
    await open('social');
    const a = await addAsset();
    const [heart, rect] = await put([['heart', { x: 100, y: 100, w: 300, h: 300, frame: true, asset: a }], ['rect', { x: 600, y: 100, w: 300, h: 300, frame: true, asset: a }]]);
    await clickEl(heart);
    ok(!(await toolbar()).includes('Corner rounding'), 'rounding offered for a heart frame');
    await clickEl(rect);
    ok((await toolbar()).includes('Corner rounding'), 'rounding missing for a rectangle frame');
  });

  await step('ui: Ctrl+wheel zoom follows the gesture size and the cursor (touch-11)', async () => {
    await open('presentation');
    // zoomed in, so the page overflows and scrolling can hold the point under the cursor
    await ev(() => A.E.setZoom(1.2));
    await wait(200);
    const v = await page.locator('.ed-scroll').boundingBox();
    const mx = v.x + v.width * 0.35, my = v.y + v.height * 0.45;
    await page.mouse.move(mx, my);
    const at = () => ev(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { z: A.E.zoom, px: (x - r.left) / A.E.zoom, py: (y - r.top) / A.E.zoom }; }, [mx, my]);
    const s0 = await at();
    await page.keyboard.down('Control');
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -2);
    await page.keyboard.up('Control');
    await wait(300);
    const s1 = await at();
    ok(s1.z / s0.z > 1.02 && s1.z / s0.z < 1.3, 'small pinch', { z0: s0.z, z1: s1.z });
    const notch = async (dy) => {
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, dy);
      await page.keyboard.up('Control');
      await wait(300);
      return at();
    };
    const s2 = await notch(-100);
    ok(s2.z / s1.z > 1.1 && s2.z / s1.z < 1.5, 'one wheel notch in', { z1: s1.z, z2: s2.z });
    ok(Math.abs(s2.px - s1.px) < 2 && Math.abs(s2.py - s1.py) < 2, 'point under the cursor moved', { s1, s2 });
    const s3 = await notch(100);
    ok(s3.z / s2.z < 0.9 && s3.z / s2.z > 0.6, 'one wheel notch out', { z2: s2.z, z3: s3.z });
  });

  await step('ui: failed saves show one sticky warning that downloads the design file (rank 4)', async () => {
    await open('social');
    await ev(() => {
      window.__save = A.S.saveDesign;
      window.__err = console.error;
      console.error = () => {};
      A.S.saveDesign = () => Promise.reject(new DOMException('full', 'QuotaExceededError'));
      document.querySelectorAll('.toast').forEach((t) => t.remove());
    });
    const warnings = () => ev(() => [...document.querySelectorAll('.toast.error')].filter((t) => [...t.querySelectorAll('button')].some((b) => b.textContent.includes('Download design file'))).length);
    try {
      await blur();
      await page.keyboard.press('r');
      await page.keyboard.press('Control+s');
      await wait(300);
      await ev(() => A.E.save());
      await wait(3600); // longer than an ordinary toast lives
      const s = await ev(() => ({ saved: [...document.querySelectorAll('.toast.ok')].some((t) => t.textContent.includes('Saved')), icon: !!document.querySelector('.save-state.error') }));
      const n = await warnings();
      ok(n === 1 && !s.saved && s.icon, 'warning toasts', { n, ...s });
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.toast.error button', { hasText: 'Download design file' }).click()]);
      ok(dl.suggestedFilename().endsWith('.atelier.json'), 'download name', dl.suggestedFilename());
    } finally {
      await ev(() => { A.S.saveDesign = window.__save; console.error = window.__err; });
    }
    ok(await ev(() => A.E.save()), 'save after recovery');
    ok((await warnings()) === 0, 'warning left after a successful save');
  });

  await step('ui: a save warning left from an earlier session downloads that session\'s edits and says so (rank 4)', async () => {
    const id = await open('social');
    await ev(() => {
      window.__save = A.S.saveDesign;
      window.__err = console.error;
      console.error = () => {};
      A.S.saveDesign = () => Promise.reject(new DOMException('full', 'QuotaExceededError'));
      document.querySelectorAll('.toast').forEach((t) => t.remove());
    });
    try {
      await blur();
      await page.keyboard.press('r');
      await ev(() => A.E.save());
      await page.click('.ed-top-left button[title="Home"]');
      await page.waitForSelector('.hero');
    } finally {
      await ev(() => { A.S.saveDesign = window.__save; console.error = window.__err; });
    }
    await ev((i) => A.app.go('#/design/' + i), id);
    await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await wait(300);
    ok(await ev(() => A.E.save()), 'save in the reopened editor');
    const warn = page.locator('.toast.error', { hasText: 'Download design file' });
    const text = await warn.textContent();
    ok(text.startsWith('Earlier changes'), 'warning text after reopening', text);
    await ev(() => { window.__dl = null; window.__download = A.U.download; A.U.download = (blob) => (window.__dl = blob); });
    try {
      await warn.locator('button', { hasText: 'Download design file' }).click();
      await page.waitForFunction(() => window.__dl);
      const n = await ev(async () => JSON.parse(await window.__dl.text()).design.pages[0].elements.length);
      ok(n === 1, 'the download left out the unsaved rectangle', n);
    } finally {
      await ev(() => { A.U.download = window.__download; });
    }
  });
}
