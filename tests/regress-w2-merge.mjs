// Wave 2 integration: behaviour where the wave-2 features meet (Space pan vs. timeline play, crop mode vs. the
// power shortcuts, panel drags vs. frame fit, the Layers tree vs. the key object, multi-scaling vs. video clips).
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
  // a new design of `type` whose first page holds `els` (made by build(A) in the page, so assets can be used)
  const open = async (type, build = '() => []', pages = 1) => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev(async ([type, build, pages]) => {
      const els = await (0, eval)(build)(A);
      await A.Home.newDesign({ type, pages: Array.from({ length: pages }, (_, i) => A.M.newPage({ duration: 2, elements: i ? [] : els })) });
    }, [type, build, pages]);
    await page.waitForFunction(() => A.E.d && A.E.blocks[A.E.pi]?.svg.isConnected);
    await wait(300);
    await ev(() => document.activeElement?.blur?.());
  };
  const get = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.byId(id))), id);
  const at = (x, y) => ev(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  const center = async (id) => { const e = await get(id); return at(e.x + e.w / 2, e.y + e.h / 2); };
  const click = async (id) => { const c = await center(id); await page.mouse.click(c.x, c.y); await wait(); };
  const drag = async (a, b, steps = 8) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 6, a.y + 6, { steps: 2 });
    await page.mouse.move(b.x, b.y, { steps });
    await page.mouse.up();
    await wait();
  };
  const hi = () => ev(() => A.E.hi);
  const png = (w, h) => `async (A) => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; c.getContext('2d').fillRect(0, 0, ${w}, ${h}); return A.S.addAsset(await new Promise((r) => c.toBlob(r, 'image/png')), { name: 'merge.png' }); }`;

  await step('merge: in a video a Space tap plays and pauses the timeline; Space held for a drag pans and plays nothing', async () => {
    await open('video', "(A) => [A.M.newShape('rect', { id: 'r', x: 100, y: 100, w: 300, h: 300 })]", 2);
    const sc = await page.locator('.ed-scroll').boundingBox();
    await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
    await page.keyboard.press('Space');
    await wait(300);
    ok(await ev(() => A.Present.previewing), 'a Space tap did not play');
    await page.keyboard.press('Space');
    await wait();
    ok(!(await ev(() => A.Present.previewing)), 'a second Space tap did not pause');
    // zoomed in so the canvas can pan
    await ev(() => A.E.setZoom(A.E.zoom * 3));
    await wait(300);
    const s0 = await ev(() => ({ l: A.E.scrollEl.scrollLeft, t: A.E.scrollEl.scrollTop, hi: A.E.hi }));
    const c = { x: sc.x + sc.width / 2, y: sc.y + sc.height / 2 };
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Space');
    await drag(c, { x: c.x - 150, y: c.y - 100 });
    await page.keyboard.up('Space');
    await wait(300);
    const s1 = await ev(() => ({ l: A.E.scrollEl.scrollLeft, t: A.E.scrollEl.scrollTop, hi: A.E.hi, on: A.Present.previewing }));
    ok(near(s1.l - s0.l, 150, 3) && near(s1.t - s0.t, 100, 3), 'Space-drag did not pan', { s0, s1 });
    ok(!s1.on && s1.hi === s0.hi, 'Space-drag played the timeline or changed the design', s1);
    // on the timeline ruler Space is the ruler's own (it plays once, not twice)
    // (clear of the playhead's knob)
    const rb = await page.locator('.tl-ruler').boundingBox();
    await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.keyboard.press('Space');
    await wait(300);
    ok(await ev(() => A.Present.previewing), 'Space on the ruler did not play');
    await page.keyboard.press('Space');
    ok(!(await ev(() => A.Present.previewing)), 'Space on the ruler did not pause');
  });

  await step('merge: a power shortcut during a crop keeps the crop as its own undo step', async () => {
    await open('presentation', `async (A) => { const a = await (${png(800, 400)})(A); return [A.M.newShape('rect', { id: 'f', x: 200, y: 200, w: 400, h: 400, frame: true, asset: a.id, nw: a.w, nh: a.h })]; }`);
    await click('f');
    const h0 = await hi();
    await page.keyboard.press('Enter');
    await wait();
    ok(await ev(() => A.E.cropping?.id === 'f'), 'Enter did not crop the frame');
    // the photo is wider than the frame, so it pans sideways
    const c = await center('f');
    await drag(c, { x: c.x + 60, y: c.y });
    const fit = (await get('f')).fit;
    ok(fit && fit.cx !== 0.5, 'drag did not pan the photo', fit);
    await page.keyboard.press('Shift+H');
    await wait();
    const f = await get('f');
    ok(!(await ev(() => A.E.cropping)) && f.flipX && JSON.stringify(f.fit) === JSON.stringify(fit), 'Shift+H did not keep the crop and flip', f);
    ok((await hi()) === h0 + 2, 'crop and flip were not two undo steps', { h0, hi: await hi() });
    await page.keyboard.press('Control+z');
    await wait();
    const u = await get('f');
    ok(!u.flipX && JSON.stringify(u.fit) === JSON.stringify(fit), 'undo did not take back the flip alone', u);
  });

  await step('merge: a brand photo dragged onto a frame gives the frame its size and a fresh fit (one undo step)', async () => {
    await open('presentation', "(A) => [A.M.newShape('rect', { id: 'f', x: 200, y: 200, w: 300, h: 300, fill: '#d9d9de', frame: true, fit: { s: 2, cx: 0.2, cy: 0.5 } })]");
    const a = await ev(async (src) => { const x = await (0, eval)(src)(A); return { id: x.id, w: x.w, h: x.h }; }, png(240, 120));
    const saved = await ev((id) => { const b = JSON.stringify(A.app.brand); A.app.brand = { ...A.app.brand, photos: [id] }; return b; }, a.id);
    try {
      await page.click('.rail-btn[data-p="brand"]');
      const ph = page.locator('.ed-panel .p-sec', { hasText: 'Brand photos' }).locator('.img-item');
      await ph.waitFor();
      await wait(300);
      const h0 = await hi(), b = await ph.boundingBox();
      await drag({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, await center('f'));
      await page.waitForFunction((id) => A.E.byId('f').asset === id, a.id, { timeout: 5000 });
      const f = await get('f');
      ok(f.nw === a.w && f.nh === a.h && !f.fit, 'the frame did not take the photo size and a fresh fit', f);
      ok((await hi()) === h0 + 1 && (await ev(() => A.E.sel.join())) === 'f', 'the fill was not one step selecting the frame');
    } finally {
      await ev((b) => (A.app.brand = JSON.parse(b)), saved);
    }
  });

  await step('merge: Ctrl-click in the Layers tree adds a row and makes it the key object', async () => {
    await open('presentation', "(A) => [A.M.newShape('rect', { id: 'a', x: 100, y: 100, w: 150, h: 150 }), A.M.newShape('rect', { id: 'b', x: 500, y: 300, w: 150, h: 150 }), A.M.newShape('rect', { id: 'c', x: 900, y: 500, w: 150, h: 150 })]");
    await click('a');
    await ev(() => A.EU.openLayers());
    await wait();
    await page.click('.ed-panel .layer[data-key="c"] .layer-name', { modifiers: ['Control'] });
    await wait();
    ok((await ev(() => A.E.sel.join())) === 'a,c' && (await ev(() => A.E.keyId)) === 'c' && (await page.locator('.sel-key').count()) === 1, 'Ctrl-click key', await ev(() => ({ sel: A.E.sel, key: A.E.keyId })));
    // aligned to the key object, it stays put
    await ev(() => (A.E.alignTo = 'key'));
    await page.keyboard.press('Alt+a');
    await wait();
    ok((await get('c')).x === 900 && (await get('a')).x === 900, 'align to the key object', [await get('a'), await get('c')]);
    await ev(() => (A.E.alignTo = 'selection'));
  });

  await step('merge: stretching a multi-selection sideways keeps a video clip in proportion (one undo step)', async () => {
    // a 1 s clip recorded in the page
    await ev(async () => {
      if (window.__mergeClip) return;
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const g = c.getContext('2d'), rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }), chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r)), t0 = performance.now();
      rec.start(100);
      await new Promise((res) => { const f = () => { g.fillStyle = performance.now() - t0 < 500 ? '#f00' : '#00f'; g.fillRect(0, 0, 320, 180); if (performance.now() - t0 > 1000) return res(); requestAnimationFrame(f); }; f(); });
      rec.stop();
      await done;
      window.__mergeClip = await A.V.importVideo(new File([new Blob(chunks, { type: 'video/webm' })], 'merge.webm', { type: 'video/webm' }));
    });
    await open('presentation', "(A) => [A.M.newVideo(window.__mergeClip, { id: 'v', x: 100, y: 100, w: 320, h: 180 }), A.M.newShape('rect', { id: 'r', x: 600, y: 100, w: 200, h: 180 })]");
    await click('v');
    await page.keyboard.down('Shift');
    await click('r');
    await page.keyboard.up('Shift');
    ok((await ev(() => A.E.sel.join())) === 'v,r', 'both selected', await ev(() => A.E.sel));
    const h0 = await hi(), z = await ev(() => A.E.zoom), hd = await page.locator('.sel-box .handle.e').first().boundingBox();
    const p = { x: hd.x + hd.width / 2, y: hd.y + hd.height / 2 };
    await drag(p, { x: p.x + 350 * z, y: p.y });
    const v = await get('v'), r = await get('r');
    ok(near(v.w / v.h, 320 / 180, 0.01) && JSON.stringify(v.crop) === JSON.stringify({ x: 0, y: 0, w: 1, h: 1 }), 'the clip was stretched out of shape', v);
    ok(near(r.w, 300, 5) && r.h === 180, 'the rectangle did not stretch sideways', r);
    ok((await hi()) === h0 + 1, 'the stretch was not one undo step');
  });
}
