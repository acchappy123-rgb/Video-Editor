// Regression checks for the cross-file fixes applied at integration: panel fields and popovers keep focus and
// show current values, anchored zoom without drift, timeline grip cancel, text control characters,
// dragging a selection from inside its box, line hit size, present-mode exits and Animate defaults.
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  // Opens a new design of `type` whose first page holds `els` (partial element objects for the A.M factories).
  const open = async (type, els = [], { pages = 1, page: pg = {} } = {}) => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev(async ([type, els, pages, pg]) => {
      const M = A.M;
      const mk = (o) => {
        const el = o.type === 'text' ? M.newText(o) : o.type === 'line' ? M.newLine(o) : M.newShape(o.shape || 'rect', o);
        if (el.type === 'text') el.h = A.R.textHeight(el);
        if (el.type === 'line') M.syncLineBox(el);
        return el;
      };
      await A.Home.newDesign({ type, pages: Array.from({ length: pages }, (_, i) => M.newPage({ ...pg, elements: i ? [] : els.map(mk) })) });
    }, [type, els, pages, pg]);
    await page.waitForFunction(() => A.E.d && A.E.blocks[A.E.pi]?.svg.isConnected);
    await wait(300);
    await ev(() => document.activeElement?.blur?.());
  };
  // client point of a page point on the active page, and back
  const at = (x, y) => ev(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  const pagePt = (c) => ev((c) => A.E.toPage({ clientX: c.x, clientY: c.y }), c);
  const get = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.byId(id))), id);
  const ids = () => ev(() => A.E.els().map((e) => e.id));
  const centreOf = async (id) => { const b = await get(id); return at(b.x + b.w / 2, b.y + b.h / 2); };
  const field = (name) => page.locator(`.adv-grid label:has(span:text-is("${name}")) input`);

  await step('integ: Tab in the Position panel moves to the next field; Width updates Height (ui-6)', async () => {
    await open('social', [{ x: 100, y: 100, w: 300, h: 200 }]);
    const [id] = await ids();
    const c = await centreOf(id);
    await page.mouse.click(c.x, c.y);
    await page.click('.ed-toolbar button[title="Position"]');
    await wait();
    await field('X').fill('50');
    await page.keyboard.press('Tab');
    await wait();
    const f = await ev(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.closest('label')?.querySelector('span')?.textContent }));
    ok(f.label === 'Y', 'focus after Tab', f);
    await page.keyboard.type('70');
    await page.keyboard.press('Tab');
    await wait();
    const el = await get(id);
    ok(el.x === 50 && el.y === 70, 'X/Y typed in the fields', { x: el.x, y: el.y });
    await page.click('.ed-panel label.check:has-text("Lock aspect ratio") input');
    await field('Width').fill('600');
    await page.keyboard.press('Enter');
    await wait();
    const h = await field('Height').inputValue(), el2 = await get(id);
    ok(el2.h === 400 && +h === 400, 'Height after Width with the ratio locked', { h, elh: el2.h });
  });

  await step('integ: the Border popover shows the style and weight just picked (ui-6)', async () => {
    await open('social', [{ x: 100, y: 100, w: 300, h: 200 }]);
    const [id] = await ids();
    const c = await centreOf(id);
    await page.mouse.click(c.x, c.y);
    await page.click('.ed-toolbar button[title="Border"]');
    await wait();
    await page.click('.popover .seg-btn:has-text("Dashed")');
    await wait();
    const r = await ev(() => ({ on: [...document.querySelectorAll('.popover .seg-btn.on')].map((b) => b.textContent), weight: +document.querySelector('.popover input[type=range]')?.value, open: !!document.querySelector('.popover') }));
    const el = await get(id);
    ok(r.open && r.on.join() === 'Dashed' && r.weight === el.strokeWidth && el.strokeWidth > 0 && el.dash === 'dashed', 'popover after Dashed', { r, sw: el.strokeWidth, dash: el.dash });
    await page.keyboard.press('Escape');
  });

  await step('integ: anchored zoom steps keep the point under the cursor (touch-11, touch-12)', async () => {
    await open('presentation', [], { pages: 3 });
    // larger than the view, so no scroll position is clamped while zooming
    await ev(() => A.E.setZoom(1));
    await wait(300);
    const c = await ev(() => { const r = A.E.scrollEl.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2 - 120), y: Math.round(r.top + r.height / 2 - 60) }; });
    const p0 = await pagePt(c);
    // a trackpad pinch: many tiny steps about the same point, one per frame
    await ev(async (c) => { for (let k = 0; k < 40; k++) { A.E.setZoom(A.E.zoom * 1.004, c); await new Promise(requestAnimationFrame); } }, c);
    const p1 = await pagePt(c);
    ok(Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1, 'setZoom drift', { p0, p1 });
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Control');
    for (let k = 0; k < 20; k++) { await page.mouse.wheel(0, -4); await wait(20); }
    await page.keyboard.up('Control');
    await wait(100);
    const p2 = await pagePt(c), z = await ev(() => A.E.zoom);
    ok(Math.hypot(p2.x - p0.x, p2.y - p0.y) < 1.5, 'ctrl+wheel drift', { p0, p2, z });
  });

  await step('integ: a cancelled timeline grip drag stops resizing the page (touch-5)', async () => {
    await open('presentation', [], { pages: 2 });
    const g = await page.locator('.tl-block >> nth=0').locator('.tl-grip').boundingBox();
    const x = g.x + g.width / 2, y = g.y + g.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 34, y, { steps: 4 });
    const d1 = await ev(() => A.E.d.pages[0].duration);
    // the system takes the gesture over
    await ev(() => document.querySelector('.tl-grip').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
    await page.mouse.move(x + 200, y, { steps: 4 });
    await page.mouse.up();
    await wait();
    const d2 = await ev(() => A.E.d.pages[0].duration);
    ok(d1 > 5 && d2 === d1, 'duration after cancel', { d1, d2 });
  });

  await step('integ: a pasted Word line break (\\v) becomes a new line (render-6)', async () => {
    await open('social', [{ type: 'text', text: 'Hello', x: 100, y: 100, w: 600, size: 60 }]);
    const [id] = await ids();
    const c = await centreOf(id);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForSelector('textarea.text-edit');
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('Line one\u000bLine two\u0007');
    const ta = await ev(() => document.querySelector('textarea.text-edit').value);
    await page.keyboard.press('Escape');
    const el = await get(id);
    ok(el.text === 'Line one\nLine two' && ta === el.text, 'text after insert', { text: el.text, ta });
  });

  await step('integ: dragging empty space inside a group box moves the group (transform-5)', async () => {
    await open('social', [{ x: 100, y: 100, w: 150, h: 150 }, { x: 600, y: 500, w: 150, h: 150 }]);
    const [a, b] = await ids();
    await ev((s) => { A.E.select(s); A.E.group(); }, [a, b]);
    await wait();
    const p = await at(420, 380), q = await at(520, 430);
    ok(!(await ev((p) => document.elementFromPoint(p.x, p.y)?.closest('[data-id]'), p)), 'point is on empty space');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(q.x, q.y, { steps: 8 });
    await page.mouse.up();
    await wait();
    const [ea, eb] = [await get(a), await get(b)];
    ok(Math.round(ea.x) === 200 && Math.round(ea.y) === 150 && Math.round(eb.x) === 700 && Math.round(eb.y) === 550, 'group moved by the drag', { a: [ea.x, ea.y], b: [eb.x, eb.y] });
    ok((await ev(() => A.E.sel.length)) === 2, 'group still selected');
  });

  await step('integ: blank space inside an ad-hoc multi-selection deselects or starts a marquee', async () => {
    await open('presentation', [{ x: 100, y: 100, w: 150, h: 150 }, { x: 800, y: 400, w: 100, h: 100 }, { x: 1600, y: 800, w: 150, h: 150 }]);
    const [a, b, c] = await ids();
    const p = await at(900, 300);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Control+a');
    await wait();
    ok((await ev(() => A.E.sel.length)) === 3, 'all selected');
    await page.mouse.click(p.x, p.y);
    await wait();
    ok((await ev(() => A.E.sel.length)) === 0, 'click on blank space deselects', await ev(() => A.E.sel));
    await page.keyboard.press('Control+a');
    const s = await at(700, 300), t = await at(1100, 700);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await page.mouse.up();
    await wait();
    const xs = [(await get(a)).x, (await get(b)).x, (await get(c)).x];
    ok(xs.join() === '100,800,1600', 'nothing moved', xs);
    ok((await ev(() => A.E.sel.join())) === b, 'the marquee picked the middle one', await ev(() => A.E.sel));
  });

  await step('integ: a thin line is hit a few screen px off at a small zoom (touch-7)', async () => {
    await open('presentation', [{ type: 'line', p1: { x: 200, y: 500 }, p2: { x: 1400, y: 500 }, strokeWidth: 2 }]);
    await ev(() => A.E.setZoom(0.25));
    await wait();
    const [id] = await ids();
    const c = await at(800, 500);
    await page.mouse.click(c.x, c.y - 6);
    await wait();
    ok((await ev(() => A.E.sel)).includes(id), 'line not selected 6px off');
  });

  await step('integ: in a presentation moved on by hand, exit animations do not play (render-22, present-4)', async () => {
    await open('presentation', [{ x: 100, y: 100, w: 300, h: 300, fill: '#ff3131', anim: { out: 'fade' } }], { page: { duration: 1 } });
    const [id] = await ids();
    await ev(() => A.Present.start({ fullscreen: false }));
    await page.waitForSelector('.present .pr-layer svg');
    await wait(1600);
    const op = await ev((id) => document.querySelector(`.present .pr-layer [data-id="${id}"]`)?.getAttribute('opacity'), id);
    await page.keyboard.press('Escape');
    await wait();
    ok(op === null || +op > 0.99, 'element faded out while the slide is up', op);
  });

  await step('integ: Animate reopens on the element tab; an unset Pan direction shows right (ui-15, render-21)', async () => {
    await open('presentation', [{ x: 100, y: 100, w: 300, h: 300, anim: { in: 'pan' } }]);
    const [id] = await ids();
    const c = await centreOf(id);
    await page.mouse.click(c.x, c.y);
    await page.click('.ed-toolbar button[title="Animate"]');
    await wait();
    const dir = await ev(() => [...document.querySelectorAll('.ed-panel .seg-btn.on')].map((b) => b.textContent));
    ok(dir.includes('right') && !dir.includes('up'), 'direction highlighted', dir);
    await page.click('.ed-panel .p-tab:text-is("Page")');
    await wait();
    ok((await ev(() => document.querySelector('.ed-panel .p-tab.on')?.textContent)) === 'Page', 'Page tab picked');
    await page.click('.panel-collapse');
    await wait();
    await page.click('.ed-toolbar button[title="Animate"]');
    await wait();
    const tab = await ev(() => document.querySelector('.ed-panel .p-tab.on')?.textContent);
    ok(tab === 'Element', 'tab after reopening', tab);
  });
}
