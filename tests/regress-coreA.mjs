// Regression checks for editor pointer/geometry fixes (resize anchors, connectors, groups, zoom, touch, overlay).
export default async function ({ page, step, shot }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 120) => page.waitForTimeout(ms);
  // Opens a new design whose first page holds `els` (partial element objects, built with the A.M factories).
  const open = async (p, type, els = [], { pages = 1 } = {}) => {
    await p.evaluate(() => A.app.go('#/home'));
    await p.waitForSelector('.hero');
    await p.evaluate(async ([type, els, pages]) => {
      const M = A.M;
      const mk = (o) => {
        const el = o.type === 'text' ? M.newText(o) : o.type === 'line' ? M.newLine(o) : o.type === 'icon' ? M.newIcon(o.icon || 'heart', o) : M.newShape(o.shape || 'rect', o);
        if (el.type === 'text') el.h = A.R.textHeight(el);
        if (el.type === 'line') M.syncLineBox(el);
        return el;
      };
      await A.Home.newDesign({ type, pages: Array.from({ length: pages }, (_, i) => M.newPage({ elements: i ? [] : els.map(mk) })) });
    }, [type, els, pages]);
    await p.waitForSelector('.page-svg');
    await p.waitForFunction(() => A.E.d && Object.keys(A.E.blocks).length && A.E.blocks[0].svg.isConnected);
    await p.waitForTimeout(300);
    await p.evaluate(() => document.activeElement?.blur?.());
  };
  // client position of a page point on the active page
  const at = (x, y) => ev(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  const zoom = () => ev(() => A.E.zoom);
  const drag = async (a, b, steps = 8) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps });
    await page.mouse.up();
  };
  const handle = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error('no handle ' + sel);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const get = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.byId(id))), id);
  const ends = (id) => ev((id) => JSON.parse(JSON.stringify(A.R.lineEnds(A.E.byId(id), A.E.page()))), id);
  const select = (ids) => ev((ids) => A.E.select(ids), ids);
  // page position of a point given in the element's own (rotated) frame, relative to its centre
  const local = (e, lx, ly) => {
    const t = ((e.rot || 0) * Math.PI) / 180;
    return { x: e.x + e.w / 2 + Math.cos(t) * lx - Math.sin(t) * ly, y: e.y + e.h / 2 + Math.sin(t) * lx + Math.cos(t) * ly };
  };
  const near = (a, b, tol, what) => {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > tol) throw new Error(`${what} moved ${d.toFixed(1)} (${a.x.toFixed(1)},${a.y.toFixed(1)} -> ${b.x.toFixed(1)},${b.y.toFixed(1)})`);
  };
  const centre = (p = page) => p.evaluate(() => {
    const w = A.E.scrollEl, sr = w.getBoundingClientRect(), x = sr.left + w.clientWidth / 2, y = sr.top + w.clientHeight / 2;
    for (const k in A.E.blocks) {
      const r = A.E.blocks[k].svg.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return { page: +k, x: (x - r.left) / A.E.zoom, y: (y - r.top) / A.E.zoom, cx: x, cy: y };
    }
    return { page: -1 };
  });

  await step('rotated element: side handles keep the opposite side fixed', async () => {
    await open(page, 'presentation', [{ id: 'r90', x: 700, y: 400, w: 400, h: 200, rot: 90 }, { id: 'r45', x: 1200, y: 300, w: 400, h: 200, rot: 45 }]);
    const z = await zoom();
    // rot 90: the 's' handle points to page -x
    await select(['r90']);
    let e0 = await get('r90');
    const a0 = local(e0, 0, -e0.h / 2);
    let hd = await handle('.sel-box .handle.s');
    await drag(hd, { x: hd.x - 100 * z, y: hd.y });
    let e1 = await get('r90');
    near(a0, local(e1, 0, -e1.h / 2), 1.5, 'rot 90 top side');
    if (Math.abs(e1.h - 300) > 3) throw new Error('height ' + e1.h);
    // rot 45: drag 'e' outward along the element's own x axis
    await select(['r45']);
    e0 = await get('r45');
    const b0 = local(e0, -e0.w / 2, 0);
    hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x + 100 * z * Math.SQRT1_2, y: hd.y + 100 * z * Math.SQRT1_2 });
    e1 = await get('r45');
    near(b0, local(e1, -e1.w / 2, 0), 1.5, 'rot 45 left side');
    if (Math.abs(e1.w - 500) > 3) throw new Error('width ' + e1.w);
  });

  await step('rotated text: width handle keeps the opposite top corner fixed', async () => {
    await open(page, 'presentation', [{ id: 't', type: 'text', text: 'Hello\nWorld', x: 600, y: 300, w: 600, size: 60, rot: 90 }]);
    const z = await zoom();
    await select(['t']);
    const e0 = await get('t');
    const a0 = local(e0, -e0.w / 2, -e0.h / 2);
    const hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x, y: hd.y + 150 * z }); // local +x is page +y at 90 degrees
    const e1 = await get('t');
    near(a0, local(e1, -e1.w / 2, -e1.h / 2), 1.5, 'text top-left corner');
    if (Math.abs(e1.w - 750) > 3 || e1.size !== e0.size) throw new Error(`w ${e1.w} size ${e1.size}`);
  });

  await step('clicking or dragging a shape while editing text selects / moves it', async () => {
    await open(page, 'presentation', [{ id: 't', type: 'text', text: 'Hello', x: 200, y: 200, w: 400, size: 80 }, { id: 's', x: 1000, y: 500, w: 300, h: 200 }]);
    const t = await get('t');
    await page.mouse.dblclick(...Object.values(await at(t.x + 25, t.y + t.h / 2)));
    await page.waitForSelector('textarea.text-edit');
    await page.keyboard.type(' there');
    await page.mouse.click(...Object.values(await at(1150, 600)));
    await wait();
    const st = await ev(() => ({ sel: A.E.sel, editing: A.E.editingId, text: A.E.byId('t').text }));
    if (st.sel.join() !== 's' || st.editing || !st.text.includes('there')) throw new Error(JSON.stringify(st));
    await page.mouse.dblclick(...Object.values(await at(t.x + 25, t.y + t.h / 2)));
    await page.waitForSelector('textarea.text-edit');
    const z = await zoom();
    const s0 = await get('s');
    await drag(await at(1150, 600), await at(1150 + 150, 600 + 120));
    const s1 = await get('s');
    if (s1.x - s0.x < 100 || s1.y - s0.y < 80) throw new Error(`shape moved ${s1.x - s0.x},${s1.y - s0.y} (zoom ${z})`);
  });

  await step('after entering a group and clicking away, a drag moves the whole group', async () => {
    await open(page, 'presentation', [{ id: 'a', type: 'icon', x: 300, y: 300, w: 200, h: 200, groupId: 'g1' }, { id: 'b', type: 'icon', x: 600, y: 300, w: 200, h: 200, groupId: 'g1' }]);
    const pa = await at(400, 400);
    await page.mouse.click(pa.x, pa.y);
    await wait();
    await page.mouse.dblclick(pa.x, pa.y);
    await wait();
    const inside = await ev(() => ({ sel: A.E.sel, g: A.E.enteredGroup }));
    if (inside.sel.join() !== 'a' || inside.g !== 'g1') throw new Error('did not enter group ' + JSON.stringify(inside));
    const empty = await at(1500, 900);
    await page.mouse.click(empty.x, empty.y);
    await wait();
    const b0 = await get('b');
    await drag(pa, { x: pa.x + 80, y: pa.y + 60 });
    const st = await ev(() => ({ sel: A.E.sel, b: A.E.byId('b') }));
    if (st.sel.length !== 2 || st.b.x === b0.x) throw new Error('only one member moved ' + JSON.stringify(st.sel));
  });

  await step('connectors: drag, nudge, duplicate, paste and Alt-drag keep the drawn line', async () => {
    await open(page, 'presentation', [{ id: 'A', x: 200, y: 200, w: 300, h: 200 }, { id: 'B', x: 1300, y: 700, w: 300, h: 200 }, { id: 'L', type: 'line', p1: { x: 700, y: 500 }, p2: { x: 1000, y: 500 } }]);
    const z = await zoom();
    await select(['L']);
    await drag(await handle('.handle.end[data-h="p1"]'), await at(350, 300));
    await drag(await handle('.handle.end[data-h="p2"]'), await at(1450, 800));
    let l = await get('L');
    if (l.c1 !== 'A' || l.c2 !== 'B') throw new Error('not connected ' + l.c1 + ' ' + l.c2);
    // move shape A down; the line follows it
    await drag(await at(350, 300), await at(350, 300 + 300), 10);
    await select(['L']);
    const e0 = await ends('L');
    const mid = await at((e0.p1.x + e0.p2.x) / 2, (e0.p1.y + e0.p2.y) / 2);
    await drag(mid, { x: mid.x + 10, y: mid.y + 10 });
    const e1 = await ends('L');
    const d = Math.hypot(e1.p1.x - e0.p1.x, e1.p1.y - e0.p1.y);
    if (d > 20 / z + 15) throw new Error(`p1 jumped ${d.toFixed(0)} page px for a 10px drag`);
    await page.keyboard.press('Control+z');
    await wait();
    // nudging a lone connector moves it
    await select(['L']);
    const n0 = await ends('L');
    await page.keyboard.press('Shift+ArrowDown');
    const n1 = await ends('L');
    near({ x: n0.p1.x, y: n0.p1.y + 10 }, n1.p1, 0.5, 'nudged p1');
    near({ x: n0.p2.x, y: n0.p2.y + 10 }, n1.p2, 0.5, 'nudged p2');
    await page.keyboard.press('Control+z');
    await wait();
    // Ctrl+D on both shapes and the line: the copy connects the copied shapes
    await select(['A', 'B', 'L']);
    await page.keyboard.press('Control+d');
    let st = await ev(() => { const s = A.E.selEls(); const l = s.find((e) => e.type === 'line'); return { n: s.length, c1: l.c1, c2: l.c2, shapes: s.filter((e) => e.type === 'shape').map((e) => e.id) }; });
    if (st.n !== 3 || !st.shapes.includes(st.c1) || !st.shapes.includes(st.c2)) throw new Error('duplicate not reconnected ' + JSON.stringify(st));
    await page.keyboard.press('Control+z');
    await wait();
    // copy/paste the line alone: it lands next to the drawn line
    await select(['L']);
    const c0 = await ends('L');
    await ev(() => { A.E.copy(); A.E.paste(); });
    const pasted = await ev(() => A.E.sel[0]);
    const c1 = await ends(pasted);
    near({ x: c0.p1.x + 24, y: c0.p1.y + 24 }, c1.p1, 0.5, 'pasted p1');
    near({ x: c0.p2.x + 24, y: c0.p2.y + 24 }, c1.p2, 0.5, 'pasted p2');
    await page.keyboard.press('Control+z');
    await wait();
    // Alt-drag copies the shapes and the line together, still connected
    await select(['A', 'B', 'L']);
    const b = await get('B');
    const pb = await at(b.x + b.w / 2, b.y + b.h / 2);
    await page.keyboard.down('Alt');
    await drag(pb, { x: pb.x, y: pb.y - 150 });
    await page.keyboard.up('Alt');
    st = await ev(() => { const s = A.E.selEls(); const l = s.find((e) => e.type === 'line'); return { n: s.length, all: A.E.els().length, c1: l?.c1, c2: l?.c2, shapes: s.filter((e) => e.type === 'shape').map((e) => e.id) }; });
    if (st.all !== 6 || !st.shapes.includes(st.c1) || !st.shapes.includes(st.c2)) throw new Error('alt-copy not reconnected ' + JSON.stringify(st));
  });

  await step('connector end snaps to the topmost visible (rotated) shape', async () => {
    await open(page, 'presentation', [
      { id: 'bg', x: 0, y: 0, w: 1920, h: 1080, fill: '#eeeeee' },
      { id: 'A', x: 300, y: 300, w: 300, h: 200 },
      { id: 'H', x: 1300, y: 880, w: 200, h: 120, hidden: true },
      { id: 'R', x: 1200, y: 600, w: 400, h: 60, rot: 90 },
      { id: 'L', type: 'line', p1: { x: 800, y: 300 }, p2: { x: 1000, y: 300 } },
    ]);
    await select(['L']);
    await drag(await handle('.handle.end[data-h="p1"]'), await at(450, 400));
    await drag(await handle('.handle.end[data-h="p2"]'), await at(1400, 940));
    let l = await get('L');
    if (l.c1 !== 'A') throw new Error('p1 attached to ' + l.c1);
    if (l.c2 === 'H') throw new Error('p2 attached to a hidden shape');
    // (1400,450) is inside R only once its rotation is taken into account
    await drag(await handle('.handle.end[data-h="p2"]'), await at(1400, 450));
    l = await get('L');
    if (l.c2 !== 'R') throw new Error('p2 attached to ' + l.c2);
  });

  await step('short text boxes keep their width handles', async () => {
    await open(page, 'social');
    await page.keyboard.press('t');
    await page.waitForSelector('.sel-box');
    const st = await ev(() => { const sb = document.querySelector('.sel-box').getBoundingClientRect(); return { h: sb.height, sides: [...document.querySelectorAll('.sel-box .handle.side')].map((x) => x.dataset.h + ':' + x.getBoundingClientRect().height) }; });
    if (st.h >= 40 || st.sides.length !== 2) throw new Error(JSON.stringify(st));
    if (st.sides.some((s) => +s.split(':')[1] > st.h)) throw new Error('side handles taller than the box ' + JSON.stringify(st));
    const e0 = await ev(() => ({ ...A.E.selEls()[0] }));
    const hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x + 60, y: hd.y });
    const e1 = await ev(() => ({ ...A.E.selEls()[0] }));
    if (!(e1.w > e0.w + 50) || e1.size !== e0.size) throw new Error(`w ${e0.w} -> ${e1.w}, size ${e0.size} -> ${e1.size}`);
    if (Math.abs(e1.x - e0.x) > 0.01 || Math.abs(e1.y - e0.y) > 0.01) throw new Error('e handle moved the left/top edge');
    const hw = await handle('.sel-box .handle.w');
    await drag(hw, { x: hw.x - 40, y: hw.y });
    const e2 = await ev(() => ({ ...A.E.selEls()[0] }));
    if (Math.abs(e2.x + e2.w - (e1.x + e1.w)) > 0.01 || Math.abs(e2.y - e1.y) > 0.01 || !(e2.w > e1.w + 30)) throw new Error('w handle: ' + JSON.stringify([e1.x, e1.w, e2.x, e2.w]));
  });

  await step('whiteboard grows after a resize or an arrow-key nudge past its edge', async () => {
    await open(page, 'whiteboard', [{ id: 's', x: 2000, y: 600, w: 200, h: 200 }]);
    const z = await zoom();
    await select(['s']);
    const hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x + 400 * z, y: hd.y });
    let st = await ev(() => ({ W: A.E.d.width, right: A.E.byId('s').x + A.E.byId('s').w }));
    if (!(st.right > 2400) || !(st.W > st.right)) throw new Error('resize: ' + JSON.stringify(st));
    await open(page, 'whiteboard', [{ id: 's', x: 2170, y: 600, w: 140, h: 140 }]);
    await select(['s']);
    await page.keyboard.press('Shift+ArrowRight');
    st = await ev(() => ({ W: A.E.d.width, right: A.E.byId('s').x + A.E.byId('s').w }));
    if (!(st.W > 2400)) throw new Error('nudge: ' + JSON.stringify(st));
  });

  await step('side crop on a flipped image crops the visible side', async () => {
    await open(page, 'presentation');
    await ev(async () => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 400;
      const g = c.getContext('2d'); g.fillStyle = '#f00'; g.fillRect(0, 0, 400, 400); g.fillStyle = '#00f'; g.fillRect(400, 0, 400, 400);
      const a = await A.S.addAsset(await new Promise((r) => c.toBlob(r, 'image/png')), { name: 'rb.png' });
      const el = A.M.newImage(a, { id: 'im', x: 200, y: 200, w: 800, h: 400, flipX: true });
      A.E.page().elements.push(el);
      A.E.changed();
      A.E.select(['im']);
    });
    await wait(200);
    const z = await zoom();
    const hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x - 200 * z, y: hd.y });
    const e = await get('im');
    if (Math.abs(e.crop.x - 0.25) > 0.01 || Math.abs(e.crop.w - 0.75) > 0.01 || Math.abs(e.x - 200) > 0.5 || Math.abs(e.w - 600) > 2) throw new Error(JSON.stringify({ crop: e.crop, x: e.x, w: e.w }));
  });

  await step('hover outline follows a rotated element', async () => {
    await open(page, 'presentation', [{ id: 'r', x: 600, y: 400, w: 600, h: 100, rot: 45 }]);
    const z = await zoom();
    const c = await at(900, 450);
    await page.mouse.move(c.x - 5, c.y - 5);
    await page.mouse.move(c.x, c.y);
    await wait();
    const hb = await ev(() => { const h = document.querySelector('.hover-box'); return { w: h.offsetWidth, h: h.offsetHeight, tr: getComputedStyle(h).transform, shown: getComputedStyle(h).display }; });
    if (hb.shown !== 'block' || Math.abs(hb.w - 600 * z) > 6 || Math.abs(hb.h - 100 * z) > 6 || hb.tr === 'none') throw new Error(JSON.stringify(hb));
  });

  await step('zoom to fit keeps the current page in view', async () => {
    await open(page, 'doc', [], { pages: 8 });
    await ev(() => { A.E.setZoom(1); A.E.setPage(5, false); A.E.blocks[5].el.scrollIntoView({ block: 'center' }); });
    await wait(200);
    const c0 = await centre();
    if (c0.page !== 5) throw new Error('setup centre on page ' + c0.page);
    await page.keyboard.press('Control+0');
    await wait(200);
    const c1 = await centre();
    const st = await ev(() => ({ pi: A.E.pi, zoom: A.E.zoom }));
    if (c1.page !== 5 || st.pi !== 5 || st.zoom === 1) throw new Error(JSON.stringify({ c1, ...st }));
  });

  await step('zoom buttons and ctrl+wheel keep the viewport centre', async () => {
    await open(page, 'doc', [], { pages: 8 });
    await ev(() => A.E.blocks[3].el.scrollIntoView({ block: 'center' }));
    await wait(200);
    const c0 = await centre();
    for (let k = 0; k < 4; k++) { await page.click('button[title="Zoom in"]'); await wait(60); }
    const c1 = await centre();
    if (c1.page !== c0.page || Math.hypot(c1.x - c0.x, c1.y - c0.y) > 3) throw new Error(`buttons: ${JSON.stringify(c0)} -> ${JSON.stringify(c1)}`);
    await page.mouse.move(c1.cx, c1.cy);
    await page.keyboard.down('Control');
    for (let k = 0; k < 3; k++) { await page.mouse.wheel(0, 100); await wait(60); }
    await page.keyboard.up('Control');
    const c2 = await centre();
    if (c2.page !== c0.page || Math.hypot(c2.x - c0.x, c2.y - c0.y) > 4) throw new Error(`wheel: ${JSON.stringify(c0)} -> ${JSON.stringify(c2)}`);
  });

  await step('leaving the editor mid-drag throws nothing', async () => {
    await open(page, 'presentation', [{ id: 's', x: 800, y: 400, w: 300, h: 200 }]);
    const errs = [];
    const onErr = (e) => errs.push(e.message);
    page.on('pageerror', onErr);
    const p = await at(950, 500);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y + 30, { steps: 4 });
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await page.waitForFunction(() => !A.E.d);
    await page.mouse.move(p.x + 80, p.y + 60, { steps: 4 });
    await page.mouse.up();
    await wait(200);
    page.off('pageerror', onErr);
    if (errs.length) throw new Error(errs.join(' | '));
    if (await ev(() => A.E.dragging)) throw new Error('still dragging');
  });

  await step('recording a motion path moves a line with the pointer', async () => {
    await open(page, 'presentation', [{ id: 'L', type: 'line', p1: { x: 600, y: 500 }, p2: { x: 1200, y: 500 } }]);
    await select(['L']);
    await ev(() => A.E.startMotion());
    const l0 = await get('L');
    const p = await at(900, 500);
    const bx0 = (await page.locator('.page-svg [data-id="L"]').boundingBox()).x;
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 100, p.y + 40, { steps: 12 });
    const bx1 = (await page.locator('.page-svg [data-id="L"]').boundingBox()).x;
    await page.mouse.up();
    const l1 = await get('L');
    if (Math.abs(bx1 - bx0 - 100) > 3) throw new Error(`line moved ${bx1 - bx0}px while recording`);
    if (JSON.stringify([l1.p1, l1.p2]) !== JSON.stringify([l0.p1, l0.p2]) || !(l1.anim?.motion?.length > 3)) throw new Error('ends not restored or no motion ' + JSON.stringify(l1));
  });

  await step('mini-menu stays inside the view and off the page head', async () => {
    await open(page, 'presentation', [{ id: 'left', x: 0, y: 500, w: 40, h: 100 }, { id: 'top', x: 800, y: 0, w: 300, h: 100 }, { id: 'mid', x: 800, y: 500, w: 300, h: 100 }]);
    await select(['mid']);
    const mid = await ev(() => document.querySelector('.mini-menu').getBoundingClientRect().bottom <= document.querySelector('.sel-box').getBoundingClientRect().top);
    if (!mid) throw new Error('menu no longer above an element in the middle of the page');
    await select(['top']);
    const top = await ev(() => {
      const m = document.querySelector('.mini-menu').getBoundingClientRect(), t = document.querySelector('.page-block.active .pg-title'), r = t.getBoundingClientRect();
      return { menuTop: m.top, headBottom: document.querySelector('.page-block.active .page-head').getBoundingClientRect().bottom, titleFree: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === t };
    });
    if (top.menuTop < top.headBottom || !top.titleFree) throw new Error('menu covers the page head ' + JSON.stringify(top));
    await ev(() => { A.E.setZoom(2); A.E.scrollEl.scrollLeft = 0; A.E.select(['left']); });
    await wait();
    const left = await ev(() => {
      const sr = A.E.scrollEl.getBoundingClientRect();
      return [...document.querySelectorAll('.mini-menu .mini-btn')].map((b) => { const r = b.getBoundingClientRect(); return r.left >= sr.left && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.mini-btn') === b; });
    });
    if (!left.length || left.includes(false)) throw new Error('unreachable buttons ' + JSON.stringify(left));
  });

  await step('touch: two fingers pinch-zoom and pan instead of moving, drawing or committing', async () => {
    const ctx2 = await page.context().browser().newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
    const p = await ctx2.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    try {
      await p.goto(page.url().split('#')[0] + '#/home');
      await p.waitForSelector('.hero');
      await open(p, 'presentation', [{ id: 's', x: 800, y: 400, w: 300, h: 200 }]);
      const cdp = await ctx2.newCDPSession(p);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 1, radiusY: 1, force: 1 })) });
      const pat = (x, y) => p.evaluate(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return [r.left + x * A.E.zoom, r.top + y * A.E.zoom]; }, [x, y]);
      const st = () => p.evaluate(() => ({ s: [A.E.byId('s').x, A.E.byId('s').y], hi: A.E.hi, n: A.E.hist.length, zoom: A.E.zoom, els: A.E.els().length, sel: A.E.sel.join(), scroll: [A.E.scrollEl.scrollLeft, A.E.scrollEl.scrollTop] }));
      // client points inside the visible part of the page
      const vis = await p.evaluate(() => { const r = A.E.blocks[0].frame.getBoundingClientRect(), s = A.E.scrollEl.getBoundingClientRect(); return { l: Math.max(r.left, s.left), t: Math.max(r.top, s.top) }; });
      const f1 = await pat(950, 500), f2 = [vis.l + 120, vis.t + 30];
      await p.touchscreen.tap(...f1);
      await p.waitForTimeout(200);
      const s0 = await st();
      if (s0.sel !== 's') throw new Error('tap did not select ' + s0.sel);
      // finger 1 on the selected shape, finger 2 spreads away from it
      await touch('touchStart', [f1]);
      await touch('touchStart', [f1, f2]);
      for (let k = 1; k <= 6; k++) { await touch('touchMove', [f1, [f2[0] - k * 15, f2[1] - k * 4]]); await p.waitForTimeout(20); }
      await touch('touchEnd', []);
      await p.waitForTimeout(150);
      const s1 = await st();
      if (s1.s.join() !== s0.s.join() || s1.hi !== s0.hi || s1.n !== s0.n || s1.sel !== 's') throw new Error('pinch changed the design ' + JSON.stringify({ s0, s1 }));
      if (!(s1.zoom > s0.zoom * 1.1)) throw new Error('pinch did not zoom ' + s0.zoom + ' -> ' + s1.zoom);
      // two fingers with the Draw tool: no strokes, no undo step
      await p.evaluate(() => { A.E.tool = 'draw'; A.EU.refreshTool(); A.E.deselect(); });
      const d0 = await st();
      const a = [vis.l + 60, vis.t + 60], b = [vis.l + 260, vis.t + 160];
      await touch('touchStart', [a]);
      await touch('touchStart', [a, b]);
      for (let k = 1; k <= 5; k++) { await touch('touchMove', [[a[0] + k * 4, a[1] + k * 4], [b[0] + k * 4, b[1] + k * 4]]); await p.waitForTimeout(20); }
      await touch('touchEnd', []);
      await p.waitForTimeout(150);
      const d1 = await st();
      if (d1.els !== d0.els || d1.hi !== d0.hi) throw new Error('two-finger draw added strokes ' + JSON.stringify({ d0, d1 }));
      // two-finger pan when zoomed in
      await p.evaluate(() => { A.E.tool = null; A.EU.refreshTool(); A.E.setZoom(1.5); });
      await p.waitForTimeout(100);
      const q0 = await st();
      const m1 = [300, 500], m2 = [450, 500];
      await touch('touchStart', [m1]);
      await touch('touchStart', [m1, m2]);
      for (let k = 1; k <= 5; k++) { await touch('touchMove', [[m1[0], m1[1] - k * 20], [m2[0], m2[1] - k * 20]]); await p.waitForTimeout(20); }
      await touch('touchEnd', []);
      await p.waitForTimeout(150);
      const q1 = await st();
      if (!(q1.scroll[1] - q0.scroll[1] > 60) || q1.hi !== q0.hi || q1.s.join() !== q0.s.join()) throw new Error('two-finger pan ' + JSON.stringify({ q0, q1 }));
      // one finger still drags the shape afterwards
      await p.evaluate(() => { const w = A.E.scrollEl, r = A.E.blocks[0].svg.getBoundingClientRect(), s = w.getBoundingClientRect(); w.scrollLeft += r.left + 950 * A.E.zoom - s.left - w.clientWidth / 2; w.scrollTop += r.top + 500 * A.E.zoom - s.top - w.clientHeight / 2; });
      const g = await pat(950, 500);
      await touch('touchStart', [g]);
      for (let k = 1; k <= 5; k++) { await touch('touchMove', [[g[0] + k * 10, g[1] + k * 6]]); await p.waitForTimeout(20); }
      await touch('touchEnd', []);
      await p.waitForTimeout(150);
      const g1 = await st();
      if (!(g1.s[0] > q1.s[0] + 20) || g1.hi !== q1.hi + 1) throw new Error('one-finger drag after gestures ' + JSON.stringify({ q1, g1 }));
      if (errs.length) throw new Error(errs.join(' | '));
    } finally {
      await ctx2.close();
    }
  });
}
