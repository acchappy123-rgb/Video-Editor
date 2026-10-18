// Photo frames and on-canvas crop (wave 2): frame fit, the crop mode for photos, frames and page backgrounds,
// the Crop panel for frames, and photos dropped into frames.
import fs from 'fs';
import path from 'path';
export default async function ({ page, step, shot, OUT, ctx }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
  const open = async (type = 'presentation') => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev((t) => A.Home.newDesign({ type: t }), type);
    await page.waitForFunction(() => A.E.d && A.E.blocks[A.E.pi]?.svg.isConnected);
    await wait(300);
    await ev(() => document.activeElement?.blur?.());
  };
  // a photo in the uploads (red left half, blue right half), 800 × 400 unless asked
  const asset = (w = 800, h = 400) => ev(async ([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#e02020'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#2040e0'; g.fillRect(w / 2, 0, w / 2, h);
    const a = await A.S.addAsset(await new Promise((r) => c.toBlob(r, 'image/png')), { name: 'frames.png' });
    return { id: a.id, w: a.w, h: a.h };
  }, [w, h]);
  const pngFile = async (name, w, h) => {
    const b64 = await ev(([w, h]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#20a040'; g.fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, [w, h]);
    const p = path.join(OUT, name);
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    return p;
  };
  // elements made with the A.M factories, added to the page unselected; returns their ids
  const put = (list) => ev((list) => {
    const ids = list.map((o) => {
      const el = o.type === 'image' ? A.M.newImage({ id: o.asset, w: o.nw, h: o.nh }, o) : A.M.newShape(o.shape || 'rect', o);
      A.E.page().elements.push(el);
      return el.id;
    });
    A.E.sel = [];
    A.E.changed();
    return ids;
  }, list);
  const get = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.d.pages.flatMap((p) => p.elements).find((e) => e.id === id) || null)), id);
  const box = (sel) => page.locator(sel).first().boundingBox();
  // client position of a page point on the active page
  const at = (x, y) => ev(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  // the middle of an element (its drawn box also counts the clipped-off parts of a frame's photo)
  const center = async (id) => { const e = await get(id); return at(e.x + e.w / 2, e.y + e.h / 2); };
  const drag = async (a, b, steps = 6) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps });
    await page.mouse.up();
    await wait(60);
  };
  const handle = async (h) => { const b = await box(`.crop-layer [data-h="${h}"] .crop-dot`); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // the photo drawn in a frame (or the page background when id is null), in page units
  const img = (id) => ev((id) => {
    const i = document.querySelector(id ? `.page-block.active .page-svg [data-id="${id}"] image` : '.page-block.active .page-svg > image');
    return i && { x: +i.getAttribute('x'), y: +i.getAttribute('y'), w: +i.getAttribute('width'), h: +i.getAttribute('height'), par: i.getAttribute('preserveAspectRatio') };
  }, id);
  const state = () => ev(() => ({ crop: A.E.cropping && { kind: A.E.cropping.kind, id: A.E.cropping.id }, hi: A.E.hi, editing: A.E.editingId, ta: !!document.querySelector('textarea.text-edit'), sel: A.E.sel, panel: A.EU.panelOpen && A.EU.panel, layer: !!document.querySelector('.crop-layer .crop-ghost') }));
  const tb = async (title) => { await page.click(`.ed-toolbar button[title="${title}"]`); await wait(); };
  const rail = async (p) => {
    if (!(await ev((p) => A.EU.panelOpen && A.EU.panel === p, p))) await page.click(`.rail-btn[data-p="${p}"]`);
    await wait();
  };
  const z = () => ev(() => A.E.zoom);

  await step('frames: double-click never edits a frame; an empty one asks for a photo, filling it from Uploads stores its size (rank 13)', async () => {
    await open();
    const a = await asset();
    await rail('elements');
    await page.click('.panel-body .p-sec:has-text("Frames") .el-item >> nth=0');
    await wait();
    const id = await ev(() => A.E.sel[0]);
    const keys0 = Object.keys(await get(id)).length;
    let c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    let s = await state();
    ok(!s.ta && s.editing === null && !s.crop && Object.keys(await get(id)).length === keys0, 'double-click on an empty frame edited it', { s, keys: Object.keys(await get(id)) });
    ok(s.panel === 'uploads' && (await page.locator('.panel-body .notice').innerText()).includes('selected frame'), 'Uploads did not open for the frame', s);
    const hi0 = s.hi;
    await page.waitForSelector('.panel-body .img-item');
    await page.click('.panel-body .img-item >> nth=0');
    await wait();
    const fr = await get(id);
    ok(fr.asset === a.id && fr.nw === 800 && fr.nh === 400 && !fr.fit, 'frame fill did not store the photo size', fr);
    ok((await ev(() => A.E.els().filter((e) => e.type === 'image').length)) === 0, 'filling the frame added a loose photo');
    ok((await state()).hi === hi0 + 1, 'filling the frame was not one undo step');
    const keys1 = Object.keys(fr).length;
    c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    s = await state();
    ok(!s.ta && s.editing === null && s.crop?.kind === 'frame' && s.crop.id === id && s.layer, 'double-click did not adjust the photo', s);
    ok(s.panel === 'crop' && (await page.locator('.ed-panel .panel-head h3').innerText()) === 'Crop', 'the Crop panel did not come along', s);
    ok(Object.keys(await get(id)).length === keys1 && (await state()).hi === hi0 + 1, 'entering crop mode changed the frame');
    await shot('w2-frames-01-frame-crop');
    await page.keyboard.press('Escape');
    ok(!(await state()).crop, 'Esc did not leave crop mode');
  });

  await step('frames: drag pans the photo, the wheel and a corner handle zoom it, Enter is one undo step and Esc cancels', async () => {
    await open();
    const a = await asset();
    const [id] = await put([{ shape: 'rect', x: 640, y: 220, w: 640, h: 640, frame: true, asset: a.id, nw: 800, nh: 400 }]);
    // cover: 1280 × 640, centred
    let i = await img(id);
    ok(near(i.x, -320) && near(i.w, 1280) && i.par === 'none', 'frame photo not covering and centred', i);
    const hi0 = (await state()).hi;
    let c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    const zz = await z();
    await drag(c, { x: c.x + 100, y: c.y + 40 });
    i = await img(id);
    ok(near(i.x, -320 + 100 / zz, 1.5) && near(i.y, 0), 'drag did not pan the photo (only sideways: it fills the height)', { i, want: -320 + 100 / zz });
    ok((await state()).hi === hi0 && (await state()).crop, 'a drag inside crop mode was its own undo step');
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -200);
    await wait();
    let f = (await get(id)).fit;
    i = await img(id);
    ok(f.s > 1.3 && near(i.w, 1280 * f.s, 1) && near(i.h, 640 * f.s, 1), 'wheel did not zoom the photo', { f, i });
    // (the photo's bottom-right corner is past the edge of the view)
    const sw = await handle('sw');
    await drag(sw, { x: sw.x - 60, y: sw.y + 60 });
    const f2 = (await get(id)).fit;
    ok(f2.s > f.s + 0.05, 'dragging the corner handle out did not zoom in', { f, f2 });
    await page.keyboard.press('Enter');
    await wait();
    let s = await state();
    ok(!s.crop && s.hi === hi0 + 1 && s.sel.join() === id, 'Enter did not commit one undo step', s);
    await page.keyboard.press('Control+z');
    await wait();
    ok(!(await get(id)).fit && near((await img(id)).x, -320), 'undo did not restore the fit');
    await page.keyboard.press('Control+y');
    await wait();
    ok(JSON.stringify((await get(id)).fit) === JSON.stringify(f2), 'redo did not bring the fit back');
    // Esc puts the photo back without an undo step
    c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    await drag(c, { x: c.x - 150, y: c.y - 150 });
    ok(JSON.stringify((await get(id)).fit) !== JSON.stringify(f2), 'second drag did nothing');
    await page.keyboard.press('Escape');
    await wait();
    s = await state();
    ok(!s.crop && s.hi === hi0 + 1 && JSON.stringify((await get(id)).fit) === JSON.stringify(f2), 'Esc did not cancel the crop', { s, fit: (await get(id)).fit });
  });

  await step('frames: a click outside the photo or on another element ends the crop; the bar Reset centres the photo again', async () => {
    await open();
    const a = await asset();
    const [id, other] = await put([{ shape: 'ellipse', x: 700, y: 300, w: 500, h: 500, frame: true, asset: a.id, nw: 800, nh: 400, fit: { s: 1.5, cx: 0.3, cy: 0.5 } }, { shape: 'rect', x: 60, y: 900, w: 200, h: 120, fill: '#00bf63' }]);
    const hi0 = (await state()).hi;
    let c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    await page.click('.crop-bar button[title="Reset"]');
    await wait();
    ok(!(await get(id)).fit && (await state()).crop, 'Reset did not centre the photo', await get(id));
    // a click on the page outside the photo (above the frame) commits
    const p = await at(100, 100);
    await page.mouse.click(p.x, p.y);
    await wait();
    let s = await state();
    ok(!s.crop && s.hi === hi0 + 1 && !s.sel.length, 'a click outside did not commit', s);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    await drag(c, { x: c.x + 80, y: c.y });
    const o = await center(other);
    await page.mouse.click(o.x, o.y);
    await wait();
    s = await state();
    ok(!s.crop && s.hi === hi0 + 2 && s.sel.join() === other, 'clicking another element did not end the crop and select it', s);
    // undo while cropping leaves the photo as it was
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    const f0 = (await get(id)).fit;
    await drag(c, { x: c.x - 80, y: c.y });
    await page.keyboard.press('Control+z');
    await wait();
    s = await state();
    ok(!s.crop && s.hi === hi0 + 2 && JSON.stringify((await get(id)).fit) === JSON.stringify(f0), 'undo during a crop', { s, f0, f: (await get(id)).fit });
  });

  await step('frames: Crop panel – Zoom 200 doubles the photo, Horizontal 0 puts it at the left edge, undo restores the fit (rank 13)', async () => {
    await open();
    const a = await asset();
    const [id] = await put([{ shape: 'heart', x: 640, y: 220, w: 640, h: 640, frame: true, asset: a.id, nw: 800, nh: 400 }]);
    const c = await center(id);
    await page.mouse.click(c.x, c.y);
    await wait();
    await tb('Crop');
    let s = await state();
    ok(s.panel === 'crop' && (await page.locator('.ed-panel .panel-head h3').innerText()) === 'Crop' && s.crop?.kind === 'frame', 'Crop did not open the panel and crop mode', s);
    const zoom = page.locator('.panel-body .slider-row:has-text("Zoom") input.num');
    await zoom.fill('200');
    await zoom.press('Enter');
    await wait();
    let i = await img(id);
    ok(near(i.w, 2560) && near(i.h, 1280), 'Zoom 200 did not double the cover width', i);
    const hx = page.locator('.panel-body .slider-row:has-text("Horizontal") input.num');
    await hx.fill('0');
    await hx.press('Enter');
    await wait();
    i = await img(id);
    const ghost = await ev(() => +document.querySelector('.crop-layer .crop-ghost')?.getAttribute('x'));
    ok(i.x === 0 && ghost === 0 && (await state()).crop, 'Horizontal 0 did not put the photo at the left edge (or the crop overlay did not follow)', { i, ghost });
    const before = (await get(id)).fit;
    await page.click('.ed-top button[title^="Undo"]');
    await wait();
    const f = (await get(id)).fit;
    ok(f.s === 2 && f.cx !== before.cx && !(await state()).crop, 'undo did not restore the previous fit', { f, before });
    ok((await img(id)).x !== 0, 'the frame still shows the undone position');
  });

  await step('frames: older frames without the photo size render centred and still open crop mode (slice fallback)', async () => {
    await open();
    const a = await asset();
    const [id] = await put([{ shape: 'rect', x: 640, y: 220, w: 640, h: 640, frame: true, asset: a.id }]);
    let i = await img(id);
    ok(i.par === 'xMidYMid slice' && i.w === 640, 'old frame not drawn with the slice fallback', i);
    const hi0 = (await state()).hi;
    const c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForFunction(() => A.E.cropping, null, { timeout: 3000 });
    const fr = await get(id);
    ok(fr.nw === 800 && fr.nh === 400, 'photo size not looked up', fr);
    await page.keyboard.press('Escape');
    await wait();
    ok((await state()).hi === hi0, 'looking up the photo size made an undo step');
    i = await img(id);
    ok(i.par === 'none' && near(i.x, -320), 'frame not drawn from its size', i);
  });

  await step('frames: exports and thumbnails use the fit (frames and the background)', async () => {
    await open();
    const a = await asset();
    const r = await ev(async (aid) => {
      const fr = A.M.newShape('rect', { x: 100, y: 100, w: 400, h: 400, frame: true, asset: aid, nw: 800, nh: 400, fit: { s: 2, cx: 0.25, cy: 0.5 } });
      const p = A.M.newPage({ bg: { color: '#fff', asset: aid, nw: 800, nh: 400, fit: { s: 1, cx: 0, cy: 0.5 } }, elements: [fr] });
      const d = { ...A.E.d, pages: [p] };
      const svg = await A.R.standaloneSVG(d, p);
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const imgs = [...doc.querySelectorAll('image')].map((i) => ['x', 'y', 'width', 'height'].map((k) => +i.getAttribute(k)));
      return { imgs, box: A.R.fitBox(400, 400, 800, 400, { s: 2, cx: 0.25, cy: 0.5 }), thumb: (await A.R.thumbnail(d, p)).length };
    }, a.id);
    // background: cover 2160 × 1080 of a 1920 page, left edge; frame: 1600 × 800 with the left quarter at the centre
    ok(JSON.stringify(r.imgs[0]) === JSON.stringify([0, 0, 2160, 1080]), 'background photo not placed by its fit', r);
    ok(JSON.stringify(r.imgs[1]) === JSON.stringify([-200, -200, 1600, 800]) && r.box.x === -200, 'frame photo not placed by its fit', r);
    ok(r.thumb > 1000, 'thumbnail failed', r);
  });

  await step('photos: double-click crops on the page – a side handle crops with the far edge fixed, a drag moves the photo, 1:1, one undo step', async () => {
    await open();
    const a = await asset();
    const [id] = await put([{ type: 'image', asset: a.id, nw: 800, nh: 400, x: 300, y: 300, w: 800, h: 400 }]);
    const o = await get(id);
    const hi0 = (await state()).hi;
    const c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    let s = await state();
    ok(s.crop?.kind === 'image' && s.layer && s.panel !== 'imageEdit', 'double-click did not crop the photo', s);
    const zz = await z();
    const e = await handle('e');
    await drag(e, { x: e.x - 100, y: e.y });
    let el = await get(id);
    ok(near(el.x, 300) && near(el.w, 800 - 100 / zz, 1.5) && near(el.crop.w, el.w / 800, 0.002) && near(el.crop.x, 0), 'right handle did not crop from the right', el);
    // the photo stays where it was on the page: its left half is still red at the same place
    const w1 = el.w;
    await drag({ x: c.x - 60, y: c.y }, { x: c.x - 160, y: c.y });
    el = await get(id);
    ok(near(el.x, 300) && near(el.w, w1, 0.01) && near(el.crop.x, 100 / zz / 800, 0.003), 'dragging inside did not move the photo behind the crop', el);
    await page.click('.crop-bar button[title="Crop to 1:1"]');
    await wait();
    el = await get(id);
    ok(near(el.w, el.h, 0.5) && near(el.h, 400, 0.5) && near(el.crop.h, 1, 0.001), '1:1 did not square the crop', el);
    ok((await state()).hi === hi0, 'crop mode made undo steps before it ended');
    await page.keyboard.press('Enter');
    await wait();
    s = await state();
    ok(!s.crop && s.hi === hi0 + 1, 'Enter did not commit one step', s);
    await page.keyboard.press('Control+z');
    await wait();
    el = await get(id);
    ok(['x', 'y', 'w', 'h'].every((k) => near(el[k], o[k], 0.01)) && JSON.stringify(el.crop) === JSON.stringify(o.crop), 'undo did not restore the photo', el);
  });

  await step('photos: toolbar Crop opens the panel with crop mode, both stay in sync; wheel zooms; Done in the toolbar commits', async () => {
    await open();
    const a = await asset();
    const [id] = await put([{ type: 'image', asset: a.id, nw: 800, nh: 400, x: 300, y: 300, w: 800, h: 400 }]);
    const c = await center(id);
    await page.mouse.click(c.x, c.y);
    await wait();
    await tb('Crop');
    let s = await state();
    ok(s.panel === 'crop' && s.crop?.kind === 'image', 'toolbar Crop', s);
    const zoomNum = page.locator('.panel-body .slider-row:has-text("Zoom") input.num');
    ok((await zoomNum.inputValue()) === '100', 'panel zoom before');
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -250);
    await wait(400);
    const el = await get(id);
    ok(el.crop.w < 0.8 && near(el.w, 800, 0.01) && near(el.x, 300, 0.01), 'wheel did not zoom the photo behind the crop', el);
    ok(+(await zoomNum.inputValue()) === Math.round(100 / Math.max(el.crop.w, el.crop.h)), 'the Crop panel did not follow the canvas', await zoomNum.inputValue());
    // the panel drives the canvas crop too
    const hx = page.locator('.panel-body .slider-row:has-text("Horizontal") input.num');
    await hx.fill('100');
    await hx.press('Enter');
    await wait();
    const ghost = await ev(() => { const g = document.querySelector('.crop-layer .crop-ghost'), w = document.querySelector('.crop-layer svg'); return { x: +g.getAttribute('x'), gw: +g.getAttribute('width'), w: +w.getAttribute('width') }; });
    ok(near(ghost.x + ghost.gw, ghost.w, 0.5), 'crop overlay did not follow the panel', ghost);
    await tb('Done (Enter)');
    ok(!(await state()).crop, 'toolbar Done did not end crop mode');
    // the Crop button ends a crop it started
    await tb('Crop');
    ok((await state()).crop, 'Crop did not start again');
    await tb('Crop');
    ok(!(await state()).crop, 'Crop did not toggle off');
  });

  await step('photos: a rotated, flipped photo keeps its far edge in place while cropping; Esc puts everything back', async () => {
    await open();
    const a = await asset();
    const [id] = await put([{ type: 'image', asset: a.id, nw: 800, nh: 400, x: 500, y: 300, w: 800, h: 400, rot: 30, flipX: true, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } }]);
    const o = await get(id);
    const hi0 = (await state()).hi;
    // page position of the middle of the element's local (unflipped) left / right edge
    const edge = (el, side) => {
      const t = (el.rot * Math.PI) / 180, lx = (side === 'w' ? -el.w / 2 : el.w / 2) * (el.flipX ? -1 : 1);
      return { x: el.x + el.w / 2 + Math.cos(t) * lx, y: el.y + el.h / 2 + Math.sin(t) * lx };
    };
    const c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    const e = await handle('e');
    // the flipped photo's local right edge is drawn on its left: drag it towards the middle
    await drag(e, { x: e.x + (c.x - e.x) * 0.4, y: e.y + (c.y - e.y) * 0.4 });
    const el = await get(id);
    const w0 = edge(o, 'w'), w1 = edge(el, 'w');
    ok(el.w < o.w - 20 && near(el.h, o.h, 0.01), 'side handle did not crop', el);
    ok(near(w0.x, w1.x, 1) && near(w0.y, w1.y, 1), 'the far edge moved', { w0, w1 });
    ok(near(el.crop.x, o.crop.x, 0.001) && el.crop.w < o.crop.w, 'the crop was taken from the wrong side', el.crop);
    await page.keyboard.press('Escape');
    await wait();
    const back = await get(id);
    ok(['x', 'y', 'w', 'h'].every((k) => back[k] === o[k]) && JSON.stringify(back.crop) === JSON.stringify(o.crop) && (await state()).hi === hi0, 'Esc did not restore the photo', back);
  });

  await step('background: Adjust moves and zooms the page photo, double-click on the background starts it, Done commits one step', async () => {
    await open();
    await asset();
    await tb('Background image');
    await page.waitForSelector('.panel-body .img-item');
    await page.click('.panel-body .img-item >> nth=0');
    await wait();
    const bg0 = await ev(() => A.E.page().bg);
    ok(bg0.asset && bg0.nw === 800 && bg0.nh === 400 && !bg0.fit, 'background photo size not stored', bg0);
    // cover: 2160 × 1080 on the 1920 × 1080 page
    let i = await img(null);
    ok(near(i.x, -120) && near(i.w, 2160) && i.par === 'none', 'background photo not centred by size', i);
    const hi0 = (await state()).hi;
    await tb('Adjust background');
    ok((await state()).crop?.kind === 'bg', 'Adjust did not start');
    const zz = await z();
    const p = await at(960, 800);
    await drag(p, { x: p.x + 25, y: p.y });
    i = await img(null);
    ok(near(i.x, -120 + 25 / zz, 1.5), 'drag did not move the background photo', { i, want: -120 + 25 / zz });
    const zr = page.locator('.crop-bar .crop-zoom');
    await zr.focus();
    for (let k = 0; k < 20; k++) await page.keyboard.press('ArrowRight');
    await wait();
    const f = await ev(() => A.E.page().bg.fit);
    ok(f.s >= 1.19 && (await page.locator('.crop-bar .crop-zoom').count()) === 1, 'bar zoom slider did not zoom', f);
    await page.click('.crop-bar button[title="Done (Enter)"]');
    await wait();
    let s = await state();
    ok(!s.crop && s.hi === hi0 + 1, 'Done did not commit one step', s);
    // double-click on the background, then Esc
    const q = await at(200, 900);
    await page.mouse.dblclick(q.x, q.y);
    await wait();
    ok((await state()).crop?.kind === 'bg', 'double-click on the background did not start adjusting');
    await drag(q, { x: q.x + 100, y: q.y });
    await page.keyboard.press('Escape');
    await wait();
    s = await state();
    ok(!s.crop && s.hi === hi0 + 1 && JSON.stringify(await ev(() => A.E.page().bg.fit)) === JSON.stringify(f), 'Esc did not restore the background', s);
    await shot('w2-frames-02-background');
    // a locked page cannot be adjusted
    await ev(() => { A.E.page().locked = true; A.E.changed({ structure: true }); });
    await wait();
    await page.mouse.dblclick(q.x, q.y);
    await wait();
    ok(!(await state()).crop, 'a locked page background was adjusted');
  });

  await step('locks and keys: locked frames are not cropped; Enter crops, arrows and + move and zoom, Esc cancels; Enter on an empty frame asks for a photo', async () => {
    await open();
    const a = await asset();
    const [locked, free, empty] = await put([
      { shape: 'rect', x: 100, y: 100, w: 400, h: 400, frame: true, asset: a.id, nw: 800, nh: 400, locked: true },
      { shape: 'rect', x: 700, y: 300, w: 400, h: 400, frame: true, asset: a.id, nw: 800, nh: 400 },
      { shape: 'rect', x: 1300, y: 300, w: 400, h: 400, frame: true, fill: '#d9d9de' },
    ]);
    let c = await center(locked);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    ok(!(await state()).crop, 'a locked frame was cropped');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    await wait();
    ok(!(await state()).crop, 'Enter cropped a locked frame');
    c = await center(free);
    await page.mouse.click(c.x, c.y);
    await wait();
    await page.keyboard.press('Enter');
    await wait();
    ok((await state()).crop?.id === free, 'Enter did not crop the frame');
    // 400×400 frame: cover 800 × 400 at x −200
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('ArrowRight');
    await wait();
    ok(near((await img(free)).x, -189, 0.5), 'arrows did not move the photo', await img(free));
    await page.keyboard.press('+');
    await wait();
    ok(near((await get(free)).fit.s, 1.1, 0.001), '+ did not zoom', await get(free));
    const n0 = await ev(() => A.E.els().length);
    await page.keyboard.press('Delete');
    ok((await ev(() => A.E.els().length)) === n0 && (await state()).crop, 'Delete in crop mode deleted the frame');
    await page.keyboard.press('Escape');
    await wait();
    ok(!(await get(free)).fit && !(await state()).crop, 'Esc did not cancel', await get(free));
    c = await center(empty);
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    await wait();
    const s = await state();
    ok(s.panel === 'uploads' && !s.crop && !s.ta, 'Enter on an empty frame', s);
    // and on a locked page nothing is cropped
    await ev(() => { A.E.deselect(); A.E.page().locked = true; A.E.changed({ structure: true }); });
    c = await center(free);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    ok(!(await state()).crop, 'a frame on a locked page was cropped');
  });

  await step('drops: a photo file dropped onto a frame fills it (one undo step, centred again); an upload dragged from the panel fills a frame', async () => {
    await open();
    const a = await asset();
    const [id, id2] = await put([
      { shape: 'heart', x: 300, y: 200, w: 500, h: 500, frame: true, asset: a.id, nw: 800, nh: 400, fit: { s: 2, cx: 0.2, cy: 0.5 } },
      { shape: 'ellipse', x: 1100, y: 200, w: 500, h: 500, frame: true, fill: '#d9d9de' },
    ]);
    const hi0 = (await state()).hi;
    const file = await pngFile('w2-frames-drop.png', 300, 200);
    const c = await center(id);
    const cdp = await ctx.newCDPSession(page);
    const data = { items: [], files: [path.resolve(file)], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: c.x, y: c.y, data });
    await cdp.detach();
    await page.waitForFunction(([id, aid]) => A.E.byId(id).asset !== aid, [id, a.id], { timeout: 5000 });
    await wait();
    const fr = await get(id);
    ok(fr.nw === 300 && fr.nh === 200 && !fr.fit, 'dropped photo size / fit', fr);
    const s = await state();
    ok(s.hi === hi0 + 1 && s.sel.join() === id && (await ev(() => A.E.els().filter((e) => e.type === 'image').length)) === 0, 'drop onto a frame was not one clean step', s);
    await rail('uploads');
    await page.waitForSelector('.panel-body .img-item');
    const want = await ev(async () => (await A.S.listAssets('image'))[0].id);
    await page.locator('.panel-body .img-item').first().dragTo(page.locator(`.page-block.active .page-svg [data-id="${id2}"]`).first());
    await page.waitForFunction(([id, w]) => A.E.byId(id).asset === w, [id2, want], { timeout: 5000 });
    const f2 = await get(id2);
    ok(f2.nw > 0 && f2.nh > 0 && (await state()).hi === hi0 + 2, 'dragged upload did not fill the frame', f2);
    // an upload dragged onto empty page space is added as a photo
    const p = await at(960, 950);
    await page.locator('.panel-body .img-item').first().dragTo(page.locator('.page-block.active .page-frame'), { targetPosition: { x: p.x - (await box('.page-block.active .page-frame')).x, y: p.y - (await box('.page-block.active .page-frame')).y } });
    await page.waitForFunction(() => A.E.els().some((e) => e.type === 'image'), null, { timeout: 5000 });
  });

  await step('frames: a flipped or rotated frame moves its photo the way the pointer goes; the context menu offers Crop and Adjust background', async () => {
    await open();
    const wide = await asset(), tall = await asset(400, 800);
    const [flip, turn] = await put([
      { shape: 'rect', x: 200, y: 220, w: 640, h: 640, frame: true, asset: wide.id, nw: 800, nh: 400, flipX: true },
      { shape: 'rect', x: 1080, y: 220, w: 640, h: 640, frame: true, asset: tall.id, nw: 400, nh: 800, rot: 90 },
    ]);
    const zz = await z();
    // flipped: dragging right moves the mirrored photo right on screen, i.e. left in its own units
    let c = await center(flip);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    await drag(c, { x: c.x + 50, y: c.y });
    ok(near((await img(flip)).x, -320 - 50 / zz, 1.5), 'flipped frame photo moved the wrong way', await img(flip));
    await page.keyboard.press('Enter');
    // turned a quarter: dragging right runs along the photo's own height
    c = await center(turn);
    await page.mouse.dblclick(c.x, c.y);
    await wait();
    await drag(c, { x: c.x + 50, y: c.y });
    const i = await img(turn);
    ok(near(i.y, -320 - 50 / zz, 1.5) && near(i.x, 0), 'rotated frame photo moved the wrong way', i);
    await page.keyboard.press('Enter');
    await wait();
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.click('.menu-item:has-text("Crop")');
    await wait();
    ok((await state()).crop?.id === turn, 'context menu Crop did not start crop mode');
    await page.keyboard.press('Escape');
    await ev((aid) => { A.E.deselect(); A.E.page().bg = { color: '#fff', asset: aid, nw: 800, nh: 400 }; A.E.changed(); }, wide.id);
    const p = await at(960, 1000);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.click('.menu-item:has-text("Adjust background")');
    await wait();
    ok((await state()).crop?.kind === 'bg', 'context menu Adjust background did not start');
    await page.keyboard.press('Escape');
  });

  await step('frames: toolbar shows Crop / Detach for a filled frame and Add photo (no Add text) for an empty one; Detach clears the photo size', async () => {
    await open();
    const a = await asset();
    const [full, empty] = await put([
      { shape: 'rect', x: 200, y: 200, w: 400, h: 400, frame: true, asset: a.id, nw: 800, nh: 400, fit: { s: 1.5, cx: 0.4, cy: 0.5 } },
      { shape: 'rect', x: 900, y: 200, w: 400, h: 400, frame: true, fill: '#d9d9de' },
    ]);
    const titles = () => ev(() => [...document.querySelectorAll('.ed-toolbar button')].map((b) => b.title));
    let c = await center(empty);
    await page.mouse.click(c.x, c.y);
    await wait();
    let t = await titles();
    ok(t.includes('Add a photo to the frame') && !t.includes('Add text'), 'empty frame toolbar', t);
    c = await center(full);
    await page.mouse.click(c.x, c.y);
    await wait();
    t = await titles();
    ok(t.includes('Crop') && t.includes('Remove image from frame') && !t.includes('Add text'), 'filled frame toolbar', t);
    await tb('Remove image from frame');
    const fr = await get(full);
    ok(!fr.asset && !fr.nw && !fr.nh && !fr.fit, 'Detach left the photo size or fit', fr);
  });

  await step('phone: at 390px the crop bar fits on screen, a drag pans the photo and the toolbar Done commits', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await open('social');
      const a = await asset();
      const [id] = await put([{ shape: 'ellipse', x: 240, y: 240, w: 600, h: 600, frame: true, asset: a.id, nw: 800, nh: 400 }]);
      const hi0 = (await state()).hi;
      const c = await center(id);
      await page.mouse.dblclick(c.x, c.y);
      await wait();
      ok((await state()).crop?.kind === 'frame', 'double-click did not start crop mode on a phone');
      const b = await box('.crop-bar');
      ok(b.x >= 0 && b.x + b.width <= 390 && b.width > 100 && b.height < 50, 'crop bar does not fit the phone screen in one row', b);
      ok((await state()).panel !== 'crop', 'the Crop sheet covered the phone canvas');
      ok((await ev(() => document.documentElement.scrollWidth)) <= 390, 'the page scrolls sideways');
      await drag(c, { x: c.x + 40, y: c.y });
      ok((await get(id)).fit?.cx < 0.5, 'drag did not pan on a phone', await get(id));
      await shot('w2-frames-03-phone');
      await tb('Done (Enter)');
      const s = await state();
      ok(!s.crop && s.hi === hi0 + 1, 'toolbar Done on a phone', s);
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });
}
