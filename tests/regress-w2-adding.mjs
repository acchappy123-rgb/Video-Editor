// Regression checks (wave 2, adding): position-aware paste and duplicate, new text that opens for typing,
// adds and pastes on the page in view, and drag-and-drop from the panels and of files.
import fs from 'fs';
import path from 'path';

export default async function ({ page, step, ctx, url, OUT }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // a new design; page 1 holds `els` ([kind, props]: 'text', 'line' or a shape name)
  const open = async (type, els = [], { pages = 1, p = page } = {}) => {
    await p.evaluate(() => A.app.go('#/home'));
    await p.waitForSelector('.hero');
    await p.evaluate(async ([type, els, pages]) => {
      const M = A.M;
      const mk = ([kind, o]) => {
        const el = kind === 'text' ? M.newText(o) : kind === 'line' ? M.newLine(o) : M.newShape(kind, o);
        if (kind === 'text') el.h = A.R.textHeight(el);
        if (kind === 'line') M.syncLineBox(el);
        return el;
      };
      await A.Home.newDesign({ type, pages: Array.from({ length: pages }, (_, i) => M.newPage({ elements: i ? [] : els.map(mk) })) });
    }, [type, els, pages]);
    await p.waitForFunction(() => A.E.d && A.E.blocks[0]?.svg.isConnected);
    await p.waitForTimeout(400);
    await p.evaluate(() => document.activeElement?.blur?.());
  };
  const count = (i) => ev((i) => (i == null ? A.E.els() : A.E.d.pages[i].elements).length, i);
  const last = (i) => ev((i) => JSON.parse(JSON.stringify((i == null ? A.E.els() : A.E.d.pages[i].elements).at(-1))), i);
  const get = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.d.pages.flatMap((p) => p.elements).find((e) => e.id === id) || null)), id);
  // client position of a page point on page i (default: the current page)
  const at = (x, y, i) => ev(([x, y, i]) => { const r = A.E.blocks[i ?? A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y, i]);
  const clickEl = async (id, opts) => {
    const b = await page.locator(`.page-svg [data-id="${id}"]`).first().boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, opts);
  };
  const centreOf = (el) => ({ x: el.x + el.w / 2, y: el.y + el.h / 2 });
  // scroll the canvas with the mouse wheel until page i's top is near the top of the view
  const wheelTo = async (i) => {
    const s = await page.locator('.ed-scroll').boundingBox();
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
    const dy = await ev((i) => A.E.blocks[i].frame.getBoundingClientRect().top - A.E.scrollEl.getBoundingClientRect().top - 20, i);
    await page.mouse.wheel(0, dy);
    await wait(500);
  };
  const editing = () => ev(() => {
    const t = A.E.textArea;
    return { id: A.E.editingId, focused: !!t && document.activeElement === t, value: t?.value, from: t?.selectionStart, to: t?.selectionEnd };
  });
  const menu = (label) => page.locator('.popover .menu-item', { has: page.locator('.menu-label', { hasText: new RegExp('^' + label + '$') }) }).click();
  const rail = async (p) => { await page.click(`.rail-btn[data-p="${p}"]`); await wait(250); };
  // mouse drag (HTML5 drag-and-drop for panel items); `over` runs while the item is held over the target
  const dragTo = async (from, to, over) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    if (over) await over();
    await page.mouse.up();
    await wait(200);
  };
  const hint = () => ev(() => { const d = document.querySelector('.drop-hint'); return d && { w: parseFloat(d.style.width) / A.E.zoom, h: parseFloat(d.style.height) / A.E.zoom }; });
  // (drag input reaches the page a moment later)
  const hintBecomes = (on) => page.waitForFunction((on) => !!document.querySelector('.drop-hint') === on, on, { timeout: 2000 }).then(() => true, () => false);
  const boxCentre = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // a PNG of w×h made in the page (kept on window.__png)
  const makePng = (w, h) => ev(async ([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').fillStyle = '#3a7';
    c.getContext('2d').fillRect(0, 0, w, h);
    window.__png = await new Promise((r) => c.toBlob(r, 'image/png'));
  }, [w, h]);
  // a PNG of w×h written to OUT, to drag in as a file
  const pngFile = async (name, w, h) => {
    const b64 = await ev(([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').fillStyle = '#3a7';
      c.getContext('2d').fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, [w, h]);
    const f = path.resolve(OUT, name);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    return f;
  };
  // files dragged in from the OS through Chromium's drag input: `types` are the drag events sent at the point
  let cdp = null;
  const osDrag = async (pt, files, types = ['dragEnter', 'dragOver', 'drop']) => {
    cdp ||= await ctx.newCDPSession(page);
    for (const type of types) await cdp.send('Input.dispatchDragEvent', { type, x: pt.x, y: pt.y, data: { items: [], files, dragOperationsMask: 1 } });
  };

  await step('adding: Ctrl+V steps each paste to a free spot beside the copy; Ctrl+Shift+V and Paste in place keep its spot; a cut pastes back in place', async () => {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    await open('social', [['rect', { id: 'r', x: 300, y: 300, w: 200, h: 200, fill: '#ff3131' }]]);
    await ev(() => navigator.clipboard.writeText('external'));
    await clickEl('r');
    await page.keyboard.press('Control+c');
    const paste = async (keys, x, n, msg) => {
      await page.keyboard.press(keys);
      await wait(120);
      const l = await last();
      ok(l.type === 'shape' && l.x === x && l.y === x && (await count()) === n, msg, { l, n: await count() });
      return l;
    };
    await paste('Control+v', 324, 2, 'first paste is not beside the copy');
    await paste('Control+v', 348, 3, 'a repeated paste did not step on');
    // one paste is one undo step, and undoing it frees its spot for the next paste
    await page.keyboard.press('Control+z');
    ok((await count()) === 2, 'undo after a paste');
    await paste('Control+v', 348, 3, 'the paste after an undo did not take the freed spot');
    await paste('Control+Shift+v', 300, 4, 'Ctrl+Shift+V did not paste in place');
    await page.keyboard.press('Control+z');
    // the empty-page menu (nothing selected) and the element menu both offer Paste in place
    const pt = await at(900, 950);
    await page.mouse.click(pt.x, pt.y);
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    ok(await page.locator('.popover .menu-label', { hasText: /^Select all$/ }).count(), 'not the empty-page menu');
    await menu('Paste in place');
    let l = await last();
    ok(l.x === 300 && l.y === 300 && (await count()) === 4, 'menu Paste in place', l);
    // (the copy just pasted in place covers the original, so a click there picks the copy)
    const c = await at(400, 400);
    await page.mouse.click(c.x, c.y, { button: 'right' });
    ok((await ev(() => A.E.sel.join())) === l.id && (await page.locator('.popover .menu-label', { hasText: /^Paste in place$/ }).count()), 'no Paste in place on the element menu');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    // a cut element pastes back where it was, the next paste steps on
    const c3 = await at(540, 540);
    await page.mouse.click(c3.x, c3.y);
    const cut = await ev(() => A.E.selEls()[0]);
    ok(cut.x === 348 && (await count()) === 3, 'did not pick the third copy', cut);
    await page.keyboard.press('Control+x');
    await wait(100);
    ok((await count()) === 2 && !(await get(cut.id)), 'Ctrl+X did not cut the selection');
    await paste('Control+v', 348, 3, 'a cut did not paste back in place');
    await paste('Control+v', 372, 4, 'the paste after a cut did not step on');
    // after the window lost focus the browser's paste event decides; Shift still pastes in place
    await ev(() => (A.E.clipFresh = false));
    await paste('Control+Shift+v', 348, 5, 'Ctrl+Shift+V through the paste event');
    await paste('Control+v', 396, 6, 'Ctrl+V through the paste event');
  });

  await step('adding: in a presentation a copy pasted on the next slide keeps its position', async () => {
    await open('presentation', [['rect', { id: 'r', x: 500, y: 300, w: 300, h: 200 }]], { pages: 2 });
    await clickEl('r');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await wait(300);
    ok((await ev(() => A.E.pi)) === 1, 'ArrowRight did not go to slide 2');
    await page.keyboard.press('Control+v');
    await wait(100);
    let l = await last(1);
    ok((await count(1)) === 1 && l.x === 500 && l.y === 300, 'paste on slide 2 moved', l);
    await page.keyboard.press('Control+v');
    await wait(100);
    l = await last(1);
    ok(l.x === 524 && l.y === 324 && (await count(0)) === 1, 'second paste on slide 2', l);
    // copied and then deleted: the paste goes back in its place
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowLeft');
    await wait(300);
    await clickEl('r');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Delete');
    ok((await count(0)) === 0, 'Delete');
    await page.keyboard.press('Control+v');
    await wait(100);
    l = await last(0);
    ok((await count(0)) === 1 && l.x === 500 && l.y === 300, 'copy, delete, paste did not land in place', l);
  });

  await step('adding: copy on one page, scroll to another with the wheel: the view picks that page and Ctrl+V keeps the position', async () => {
    await open('doc', [['rect', { id: 'r', x: 100, y: 120, w: 160, h: 90 }]], { pages: 3 });
    await clickEl('r');
    await page.keyboard.press('Control+c');
    await wheelTo(2);
    const st = await ev(() => ({ pi: A.E.pi, info: A.EU.pageInfo.textContent, sel: A.E.sel.length }));
    ok(st.pi === 2 && st.info === 'Page 3 / 3' && !st.sel, 'scrolling to page 3 did not make it current', st);
    await page.keyboard.press('Control+v');
    await wait(100);
    let l = await last(2);
    ok((await count(2)) === 1 && l.x === 100 && l.y === 120, 'paste on another page moved', l);
    await page.keyboard.press('Control+v');
    await wait(100);
    l = await last(2);
    ok(l.x === 124 && l.y === 144, 'second paste on that page did not step', l);
    // an add lands in the part of page 3 in view
    await rail('text');
    await page.click('.text-add.heading');
    await page.keyboard.press('Escape');
    const h = await last(2);
    ok(h.type === 'text' && (await count(2)) === 3 && (await count(0)) === 1, 'heading not added to page 3', { h, p1: await count(0) });
    const vis = await ev((id) => {
      const r = document.querySelector(`.page-svg [data-id="${id}"]`).getBoundingClientRect(), s = A.E.scrollEl.getBoundingClientRect();
      return r.top >= s.top && r.bottom <= s.bottom;
    }, h.id);
    ok(vis, 'the heading is out of view');
  });

  await step('adding: a page with a selection stays current while it shows; with nothing selected the page mostly in view takes over', async () => {
    await open('doc', [['rect', { id: 'r', x: 100, y: 800, w: 160, h: 90 }]], { pages: 3 });
    await clickEl('r');
    const s = await page.locator('.ed-scroll').boundingBox();
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
    // page 1 keeps a strip in view
    const dy = await ev(() => A.E.blocks[1].frame.getBoundingClientRect().top - A.E.scrollEl.getBoundingClientRect().top - 120);
    await page.mouse.wheel(0, dy);
    await wait(500);
    let st = await ev(() => ({ pi: A.E.pi, sel: A.E.sel }));
    ok(st.pi === 0 && st.sel[0] === 'r', 'the selected page gave way while still in view', st);
    await page.keyboard.press('Escape');
    await page.mouse.wheel(0, 20);
    await wait(500);
    st = await ev(() => ({ pi: A.E.pi, info: A.EU.pageInfo.textContent }));
    ok(st.pi === 1 && st.info === 'Page 2 / 3', 'the page mostly in view did not become current', st);
    // pages picked in the page grid, or added, stay current while the view scrolls over to them
    await page.click('.page-info');
    await page.locator('.pg-card').nth(2).click();
    await wait(1200);
    st = await ev(() => ({ pi: A.E.pi, info: A.EU.pageInfo.textContent }));
    ok(st.pi === 2 && st.info === 'Page 3 / 3', 'grid pick lost while scrolling', st);
    await page.click('.page-info');
    await page.locator('.pg-card').nth(0).click();
    await wait(1200);
    ok((await ev(() => A.E.pi)) === 0, 'grid pick of page 1 lost while scrolling');
    await page.locator('.add-page-btn').click();
    await wait(1200);
    st = await ev(() => ({ pi: A.E.pi, n: A.E.d.pages.length, info: A.EU.pageInfo.textContent }));
    ok(st.pi === 3 && st.n === 4 && st.info === 'Page 4 / 4', 'the added page did not stay current', st);
  });

  await step('adding: duplicating a moved copy repeats the step (Ctrl+D and Alt-drag); pasted connectors keep their shapes', async () => {
    await open('presentation', [
      ['rect', { id: 'a', x: 200, y: 200, w: 200, h: 150 }],
      ['rect', { id: 'B', x: 300, y: 700, w: 200, h: 150 }],
      ['ellipse', { id: 'C', x: 900, y: 700, w: 200, h: 150 }],
      ['line', { id: 'L', p1: { x: 500, y: 775 }, p2: { x: 900, y: 775 }, c1: 'B', c2: 'C' }],
    ]);
    await clickEl('a');
    await page.keyboard.press('Control+d');
    const c1 = await ev(() => A.E.sel[0]);
    let e1 = await get(c1);
    ok(e1.x === 220 && e1.y === 220, 'first duplicate offset', e1);
    // move the copy (Ctrl: no snapping) and duplicate again: the step from the original repeats
    const p = await at(e1.x + 100, e1.y + 75);
    await page.keyboard.down('Control');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 100, p.y + 10, { steps: 6 });
    await page.mouse.move(p.x + 150, p.y - 20, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    e1 = await get(c1);
    ok(e1.x > 300, 'the copy did not move', e1);
    await page.keyboard.press('Control+d');
    const e2 = await last();
    ok(near(e2.x - e1.x, e1.x - 200, 0.01) && near(e2.y - e1.y, e1.y - 200, 0.01), 'second duplicate did not repeat the step', { e1, e2 });
    await page.keyboard.press('Control+d');
    const e3 = await last();
    ok(near(e3.x - e2.x, e1.x - 200, 0.01) && near(e3.y - e2.y, e1.y - 200, 0.01), 'third duplicate did not continue the row', { e2, e3 });
    const n = await count();
    await page.keyboard.press('Control+z');
    ok((await count()) === n - 1, 'one duplicate is not one undo step');
    // a new selection starts over at 20/20
    await clickEl('a');
    await page.keyboard.press('Control+d');
    let d = await last();
    ok(d.x === 220 && d.y === 220, 'duplicate of another selection did not start over', d);
    await page.keyboard.press('Control+z');
    // Alt-drag a copy, then Ctrl+D repeats that drag
    await clickEl('a');
    const q = await at(300, 275);
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.mouse.move(q.x, q.y);
    await page.mouse.down();
    await page.mouse.move(q.x + 120, q.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    const alt = await ev(() => ({ ...A.E.selEls()[0] }));
    ok(alt.id !== 'a' && alt.x > 220 && (await get('a')).x === 200, 'Alt-drag did not copy', alt);
    await page.keyboard.press('Control+d');
    d = await last();
    ok(near(d.x - alt.x, alt.x - 200, 0.01) && near(d.y, alt.y, 0.01), 'Ctrl+D after Alt-drag did not repeat it', { alt, d });
    // copy and paste two shapes with their connector: the pasted line joins the pasted shapes
    await clickEl('B');
    await page.keyboard.down('Shift');
    await clickEl('C');
    await page.keyboard.up('Shift');
    await ev(() => A.E.select([...A.E.sel, 'L']));
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await wait(100);
    const linked = () => ev(() => { const s = A.E.selEls(), l = s.find((e) => e.type === 'line'); return { n: s.length, c1: l?.c1, c2: l?.c2, shapes: s.filter((e) => e.type === 'shape').map((e) => e.id) }; });
    const st = await linked();
    ok(st.n === 3 && st.shapes.includes(st.c1) && st.shapes.includes(st.c2) && !['B', 'C'].includes(st.c1), 'pasted connector lost its shapes', st);
    // and so does a duplicated one
    await page.keyboard.press('Control+d');
    const du = await linked();
    ok(du.n === 3 && du.shapes.includes(du.c1) && du.shapes.includes(du.c2) && !st.shapes.includes(du.c1) && du.c1 !== du.c2, 'duplicated connector lost its shapes', du);
  });

  await step('adding: a new text box opens for typing with its sample selected, typed letters stay in it, repeats cascade', async () => {
    await open('social');
    await rail('text');
    const n = await count();
    await page.click('.text-add.heading');
    let t = await editing();
    ok(t.id && t.focused && t.value === 'Add a heading' && t.from === 0 && t.to === t.value.length, 'heading not opened for typing with the sample selected', t);
    // the text box keeps its width handles while it is filled in
    ok(await page.locator('.sel-box .handle.e').count(), 'no handles while typing');
    await page.keyboard.type('Hello world');
    ok((await count()) === n + 1, 'typed letters added elements', await count());
    await page.keyboard.press('Escape');
    let l = await last();
    ok(l.text === 'Hello world' && !l.placeholder && !(await ev(() => A.E.editingId)), 'typed text', l);
    // two untouched headings do not hide each other
    await page.click('.text-add.heading');
    await page.keyboard.press('Escape');
    await page.click('.text-add.heading');
    await page.keyboard.press('Escape');
    const [h1, h2] = await ev(() => A.E.els().slice(-2).map((e) => ({ x: e.x, y: e.y, text: e.text })));
    ok(h1.text === 'Add a heading' && h2.x === h1.x + 20 && h2.y === h1.y + 20, 'repeated heading did not cascade', [h1, h2]);
    // a text effect opens for typing too
    await page.locator('.combo', { hasText: 'Neon glow' }).click();
    t = await editing();
    ok(t.focused && t.value === 'Neon glow' && t.to === 9, 'text effect not opened for typing', t);
    await page.keyboard.type('Glow');
    await page.keyboard.press('Escape');
    ok((await last()).text === 'Glow', 'text effect text');
    // T opens a body text box; the letters typed go into it, not to the shortcuts
    const m = await count();
    await page.keyboard.press('t');
    t = await editing();
    ok(t.focused && t.value === 'Add a little bit of body text' && t.to === t.value.length, 'T did not open for typing', t);
    await page.keyboard.type('crt');
    await page.keyboard.press('Escape');
    ok((await count()) === m + 1 && (await last()).text === 'crt', 'letters after T', { n: await count(), m });
    // the quick menu's Enter does not reach the new text
    await page.keyboard.press('/');
    await page.keyboard.type('add heading');
    await page.keyboard.press('Enter');
    await wait(50);
    t = await editing();
    ok(t.focused && t.value === 'Add a heading' && t.from === 0 && t.to === 13, 'quick menu heading', t);
    await page.keyboard.type('Q');
    await page.keyboard.press('Escape');
    ok((await last()).text === 'Q', 'quick menu heading text');
  });

  await step('adding: a new text box can be widened by its handle while it is typed into, in one undo step', async () => {
    await open('social');
    await rail('text');
    await page.click('.text-add.sub');
    const id = await ev(() => A.E.editingId);
    const w0 = (await get(id)).w;
    const hb = await page.locator('.sel-box .handle.e').boundingBox();
    const y = hb.y + hb.height / 2;
    await page.mouse.move(hb.x + hb.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(hb.x + 60, y, { steps: 5 });
    await page.mouse.move(hb.x + 120, y, { steps: 5 });
    await page.mouse.up();
    const t = await editing();
    const w1 = (await get(id)).w;
    ok(t.id === id && t.focused && t.from === 0 && t.to === 16 && w1 > w0 + 100, 'widening ended the typing or lost the sample selection', { t, w0, w1 });
    await page.keyboard.type('Wider');
    await page.keyboard.press('Escape');
    const l = await get(id);
    ok(l.text === 'Wider' && l.w === w1, 'typed after widening', l);
    await page.keyboard.press('Control+z');
    const u = await get(id);
    ok(u.text === 'Add a subheading' && u.w === w1, 'undo of the typing', u);
    await page.keyboard.press('Control+z');
    ok((await get(id)).w === w0, 'undo of the widening');
  });

  await step('adding: a clicked panel item lets go of the focus (Space adds nothing more); one pressed from the keyboard keeps it', async () => {
    await open('social');
    await rail('elements');
    let n = await count();
    await page.locator('.ed-panel .el-item[title="Star"]').click();
    ok((await count()) === n + 1, 'click did not add');
    await page.keyboard.press(' ');
    await page.keyboard.press('Enter');
    ok((await count()) === n + 1, 'Space/Enter after the click added again', await count());
    // (Enter opened the selected star's text)
    await page.keyboard.press('Escape');
    // keyboard: Enter on a focused item adds, the focus stays for the next one
    await page.locator('.ed-panel .el-item[title="Circle"]').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    let st = await ev(() => ({ n: A.E.els().length, title: document.activeElement?.title, xs: A.E.els().slice(-2).map((e) => e.x) }));
    ok(st.n === n + 3 && st.title === 'Circle' && st.xs[1] === st.xs[0] + 20, 'keyboard adds', st);
    // a heading added from the keyboard is typed into, and Escape goes back to its button
    await rail('text');
    await page.locator('.text-add.heading').focus();
    await page.keyboard.press('Enter');
    let t = await editing();
    ok(t.focused && t.value === 'Add a heading' && t.to === 13, 'keyboard heading not opened for typing', t);
    await page.keyboard.type('Keys');
    await page.keyboard.press('Escape');
    st = await ev(() => ({ text: A.E.els().at(-1).text, focus: document.activeElement?.className }));
    ok(st.text === 'Keys' && /text-add/.test(st.focus), 'focus did not return to the button', st);
    n = await count();
    await page.keyboard.press('Enter');
    t = await editing();
    ok(t.focused && (await count()) === n + 1, 'second keyboard heading', t);
    await page.keyboard.press('Escape');
  });

  await step('adding: sticky notes open for typing (S and the panel); Doc starter text is replaced when typed over', async () => {
    await open('whiteboard');
    let n = await count();
    await page.keyboard.press('s');
    let t = await editing();
    ok(t.focused && t.value === 'Add an idea' && t.to === 11, 'S sticky not opened for typing', t);
    await page.keyboard.type('Idea one');
    await page.keyboard.press('Escape');
    let l = await last();
    ok((await count()) === n + 1 && l.sticky && l.text === 'Idea one', 'sticky text', l);
    await rail('elements');
    await page.locator('.ed-panel .el-item[title="Sticky note"]').first().click();
    t = await editing();
    ok(t.focused && t.value === 'Add an idea' && t.to === 11, 'panel sticky not opened for typing', t);
    await page.keyboard.type('Two');
    await page.keyboard.press('Escape');
    ok((await last()).text === 'Two', 'panel sticky text');
    // the Doc starter copy
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev(() => A.Home.newDesign({ type: 'doc' }));
    await page.waitForFunction(() => A.E.d && A.E.blocks[0]?.svg.isConnected);
    await wait(400);
    const id = await ev(() => A.E.els().find((e) => e.text === 'Start writing here…').id);
    const b = await page.locator(`.page-svg [data-id="${id}"]`).boundingBox();
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForSelector('textarea.text-edit');
    await page.keyboard.type('My notes');
    await page.keyboard.press('Escape');
    l = await get(id);
    ok(l.text === 'My notes', 'Doc starter text was appended to', l);
  });

  await step('adding: panel items dragged with the mouse land at the drop point on the page under it', async () => {
    await open('doc', [], { pages: 2 });
    await rail('elements');
    await wheelTo(1);
    let to = await at(300, 400, 1);
    await dragTo(await boxCentre(page.locator('.ed-panel .el-item[title="Star"]')), to);
    let l = await last(1);
    let c = centreOf(l);
    ok(l.shape === 'star' && near(c.x, 300, 3) && near(c.y, 400, 3) && (await ev(() => A.E.pi)) === 1, 'star not at the drop point', { c, pi: await ev(() => A.E.pi) });
    ok((await count(0)) === 0, 'star went to page 1');
    const n = await count(1);
    // the tile dragged from does not keep the focus: Space adds nothing
    await page.keyboard.press(' ');
    await wait(100);
    ok((await count(1)) === n && !(await ev(() => document.activeElement?.closest('.ed-panel'))), 'Space after a drop added the item again');
    await page.keyboard.press('Control+z');
    ok((await count(1)) === n - 1, 'a drop is not one undo step');
    // a line keeps its shape, centred at the drop
    to = await at(500, 300, 1);
    await dragTo(await boxCentre(page.locator('.ed-panel .el-item[title="Arrow"]')), to);
    l = await last(1);
    ok(l.type === 'line' && near((l.p1.x + l.p2.x) / 2, 500, 3) && near(l.p1.y, 300, 3) && l.end === 'triangle', 'arrow drop', l);
    // a photo grid fills the page it is dropped on
    to = await at(200, 200, 1);
    await dragTo(await boxCentre(page.locator('.ed-panel .el-item[title="Photo grid"]').first()), to);
    const g = await ev(() => A.E.d.pages[1].elements.filter((e) => e.frame).map((e) => [e.x, e.y]));
    ok(g.length === 2 && g.every(([x, y]) => x < 20 && y < 20 || x > 300), 'photo grid not placed on the page', g);
    // text from the Text panel: at the drop point and open for typing
    await rail('text');
    to = await at(400, 600, 1);
    await dragTo(await boxCentre(page.locator('.text-add.heading')), to);
    const t = await editing();
    l = await last(1);
    c = centreOf(l);
    ok(l.type === 'text' && near(c.x, 400, 3) && near(c.y, 600, 3) && t.focused && t.to === 13, 'heading drop', { c, t });
    await page.keyboard.type('Dropped');
    await page.keyboard.press('Escape');
    ok((await last(1)).text === 'Dropped', 'dropped heading text');
  });

  await step('adding: an upload dragged onto a frame fills it in one undo step; elsewhere it lands at the pointer; a locked frame is left alone', async () => {
    await open('social', [
      ['rect', { id: 'f', x: 100, y: 100, w: 400, h: 400, fill: '#d9d9de', frame: true }],
      ['rect', { id: 'lk', x: 600, y: 600, w: 300, h: 300, fill: '#d9d9de', frame: true, locked: true }],
    ]);
    await makePng(200, 100);
    const aid = await ev(async () => (await A.S.addAsset(window.__png, { name: 'drag test' })).id);
    await rail('uploads');
    const img = page.locator(`.ed-panel .img-item[title="drag test"]`);
    await img.waitFor();
    const n = await count();
    // while held over the frame it is outlined; off it, and once dropped, the outline goes
    await dragTo(await boxCentre(img), await at(300, 300), async () => {
      const on = await hint();
      ok(on && near(on.w, 400, 1) && near(on.h, 400, 1), 'no outline on the frame under the photo', on);
      const off = await at(800, 250);
      await page.mouse.move(off.x, off.y, { steps: 4 });
      ok(!(await hint()), 'outline stayed off the frame');
      const lk = await at(750, 750);
      await page.mouse.move(lk.x, lk.y, { steps: 4 });
      ok(!(await hint()), 'a locked frame was outlined');
      const back = await at(300, 300);
      await page.mouse.move(back.x, back.y, { steps: 4 });
      ok(await hint(), 'outline did not come back');
    });
    ok(!(await hint()), 'outline left after the drop');
    let f = await get('f');
    ok(f.asset === aid && (await count()) === n, 'frame not filled by the dragged photo', { f, n: await count() });
    ok(!(await ev(() => document.activeElement?.closest('.ed-panel'))), 'the upload dragged from kept the focus');
    await page.keyboard.press('Control+z');
    f = await get('f');
    ok(!f.asset && (await count()) === n, 'one undo did not empty the frame', f);
    await dragTo(await boxCentre(img), await at(800, 250));
    let l = await last();
    ok(l.type === 'image' && l.asset === aid && near(l.x + l.w / 2, 800, 3) && near(l.y + l.h / 2, 250, 3), 'photo not at the drop point', l);
    await dragTo(await boxCentre(img), await at(750, 750));
    l = await last();
    ok(!(await get('lk')).asset && l.type === 'image' && (await count()) === n + 2, 'locked frame was filled', l);
  });

  await step('adding: files dragged in from the OS land at the pointer on the page under it, fill a frame (outlined on the way) in one step, and respect a locked page', async () => {
    await open('social', [], { pages: 3 });
    await ev(() => { A.E.d.pages[2].elements.push(A.M.newShape('ellipse', { id: 'fr', x: 500, y: 500, w: 300, h: 300, fill: '#d9d9de', frame: true })); A.E.changed({ structure: true }); });
    const f1 = await pngFile('w2-drop-1.png', 200, 100), f2 = await pngFile('w2-drop-2.png', 200, 100);
    await wheelTo(2);
    await osDrag(await at(150, 200, 2), [f1]);
    await page.waitForFunction(() => A.E.d.pages[2].elements.length === 2);
    let l = await last(2);
    ok(l.type === 'image' && near(l.x + l.w / 2, 150, 2) && near(l.y + l.h / 2, 200, 2) && (await ev(() => A.E.pi)) === 2, 'file not at the drop point on page 3', l);
    // two files: fanned out, one undo step
    await osDrag(await at(600, 200, 2), [f1, f2]);
    await page.waitForFunction(() => A.E.d.pages[2].elements.length === 4);
    const two = await ev(() => A.E.d.pages[2].elements.slice(-2).map((e) => [e.x, e.y]));
    ok(two[1][0] === two[0][0] + 20 && two[1][1] === two[0][1] + 20, 'two dropped files stacked', two);
    await page.keyboard.press('Control+z');
    ok((await count(2)) === 2, 'two dropped files took two undo steps', await count(2));
    // onto the frame: outlined while dragged over, then filled, nothing added; one undo empties it again
    const pt = await at(650, 650, 2);
    await osDrag(pt, [f1], ['dragEnter', 'dragOver']);
    ok(await hintBecomes(true), 'a dragged file did not outline the frame');
    // (a drag held still keeps sending dragOver)
    await osDrag(await at(150, 600, 2), [f1], ['dragOver', 'dragOver']);
    ok(await hintBecomes(false), 'outline stayed off the frame');
    await osDrag(pt, [f1], ['dragOver', 'dragOver', 'drop']);
    await page.waitForFunction(() => A.E.d.pages[2].elements.find((e) => e.id === 'fr').asset);
    ok(!(await hint()), 'outline left after the drop');
    ok((await count(2)) === 2, 'a photo was added beside the filled frame');
    await page.keyboard.press('Control+z');
    const fr = await get('fr');
    ok(!fr.asset && (await count(2)) === 2, 'undo of a frame drop', fr);
    // a locked page takes nothing
    await ev(() => { A.E.d.pages[2].locked = true; A.E.changed({ structure: true }); });
    await osDrag(pt, [f1], ['dragEnter', 'dragOver', 'dragOver']);
    await wait(400);
    ok(!(await hint()), 'a frame on a locked page was outlined');
    await osDrag(await at(150, 600, 2), [f1], ['dragOver', 'dragOver', 'drop']);
    await wait(500);
    ok((await count(2)) === 2, 'a file dropped on a locked page was added');
  });

  await step('adding: a brand photo dragged onto a frame fills it; a background swatch colours the page it is dropped on', async () => {
    await open('doc', [['rect', { id: 'f', x: 100, y: 100, w: 300, h: 300, fill: '#d9d9de', frame: true }]], { pages: 2 });
    await makePng(120, 120);
    const aid = await ev(async () => (await A.S.addAsset(window.__png, { name: 'brand pic' })).id);
    const saved = await ev((id) => { const b = JSON.stringify(A.app.brand); A.app.brand = { ...A.app.brand, photos: [id] }; return b; }, aid);
    try {
      await rail('brand');
      const ph = page.locator('.ed-panel .p-sec', { hasText: 'Brand photos' }).locator('.img-item');
      await ph.waitFor();
      const n = await count(0);
      await dragTo(await boxCentre(ph), await at(250, 250, 0), async () => ok(await hint(), 'brand photo did not outline the frame'));
      ok((await get('f')).asset === aid && (await count(0)) === n, 'brand photo did not fill the frame', await get('f'));
      // elsewhere it is added at the drop point; a click adds it in the middle of the view
      await dragTo(await boxCentre(ph), await at(600, 300, 0));
      await page.waitForFunction((n) => A.E.d.pages[0].elements.length === n + 1, n);
      const l = await last(0);
      ok(l.type === 'image' && l.asset === aid && near(l.x + l.w / 2, 600, 3) && near(l.y + l.h / 2, 300, 3), 'brand photo not at the drop point', l);
      await ph.click();
      await page.waitForFunction((n) => A.E.d.pages[0].elements.length === n + 2, n);
      await page.keyboard.press(' ');
      await wait(300);
      ok((await count(0)) === n + 2, 'Space after clicking a brand photo added it again');
    } finally {
      await ev((b) => (A.app.brand = JSON.parse(b)), saved);
    }
    await rail('elements');
    await page.fill('.ed-panel input.search', 'background');
    await wheelTo(1);
    const bg0 = await ev(() => JSON.stringify(A.E.d.pages[0].bg || null));
    await dragTo(await boxCentre(page.locator('.ed-panel .bg-sw').first()), await at(400, 500, 1));
    const st = await ev(() => ({ pi: A.E.pi, bg: A.E.d.pages[1].bg?.color, bg0: JSON.stringify(A.E.d.pages[0].bg || null) }));
    ok(st.pi === 1 && st.bg === 'grad:#8c52ff:#ff66c4:135' && st.bg0 === bg0, 'background not set on the page it was dropped on', st);
    await page.keyboard.press('Control+z');
    ok((await ev(() => A.E.d.pages[1].bg?.color)) !== st.bg, 'one undo did not take the background back');
    await page.fill('.ed-panel input.search', '');
  });

  await step('adding: on a phone a held Elements item drags onto the page; a swipe still scrolls the panel and a tap still adds', async () => {
    const pctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await pctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    try {
      await p.goto(page.url().split('#')[0] + '#/home');
      await p.waitForSelector('.hero');
      await open('social', [['rect', { id: 'pf', x: 60, y: 60, w: 300, h: 300, fill: '#d9d9de', frame: true }]], { p });
      const cdp = await pctx.newCDPSession(p);
      const touch = (type, pt) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt ? [{ x: pt.x, y: pt.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] : [] });
      await p.tap('.rail-btn[data-p="elements"]');
      await p.waitForTimeout(400);
      const tile = p.locator('.ed-panel .el-item[title="Circle"]');
      await tile.scrollIntoViewIfNeeded();
      const tb = await tile.boundingBox(), from = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
      const fr = await p.evaluate(() => { const r = A.E.blocks[0].frame.getBoundingClientRect(), s = document.querySelector('.panel-wrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.bottom, s.top) - 60 }; });
      const n = await p.evaluate(() => A.E.els().length);
      await touch('touchStart', from);
      await p.waitForTimeout(650);
      ok(await p.locator('.drag-ghost').count(), 'holding the item did not pick it up');
      for (let k = 1; k <= 10; k++) {
        await touch('touchMove', { x: from.x + ((fr.x - from.x) * k) / 10, y: from.y + ((fr.y - from.y) * k) / 10 });
        await p.waitForTimeout(16);
      }
      await touch('touchEnd');
      await p.waitForTimeout(300);
      const st = await p.evaluate(() => {
        const el = A.E.els().at(-1), r = A.E.blocks[0].svg.getBoundingClientRect();
        return { n: A.E.els().length, shape: el?.shape, cx: r.left + (el.x + el.w / 2) * A.E.zoom, cy: r.top + (el.y + el.h / 2) * A.E.zoom, ghost: !!document.querySelector('.drag-ghost') };
      });
      ok(st.n === n + 1 && st.shape === 'ellipse' && near(st.cx, fr.x, 4) && near(st.cy, fr.y, 4) && !st.ghost, 'touch drag did not drop at the finger', { st, fr });
      // a quick swipe on the items scrolls the panel and adds nothing
      const body = p.locator('.ed-panel .panel-body');
      const top0 = await body.evaluate((b) => b.scrollTop);
      await touch('touchStart', from);
      for (let k = 1; k <= 6; k++) { await touch('touchMove', { x: from.x, y: from.y - k * 25 }); await p.waitForTimeout(16); }
      await touch('touchEnd');
      await p.waitForTimeout(400);
      const sw = await p.evaluate(() => ({ n: A.E.els().length, ghost: !!document.querySelector('.drag-ghost') }));
      ok(sw.n === n + 1 && !sw.ghost, 'a swipe on the panel added an element', sw);
      ok((await body.evaluate((b) => b.scrollTop)) > top0, 'the swipe did not scroll the panel');
      // a tap adds as before
      await tile.scrollIntoViewIfNeeded();
      await tile.tap();
      await p.waitForTimeout(200);
      ok((await p.evaluate(() => A.E.els().length)) === n + 2, 'a tap on the item did not add it');
      // new text on a touch screen is selected, not opened under the on-screen keyboard
      await p.tap('.rail-btn[data-p="text"]');
      await p.waitForTimeout(400);
      await p.tap('.text-add.heading');
      await p.waitForTimeout(200);
      const tx = await p.evaluate(() => ({ editing: A.E.editingId, sel: A.E.selEls()[0]?.text }));
      ok(!tx.editing && tx.sel === 'Add a heading', 'phone heading', tx);
      // a held upload dragged onto a frame fills it, outlined on the way
      const aid = await p.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 160; c.height = 90;
        c.getContext('2d').fillRect(0, 0, 160, 90);
        return (await A.S.addAsset(await new Promise((r) => c.toBlob(r, 'image/png')), { name: 'phone pic' })).id;
      });
      await p.tap('.rail-btn[data-p="uploads"]');
      const up = p.locator('.ed-panel .img-item[title="phone pic"]');
      await up.waitFor();
      await up.scrollIntoViewIfNeeded();
      const ub = await up.boundingBox(), u0 = { x: ub.x + ub.width / 2, y: ub.y + ub.height / 2 };
      const fp = await p.evaluate(() => { A.E.scrollEl.scrollTop = 0; const r = A.E.blocks[0].svg.getBoundingClientRect(); return { x: r.left + 210 * A.E.zoom, y: r.top + 210 * A.E.zoom }; });
      const m = await p.evaluate(() => A.E.els().length);
      await touch('touchStart', u0);
      await p.waitForTimeout(650);
      for (let k = 1; k <= 10; k++) {
        await touch('touchMove', { x: u0.x + ((fp.x - u0.x) * k) / 10, y: u0.y + ((fp.y - u0.y) * k) / 10 });
        await p.waitForTimeout(16);
      }
      ok(await p.locator('.drop-hint').count(), 'the frame under the finger was not outlined');
      await touch('touchEnd');
      await p.waitForTimeout(300);
      const pf = await p.evaluate(() => ({ asset: A.E.byId('pf')?.asset, n: A.E.els().length, hint: !!document.querySelector('.drop-hint, .drag-ghost') }));
      ok(pf.asset === aid && pf.n === m && !pf.hint, 'touch-dragged upload did not fill the frame', pf);
      ok(!errs.length, 'page errors', errs);
    } finally {
      await pctx.close();
    }
  });
}
