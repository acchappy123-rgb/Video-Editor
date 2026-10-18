// Wave 2 (arrange): align to page / selection / key object, distribute with exact spacing, tidy up and the power
// shortcuts (layer order, flip, lock, hide, align, copy/paste style, Tab cycling, entering and leaving groups).
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 80) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const open = async (type = 'presentation') => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev((t) => A.Home.newDesign({ type: t }), type);
    await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg') && A.E.blocks[0]?.svg.isConnected);
    await wait(300);
    await ev(() => A.U.closePop());
  };
  const blur = () => ev(() => document.activeElement?.blur?.());
  // add elements to the current page and leave them unselected; [kind, props] with kind a shape, 'text' or 'line'
  const put = (els) => ev((list) => {
    const ids = list.map(([kind, o]) => {
      const el = kind === 'text' ? A.M.newText(o) : kind === 'line' ? A.M.newLine(o) : A.M.newShape(kind, o);
      if (kind === 'text') el.h = A.R.textHeight(el);
      if (kind === 'line') A.M.syncLineBox(el);
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
  const clickEl = async (id, shift = false, button = 'left') => {
    const c = await center(id);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(c.x, c.y, { button });
    if (shift) await page.keyboard.up('Shift');
    await wait();
  };
  // client position of a page point on the active page
  const at = (x, y) => ev(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  const clickAt = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); await wait(); };
  const get = (id) => ev((i) => JSON.parse(JSON.stringify(A.E.byId(i))), id);
  const box = (id) => ev((i) => A.E.bbox(A.E.byId(i)), id);
  const hi = () => ev(() => A.E.hi);
  const sel = () => ev(() => A.E.sel.join());
  const index = (id) => ev((i) => A.E.els().findIndex((e) => e.id === i), id);
  const key = (k) => page.keyboard.press(k);
  const menuItems = () => ev(() => [...document.querySelectorAll('.popover .menu-item')].map((b) => [b.querySelector('.menu-label').textContent, b.querySelector('kbd')?.textContent || '']));
  const menu = async (label) => { await page.click(`.popover .menu-item:has(.menu-label:text-is("${label}"))`); await wait(); };
  // from the toolbar (a locked selection has no Position button there)
  const openPosition = async () => {
    if (!(await ev(() => A.EU.panelOpen && A.EU.panel === 'position'))) {
      if (await page.locator('.ed-toolbar button[title="Position"]').count()) await page.click('.ed-toolbar button[title="Position"]');
      else await ev(() => A.EU.openPanel('position'));
    }
    await page.waitForSelector('.ed-panel .arr-grid');
    await ev(() => { if (A.P.state.posTab !== 'arrange') { A.P.state.posTab = 'arrange'; A.EU.renderPanel(); } });
  };
  const panelBtn = (label) => page.click(`.ed-panel .arr-btn:has-text("${label}")`);
  const seg = (label) => page.click(`.ed-panel .seg.align-to .seg-btn:text-is("${label}")`);
  // a key event as a Mac keyboard sends it: Option changes e.key, e.code still names the key (modifiers: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift)
  const macKey = async (k, code, modifiers) => {
    const cdp = await page.context().newCDPSession(page);
    const vk = code.startsWith('Key') ? code.charCodeAt(3) : 0;
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: vk });
    await cdp.detach();
    await wait();
  };

  await step('arrange: "Align to page…" in the context menu aligns two shapes to the page in one undo step (rank 11)', async () => {
    await open();
    const [a, b] = await put([['rect', { x: 500, y: 300, w: 120, h: 120 }], ['rect', { x: 700, y: 500, w: 160, h: 100 }]]);
    await clickEl(a);
    await clickEl(b, true);
    ok((await sel()) === [a, b].join(), 'both not selected');
    const h0 = await hi();
    await clickEl(a, false, 'right');
    await page.waitForSelector('.popover .menu');
    const items = await menuItems();
    ok(items.some(([l]) => l === 'Align elements…') && items.some(([l]) => l === 'Align to page…'), 'context menu align entries', items);
    await menu('Align to page…');
    const sub = await menuItems();
    ok(sub[0][0] === 'Align left' && !sub[0][1] && (await page.locator('.popover .menu-head').textContent()) === 'Align to page', 'page variant shows Alt shortcuts for several elements', sub);
    await menu('Align left');
    let r = [await box(a), await box(b)];
    ok(r[0].x === 0 && r[1].x === 0 && r[0].y === 300 && r[1].y === 500, 'not aligned to the page', r);
    ok((await hi()) === h0 + 1, 'not one undo step', { h0, hi: await hi() });
    await clickEl(b, false, 'right');
    await menu('Align to page…');
    await menu('Align bottom');
    r = [await box(a), await box(b)];
    ok(r[0].y + r[0].h === 1080 && r[1].y + r[1].h === 1080, 'bottom', r);
    await blur();
    await key('Control+z');
    await key('Control+z');
    r = [await get(a), await get(b)];
    ok(r[0].x === 500 && r[1].x === 700 && r[0].y === 300 && r[1].y === 500, 'undo did not restore', r);
  });

  await step('arrange: context menu items show their shortcuts', async () => {
    await open();
    const [a] = await put([['rect', { x: 300, y: 300, w: 200, h: 200 }]]);
    await clickEl(a, false, 'right');
    const items = Object.fromEntries(await menuItems());
    const want = { 'Bring forward': 'Ctrl+]', 'Bring to front': 'Ctrl+Shift+]', 'Send backward': 'Ctrl+[', 'Send to back': 'Ctrl+Shift+[', 'Copy style': 'Ctrl+Alt+C', 'Paste style': 'Ctrl+Alt+V', Lock: 'Ctrl+Shift+L', Hide: 'Ctrl+Shift+H', 'Flip horizontal': 'Shift+H', 'Flip vertical': 'Shift+V', Duplicate: 'Ctrl+D' };
    for (const [l, k] of Object.entries(want)) ok(items[l] === k, 'shortcut for ' + l, items);
    ok(!('Align elements…' in items), 'Align elements… offered for one element');
    await menu('Align to page…');
    const sub = Object.fromEntries(await menuItems());
    ok(sub['Align left'] === 'Alt+A' && sub['Align centre'] === 'Alt+H' && sub['Align bottom'] === 'Alt+S' && !('Tidy up' in sub), 'single-element align menu', sub);
    await menu('Align centre');
    ok((await box(a)).x === 860, 'centre on the page', await box(a));
  });

  await step('arrange: the toolbar Align menu aligns to the selection; Alt+W / Alt+D align from the keyboard', async () => {
    await open();
    const [a, b] = await put([['rect', { x: 200, y: 300, w: 100, h: 100 }], ['ellipse', { x: 600, y: 150, w: 200, h: 120 }]]);
    await clickEl(a);
    await clickEl(b, true);
    await page.click('.ed-toolbar button[title="Align"]');
    const items = Object.fromEntries(await menuItems());
    ok(items['Align top'] === 'Alt+W' && 'Tidy up' in items && 'Distribute horizontally' in items, 'toolbar align menu', items);
    ok((await page.locator('.popover .menu-head').textContent()) === 'Align to selection', 'menu header');
    await menu('Align top');
    let r = [await box(a), await box(b)];
    ok(r[0].y === 150 && r[1].y === 150, 'align top to the selection', r);
    await blur();
    const h0 = await hi();
    await key('Alt+KeyD');
    r = [await box(a), await box(b)];
    ok(r[0].x + r[0].w === 800 && r[1].x + r[1].w === 800 && (await hi()) === h0 + 1, 'Alt+D aligns right edges in one step', r);
    await key('Alt+KeyV');
    r = [await box(a), await box(b)];
    ok(Math.abs(r[0].y + r[0].h / 2 - (r[1].y + r[1].h / 2)) < 0.01, 'Alt+V middle', r);
  });

  await step('arrange: Shift-click sets the key object (thicker outline); aligning to it leaves it in place (rank 11)', async () => {
    await open();
    const [a, b, c] = await put([['rect', { x: 200, y: 200, w: 150, h: 150 }], ['rect', { x: 600, y: 420, w: 150, h: 150 }], ['rect', { x: 1000, y: 600, w: 150, h: 150 }]]);
    await clickEl(a);
    ok((await page.locator('.sel-key').count()) === 0, 'key outline for one element');
    await clickEl(c, true);
    await clickEl(b, true);
    ok((await ev(() => A.E.keyId)) === b, 'key is not the last Shift-clicked', await ev(() => A.E.keyId));
    const kb = await page.locator('.sel-key').boundingBox(), eb = await page.locator(`.page-svg [data-id="${b}"]`).boundingBox();
    ok(kb && Math.abs(kb.x + kb.width / 2 - (eb.x + eb.width / 2)) < 2 && kb.width > eb.width, 'key outline not around B', { kb, eb });
    ok((await page.locator('.sel-key').evaluate((n) => parseFloat(getComputedStyle(n).borderTopWidth))) >= 2.5, 'key outline is not thicker');
    await openPosition();
    await seg('Key object');
    ok(await page.locator('.ed-panel .seg.align-to .seg-btn.on:text-is("Key object")').count(), 'Key object not chosen');
    ok((await page.locator('.ed-panel label.field:has-text("Key object") select').inputValue()) === b, 'key picker shows B');
    const h0 = await hi();
    await panelBtn('Top');
    let r = [await get(a), await get(b), await get(c)];
    ok(r[0].y === 420 && r[2].y === 420 && r[1].y === 420 && r[1].x === 600, 'not aligned to the key object', r);
    ok((await hi()) === h0 + 1, 'not one undo step');
    // the picker chooses another key (keyboard and touch users can't Shift-click)
    await page.selectOption('.ed-panel label.field:has-text("Key object") select', a);
    await panelBtn('Left');
    r = [await get(a), await get(b), await get(c)];
    ok(r[0].x === 200 && r[1].x === 200 && r[2].x === 200, 'not aligned to the picked key', r);
    // Shift-clicking the key out of the selection drops it, adding it back makes it the key again, a new selection has none
    await ev(([b, c]) => { A.E.byId(b).x = 600; A.E.byId(c).x = 1000; A.E.changed(); }, [b, c]);
    await clickEl(a, true);
    ok(!(await ev(() => A.E.keyUnit())) && (await page.locator('.sel-key').count()) === 0, 'key kept after removing it');
    await clickEl(a, true);
    ok((await ev(() => A.E.keyId)) === a && (await page.locator('.sel-key').count()) === 1, 'Shift-click did not make it the key');
    await clickAt(1700, 100);
    await clickEl(a);
    ok((await page.locator('.sel-key').count()) === 0 && !(await ev(() => A.E.keyId)), 'a new selection kept the key');
    await ev(() => (A.E.alignTo = 'selection'));
  });

  await step('arrange: Shift-click in the Layers list also sets the key object', async () => {
    await open();
    const [a, b] = await put([['rect', { x: 200, y: 200, w: 150, h: 150 }], ['rect', { x: 700, y: 500, w: 150, h: 150 }]]);
    await clickEl(a);
    await openPosition();
    await page.click('.ed-panel .p-tab:text-is("Layers")');
    // the top of the list is in front
    await page.click('.ed-panel .layer >> nth=0', { modifiers: ['Shift'] });
    ok((await sel()) === [a, b].join() && (await ev(() => A.E.keyId)) === b && (await page.locator('.sel-key').count()) === 1, 'Layers Shift-click', { sel: await sel(), key: await ev(() => A.E.keyId) });
    await page.click('.ed-panel .p-tab:text-is("Arrange")');
  });

  await step('arrange: Position panel "Align to: Page" aligns several elements to the page', async () => {
    await open();
    const [a, b] = await put([['rect', { x: 500, y: 300, w: 100, h: 100 }], ['rect', { x: 700, y: 500, w: 100, h: 100 }]]);
    await clickEl(a);
    await clickEl(b, true);
    await openPosition();
    ok((await page.locator('.ed-panel .p-sec-title').allTextContents()).includes('Align'), 'section title');
    await seg('Page');
    await panelBtn('Right');
    const r = [await box(a), await box(b)];
    ok(r[0].x === 1820 && r[1].x === 1820, 'not aligned to the page right edge', r);
    // the choice also drives Alt+letter
    await blur();
    await key('Alt+KeyW');
    const t = [await box(a), await box(b)];
    ok(t[0].y === 0 && t[1].y === 0, 'Alt+W did not follow Align to: Page', t);
    await seg('Selection');
    ok((await ev(() => A.E.alignTo)) === 'selection', 'Selection not chosen');
  });

  await step('arrange: Spacing 24 + Horizontally / Vertically places two elements exactly 24 apart (rank 11)', async () => {
    await open();
    const [a, b] = await put([['rect', { x: 300, y: 300, w: 200, h: 100 }], ['ellipse', { x: 900, y: 700, w: 150, h: 120 }]]);
    await clickEl(a);
    await clickEl(b, true);
    await openPosition();
    const gap = page.locator('.ed-panel .gap-field input');
    ok((await gap.getAttribute('placeholder')) === 'Auto', 'spacing placeholder');
    await gap.fill('24');
    const h0 = await hi();
    await panelBtn('Horizontally');
    let A1 = await box(a), B1 = await box(b);
    ok(B1.x === A1.x + A1.w + 24 && A1.x === 300, 'horizontal spacing', { A1, B1 });
    ok((await hi()) === h0 + 1, 'not one undo step');
    await panelBtn('Vertically');
    A1 = await box(a); B1 = await box(b);
    ok(B1.y === A1.y + A1.h + 24 && A1.y === 300, 'vertical spacing', { A1, B1 });
    // the typed spacing stays when the panel is drawn again
    await clickAt(1700, 1000);
    await clickEl(a);
    await clickEl(b, true);
    ok((await page.locator('.ed-panel .gap-field input').inputValue()) === '24', 'spacing forgotten');
    // empty: spread evenly between the outer two
    const [c] = await put([['rect', { x: 1500, y: 100, w: 100, h: 100 }]]);
    await ev((ids) => A.E.select(ids), [a, b, c]);
    await page.locator('.ed-panel .gap-field input').fill('');
    await panelBtn('Horizontally');
    const r = [await box(a), await box(b), await box(c)];
    const g1 = r[1].x - (r[0].x + r[0].w), g2 = r[2].x - (r[1].x + r[1].w);
    ok(Math.abs(g1 - g2) < 0.01 && r[0].x === 300 && r[2].x === 1500, 'even spread', r);
  });

  await step('arrange: a selected group aligns and spaces as one unit', async () => {
    await open();
    const [a, b, c] = await put([['rect', { x: 400, y: 300, w: 100, h: 100, groupId: 'g1' }], ['rect', { x: 560, y: 360, w: 100, h: 100, groupId: 'g1' }], ['rect', { x: 1200, y: 600, w: 100, h: 100 }]]);
    await clickEl(a);
    ok((await sel()) === [a, b].join(), 'group not selected');
    await blur();
    await key('Alt+KeyA');
    let r = [await get(a), await get(b)];
    ok(r[0].x === 0 && r[1].x === 160 && r[0].y === 300, 'the group did not move as one to the page', r);
    await clickEl(c, true);
    await openPosition();
    await page.locator('.ed-panel .gap-field input').fill('40');
    await panelBtn('Horizontally');
    r = [await get(a), await get(b), await get(c)];
    ok(r[0].x === 0 && r[1].x === 160 && r[2].x === 300, 'group spacing', r);
    await panelBtn('Top');
    r = [await get(a), await get(b), await get(c)];
    ok(r[0].y === 300 && r[1].y === 360 && r[2].y === 300, 'group kept its layout when aligned', r);
  });

  await step('arrange: Tidy up makes an evenly spaced grid, a row or a column', async () => {
    await open();
    const ids = await put([
      ['rect', { x: 100, y: 100, w: 100, h: 100 }], ['rect', { x: 330, y: 120, w: 100, h: 100 }], ['rect', { x: 520, y: 90, w: 100, h: 100 }],
      ['rect', { x: 110, y: 400, w: 100, h: 100 }], ['rect', { x: 300, y: 420, w: 100, h: 100 }], ['rect', { x: 560, y: 390, w: 100, h: 100 }],
    ]);
    await ev((i) => A.E.select(i), ids);
    await openPosition();
    await page.locator('.ed-panel .gap-field input').fill('');
    const h0 = await hi();
    await panelBtn('Tidy up');
    let r = await Promise.all(ids.map(get));
    // average gaps: (130 + 90 + 90 + 160) / 4 across, 390 - 220 down
    const xs = [100, 318, 536], ys = [90, 360];
    r.forEach((e, i) => ok(e.x === xs[i % 3] && e.y === ys[Math.floor(i / 3)], 'grid cell ' + i, r.map((e) => [e.x, e.y])));
    ok((await hi()) === h0 + 1, 'not one undo step');
    await page.locator('.ed-panel .gap-field input').fill('20');
    await panelBtn('Tidy up');
    r = await Promise.all(ids.map(get));
    r.forEach((e, i) => ok(e.x === 100 + (i % 3) * 120 && e.y === 90 + Math.floor(i / 3) * 120, 'spaced grid cell ' + i, r.map((e) => [e.x, e.y])));
    // a rough row (gaps 100 and 500 become 300 each, tops level), and a rough column (left edges level)
    const row = await put([['rect', { x: 300, y: 600, w: 100, h: 100 }], ['ellipse', { x: 100, y: 610, w: 100, h: 80 }], ['rect', { x: 900, y: 580, w: 150, h: 120 }]]);
    await ev((i) => A.E.select(i), row);
    await page.locator('.ed-panel .gap-field input').fill('');
    await panelBtn('Tidy up');
    r = await Promise.all(row.map(get));
    ok(r[1].x === 100 && r[0].x === 500 && r[2].x === 900 && r.every((e) => e.y === 580), 'row', r.map((e) => [e.x, e.y]));
    const col = await put([['rect', { x: 1500, y: 100, w: 100, h: 100 }], ['rect', { x: 1530, y: 500, w: 120, h: 100 }], ['rect', { x: 1480, y: 260, w: 80, h: 100 }]]);
    await ev((i) => A.E.select(i), col);
    await panelBtn('Tidy up');
    r = await Promise.all(col.map(get));
    ok(r.every((e) => e.x === 1480) && r[0].y === 100 && r[2].y === 300 && r[1].y === 500, 'column', r.map((e) => [e.x, e.y]));
  });

  await step('arrange: locked elements stay put and a locked page refuses align, spacing and tidy up', async () => {
    await open();
    const [a, b] = await put([['rect', { x: 100, y: 100, w: 100, h: 100, locked: true }], ['rect', { x: 500, y: 300, w: 100, h: 100 }]]);
    await clickEl(a);
    await clickEl(b, true);
    await blur();
    await key('Alt+KeyA');
    let r = [await get(a), await get(b)];
    ok(r[0].x === 100 && r[1].x === 100, 'the locked one moved or did not count', r);
    await openPosition();
    await panelBtn('Horizontally');
    ok((await get(b)).x === 100, 'distribute moved with one free element');
    await page.waitForSelector('.toast:has-text("2 or more unlocked")', { timeout: 1500 });
    await ev(() => { A.E.byId(A.E.sel[0]).locked = false; A.E.page().locked = true; A.E.changed({ structure: true }); });
    const h0 = await hi();
    await blur();
    await key('Alt+KeyD');
    await ev(() => { A.E.distribute('h', 10); A.E.tidy(); A.E.align('top', { to: 'page' }); });
    r = [await get(a), await get(b)];
    ok(r[0].x === 100 && r[1].x === 100 && r[1].y === 300 && (await hi()) === h0, 'locked page changed', r);
  });

  await step('arrange: Ctrl+] / Ctrl+[ and Ctrl+Shift+] / [ change the layer order (rank 12)', async () => {
    await open();
    const ids = await put([['rect', { x: 100, y: 100, w: 150, h: 150 }], ['rect', { x: 400, y: 100, w: 150, h: 150 }], ['rect', { x: 700, y: 100, w: 150, h: 150 }], ['rect', { x: 1000, y: 100, w: 150, h: 150 }]]);
    const m = ids[1];
    await clickEl(m);
    await blur();
    const h0 = await hi();
    await key('Control+BracketRight');
    ok((await index(m)) === 2 && (await hi()) === h0 + 1, 'Ctrl+] did not bring it forward one step', await index(m));
    await key('Control+Shift+BracketLeft');
    ok((await index(m)) === 0, 'Ctrl+Shift+[ did not send it to the back', await index(m));
    await key('Control+Shift+BracketRight');
    ok((await index(m)) === 3, 'Ctrl+Shift+] did not bring it to the front', await index(m));
    await key('Control+BracketLeft');
    ok((await index(m)) === 2, 'Ctrl+[ did not send it backward', await index(m));
    ok((await sel()) === m, 'selection lost');
    // Cmd on a Mac
    await macKey('[', 'BracketLeft', 4);
    ok((await index(m)) === 1, 'Cmd+[ did not send it backward', await index(m));
  });

  await step('arrange: Shift+H / Shift+V flip, Ctrl+Shift+L locks, Ctrl+Shift+H hides (rank 12)', async () => {
    await open();
    const [a, l] = await put([['rect', { x: 300, y: 300, w: 200, h: 120 }], ['line', { p1: { x: 800, y: 500 }, p2: { x: 1100, y: 600 } }]]);
    await clickEl(a);
    await blur();
    let h0 = await hi();
    await key('Shift+KeyH');
    ok((await get(a)).flipX === true && (await hi()) === h0 + 1, 'Shift+H did not flip horizontally');
    await key('Shift+KeyV');
    ok((await get(a)).flipY === true, 'Shift+V did not flip vertically');
    await key('Shift+KeyH');
    ok(!(await get(a)).flipX, 'Shift+H did not flip back');
    await key('Control+Shift+KeyL');
    ok((await get(a)).locked === true, 'Ctrl+Shift+L did not lock');
    h0 = await hi();
    await key('Shift+KeyV');
    await key('Control+Shift+KeyH');
    ok((await get(a)).flipY === true && !(await get(a)).hidden && (await hi()) === h0, 'a locked element was flipped or hidden');
    await key('Control+Shift+KeyL');
    ok(!(await get(a)).locked, 'Ctrl+Shift+L did not unlock');
    h0 = await hi();
    await key('Control+Shift+KeyH');
    ok((await get(a)).hidden === true && (await sel()) === a && (await hi()) === h0 + 1, 'Ctrl+Shift+H did not hide');
    ok(!(await page.locator(`.page-svg [data-id="${a}"]`).count()), 'hidden element still drawn');
    await key('Control+Shift+KeyH');
    ok(!(await get(a)).hidden, 'Ctrl+Shift+H did not show it again');
    // with nothing selected it brings the page's hidden elements back
    await key('Control+Shift+KeyH');
    await key('Escape');
    ok(!(await sel()), 'Esc did not deselect');
    await key('Control+Shift+KeyH');
    ok(!(await get(a)).hidden && (await sel()) === a, 'hidden elements not shown', await sel());
    // a line has no flip: no undo step
    await clickEl(l);
    await blur();
    h0 = await hi();
    await key('Shift+KeyH');
    ok((await hi()) === h0 && !(await get(l)).flipX, 'a line was flipped');
  });

  await step('arrange: Alt+A/D/W/S/H/V align one element to the page, Option+letter on a Mac too (rank 12)', async () => {
    await open();
    const [a] = await put([['rect', { x: 500, y: 300, w: 200, h: 100 }]]);
    await clickEl(a);
    await blur();
    const want = { KeyA: ['x', 0], KeyD: ['x', 1720], KeyW: ['y', 0], KeyS: ['y', 980], KeyH: ['x', 860], KeyV: ['y', 490] };
    for (const [code, [k, v]] of Object.entries(want)) {
      await key('Alt+' + code);
      ok((await get(a))[k] === v, 'Alt+' + code, await get(a));
    }
    // Option+A types 'å' on a Mac keyboard
    await macKey('å', 'KeyA', 1);
    ok((await get(a)).x === 0, 'Option+A did not align left', await get(a));
    await macKey('∂', 'KeyD', 1);
    ok((await get(a)).x === 1720, 'Option+D did not align right', await get(a));
    // a lone connector aligns by its drawn ends
    const [l] = await put([['line', { p1: { x: 300, y: 700 }, p2: { x: 700, y: 800 } }]]);
    await clickEl(l);
    await blur();
    await key('Alt+KeyA');
    ok((await box(l)).x === 0 && (await box(l)).w === 400, 'line not aligned', await box(l));
  });

  await step('arrange: Ctrl+Alt+C / Ctrl+Alt+V copy and paste style (rank 12)', async () => {
    await open();
    const [a, b] = await put([['rect', { x: 200, y: 200, w: 200, h: 200, fill: '#ff3131', strokeWidth: 6, stroke: '#000000' }], ['ellipse', { x: 800, y: 200, w: 200, h: 200, fill: '#38b6ff' }]]);
    await clickEl(a);
    await blur();
    await key('Control+Alt+KeyC');
    await page.waitForSelector('.toast:has-text("Style copied")', { timeout: 1500 });
    ok(!(await ev(() => A.E.clipFresh)), 'Ctrl+Alt+C copied the element');
    await clickEl(b);
    await blur();
    const h0 = await hi();
    await key('Control+Alt+KeyV');
    const r = await get(b);
    ok(r.fill === '#ff3131' && r.strokeWidth === 6 && (await hi()) === h0 + 1 && (await ev(() => A.E.els().length)) === 2, 'style not pasted (or the element was)', r);
    // Cmd+Option+V on a Mac
    await ev((i) => { A.E.byId(i).fill = '#00ff00'; A.E.changed(); }, b);
    await macKey('√', 'KeyV', 5);
    ok((await get(b)).fill === '#ff3131', 'Cmd+Option+V did not paste the style');
  });

  await step('arrange: Tab / Shift+Tab step through the elements, a group as one, skipping hidden ones (rank 12)', async () => {
    await open();
    const [a, g1, g2, h, c] = await put([['rect', { x: 100, y: 100, w: 150, h: 150 }], ['rect', { x: 400, y: 100, w: 150, h: 150, groupId: 'gg' }], ['rect', { x: 600, y: 100, w: 150, h: 150, groupId: 'gg' }], ['rect', { x: 900, y: 100, w: 150, h: 150, hidden: true }], ['rect', { x: 1200, y: 100, w: 150, h: 150 }]]);
    await clickAt(1700, 900);
    ok(!(await sel()), 'canvas click did not deselect');
    const h0 = await hi();
    await key('Tab');
    ok((await sel()) === a && (await ev(() => document.activeElement === document.body)), 'Tab did not select the first element', await sel());
    await key('Tab');
    ok((await sel()) === [g1, g2].join(), 'Tab did not select the group', await sel());
    await key('Tab');
    ok((await sel()) === c, 'Tab did not skip the hidden element', await sel());
    await key('Tab');
    ok((await sel()) === a, 'Tab did not wrap', await sel());
    await key('Shift+Tab');
    ok((await sel()) === c, 'Shift+Tab did not go back', await sel());
    await key('Shift+Tab');
    ok((await sel()) === [g1, g2].join(), 'Shift+Tab', await sel());
    ok((await hi()) === h0, 'Tab made an undo step');
    // the toolbar keeps Tab for moving between its controls
    await page.locator('.ed-toolbar button[title="Position"]').focus();
    await key('Tab');
    const f = await ev(() => ({ sel: A.E.sel.join(), inBar: !!document.activeElement.closest('.ed-toolbar') }));
    ok(f.sel === [g1, g2].join() && f.inBar, 'Tab in the toolbar changed the selection', f);
    await blur();
    await key('Escape');
    await key('Shift+Tab');
    ok((await sel()) === c, 'Shift+Tab with nothing selected should pick the last', await sel());
    // an element off-screen is scrolled into view
    await ev(() => A.E.setZoom(3));
    await key('Tab');
    const vis = await ev((i) => { const r = document.querySelector(`.page-svg [data-id="${i}"]`).getBoundingClientRect(), s = A.E.scrollEl.getBoundingClientRect(); return r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom; }, a);
    ok(vis && (await sel()) === a, 'Tab did not bring the element into view');
    await ev(() => { A.E.fit(); A.E.renderAll(); });
  });

  await step('arrange: Enter on a group selects inside it, Tab cycles its members, Esc / Shift+Enter go back (rank 12)', async () => {
    await open();
    const [a, b, c] = await put([['rect', { x: 200, y: 200, w: 150, h: 150, groupId: 'g1' }], ['text', { text: 'Member', x: 450, y: 220, w: 300, size: 50, groupId: 'g1' }], ['rect', { x: 1000, y: 200, w: 150, h: 150 }]]);
    await clickEl(a);
    ok((await sel()) === [a, b].join(), 'group not selected');
    await blur();
    await key('Enter');
    let s = await ev(() => ({ sel: A.E.sel.join(), g: A.E.enteredGroup, editing: A.E.editingId }));
    ok(s.sel === a && s.g === 'g1' && !s.editing, 'Enter did not enter the group', s);
    await key('Tab');
    ok((await sel()) === b, 'Tab inside the group', await sel());
    await key('Tab');
    ok((await sel()) === a, 'Tab left the group', await sel());
    await key('Escape');
    s = await ev(() => ({ sel: A.E.sel.join(), g: A.E.enteredGroup }));
    ok(s.sel === [a, b].join() && !s.g, 'Esc did not go back to the group', s);
    await key('Escape');
    ok(!(await sel()), 'second Esc did not deselect');
    await clickEl(c);
    await clickEl(a);
    await blur();
    await key('Enter');
    await key('Tab');
    ok((await sel()) === b, 'not on the text member');
    await key('Shift+Enter');
    ok((await sel()) === [a, b].join() && !(await ev(() => A.E.enteredGroup)), 'Shift+Enter did not go back to the group');
    // Enter on a text member inside the group edits it
    await key('Enter');
    await key('Tab');
    await key('Enter');
    await page.waitForSelector('textarea.text-edit');
    ok((await ev(() => A.E.editingId)) === b, 'Enter did not edit the member text');
    await key('Escape');
  });

  await step("arrange: the shortcuts don't fire while typing in fields or editing text", async () => {
    await open();
    const [a, t] = await put([['rect', { x: 300, y: 300, w: 200, h: 200 }], ['text', { text: 'Hello', x: 800, y: 300, w: 400, size: 60 }]]);
    await ev(() => (A.E.styleClip = null));
    await clickEl(a);
    const before = JSON.stringify(await get(a)), n0 = await index(a);
    await page.click('.title-input', { clickCount: 3 });
    await page.keyboard.type('HV [x]');
    await key('Alt+KeyA');
    await key('Control+BracketRight');
    await key('Control+Shift+KeyH');
    const title = await page.locator('.title-input').inputValue();
    ok(title === 'HV [x]' && JSON.stringify(await get(a)) === before && (await index(a)) === n0, 'typing in the title ran shortcuts', { title, a: await get(a) });
    await key('Enter');
    await blur();
    await clickEl(t);
    await blur();
    await key('Enter');
    await page.waitForSelector('textarea.text-edit');
    await key('End');
    await page.keyboard.type(' HV');
    await key('Alt+KeyA');
    await key('Shift+KeyH');
    await key('Control+Alt+KeyC');
    const r = await ev((i) => ({ el: A.E.byId(i), editing: A.E.editingId, clip: A.E.styleClip }), t);
    // Shift+H types an 'H'
    ok(r.editing === t && r.el.text === 'Hello HVH' && r.el.x === 800 && !r.el.flipX && !r.clip, 'shortcuts ran while editing text', r);
    await key('Escape');
  });

  await step('arrange: each arrange action is one undo step and redo puts it back', async () => {
    await open();
    const [a, b, c] = await put([['rect', { x: 100, y: 100, w: 100, h: 100 }], ['rect', { x: 500, y: 300, w: 100, h: 100 }], ['rect', { x: 900, y: 150, w: 100, h: 100 }]]);
    await blur();
    const snap = () => ev(() => JSON.stringify(A.E.els().map((e) => [e.x, e.y])));
    for (const act of [() => key('Alt+KeyS'), () => ev(() => A.E.distribute('v', 12)), () => ev(() => A.E.tidy())]) {
      // an undo selects only what it changed
      await ev((i) => A.E.select(i), [a, b, c]);
      const s0 = await snap(), h0 = await hi();
      await act();
      const s1 = await snap();
      ok(s1 !== s0 && (await hi()) === h0 + 1, 'not one step', { s0, s1 });
      await key('Control+z');
      ok((await snap()) === s0, 'undo');
      await key('Control+y');
      ok((await snap()) === s1, 'redo');
    }
  });

  await step('arrange: the shortcuts dialog lists the new shortcuts', async () => {
    await open();
    await page.click('.ed-top .top-btn:has-text("File")');
    await menu('Keyboard shortcuts');
    await page.waitForSelector('.modal .shortcuts');
    const rows = await ev(() => [...document.querySelectorAll('.modal .sc-row')].map((r) => r.textContent));
    for (const s of ['Bring forward / send backward', 'Bring to front / send to back', 'Flip horizontal / vertical', 'Lock / unlock', 'Hide / show', 'Copy / paste style', 'Align left / centre / right', 'Align top / middle / bottom', 'Select the next / previous element', 'Select inside the group', 'Back to the whole group'])
      ok(rows.some((r) => r.includes(s)), 'missing ' + s, rows);
    await key('Escape');
  });

  await step('arrange: the Position panel arrange controls work at phone width (390px)', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await open('social');
      const [a, b] = await put([['rect', { x: 300, y: 200, w: 200, h: 200 }], ['rect', { x: 600, y: 600, w: 200, h: 200 }]]);
      await clickEl(a);
      await clickEl(b, true);
      ok((await sel()) === [a, b].join(), 'not both selected');
      await page.locator('.ed-toolbar button[title="Position"]').scrollIntoViewIfNeeded();
      await openPosition();
      await page.locator('.ed-panel .seg.align-to').scrollIntoViewIfNeeded();
      const fit = await ev(() => { const p = document.querySelector('.ed-panel .panel-body'), s = document.querySelector('.ed-panel .seg.align-to').getBoundingClientRect(); return { over: p.scrollWidth - p.clientWidth, right: s.right, vw: innerWidth }; });
      ok(fit.over <= 1 && fit.right <= fit.vw, 'Position panel overflows at 390px', fit);
      await seg('Page');
      await page.locator('.ed-panel .arr-btn:has-text("Left")').scrollIntoViewIfNeeded();
      await panelBtn('Left');
      ok((await get(a)).x === 0 && (await get(b)).x === 0, 'not aligned to the page');
      await page.locator('.ed-panel .gap-field input').scrollIntoViewIfNeeded();
      await page.locator('.ed-panel .gap-field input').fill('30');
      await panelBtn('Vertically');
      ok((await get(b)).y === 430, 'spacing at phone width', await get(b));
      await seg('Selection');
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });
}
