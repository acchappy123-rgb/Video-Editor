// Wave 2 – transform power: live numeric Position fields (multi-selections, groups, lines, arithmetic, text reflow),
// snapping while resizing, Alt-resize from the centre, equal-spacing snaps, the snapping toggle, and rotating and
// stretching multi-selections and groups. Interactions use real mouse and keyboard input.
export default async function ({ page, step, shot }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 120) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg, { got: a, want: b });
  // Opens a new design of `type` whose first page holds `els` (partial element objects for the A.M factories).
  const open = async (type, els = [], p = page) => {
    await p.evaluate(() => A.app.go('#/home'));
    await p.waitForSelector('.hero');
    await p.evaluate(async ([type, els]) => {
      const M = A.M;
      const mk = (o) => {
        const el = o.type === 'text' ? M.newText(o) : o.type === 'line' ? M.newLine(o) : M.newShape(o.shape || 'rect', o);
        if (el.type === 'text') el.h = A.R.textHeight(el);
        if (el.type === 'line') M.syncLineBox(el);
        return el;
      };
      await A.Home.newDesign({ type, pages: [M.newPage({ elements: els.map(mk) })] });
    }, [type, els]);
    await p.waitForFunction(() => A.E.d && A.E.blocks[A.E.pi]?.svg.isConnected);
    await p.waitForTimeout(300);
    await p.evaluate(() => document.activeElement?.blur?.());
  };
  // client point of a page point on the active page
  const at = (x, y, p = page) => p.evaluate(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  const zoom = () => ev(() => A.E.zoom);
  const get = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.byId(id))), id);
  const hist = () => ev(() => A.E.hi);
  const union = (ids) => ev((ids) => A.E.unionBox(ids.map((i) => A.E.byId(i))), ids);
  const centreOf = async (id) => { const b = await get(id); return at(b.x + b.w / 2, b.y + b.h / 2); };
  const click = async (id, opts) => { const c = await centreOf(id); await page.mouse.click(c.x, c.y, opts); await wait(); };
  // shift-clicks each element: a real multi-selection
  const pick = async (ids) => {
    await click(ids[0]);
    for (const id of ids.slice(1)) {
      await page.keyboard.down('Shift');
      await click(id);
      await page.keyboard.up('Shift');
    }
    ok((await ev(() => A.E.sel.slice().sort().join())) === [...ids].sort().join(), 'selection', await ev(() => A.E.sel));
  };
  const handle = async (sel, p = page) => {
    const b = await p.locator(sel).first().boundingBox();
    if (!b) throw new Error('no handle ' + sel);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  // a drag with real mouse input; `during` runs before the button is released
  const drag = async (a, b, { steps = 8, during, p = page } = {}) => {
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps });
    const r = during ? await during() : null;
    await p.mouse.up();
    await p.waitForTimeout(60);
    return r;
  };
  const positionPanel = async () => {
    await ev(() => (A.P.state.posTab = 'arrange'));
    await page.click('.ed-toolbar button[title="Position"]');
    await page.waitForSelector('.adv-grid');
  };
  const field = (k, p = page) => p.locator(`.adv-grid input[data-k="${k}"]`);
  const typeIn = async (k, text, key = 'Enter') => {
    await field(k).click({ clickCount: 3 });
    await page.keyboard.type(text);
    await page.keyboard.press(key);
    await wait();
  };
  const val = async (k) => +(await field(k).inputValue());
  const r1 = (v) => Math.round(v * 10) / 10;

  await step('w2-transform: Position fields follow drags, nudges and undo live', async () => {
    await open('social', [{ id: 'a', x: 200, y: 200, w: 300, h: 200 }]);
    await click('a');
    await positionPanel();
    const z = await zoom(), c = await centreOf('a');
    // the X field follows the drag before the button is released
    const live = await drag(c, { x: c.x + 80 * z, y: c.y + 30 * z }, { during: async () => ({ shown: await val('x'), x: (await get('a')).x }) });
    ok(live.x !== 200 && live.shown === r1(live.x), 'X field during the drag', live);
    const a1 = await get('a');
    ok((await val('x')) === r1(a1.x) && (await val('y')) === r1(a1.y), 'fields after the drag', { a1, x: await val('x') });
    await page.keyboard.press('Shift+ArrowRight');
    ok((await val('x')) === r1(a1.x + 10), 'Shift+ArrowRight adds 10 to X', await val('x'));
    await wait(500);
    await page.keyboard.press('Control+z');
    await wait();
    ok((await val('x')) === r1(a1.x), 'X after undoing the nudge', await val('x'));
    await page.keyboard.press('Control+z');
    await wait();
    ok((await val('x')) === 200 && (await val('y')) === 200, 'X/Y after undoing the drag', [await val('x'), await val('y')]);
  });

  await step('w2-transform: a field being typed in keeps its text and focus while the others update', async () => {
    await open('social', [{ id: 'a', x: 200, y: 200, w: 300, h: 200 }]);
    await click('a');
    await positionPanel();
    await field('y').click({ clickCount: 3 });
    await page.keyboard.type('77');
    // something else moves the element (a nudge from another view) while Y is being typed in
    await ev(() => A.E.nudge(5, 0));
    const st = await ev(() => ({ focus: document.activeElement?.dataset.k, y: document.querySelector('.adv-grid [data-k=y]').value, x: document.querySelector('.adv-grid [data-k=x]').value }));
    ok(st.focus === 'y' && st.y === '77' && st.x === '205', 'typed field lost its text or focus', st);
    await page.keyboard.press('Enter');
    await wait();
    ok((await get('a')).y === 77, 'typed Y applied', await get('a'));
    // arrow keys step a field and keep focus there; with the ratio locked the other side follows live; one undo step
    await page.click('.ed-panel label.check:has-text("Lock aspect ratio") input');
    const h0 = await hist();
    await field('w').click();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    let a = await get('a');
    ok(a.w === 313 && Math.abs(a.h - 313 * 2 / 3) < 0.01, 'arrow steps', a);
    ok((await ev(() => document.activeElement?.dataset.k)) === 'w' && (await val('h')) === r1(a.h), 'Height follows while Width keeps focus', await val('h'));
    await wait(600);
    ok((await hist()) === h0 + 1, 'arrow burst is one undo step', { h0, hi: await hist() });
    // Escape puts the typed text back and leaves the selection alone
    await page.keyboard.type('xyz');
    await page.keyboard.press('Escape');
    ok((await field('w').inputValue()) === '313' && (await ev(() => A.E.sel.join())) === 'a', 'Escape in a field', await field('w').inputValue());
  });

  await step('w2-transform: fields take arithmetic, relative changes and page percentages', async () => {
    await open('social', [{ id: 'a', x: 200, y: 200, w: 300, h: 200 }]);
    await click('a');
    await positionPanel();
    const h0 = await hist();
    await typeIn('x', '120+40');
    await typeIn('w', '*2');
    await typeIn('h', '+=50');
    await typeIn('y', '50%');
    let a = await get('a');
    ok(a.x === 160 && a.w === 600 && a.h === 250 && a.y === 540, 'arithmetic results', a);
    ok((await hist()) === h0 + 4, 'one undo step per field', { h0, hi: await hist() });
    ok((await field('w').inputValue()) === '600' && (await field('y').inputValue()) === '540', 'fields show the results', [await field('w').inputValue(), await field('y').inputValue()]);
    await typeIn('x', '1080/3-10', 'Tab');
    ok((await ev(() => document.activeElement?.dataset.k)) === 'y' && (await get('a')).x === 350, 'Tab commits a sum and moves on', await get('a'));
    await page.keyboard.press('Escape');
    await typeIn('w', 'abc');
    a = await get('a');
    ok(a.w === 600 && (await field('w').inputValue()) === '600', 'nonsense is refused and the value shown again', a);
    await typeIn('w', '/0');
    ok((await get('a')).w === 600, 'division by zero refused');
  });

  await step('w2-transform: multi-selections and groups get X/Y/W/H/rotation for their box', async () => {
    await open('social', [{ id: 'a', x: 100, y: 100, w: 100, h: 100 }, { id: 'b', x: 300, y: 150, w: 100, h: 100 }]);
    await pick(['a', 'b']);
    await positionPanel();
    ok(await field('w').count() && await field('h').count() && await field('x').count() && await field('y').count(), 'multi fields missing');
    ok((await val('x')) === 100 && (await val('w')) === 300 && (await val('h')) === 150, 'union values', [await val('x'), await val('w'), await val('h')]);
    await typeIn('w', '*2');
    let u = await union(['a', 'b']);
    near(u.w, 600, 0.01, 'union width doubles');
    ok((await get('a')).h === 100 && (await get('b')).h === 100 && u.x === 100, 'stretching width keeps heights and the left edge', u);
    await typeIn('x', '0');
    await typeIn('y', '20');
    u = await union(['a', 'b']);
    ok(u.x === 0 && u.y === 20, 'move the union box', u);
    // the box follows a drag of the selection live
    const z = await zoom(), c = await centreOf('a');
    const live = await drag(c, { x: c.x + 50 * z, y: c.y }, { during: async () => ({ shown: await val('x'), u: await union(['a', 'b']) }) });
    ok(live.shown === r1(live.u.x) && live.u.x > 20, 'union X during a drag', live);
    // Ctrl+G, then rotate the group by typing an angle: members turn about the group's centre
    await page.keyboard.press('Control+g');
    await wait();
    await positionPanel();
    u = await union(['a', 'b']);
    const cx = u.x + u.w / 2, cy = u.y + u.h / 2, a0 = await get('a');
    await typeIn('rot', '90');
    const a1 = await get('a'), b1 = await get('b');
    ok(a1.rot === 90 && b1.rot === 90, 'members rotated', [a1.rot, b1.rot]);
    const ax = a0.x + a0.w / 2 - cx, ay = a0.y + a0.h / 2 - cy;
    near(a1.x + a1.w / 2, cx - ay, 0.01, 'member centre x after turning');
    near(a1.y + a1.h / 2, cy + ax, 0.01, 'member centre y after turning');
    ok((await field('rot').inputValue()) === '90', 'rotation field shows the shared angle');
    // mixed angles show as Mixed; typing a change turns them all by it
    await ev(() => { A.E.byId('a').rot = 10; A.E.changed(); A.EU.renderPanel(); });
    ok((await field('rot').inputValue()) === '' && (await field('rot').getAttribute('placeholder')) === 'Mixed', 'mixed rotation');
    await typeIn('rot', '+15');
    ok((await get('a')).rot === 25 && (await get('b')).rot === 105, 'relative turn of a mixed selection', [(await get('a')).rot, (await get('b')).rot]);
    // a locked member refuses the fields
    await ev(() => { A.E.byId('b').locked = true; A.E.changed(); A.EU.renderPanel(); });
    const ub = await union(['a', 'b']);
    await typeIn('x', '500');
    ok((await union(['a', 'b'])).x === ub.x && (await val('x')) === r1(ub.x), 'a locked member keeps the selection in place');
  });

  await step('w2-transform: line fields set its ends, length and angle', async () => {
    await open('social', [{ id: 's', x: 600, y: 600, w: 200, h: 200 }, { id: 'L', type: 'line', p1: { x: 100, y: 100 }, p2: { x: 400, y: 100 } }]);
    await ev(() => { A.E.byId('L').c2 = 's'; A.E.changed(); });
    await ev(() => A.E.select(['L']));
    await positionPanel();
    for (const k of ['x1', 'y1', 'x2', 'y2', 'len', 'ang']) ok(await field(k).count() === 1, 'line field ' + k);
    ok((await field('w').count()) === 0, 'a line has no Width field');
    const e0 = await ev(() => JSON.parse(JSON.stringify(A.R.lineEnds(A.E.byId('L'), A.E.page()))));
    ok((await val('x2')) === r1(e0.p2.x), 'X2 shows the drawn (connected) end', { e0, x2: await val('x2') });
    await typeIn('x2', '500');
    let l = await get('L');
    ok(l.p2.x === 500 && Math.abs(l.p2.y - e0.p2.y) < 1e-9 && !l.c2, 'X2 moves p2 and detaches the connector', l);
    await typeIn('y1', '200');
    await typeIn('x1', '100');
    await typeIn('x2', '400');
    await typeIn('y2', '200');
    await typeIn('len', '150');
    l = await get('L');
    ok(l.p2.x === 250 && Math.abs(l.p2.y - 200) < 1e-9, 'length', l);
    await typeIn('ang', '90');
    l = await get('L');
    ok(Math.abs(l.p2.x - 100) < 1e-6 && Math.abs(l.p2.y - 350) < 1e-6 && (await val('len')) === 150, 'angle', l);
    ok(Math.abs(l.h - (150 + 2 * Math.max(l.strokeWidth * 2, 8))) < 1e-6, 'line box follows its ends', l);
    // dragging an end updates the fields live
    const z = await zoom(), hd = await handle('.handle.end[data-h="p2"]');
    const live = await drag(hd, { x: hd.x + 40 * z, y: hd.y }, { during: async () => ({ shown: await val('x2'), p2: (await get('L')).p2 }) });
    ok(live.shown === r1(live.p2.x) && live.p2.x > 130, 'X2 during an end drag', live);
  });

  await step('w2-transform: text Width rewraps (font size kept); Height scales the text', async () => {
    await open('social', [{ id: 't', type: 'text', text: 'A few words that wrap onto lines', x: 100, y: 100, w: 600, size: 40 }]);
    await click('t');
    await positionPanel();
    await typeIn('w', '200');
    let t = await ev(() => { const el = A.E.byId('t'); return { size: el.size, w: el.w, h: el.h, th: A.R.textHeight(el) }; });
    ok(t.size === 40 && t.w === 200 && Math.abs(t.h - t.th) < 0.01 && t.h > 100, 'text width', t);
    ok((await val('h')) === r1(t.h), 'Height field shows the rewrapped height', await val('h'));
    await typeIn('h', '*2');
    const t2 = await ev(() => { const el = A.E.byId('t'); return { size: el.size, w: el.w, h: el.h, th: A.R.textHeight(el) }; });
    ok(t2.size === 80 && t2.w === 400 && Math.abs(t2.h - t2.th) < 0.01, 'Height scales the text', t2);
  });

  await step('w2-transform: the Layers tab follows new elements without reopening', async () => {
    await open('social', [{ id: 'a', x: 100, y: 100, w: 100, h: 100 }]);
    await click('a');
    await page.click('.ed-toolbar button[title="Position"]');
    await page.click('.ed-panel .p-tab:text-is("Layers")');
    await wait();
    const n0 = await page.locator('.ed-panel .layer').count();
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('r');
    await wait();
    ok((await page.locator('.ed-panel .layer').count()) === n0 + 1, 'new layer row', { n0 });
    ok((await page.locator('.ed-panel .layer.on').count()) === 1, 'the new shape is highlighted');
    await ev(() => (A.P.state.posTab = 'arrange'));
  });

  await step('w2-transform: resizing snaps the moving side to other elements, with guides and a size label', async () => {
    await open('social', [{ id: 'a', x: 200, y: 200, w: 300, h: 200 }, { id: 'b', x: 800, y: 500, w: 200, h: 200 }]);
    await click('a');
    const z = await zoom(), h0 = await hist();
    let hd = await handle('.sel-box .handle.e');
    const during = await drag(hd, { x: hd.x + 298 * z, y: hd.y }, { during: () => ev(() => ({ guides: document.querySelectorAll('.snap-guide.x').length, label: document.querySelector('.size-label')?.textContent })) });
    let a = await get('a');
    ok(during.guides >= 1 && /w 600/.test(during.label), 'guide and size label during the resize', during);
    ok(a.w === 600 && a.x === 200 && a.h === 200, 'east side snapped to the neighbour', a);
    ok((await hist()) === h0 + 1, 'a resize is one undo step');
    await page.keyboard.press('Control+z');
    // Ctrl/Cmd skips snapping for that drag
    hd = await handle('.sel-box .handle.e');
    await page.keyboard.down('Control');
    await drag(hd, { x: hd.x + 298 * z, y: hd.y });
    await page.keyboard.up('Control');
    a = await get('a');
    near(a.w, 598, 1, 'Ctrl resize does not snap');
    await page.keyboard.press('Control+z');
    // the south side snaps to the neighbour's top
    hd = await handle('.sel-box .handle.s');
    await drag(hd, { x: hd.x, y: hd.y + 103 * z });
    a = await get('a');
    ok(a.h === 300 && a.y === 200, 'south side snapped to the top of b', a);
    await page.keyboard.press('Control+z');
    // a corner keeps the proportions with Shift, and the nearer snap wins
    hd = await handle('.sel-box .handle.se');
    await page.keyboard.down('Shift');
    await drag(hd, { x: hd.x + 297 * z, y: hd.y + 150 * z });
    await page.keyboard.up('Shift');
    a = await get('a');
    ok(a.w === 600 && a.h === 400, 'proportional corner snapped', a);
    await page.keyboard.press('Control+z');
    // a ruler guide added from the File menu catches the moving side too
    await page.click('.ed-top .top-btn:has-text("File")');
    await page.click('.menu button:has-text("Add guide")');
    await page.fill('.modal input', 'x 700');
    await page.keyboard.press('Enter');
    await wait(200);
    ok((await ev(() => JSON.stringify(A.E.d.guides))) === '[{"axis":"x","pos":700}]', 'guide added', await ev(() => A.E.d.guides));
    ok(!(await ev(() => A.E.editingId)), 'Enter in the guide prompt started text editing');
    await click('a');
    hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x + 196 * z, y: hd.y });
    ok((await get('a')).w === 500, 'east side snapped to the guide', await get('a'));
  });

  await step('w2-transform: Alt/Option resizes from the centre (and still snaps)', async () => {
    await open('social', [{ id: 'a', x: 100, y: 300, w: 200, h: 100 }, { id: 'b', x: 450, y: 700, w: 100, h: 100 }]);
    await click('a');
    const z = await zoom(), h0 = await hist();
    let hd = await handle('.sel-box .handle.e');
    await page.keyboard.down('Alt');
    await drag(hd, { x: hd.x + 50 * z, y: hd.y });
    await page.keyboard.up('Alt');
    let a = await get('a');
    near(a.x, 50, 1, 'x drops by 50');
    near(a.w, 300, 2, 'w grows by 100');
    ok(Math.abs(a.x + a.w / 2 - 200) < 1e-6 && a.y === 300 && a.h === 100, 'centre kept', a);
    ok((await hist()) === h0 + 1, 'one undo step');
    await page.keyboard.press('Control+z');
    // Alt on a corner: both sides grow about the centre; the moving side snaps to b's left edge (450)
    hd = await handle('.sel-box .handle.se');
    await page.keyboard.down('Alt');
    await drag(hd, { x: hd.x + 148 * z, y: hd.y + 20 * z });
    await page.keyboard.up('Alt');
    a = await get('a');
    ok(Math.abs(a.x + a.w - 450) < 1e-6 && Math.abs(a.x + a.w / 2 - 200) < 1e-6 && Math.abs(a.y + a.h / 2 - 350) < 1e-6 && a.h > 120, 'Alt corner snapped about the centre', a);
  });

  await step('w2-transform: a right-angle-rotated element snaps its moving side', async () => {
    await open('social', [{ id: 'r', x: 300, y: 300, w: 200, h: 100, rot: 90 }, { id: 'b', x: 100, y: 600, w: 600, h: 100 }]);
    await click('r');
    const z = await zoom();
    // rot 90: the local east side is the page bottom (at y 450); b's top is at 600
    const hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x, y: hd.y + 147 * z });
    const r = await get('r'), bb = await ev(() => A.E.bbox(A.E.byId('r')));
    ok(Math.abs(bb.y + bb.h - 600) < 1e-6 && Math.abs(r.w - 350) < 1e-6, 'rotated side snapped', { r, bb });
  });

  await step('w2-transform: moving snaps to equal spacing and shows the matching gaps', async () => {
    await open('social', [{ id: 'a', x: 60, y: 300, w: 100, h: 100 }, { id: 'b', x: 260, y: 300, w: 100, h: 100 }, { id: 'c', x: 560, y: 330, w: 100, h: 100 }, { id: 'd', x: 800, y: 900, w: 60, h: 60 }]);
    const z = await zoom(), c0 = await centreOf('c');
    // c to about x 461: the a–b gap (100) repeats after b
    const during = await drag(c0, { x: c0.x - 99 * z, y: c0.y }, { during: () => ev(() => [...document.querySelectorAll('.gap-label')].map((g) => g.textContent)) });
    const c = await get('c');
    ok(c.x === 460 && c.y === 330, 'equal-spacing snap', c);
    ok(during.length === 2 && during.every((t) => t === '100'), 'two badges read 100', during);
    // dropped about midway between b and c: equal gaps (20) either side
    const mid = await drag(await centreOf('d'), await at(412, 350), { during: () => ev(() => [...document.querySelectorAll('.gap-label.eq')].map((g) => g.textContent)) });
    const d = await get('d');
    ok(d.x === 380 && d.y === 320, 'midway snap', d);
    ok(mid.length === 2 && mid.every((t) => t === '20'), 'midway badges', mid);
    // the same down a column
    await open('social', [{ id: 'a', x: 600, y: 60, w: 100, h: 80 }, { id: 'b', x: 600, y: 200, w: 100, h: 80 }, { id: 'c', x: 620, y: 700, w: 100, h: 80 }]);
    const e0 = await centreOf('c');
    const col = await drag(e0, { x: e0.x, y: e0.y - 357 * z }, { during: () => ev(() => [...document.querySelectorAll('.gap-label.eq')].map((g) => g.textContent)) });
    ok((await get('c')).y === 340, 'vertical equal spacing', await get('c'));
    ok(col.length === 2 && col.every((t) => t === '60'), 'vertical badges', col);
  });

  await step('w2-transform: the Snapping toggle (File menu and bottom bar) is remembered', async () => {
    await open('social', [{ id: 'a', x: 200, y: 200, w: 300, h: 200 }, { id: 'b', x: 800, y: 500, w: 200, h: 200 }]);
    ok((await page.getAttribute('.ed-bottom .snap-btn', 'aria-pressed')) === 'true', 'bottom button starts on');
    await page.click('.ed-top .top-btn:has-text("File")');
    await page.click('.menu button:has-text("Turn off snapping")');
    await wait(300);
    ok((await ev(() => A.app.settings.snap)) === false && (await ev(async () => (await A.S.kv('settings', {})).snap)) === false, 'setting saved');
    ok((await page.getAttribute('.ed-bottom .snap-btn', 'aria-pressed')) === 'false', 'bottom button shows off');
    await click('a');
    const z = await zoom();
    let hd = await handle('.sel-box .handle.e');
    const g = await drag(hd, { x: hd.x + 298 * z, y: hd.y }, { during: () => ev(() => document.querySelectorAll('.snap-guide').length) });
    near((await get('a')).w, 598, 1, 'no snap with snapping off');
    ok(g === 0, 'no guides with snapping off', g);
    await page.keyboard.press('Control+z');
    // a move that would put a's right side on b's left edge stays where it was dropped
    const c = await centreOf('a');
    await drag(c, { x: c.x + 298 * z, y: c.y });
    near((await get('a')).x, 498, 1, 'moves do not snap either');
    // the setting survives a reload
    await page.reload();
    await page.waitForSelector('.page-svg');
    await wait(300);
    ok((await page.getAttribute('.ed-bottom .snap-btn', 'aria-pressed')) === 'false', 'off after reload');
    // keyboard: the bottom bar button turns it back on
    await page.focus('.ed-bottom .snap-btn');
    await page.keyboard.press('Enter');
    await wait(200);
    ok((await ev(() => A.app.settings.snap)) === true && (await page.getAttribute('.ed-bottom .snap-btn', 'aria-pressed')) === 'true', 'turned back on');
    await page.click('.ed-top .top-btn:has-text("File")');
    ok(await page.locator('.menu button:has-text("Turn off snapping")').count() === 1, 'menu offers turning it off');
    await page.keyboard.press('Escape');
  });

  await step('w2-transform: multi-selections get rotation and side handles and stretch along one side', async () => {
    await open('social', [{ id: 'a', x: 100, y: 100, w: 100, h: 100 }, { id: 'b', x: 300, y: 100, w: 100, h: 100 }]);
    await pick(['a', 'b']);
    ok((await page.locator('.sel-box .rot-handle').count()) === 1 && (await page.locator('.sel-box .handle.side').count()) === 4, 'handles on the union box');
    const z = await zoom(), h0 = await hist();
    const hd = await handle('.sel-box .handle.e');
    await drag(hd, { x: hd.x + 200 * z, y: hd.y });
    const a = await get('a'), b = await get('b'), u = await union(['a', 'b']);
    ok(a.h === 100 && b.h === 100, 'heights kept', [a.h, b.h]);
    near(u.w, 500, 1, 'union width');
    near(a.x, 100, 1e-6, 'west side stays');
    ok((await hist()) === h0 + 1, 'one undo step');
    await page.keyboard.press('Control+z');
    ok((await union(['a', 'b'])).w === 300, 'undo restores');
    // Shift + rotate handle through a quarter turn: both turn 90° about the union centre (250, 150)
    const rh = await handle('.sel-box .rot-handle');
    const pc = await at(250, 150);
    const rx = rh.x - pc.x, ry = rh.y - pc.y;
    await page.keyboard.down('Shift');
    await page.mouse.move(rh.x, rh.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      const t = (Math.PI / 2) * (i / 8), cs = Math.cos(t), sn = Math.sin(t);
      await page.mouse.move(pc.x + rx * cs - ry * sn, pc.y + rx * sn + ry * cs);
    }
    const frame = await ev(() => document.querySelector('.sel-box').style.transform);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await wait();
    const a1 = await get('a'), b1 = await get('b');
    ok(a1.rot === 90 && b1.rot === 90, 'both rotated 90', [a1.rot, b1.rot]);
    near(a1.x + a1.w / 2, 250, 1, 'a centre x');
    near(a1.y + a1.h / 2, 50, 1, 'a centre y');
    near(b1.y + b1.h / 2, 250, 1, 'b centre y');
    ok(/rotate\(90deg\)/.test(frame), 'the selection box turned with them', frame);
    ok((await hist()) === h0 + 1, 'rotation is one undo step', { h0, hi: await hist() });
    // Shift snaps to 15° steps: about 32° lands on 30°
    await page.keyboard.press('Control+z');
    await wait();
    const rh2 = await handle('.sel-box .rot-handle'), t32 = (32 * Math.PI) / 180;
    await page.keyboard.down('Shift');
    await drag(rh2, { x: pc.x + rx * Math.cos(t32) - ry * Math.sin(t32), y: pc.y + rx * Math.sin(t32) + ry * Math.cos(t32) });
    await page.keyboard.up('Shift');
    ok((await get('a')).rot === 30 && (await get('b')).rot === 30, 'Shift snaps to 30', [(await get('a')).rot, (await get('b')).rot]);
    // a line in the selection turns by its ends about the same centre
    await open('social', [{ id: 'r', x: 100, y: 100, w: 100, h: 100 }, { id: 'L', type: 'line', p1: { x: 300, y: 150 }, p2: { x: 500, y: 150 } }]);
    await ev(() => A.E.select(['r', 'L']));
    await positionPanel();
    const ul = await union(['r', 'L']), cx = ul.x + ul.w / 2, cy = ul.y + ul.h / 2;
    await typeIn('rot', '90');
    const l = await get('L');
    ok(Math.abs(l.p1.x - (cx - (150 - cy))) < 1e-6 && Math.abs(l.p1.y - (cy + (300 - cx))) < 1e-6 && Math.abs(l.p2.y - (cy + (500 - cx))) < 1e-6 && !l.rot, 'line ends turned', { l, cx, cy });
    ok((await get('r')).rot === 90, 'shape turned');
  });

  await step('w2-transform: multi corners keep proportions (Shift frees them); Alt scales from the centre', async () => {
    await open('social', [{ id: 'a', x: 100, y: 100, w: 100, h: 100 }, { id: 'b', x: 300, y: 200, w: 100, h: 100 }, { id: 't', type: 'text', text: 'Some words to wrap here', x: 100, y: 400, w: 300, size: 30 }]);
    await pick(['a', 'b', 't']);
    const z = await zoom(), u0 = await union(['a', 'b', 't']);
    let hd = await handle('.sel-box .handle.se');
    await drag(hd, { x: hd.x + 150 * z, y: hd.y + 20 * z });
    let u = await union(['a', 'b', 't']), t = await get('t');
    near(u.w / u0.w, u.h / u0.h, 0.01, 'corner keeps proportions');
    ok(t.size > 30, 'uniform scale scales text', t.size);
    await page.keyboard.press('Control+z');
    hd = await handle('.sel-box .handle.se');
    await page.keyboard.down('Shift');
    await drag(hd, { x: hd.x + 200 * z, y: hd.y });
    await page.keyboard.up('Shift');
    u = await union(['a', 'b', 't']);
    t = await get('t');
    near(u.w, u0.w + 200, 1.5, 'Shift corner: width');
    ok(t.size === 30 && Math.abs(t.h - (await ev(() => A.R.textHeight(A.E.byId('t'))))) < 0.01 && t.w > 300, 'text keeps its size and rewraps', t);
    await page.keyboard.press('Control+z');
    // side handle: text keeps its size and rewraps
    hd = await handle('.sel-box .handle.w');
    await drag(hd, { x: hd.x - 100 * z, y: hd.y });
    t = await get('t');
    ok(t.size === 30 && t.w > 300, 'side stretch keeps text size', t);
    await page.keyboard.press('Control+z');
    // Alt: the union centre stays
    hd = await handle('.sel-box .handle.e');
    await page.keyboard.down('Alt');
    await drag(hd, { x: hd.x + 40 * z, y: hd.y });
    await page.keyboard.up('Alt');
    u = await union(['a', 'b', 't']);
    near(u.x + u.w / 2, u0.x + u0.w / 2, 0.6, 'Alt keeps the centre');
    near(u.w, u0.w + 80, 1.2, 'Alt grows both sides');
  });

  await step('w2-transform: groups (a photo grid) rotate and stretch without ungrouping', async () => {
    await open('social');
    await page.click('.rail-btn[data-p="elements"]');
    await page.fill('.panel-body input.search', 'grid');
    await wait(300);
    await page.click('.panel-body button[title="Photo grid"] >> nth=0');
    await wait();
    const ids = await ev(() => A.E.sel.slice());
    ok(ids.length >= 2 && (await ev(() => A.E.selEls().every((e) => e.groupId && e.groupId === A.E.selEls()[0].groupId))), 'grid is a group', ids);
    ok((await page.locator('.sel-box.group .rot-handle').count()) === 1, 'group rotation handle');
    const u0 = await union(ids), z = await zoom();
    const rh = await handle('.sel-box .rot-handle');
    const pc = await at(u0.x + u0.w / 2, u0.y + u0.h / 2);
    const rx = rh.x - pc.x, ry = rh.y - pc.y, t = Math.PI / 2;
    await page.keyboard.down('Shift');
    await drag(rh, { x: pc.x + rx * Math.cos(t) - ry * Math.sin(t), y: pc.y + rx * Math.sin(t) + ry * Math.cos(t) }, { steps: 12 });
    await page.keyboard.up('Shift');
    const els = await ev((ids) => ids.map((i) => JSON.parse(JSON.stringify(A.E.byId(i)))), ids);
    ok(els.every((e) => e.rot === 90 && e.groupId === els[0].groupId), 'every member turned, still grouped', els.map((e) => e.rot));
    const u1 = await union(ids);
    near(u1.x + u1.w / 2, u0.x + u0.w / 2, 1, 'group turned about its centre');
    await page.keyboard.press('Control+z');
    await wait();
    const hd = await handle('.sel-box .handle.s');
    await drag(hd, { x: hd.x, y: hd.y - 100 * z });
    const u2 = await union(ids);
    near(u2.h, u0.h - 100, 1, 'group stretched along one side');
    near(u2.w, u0.w, 0.01, 'width kept');
    await shot('w2-transform-group');
  });

  await step('w2-transform: locked pages and elements refuse handles and fields', async () => {
    await open('social', [{ id: 'a', x: 100, y: 100, w: 100, h: 100 }, { id: 'b', x: 300, y: 100, w: 100, h: 100, locked: true }]);
    await pick(['a', 'b']);
    ok((await page.locator('.sel-box .rot-handle, .sel-box .handle').count()) === 0, 'no handles with a locked member');
    await ev(() => { A.E.page().locked = true; A.E.changed({ structure: true }); A.E.select(['a']); });
    await ev(() => { A.P.state.posTab = 'arrange'; A.EU.openPanel('position'); });
    await typeIn('w', '500');
    ok((await get('a')).w === 100 && (await field('w').inputValue()) === '100', 'locked page refuses the field');
  });

  await step('w2-transform: Position fields work at phone width', async () => {
    const p = await page.context().newPage();
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(page.url().replace(/#.*$/, '') + '#/home');
    await p.waitForSelector('.hero');
    await open('social', [{ id: 'a', x: 200, y: 200, w: 300, h: 200 }], p);
    const c = await p.evaluate(() => { const el = A.E.byId('a'), r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + (el.x + el.w / 2) * A.E.zoom, y: r.top + (el.y + el.h / 2) * A.E.zoom }; });
    await p.mouse.click(c.x, c.y);
    await p.evaluate(() => (A.P.state.posTab = 'arrange'));
    await p.click('.ed-toolbar button[title="Position"]');
    await p.waitForSelector('.adv-grid');
    await field('w', p).scrollIntoViewIfNeeded();
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, boxes: [...document.querySelectorAll('.adv-grid input')].map((i) => { const b = i.getBoundingClientRect(); return [b.left, b.right]; }) }));
    ok(r.sw <= 390 && r.boxes.every(([l, rr]) => l >= 0 && rr <= 390), 'fields fit the phone', r);
    await field('w', p).click({ clickCount: 3 });
    await p.keyboard.type('*2');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(150);
    ok((await p.evaluate(() => A.E.byId('a').w)) === 600, 'W applied on the phone');
    await p.close();
  });
}
