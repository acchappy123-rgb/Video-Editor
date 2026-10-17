// Regression checks (coreB): text-editing session, undo history, clipboard, page lock, page ops and saving.
export default async function ({ page, step, ctx, url }) {
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
  // add elements to the current page and leave them unselected
  const put = (els) => ev((list) => {
    const ids = list.map(([kind, o]) => {
      const el = kind === 'text' ? A.M.newText(o) : A.M.newShape(kind, o);
      if (kind === 'text') el.h = A.R.textHeight(el);
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
  const clickEl = async (id) => { const c = await center(id); await page.mouse.click(c.x, c.y); };
  // click an empty spot near the top right of page i (scrolled into view)
  const clickPage = async (i) => {
    const f = page.locator(`.page-block[data-pi="${i}"] .page-frame`);
    await f.scrollIntoViewIfNeeded();
    await wait(300);
    const b = await f.boundingBox();
    await page.mouse.click(b.x + b.width - 20, Math.max(b.y, 0) + 20);
  };
  const edit = async (id) => {
    await ev((i) => A.E.select([i]), id);
    await blur();
    await page.keyboard.press('Enter');
    await page.waitForSelector('textarea.text-edit');
  };
  const state = (id) => ev((i) => {
    const el = A.E.d.pages.flatMap((p) => p.elements).find((e) => e.id === i);
    return { editing: A.E.editingId, ta: !!A.E.textArea?.isConnected, focused: !!A.E.textArea && document.activeElement === A.E.textArea, text: el?.text, rendered: !!document.querySelector(`.page-svg [data-id="${i}"]`) };
  }, id);
  const count = () => ev(() => A.E.els().length);
  const clearToasts = () => ev(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));

  await step('coreB: toolbar Bold/size, zoom and resize keep the text editor (text-1, ui-2, touch-4, transform-10, state-3)', async () => {
    await open('social');
    const [id] = await put([['text', { text: 'Add a heading', x: 100, y: 100, w: 700, size: 80, bold: false }]]);
    await edit(id);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Typed words');
    await page.click('.ed-toolbar button[title^="Bold"]');
    let s = await state(id);
    ok(s.ta && s.focused && s.editing === id, 'after Bold', s);
    const size0 = await ev((i) => A.E.byId(i).size, id);
    await page.click('.ed-toolbar button[title="Bigger"]');
    s = await state(id);
    ok(s.ta && s.focused, 'after size +', s);
    await page.click('.ed-bottom button[title="Zoom in"]');
    const geo = () => ev((i) => { const el = A.E.byId(i), t = A.E.textArea; return { left: parseFloat(t.style.left), want: el.x * A.E.zoom, fs: parseFloat(t.style.fontSize), wantFs: el.size * A.E.zoom }; }, id);
    let g = await geo();
    ok(Math.abs(g.left - g.want) < 1 && Math.abs(g.fs - g.wantFs) < 0.5, 'textarea does not follow zoom', g);
    s = await state(id);
    ok(s.ta && s.focused, 'after zoom button', s);
    const sb = await page.locator('.ed-scroll').boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await wait(100);
    g = await geo();
    ok(Math.abs(g.left - g.want) < 1, 'textarea does not follow ctrl+wheel zoom', g);
    await page.setViewportSize({ width: 1200, height: 820 });
    await wait(300);
    await page.setViewportSize({ width: 1440, height: 900 });
    await wait(300);
    s = await state(id);
    ok(s.ta && s.focused && s.editing === id, 'after resize', s);
    await page.keyboard.type(' more');
    await page.keyboard.press('Escape');
    const r = await ev((i) => ({ ...A.E.byId(i), editing: A.E.editingId }), id);
    ok(r.text === 'Typed words more' && r.bold && r.size === size0 + 1 && !r.editing, 'text/style after edit', r);
    ok((await state(id)).rendered, 'text not rendered after edit');
  });

  await step('coreB: keys typed after focus left the editor go to the text; Tab and the side rail end editing (text-2)', async () => {
    const [id] = await put([['text', { text: 'Keep', x: 100, y: 400, w: 600, size: 60 }]]);
    const n = await count();
    await edit(id);
    await page.keyboard.press('End');
    await page.click('.ed-toolbar button[title="Spacing"]');
    await page.keyboard.type('rt');
    await page.keyboard.press('Backspace');
    let s = await state(id);
    ok(s.text === 'Keepr' && s.editing === id && (await count()) === n, 'keys did not go to the text', { ...s, n: await count() });
    await ev(() => A.U.closePop());
    await page.keyboard.press('Tab');
    await wait(50);
    s = await state(id);
    ok(!s.editing && !s.ta && s.rendered, 'Tab did not end editing', s);
    await edit(id);
    await page.click('.rail-btn[data-p="text"]');
    await wait(50);
    s = await state(id);
    ok(!s.editing && s.rendered && s.text === 'Keepr', 'rail click did not end editing', s);
  });

  await step('coreB: toolbar Undo/Redo while editing commits the typing first (text-4, state-2)', async () => {
    const [id] = await put([['text', { text: 'Add a little bit of body text', x: 100, y: 600, w: 700, size: 36 }]]);
    await edit(id);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Important words');
    await page.click('.ed-top button[title^="Undo"]');
    let s = await state(id);
    ok(!s.editing && !s.ta && s.text === 'Add a little bit of body text' && s.rendered, 'after Undo', s);
    await page.click('.ed-top button[title^="Redo"]');
    s = await state(id);
    ok(s.text === 'Important words' && s.rendered, 'after Redo', s);
  });

  await step('coreB: a version restore while editing leaves no hidden element behind (state-2)', async () => {
    const [id] = await put([['text', { text: 'Version text', x: 100, y: 800, w: 700, size: 40 }]]);
    await ev(() => A.E.snapshot('v1'));
    await edit(id);
    await page.keyboard.press('End');
    await page.keyboard.type(' typed');
    await ev(() => A.EU.historyDialog());
    await page.locator('.modal .version', { hasText: 'v1' }).locator('button').click();
    await page.waitForSelector('.modal', { state: 'detached' });
    const s = await state(id);
    ok(!s.editing && !s.ta && s.rendered && s.text === 'Version text', 'after version restore', s);
    // the document replaced under a live editor (same ids)
    await edit(id);
    await ev(() => { A.E.d = JSON.parse(JSON.stringify(A.E.d)); A.E.changed({ structure: true }); });
    const r = await state(id);
    ok(!r.editing && !r.ta && r.rendered, 'after replacing the document', r);
  });

  await step('coreB: right-click in the editor keeps the native menu; Ctrl+S saves; typing autosaves (text-16, text-19, state-7)', async () => {
    const [id] = await put([['text', { text: 'Important words', x: 100, y: 950, w: 700, size: 36 }]]);
    await edit(id);
    const tb = await page.locator('textarea.text-edit').boundingBox();
    await page.mouse.click(tb.x + 10, tb.y + tb.height / 2, { button: 'right' });
    ok(!(await page.$('.popover')) && (await state(id)).editing === id, 'element menu opened inside the text editor');
    await page.keyboard.press('End');
    await page.keyboard.type(' typed');
    await wait(1600);
    const db = await ev(async (i) => (await A.S.get('designs', A.E.d.id)).pages[0].elements.find((e) => e.id === i).text, id);
    ok(db === 'Important words typed', 'typing was not autosaved', db);
    await clearToasts();
    await page.keyboard.press('Control+s');
    await page.waitForSelector('.toast.ok:has-text("Saved")', { timeout: 3000 });
    ok((await state(id)).editing === id, 'Ctrl+S ended editing');
    await page.keyboard.press('Escape');
  });

  await step('coreB: switching page while editing finishes the edit on its own page (text-5, state-4)', async () => {
    await open('doc');
    await ev(() => { A.E.addPage(1); A.E.setPage(0); });
    const id = await ev(() => A.E.d.pages[0].elements[0].id);
    await edit(id);
    await page.keyboard.press('End');
    await page.keyboard.type(' edited');
    await clickPage(1);
    const s = await state(id);
    const pi = await ev(() => A.E.pi);
    ok(pi === 1 && !s.editing && s.text.endsWith(' edited') && (await page.$(`.page-block[data-pi="0"] .page-svg [data-id="${id}"]`)), 'edited text not on page 1', { ...s, pi });
    await ev(() => A.E.setPage(0));
    await wait(400);
    const [e2] = await put([['text', { text: 'Soon empty', x: 72, y: 400, w: 400, size: 30 }]]);
    await edit(e2);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await clickPage(1);
    ok(!(await ev((i) => A.E.d.pages[0].elements.some((e) => e.id === i), e2)), 'emptied text box left on page 1');
  });

  await step('coreB: strip layout - timeline page switch while editing keeps the text visible (state-4)', async () => {
    await open('presentation');
    const [id] = await put([['text', { text: 'Slide title', x: 200, y: 200, w: 900, size: 90 }]]);
    await ev(() => { A.E.addPage(1); A.E.setPage(0); });
    await edit(id);
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await page.click('.tl-block >> nth=1');
    await page.click('.tl-block >> nth=0');
    const s = await state(id);
    ok(!s.editing && s.rendered && s.text === 'Slide title!', 'title hidden after page switch', s);
  });

  await step('coreB: leaving the editor while editing saves the text and it shows on reopen (text-6, state-5, home-3)', async () => {
    const did = await open('doc');
    const id = await ev(() => A.E.els()[0].id);
    const reopen = async () => {
      await page.click('.ed-top button[title="Home"]');
      await page.waitForSelector('.hero');
      await ev((d) => A.app.go('#/design/' + d), did);
      await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg [data-id]'));
      await wait(300);
    };
    await edit(id);
    await page.keyboard.press('End');
    await page.keyboard.type(' 2');
    await reopen();
    const s = await state(id);
    ok(!s.editing && s.rendered && s.text === 'Untitled document 2', 'reopened design', s);
    const [e2] = await put([['text', { text: 'Will be emptied', x: 72, y: 500, w: 400, size: 30 }]]);
    await edit(e2);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await reopen();
    ok(!(await ev((i) => A.E.els().some((e) => e.id === i), e2)), 'emptied text box was saved');
  });

  await step('coreB: locked text and locked page block keyboard edits (text-13, state-12, transform-8)', async () => {
    await open('social');
    const [tid, rid] = await put([['text', { text: 'Locked title', x: 100, y: 100, w: 600, size: 60 }], ['rect', { x: 200, y: 400, w: 300, h: 200, fill: '#8c52ff' }]]);
    await ev((i) => { A.E.byId(i).locked = true; A.E.select([i]); }, tid);
    await blur();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+b');
    let t = await ev((i) => ({ editing: A.E.editingId, bold: !!A.E.byId(i).bold }), tid);
    ok(!t.editing && !t.bold, 'locked text was edited', t);
    await ev((i) => { A.E.byId(i).locked = false; A.E.deselect(); }, tid);
    await page.click('.page-block.active button[title="Lock page"]');
    await clickEl(rid);
    const x0 = await ev((i) => A.E.byId(i).x, rid);
    const n = await count();
    await clearToasts();
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('.toast:has-text("locked")', { timeout: 1500 });
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    const r = await ev((i) => ({ x: A.E.byId(i)?.x, sel: A.E.sel }), rid);
    ok(r.x === x0 && (await count()) === n, 'locked page changed', { ...r, x0, n: await count() });
    await ev((i) => A.E.select([i]), tid);
    await blur();
    await page.keyboard.press('Enter');
    ok(!(await ev(() => A.E.editingId)), 'text on a locked page went into editing');
    await clickEl(rid);
    await page.click('.mini-menu button[title="Unlock"]');
    const u = await ev((i) => ({ page: !!A.E.page().locked, el: !!A.E.byId(i).locked }), rid);
    ok(!u.page && !u.el, "'Unlock' did not unlock the page", u);
    await clickEl(rid);
    await page.keyboard.press('ArrowRight');
    ok((await ev((i) => A.E.byId(i).x, rid)) === x0 + 1, 'nudge after unlocking');
  });

  await step("coreB: 'Unlock' on a mixed selection unlocks everything (transform-9)", async () => {
    const [a, b] = await put([['rect', { x: 600, y: 600, w: 150, h: 150 }], ['rect', { x: 800, y: 600, w: 150, h: 150 }]]);
    await ev(([x, y]) => { A.E.byId(x).locked = true; A.E.select([x, y]); }, [a, b]);
    await page.click('.mini-menu button[title="Unlock"]');
    let l = await ev(([x, y]) => [!!A.E.byId(x).locked, !!A.E.byId(y).locked], [a, b]);
    ok(!l[0] && !l[1], 'mixed selection after Unlock', l);
    await page.click('.mini-menu button[title="Lock"]');
    l = await ev(([x, y]) => [!!A.E.byId(x).locked, !!A.E.byId(y).locked], [a, b]);
    ok(l[0] && l[1], 'Lock did not lock both', l);
  });

  await step('coreB: Ctrl+C/Ctrl+X/menu Copy put the elements on the clipboard, not stale OS text (state-1, state-17)', async () => {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    await open('social');
    const [rid] = await put([['rect', { x: 300, y: 300, w: 200, h: 200, fill: '#ff3131' }]]);
    await ev(() => navigator.clipboard.writeText('external'));
    await clickEl(rid);
    let n = await count();
    await page.keyboard.press('Control+c');
    ok((await ev(() => navigator.clipboard.readText())) === 'atelier-elements', 'Ctrl+C did not mark the clipboard');
    await page.keyboard.press('Control+v');
    await wait(100);
    let last = await ev(() => A.E.els().at(-1));
    ok((await count()) === n + 1 && last.type === 'shape', 'Ctrl+V after Ctrl+C', last);
    n = await count();
    await page.keyboard.press('Control+x');
    ok((await count()) === n - 1, 'Ctrl+X did not cut');
    await page.keyboard.press('Control+v');
    await wait(100);
    last = await ev(() => A.E.els().at(-1));
    await wait(300);
    ok((await count()) === n && last.type === 'shape', 'Ctrl+V after Ctrl+X', { n, now: await count(), last: last.type });
    await ev(() => navigator.clipboard.writeText('stale'));
    await clickEl(rid);
    const c = await center(rid);
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.locator('.popover .menu-item', { has: page.locator('.menu-label', { hasText: /^Copy$/ }) }).click();
    await ev(() => navigator.clipboard.writeText('stale'));
    n = await count();
    await page.keyboard.press('Control+v');
    await wait(100);
    last = await ev(() => A.E.els().at(-1));
    ok((await count()) === n + 1 && last.type === 'shape', 'Ctrl+V after menu Copy', last);
    // a marker without elements behind it (other window / after reload) pastes nothing
    await ev(() => { A.E.clip = null; A.E.clipFresh = false; return navigator.clipboard.writeText('atelier-elements'); });
    n = await count();
    await page.keyboard.press('Control+v');
    await wait(100);
    ok((await count()) === n, "pasted the 'atelier-elements' marker as text");
    // text copied from a field is pasted as text again
    await page.click('.page-block.active input.pg-title');
    await page.keyboard.type('Clip text');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Enter');
    await blur();
    await page.keyboard.press('Control+v');
    await wait(100);
    last = await ev(() => A.E.els().at(-1));
    ok(last.type === 'text' && last.text === 'Clip text', 'text copied from a field was not pasted', last);
  });

  await step('coreB: autosave adds no dead undo steps and keeps redo (state-6)', async () => {
    await open('social');
    const [tid] = await put([['text', { text: 'Undo me', x: 100, y: 100, w: 500, size: 50 }]]);
    await blur();
    await page.keyboard.press('r');
    const rid = await ev(() => A.E.sel[0]);
    await wait(1800);
    await edit(tid);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    ok(!(await ev((i) => !!A.E.byId(i), rid)), 'first undo was a dead step');
    await page.keyboard.press('Control+y');
    ok(await ev((i) => !!A.E.byId(i), rid), 'redo lost');
    await ev((i) => A.E.select([i]), rid);
    await blur();
    const x0 = await ev((i) => A.E.byId(i).x, rid);
    await page.keyboard.press('ArrowRight');
    await wait(1500);
    await page.keyboard.press('Control+z');
    await wait(1500);
    await edit(tid);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+y');
    ok((await ev((i) => A.E.byId(i).x, rid)) === x0 + 1, 'redo stack lost after autosave');
  });

  await step('coreB: a burst of nudges is one undo step (rank 6)', async () => {
    const rid = await ev(() => A.E.els().find((e) => e.type === 'shape').id);
    await clickEl(rid);
    const h0 = await ev(() => A.E.hi), x0 = await ev((i) => A.E.byId(i).x, rid);
    for (let k = 0; k < 10; k++) await page.keyboard.press('Shift+ArrowRight');
    await wait(600);
    const r = await ev((i) => ({ hi: A.E.hi, x: A.E.byId(i).x }), rid);
    ok(r.hi === h0 + 1 && r.x === x0 + 100, 'nudge history', { ...r, h0, x0 });
    for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Control+z');
    ok((await ev((i) => A.E.byId(i).x, rid)) === x0 + 100, 'undo during a burst did not undo the burst first');
    await page.keyboard.press('Control+z');
    ok((await ev((i) => A.E.byId(i).x, rid)) === x0, 'one undo did not revert the burst');
  });

  await step('coreB: undo shows the page that changed and selects what came back (rank 6)', async () => {
    await open('presentation');
    const [id] = await put([['text', { text: 'Delete me', x: 200, y: 200, w: 800, size: 80 }]]);
    await ev(() => { A.E.addPage(1); A.E.setPage(0); });
    await ev((i) => A.E.select([i]), id);
    await blur();
    await page.keyboard.press('Delete');
    await page.click('.tl-block >> nth=1');
    await page.keyboard.press('Control+z');
    const r = await ev(() => ({ pi: A.E.pi, sel: A.E.sel }));
    ok(r.pi === 0 && r.sel.includes(id) && (await state(id)).rendered, 'undo on another page', r);
  });

  await step('coreB: deleting a page keeps the active page and drops its comments (state-20, state-21)', async () => {
    await open('doc');
    await ev(() => { A.E.addPage(1); A.E.addPage(2); });
    const ids = await ev(() => A.E.d.pages.map((p) => p.id));
    await ev((pid) => { A.E.d.comments.push({ id: 'c_x', pageId: pid, elId: null, x: 100, y: 100, author: 'You', text: 'Fix this page', ts: Date.now(), replies: [], resolved: false }); A.E.setPage(1); }, ids[0]);
    await page.click('.page-block[data-pi="0"] button[title="Delete page"]');
    const r = await ev(() => ({ active: A.E.page().id, comments: A.E.d.comments.map((c) => c.pageId) }));
    ok(r.active === ids[1] && !r.comments.includes(ids[0]), 'after deleting page A', r);
  });

  await step('coreB: shortcuts still work after using a slider (state-22)', async () => {
    const [rid] = await put([['rect', { x: 100, y: 300, w: 200, h: 200 }]]);
    await clickEl(rid);
    await page.click('.ed-bottom .zoom-range');
    const x0 = await ev((i) => A.E.byId(i).x, rid);
    await page.keyboard.press('ArrowRight');
    ok((await ev((i) => A.E.byId(i).x, rid)) === x0, 'arrow on the slider nudged the element');
    await page.keyboard.press('Delete');
    ok(!(await ev((i) => !!A.E.byId(i), rid)), 'Delete ignored after slider');
    await page.keyboard.press('Control+z');
    ok(await ev((i) => !!A.E.byId(i), rid), 'Ctrl+Z ignored after slider');
  });

  await step('coreB: undo keeps a rename (ui-4)', async () => {
    await open('social');
    await page.click('.title-input', { clickCount: 3 });
    await page.keyboard.type('My New Title');
    await page.keyboard.press('Enter');
    await blur();
    await page.keyboard.press('r');
    await page.keyboard.press('Control+z');
    const t = await ev(() => ({ title: A.E.d.title, field: document.querySelector('.title-input').value }));
    ok(t.title === 'My New Title' && t.field === 'My New Title', 'title after undo', t);
  });

  await step('coreB: a typed font size goes to the element it was typed for (ui-1, text-17)', async () => {
    await open('social');
    const [a, b] = await put([['rect', { x: 100, y: 100, w: 300, h: 200, text: 'A', size: 60, color: '#fff' }], ['rect', { x: 600, y: 100, w: 300, h: 200, text: 'B', size: 60, color: '#fff' }]]);
    await clickEl(a);
    await page.click('.ed-toolbar input.fs', { clickCount: 3 });
    await page.keyboard.type('77');
    await clickEl(b);
    let r = await ev(([x, y]) => ({ a: A.E.byId(x).size, b: A.E.byId(y).size, sel: A.E.sel }), [a, b]);
    ok(r.a === 77 && r.b === 60 && r.sel[0] === b, 'size went to the wrong element', r);
    await page.click('.ed-toolbar input.fs', { clickCount: 3 });
    await page.keyboard.type('50');
    const fb = await page.locator('.page-block.active .page-frame').boundingBox();
    await page.mouse.click(fb.x + fb.width - 20, fb.y + fb.height - 20);
    r = await ev(([x, y]) => ({ a: A.E.byId(x).size, b: A.E.byId(y).size }), [a, b]);
    ok(r.a === 77 && r.b === 50, 'size lost on canvas click', r);
  });

  await step('coreB: Position panel follows Duplicate and drags (ui-5, ui-6)', async () => {
    const rid = await ev(() => A.E.els()[0].id);
    await clickEl(rid);
    await ev(() => { A.P.state.posTab = 'arrange'; A.EU.openPanel('position'); });
    await blur();
    await page.keyboard.press('Control+d');
    const dup = await ev(() => A.E.sel[0]);
    const x0 = await ev((i) => A.E.byId(i).x, rid);
    const xf = page.locator('.ed-panel label.field', { hasText: 'X' }).locator('input');
    await xf.fill('5');
    await xf.press('Enter');
    const r = await ev(([o, d]) => ({ orig: A.E.byId(o).x, dup: A.E.byId(d).x }), [rid, dup]);
    ok(r.dup === 5 && r.orig === x0, 'Position panel edited the original', r);
    const c = await center(dup);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 120, c.y + 40, { steps: 6 });
    await page.mouse.up();
    const live = await ev((i) => Math.round(A.E.byId(i).x * 10) / 10, dup);
    const shown = +(await page.locator('.ed-panel label.field', { hasText: 'X' }).locator('input').inputValue());
    ok(Math.abs(shown - live) < 0.2 && live !== 5, 'panel shows a stale X', { shown, live });
  });

  await step("coreB: 'Add text' on a shape with no fill picks readable text (ui-28)", async () => {
    const [rid] = await put([['rect', { x: 300, y: 600, w: 300, h: 200, fill: 'none', stroke: '#000', strokeWidth: 4 }]]);
    await clickEl(rid);
    await page.click('.ed-toolbar button[title="Add text"]');
    await page.waitForSelector('textarea.text-edit');
    ok((await ev((i) => A.E.byId(i).color, rid)) === '#1a1a1a', 'white text on a white page');
    await page.keyboard.press('Escape');
  });

  await step('coreB: shape and list text editors sit over the rendered text (text-14, text-15)', async () => {
    await open('social');
    const [rot, over, list] = await put([
      ['rect', { x: 100, y: 100, w: 500, h: 500, rot: 45, text: 'Hi', size: 60, align: 'center', color: '#fff' }],
      ['rect', { x: 650, y: 700, w: 300, h: 120, text: 'One\nTwo\nThree\nFour', size: 40, align: 'center', color: '#fff' }],
      ['text', { text: 'First point\nSecond point', x: 600, y: 120, w: 420, size: 40, list: 'bullet' }],
    ]);
    const mid = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    for (const id of [rot, over]) {
      const t = mid(await page.locator(`.page-svg [data-id="${id}"] text`).first().boundingBox());
      await edit(id);
      const a = mid(await page.locator('textarea.text-edit').boundingBox());
      ok(Math.hypot(t.x - a.x, t.y - a.y) < 8, 'editor off the rendered text', { id, t, a });
      await page.keyboard.press('Escape');
    }
    await edit(list);
    const g = await ev((i) => { const el = A.E.byId(i), r = A.E.textArea.getBoundingClientRect(), s = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { indent: r.left - s.left - el.x * A.E.zoom, w: r.width, full: el.w * A.E.zoom }; }, list);
    ok(g.indent > 5 && g.w < g.full - 5, 'list editor ignores the bullet indent', g);
    await page.keyboard.press('Escape');
  });

  await step("coreB: opening and closing without edits keeps 'last edited' (home-19)", async () => {
    const d = await ev(async () => {
      const d = A.M.newDesign({ type: 'social', title: 'Old untouched design' });
      d.thumb = 'data:image/png;base64,iVBORw0KGgo=';
      await A.S.put('designs', { ...d, updatedAt: Date.now() - 3 * 864e5 });
      return { id: d.id, t: Date.now() - 3 * 864e5 };
    });
    await ev((i) => A.app.go('#/design/' + i), d.id);
    await page.waitForFunction((i) => A.E.d?.id === i && document.querySelector('.page-svg'), d.id);
    await wait(1200);
    await page.click('.ed-top button[title="Home"]');
    await page.waitForSelector('.hero');
    const u = await ev(async (i) => (await A.S.get('designs', i)).updatedAt, d.id);
    ok(Math.abs(u - d.t) < 5000, 'updatedAt was bumped', { u, t: d.t });
  });

  await step('coreB: Back is not trapped by a trashed design (home-8)', async () => {
    await ev(() => A.app.go('#/templates'));
    await wait(300);
    const id = await ev(async () => { const d = A.M.newDesign({ type: 'social' }); await A.S.saveDesign(d); return d.id; });
    await ev((i) => A.app.go('#/design/' + i), id);
    await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev((i) => A.S.trashDesign(i), id);
    await clearToasts();
    await ev(() => history.back());
    await page.waitForSelector('.toast:has-text("could not be found")');
    await page.waitForFunction(() => location.hash === '#/home' && document.querySelector('.hero'));
    await wait(300);
    await ev(() => history.back());
    await page.waitForFunction(() => location.hash === '#/templates', null, { timeout: 3000 });
  });

  await step("coreB: a failed save is reported, not 'Saved' (rank 4)", async () => {
    await open('social');
    await ev(() => {
      window.__save = A.S.saveDesign;
      window.__err = console.error;
      console.error = () => {};
      A.S.saveDesign = () => Promise.reject(new DOMException('full', 'QuotaExceededError'));
    });
    let r;
    try {
      await blur();
      await page.keyboard.press('r');
      await clearToasts();
      await page.keyboard.press('Control+s');
      await page.waitForSelector('.toast.error', { timeout: 3000 });
      r = await ev(() => ({ saved: [...document.querySelectorAll('.toast.ok')].some((t) => t.textContent.includes('Saved')), icon: !!document.querySelector('.save-state.error') }));
    } finally {
      await ev(() => { A.S.saveDesign = window.__save; console.error = window.__err; });
    }
    ok(!r.saved && r.icon, 'failed save', r);
    ok(await ev(() => A.E.save()), 'save after recovery');
  });

  await step('coreB: an edit right before reload is kept (rank 4)', async () => {
    const id = await open('social');
    await blur();
    await page.keyboard.press('r');
    await wait(30);
    await page.reload();
    await page.waitForFunction(() => window.A?.S);
    const n = await ev(async (i) => (await A.S.get('designs', i)).pages[0].elements.length, id);
    ok(n === 1, 'edit lost on reload', n);
  });
}
