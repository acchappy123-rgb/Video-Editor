// Wave 2 (selection, layers & text productivity): mixed-selection toolbar, Select similar, the Layers tree
// (rename, groups, range/toggle selection, drag and keyboard reorder, live refresh), find & replace and justified text.
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const open = async (type = 'presentation') => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev((t) => A.Home.newDesign({ type: t }), type);
    await page.waitForFunction(() => A.E.d && A.E.blocks[A.E.pi]?.svg.isConnected);
    await wait(300);
    await ev(() => document.activeElement?.blur?.());
  };
  // [kind, props] pairs onto the current page, unselected; returns their ids
  const put = (specs) => ev((specs) => {
    const M = A.M;
    const ids = specs.map(([kind, o]) => {
      const el = kind === 'text' ? M.newText(o) : kind === 'line' ? M.newLine(o) : M.newShape(kind, o);
      if (el.type === 'text') el.h = A.R.textHeight(el);
      if (el.type === 'line') M.syncLineBox(el);
      A.E.page().elements.push(el);
      return el.id;
    });
    A.E.sel = [];
    A.E.changed();
    return ids;
  }, specs);
  const center = async (id) => {
    const b = await page.locator(`.page-block.active .page-svg [data-id="${id}"]`).first().boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const clickEl = async (id, mod) => {
    const c = await center(id);
    if (mod) await page.keyboard.down(mod);
    await page.mouse.click(c.x, c.y);
    if (mod) await page.keyboard.up(mod);
    await wait();
  };
  const el = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.d.pages.flatMap((p) => p.elements).find((e) => e.id === id) || null)), id);
  const sel = () => ev(() => [...A.E.sel].sort());
  const hi = () => ev(() => A.E.hi);
  const tbTitles = () => ev(() => [...document.querySelectorAll('.ed-toolbar button')].map((b) => b.title));
  const tb = async (title) => { await page.click(`.ed-toolbar button[title="${title}"]`); await wait(); };
  const menu = async (label) => { await page.click(`.menu-item:has-text("${label}")`); await wait(250); };
  // with a selection through Position › Layers, without one from the empty canvas's context menu
  const layers = async () => {
    if (await ev(() => !A.E.sel.length)) {
      const b = await page.locator('.page-block.active .page-svg').boundingBox();
      await page.mouse.click(b.x + b.width - 8, b.y + b.height - 8, { button: 'right' });
      await wait();
      await menu('Layers');
    } else {
      if (!(await ev(() => A.EU.panelOpen && A.EU.panel === 'position'))) await tb('Position');
      await page.click('.panel-body .p-tab:has-text("Layers")');
      await wait();
    }
    ok(await ev(() => A.EU.panel === 'position' && !!document.querySelector('.ed-panel .layers')), 'Layers list not open');
  };
  const row = (key) => `.ed-panel .layer[data-key="${key}"]`;
  const rowKeys = () => ev(() => [...document.querySelectorAll('.ed-panel .layer')].map((r) => r.dataset.key));
  const order = () => ev(() => A.E.els().map((e) => e.id));

  await step('selection: a mixed selection shows Mixed and edits colour, font, size, transparency and shadow in one step each', async () => {
    await open();
    const [t1, t2, sh, ln] = await put([
      ['text', { text: 'Alpha', x: 100, y: 100, w: 500, size: 40, font: 'Inter', color: '#111111' }],
      ['text', { text: 'Beta', x: 100, y: 400, w: 500, size: 60, font: 'Georgia', color: '#111111' }],
      ['rect', { x: 900, y: 100, w: 300, h: 200, fill: '#ff0000', opacity: 0.5, shadow: true }],
      ['line', { p1: { x: 900, y: 600 }, p2: { x: 1500, y: 600 }, stroke: '#00ff00', strokeWidth: 12 }],
    ]);
    await clickEl(t1);
    await clickEl(sh, 'Shift');
    ok((await sel()).join() === [t1, sh].sort().join(), 'shift-click did not build the selection');
    let titles = await tbTitles();
    ok(titles.includes('Colour: Mixed') && titles.includes('Font') && titles.includes('Shadow: Mixed'), 'text + shape toolbar lacks the common controls', titles);
    ok(await ev(() => !!document.querySelector('.ed-toolbar .swatch.mixed')), 'mixed colour not drawn as mixed');
    ok((await ev(() => document.querySelector('.ed-toolbar .font-btn span').textContent)) === 'Inter', 'one text-like element: its font is shown');
    await clickEl(t2, 'Shift');
    ok((await ev(() => document.querySelector('.ed-toolbar .font-btn span').textContent)) === 'Mixed', 'differing fonts not shown as Mixed');
    ok((await ev(() => { const i = document.querySelector('.ed-toolbar input.fs'); return [i.value, i.placeholder]; })).join() === ',Mixed', 'differing sizes not shown as Mixed');
    // one colour for all: text colour for texts, fill for the shape
    let h0 = await hi();
    await tb('Colour: Mixed');
    await page.click('.cp-pop input.hex');
    await page.keyboard.type('#123456');
    await page.keyboard.press('Enter');
    await wait();
    await page.keyboard.press('Escape');
    let [a, b, s] = await Promise.all([el(t1), el(t2), el(sh)]);
    ok(a.color === '#123456' && b.color === '#123456' && s.fill === '#123456', 'colour not applied to each kind', [a.color, b.color, s.fill]);
    ok((await hi()) === h0 + 1, 'colour took more than one undo step', [h0, await hi()]);
    ok(!(await tbTitles()).includes('Colour: Mixed') && (await tbTitles()).includes('Colour'), 'shared colour still shown as Mixed');
    // font for both texts, the shape untouched
    h0 = await hi();
    await page.click('.ed-toolbar .font-btn');
    await page.click('.font-picker .font-item:text-is("Verdana")');
    await wait();
    [a, b, s] = await Promise.all([el(t1), el(t2), el(sh)]);
    ok(a.font === 'Verdana' && b.font === 'Verdana' && !s.font, 'font not applied to the texts only', [a.font, b.font, s.font]);
    ok((await hi()) === h0 + 1, 'font took more than one undo step');
    // size typed into the Mixed field
    h0 = await hi();
    await page.click('.ed-toolbar input.fs');
    await page.keyboard.type('50');
    await page.keyboard.press('Enter');
    await wait();
    [a, b, s] = await Promise.all([el(t1), el(t2), el(sh)]);
    ok(a.size === 50 && b.size === 50 && s.size === undefined, 'size not applied to the texts only', [a.size, b.size, s.size]);
    ok(Math.abs(a.h - (await ev((id) => A.R.textHeight(A.E.byId(id)), t1))) < 0.5, 'text box not refitted to the new size');
    ok((await hi()) === h0 + 1, 'size took more than one undo step');
    // transparency: the field says Mixed until a value is typed
    await page.click('.ed-toolbar button[title="Transparency"]');
    await wait();
    ok((await ev(() => document.querySelector('.slider-pop input.num').placeholder)) === 'Mixed', 'differing transparency not shown as Mixed');
    h0 = await hi();
    await page.click('.slider-pop input.num');
    await page.keyboard.type('40');
    await page.keyboard.press('Enter');
    await wait();
    await page.keyboard.press('Escape');
    [a, b, s] = await Promise.all([el(t1), el(t2), el(sh)]);
    ok([a, b, s].every((x) => Math.abs(x.opacity - 0.4) < 1e-9), 'transparency not applied to all', [a.opacity, b.opacity, s.opacity]);
    ok((await hi()) === h0 + 1, 'transparency took more than one undo step');
    // shadow: mixed turns on for all
    h0 = await hi();
    await tb('Shadow: Mixed');
    [a, b, s] = await Promise.all([el(t1), el(t2), el(sh)]);
    ok(a.shadow && b.shadow && s.shadow, 'shadow not turned on for all', [a.shadow, b.shadow, s.shadow]);
    ok((await hi()) === h0 + 1, 'shadow took more than one undo step');
    ok(await ev(() => document.querySelector('.ed-toolbar button[title="Shadow"]').classList.contains('on')), 'shared shadow not shown as on');
    // a line joins: its stroke takes the colour, and it has no shadow control of its own
    await clickEl(ln, 'Shift');
    ok((await sel()).length === 4, 'line not added to the selection');
    titles = await tbTitles();
    ok(titles.includes('Colour: Mixed'), 'line stroke not part of the shared colour', titles);
    await tb('Colour: Mixed');
    await page.click('.cp-pop .color-sw[title="#ff914d"]');
    await wait();
    await page.keyboard.press('Escape');
    const l = await el(ln);
    ok(l.stroke === '#ff914d' && !l.shadow, 'line colour/shadow wrong', [l.stroke, l.shadow]);
    // undo walks the steps back one at a time
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+z');
    ok((await el(ln)).stroke === '#00ff00' && (await el(t1)).color === '#123456' && (await el(t1)).shadow, 'one undo did not revert exactly the last colour');
  });

  await step('selection: several elements of one type show Mixed for the values that differ', async () => {
    await open();
    const [r1, r2] = await put([
      ['rect', { x: 100, y: 100, w: 300, h: 200, fill: '#ff0000' }],
      ['rect', { x: 600, y: 100, w: 300, h: 200, fill: '#0000ff', shadow: true }],
    ]);
    await clickEl(r1);
    await clickEl(r2, 'Shift');
    const titles = await tbTitles();
    ok(titles.includes('Fill colour: Mixed') && titles.includes('Shadow: Mixed'), 'same-type selection hides the difference', titles);
    await tb('Fill colour: Mixed');
    await page.click('.cp-pop .color-sw[title="#00bf63"]');
    await wait();
    await page.keyboard.press('Escape');
    ok((await el(r1)).fill === '#00bf63' && (await el(r2)).fill === '#00bf63', 'fill not applied to both');
    ok((await tbTitles()).includes('Fill colour'), 'shared fill still Mixed');
    // a locked member keeps the toolbar to Unlock
    await ev((id) => { A.E.byId(id).locked = true; A.E.changed(); }, r2);
    ok((await tbTitles()).includes('Unlock'), 'locked element in the selection is editable');
  });

  await step('selection: several texts – bold shows on only when all are bold, spacing shows Mixed', async () => {
    await open();
    const [a, b] = await put([
      ['text', { text: 'Bold one', x: 100, y: 100, w: 600, size: 50, bold: true, spacing: 100 }],
      ['text', { text: 'Plain one', x: 100, y: 400, w: 600, size: 50 }],
    ]);
    await clickEl(a);
    await clickEl(b, 'Shift');
    ok(!(await ev(() => document.querySelector('.ed-toolbar button[title="Bold (Ctrl+B)"]').classList.contains('on'))), 'bold shown on for a mixed selection');
    const h0 = await hi();
    await tb('Bold (Ctrl+B)');
    ok((await el(a)).bold && (await el(b)).bold && (await hi()) === h0 + 1, 'bold not set on both in one step');
    // Ctrl+B agrees with the button: all bold turns it off, a mix turns it on
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+b');
    ok(!(await el(a)).bold && !(await el(b)).bold, 'Ctrl+B on all-bold did not clear it');
    await ev((id) => { A.E.byId(id).bold = true; A.E.changed(); }, a);
    await page.keyboard.press('Control+b');
    ok((await el(a)).bold && (await el(b)).bold, 'Ctrl+B on a mix did not make all bold');
    await tb('Spacing');
    ok((await ev(() => [...document.querySelectorAll('.slider-pop input.num')].map((i) => i.placeholder || i.value))).join() === 'Mixed,1.3', 'letter spacing not Mixed / line spacing not shared');
    await page.keyboard.press('Escape');
  });

  await step('selection: Select similar (context menu and quick menu) picks the same type with the same fill or font', async () => {
    await open();
    const [a, b, c, d, t1, t2, t3, hid] = await put([
      ['rect', { x: 100, y: 100, w: 200, h: 150, fill: '#ff0000' }],
      ['rect', { x: 400, y: 100, w: 200, h: 150, fill: '#ff0000' }],
      ['ellipse', { x: 700, y: 100, w: 200, h: 150, fill: '#ff0000' }],
      ['rect', { x: 1000, y: 100, w: 200, h: 150, fill: '#0000ff' }],
      ['text', { text: 'One', x: 100, y: 500, w: 300, size: 40, font: 'Inter' }],
      ['text', { text: 'Two', x: 500, y: 500, w: 300, size: 40, font: 'Inter', color: '#ff0000' }],
      ['text', { text: 'Three', x: 900, y: 500, w: 300, size: 40, font: 'Georgia' }],
      ['rect', { x: 1300, y: 100, w: 200, h: 150, fill: '#ff0000', hidden: true }],
    ]);
    const ca = await center(a);
    await page.mouse.click(ca.x, ca.y, { button: 'right' });
    await wait();
    await menu('Select similar');
    ok((await sel()).join() === [a, b, c].sort().join(), 'similar shapes wrong (same fill, visible)', await sel());
    // the quick menu, from a text: the same font
    await clickEl(t1);
    await page.keyboard.press('/');
    await page.waitForSelector('.modal .qm-list');
    await page.keyboard.type('similar');
    await page.keyboard.press('Enter');
    await wait();
    ok((await sel()).join() === [t1, t2].sort().join(), 'similar texts wrong (same font)', await sel());
    // two looks at once: each brings its own
    await clickEl(t3);
    await clickEl(d, 'Shift');
    await page.mouse.click(...Object.values(await center(d)), { button: 'right' });
    await wait();
    await menu('Select similar');
    ok((await sel()).join() === [t3, d].sort().join(), 'similar of two looks wrong', await sel());
    ok(!(await sel()).includes(hid), 'hidden element selected');
    // Select all on page is still there
    await page.mouse.click(...Object.values(await center(a)), { button: 'right' });
    await wait();
    await menu('Select all on page');
    ok((await sel()).length === 7, 'select all on page broken', await sel());
  });

  await step('selection: clicking a table on another page keeps the Table panel open on it', async () => {
    await open('doc');
    await ev(() => {
      const M = A.M, d = A.E.d;
      d.pages.push(M.newPage({}));
      d.pages[0].elements.push(M.newTable(2, 2, { id: 'tb1', x: 100, y: 100, w: 500, h: 120 }));
      d.pages[1].elements.push(M.newTable(2, 2, { id: 'tb2', x: 100, y: 100, w: 500, h: 120 }));
      A.E.changed({ structure: true });
    });
    await wait(300);
    await page.locator('.page-svg [data-id="tb1"]').click();
    await tb('Edit table');
    ok((await ev(() => A.EU.panel)) === 'table', 'table panel not open');
    await page.locator('.page-svg [data-id="tb2"]').click();
    await wait();
    ok((await ev(() => [A.EU.panel, A.E.pi, A.E.sel.join()])).join() === 'table,1,tb2', 'table panel lost on a click on another page', await ev(() => [A.EU.panel, A.E.pi, A.E.sel]));
  });

  await step('layers: double-click renames (one undo step), Esc cancels, empty restores, and the name shows in comments and find', async () => {
    await open();
    const [t, r] = await put([
      ['text', { text: 'Big headline here', x: 100, y: 100, w: 800, size: 60 }],
      ['rect', { x: 100, y: 500, w: 300, h: 200 }],
    ]);
    await clickEl(r);
    await layers();
    ok((await rowKeys()).join() === [r, t].join(), 'rows not front to back', await rowKeys());
    ok((await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"] .layer-name`).textContent, t)) === '“Big headline here”', 'default text layer name');
    const h0 = await hi();
    await page.dblclick(row(t) + ' .layer-name');
    await page.waitForSelector('.ed-panel .layer-input');
    ok(await ev(() => document.activeElement.classList.contains('layer-input')), 'rename field not focused');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Hero title');
    await page.keyboard.press('Enter');
    await wait();
    ok((await el(t)).name === 'Hero title', 'name not saved', await el(t));
    ok((await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"] .layer-name`).textContent, t)) === 'Hero title', 'row not showing the new name');
    ok((await hi()) === h0 + 1, 'rename took more than one undo step', [h0, await hi()]);
    ok(await ev((k) => document.activeElement?.dataset.key === k, t), 'focus not back on the row after Enter');
    // Esc puts the old name back
    await page.keyboard.press('F2');
    await page.waitForSelector('.ed-panel .layer-input');
    await page.keyboard.type('Nope');
    await page.keyboard.press('Escape');
    await wait();
    ok((await el(t)).name === 'Hero title' && (await hi()) === h0 + 1, 'Esc did not cancel the rename');
    // the name goes where layer names appear: comments and the find bar
    await clickEl(t);
    await page.mouse.click(...Object.values(await center(t)), { button: 'right' });
    await wait();
    await menu('Comment');
    await page.waitForSelector('.panel-body textarea');
    ok(await ev(() => document.querySelector('.panel-body .p-sec-title').textContent.includes('Hero title')), 'new comment not titled with the layer name');
    await page.keyboard.type('Check this');
    await page.click('.panel-body button.btn.primary:text-is("Comment")');
    await wait();
    ok(await ev(() => [...document.querySelectorAll('.comment .c-head')].some((x) => x.textContent.includes('Hero title'))), 'comment head lacks the layer name');
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+f');
    await page.keyboard.type('headline');
    await wait();
    ok((await ev(() => document.querySelector('.find-count').title)).includes('Hero title'), 'find result not named by its layer');
    await page.keyboard.press('Escape');
    // an empty name goes back to the default
    await layers();
    await page.dblclick(row(t) + ' .layer-name');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await wait();
    ok(!('name' in (await el(t))), 'empty name kept', await el(t));
    ok((await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"] .layer-name`).textContent, t)).startsWith('“Big'), 'default name not back');
    // the context menu's Rename… opens the field too
    await clickEl(r);
    await page.mouse.click(...Object.values(await center(r)), { button: 'right' });
    await wait();
    await menu('Rename');
    await page.waitForSelector('.ed-panel .layer-input');
    await page.keyboard.type('Box');
    await page.keyboard.press('Enter');
    await wait();
    ok((await el(r)).name === 'Box', 'context-menu rename failed');
    // a locked element or page refuses
    await ev((id) => { A.E.byId(id).locked = true; A.E.changed(); }, r);
    await page.dblclick(row(r) + ' .layer-name');
    await wait();
    ok(!(await ev(() => !!document.querySelector('.ed-panel .layer-input'))), 'locked element opened a rename field');
    await ev(() => { A.E.page().locked = true; A.E.changed({ structure: true }); });
    await page.dblclick(row(t) + ' .layer-name');
    await wait();
    ok(!(await ev(() => !!document.querySelector('.ed-panel .layer-input'))), 'locked page opened a rename field');
  });

  await step('layers: groups are collapsible rows with their members; group and member rows select as on the canvas', async () => {
    await open();
    const [a, b, c] = await put([
      ['rect', { x: 100, y: 100, w: 200, h: 200, fill: '#ff0000' }],
      ['rect', { x: 400, y: 100, w: 200, h: 200, fill: '#00ff00' }],
      ['rect', { x: 700, y: 100, w: 200, h: 200, fill: '#0000ff' }],
    ]);
    await clickEl(a);
    await clickEl(b, 'Shift');
    await page.keyboard.press('Control+g');
    await wait();
    const gid = (await el(a)).groupId;
    ok(gid && gid === (await el(b)).groupId, 'not grouped');
    await layers();
    ok((await rowKeys()).join() === [c, 'g:' + gid, b, a].join(), 'group row with members not listed', await rowKeys());
    ok(await ev(([ga, gb]) => [...document.querySelectorAll('.ed-panel .layer.member')].map((r) => r.dataset.key).join() === [gb, ga].join(), [a, b]), 'members not indented under the group');
    ok((await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"] .layer-count`).textContent, 'g:' + gid)) === '2', 'group count');
    // collapse and expand with the caret
    await page.click(row('g:' + gid) + ' .layer-caret');
    await wait();
    ok((await rowKeys()).join() === [c, 'g:' + gid].join(), 'collapse did not hide the members', await rowKeys());
    ok((await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"]`).getAttribute('aria-expanded'), 'g:' + gid)) === 'false', 'aria-expanded');
    await page.click(row('g:' + gid) + ' .layer-caret');
    await wait();
    ok((await rowKeys()).length === 4, 'expand did not show the members');
    // a member row selects just it, inside the group; the group row selects the whole group
    await page.click(row(a) + ' .layer-name');
    await wait();
    ok((await sel()).join() === a && (await ev(() => A.E.enteredGroup)) === gid, 'member row did not select inside the group', [await sel(), await ev(() => A.E.enteredGroup)]);
    ok(await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"]`).classList.contains('part'), 'g:' + gid), 'group row not marked partly selected');
    await page.click(row('g:' + gid) + ' .layer-name');
    await wait();
    ok((await sel()).join() === [a, b].sort().join() && !(await ev(() => A.E.enteredGroup)), 'group row did not select the group');
    ok(await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"]`).classList.contains('on'), 'g:' + gid), 'group row not marked selected');
    // renaming the group names it on its members, and ungrouping drops the name
    await page.dblclick(row('g:' + gid) + ' .layer-name');
    await page.keyboard.type('Logo');
    await page.keyboard.press('Enter');
    await wait();
    ok((await el(a)).groupName === 'Logo' && (await el(b)).groupName === 'Logo', 'group name not saved');
    ok((await ev((k) => document.querySelector(`.ed-panel .layer[data-key="${k}"] .layer-name`).textContent, 'g:' + gid)) === 'Logo', 'group row not renamed');
    // hide on the group row hides all members (one step)
    const h0 = await hi();
    await page.click(row('g:' + gid) + ' button[title="Hide"]');
    await wait();
    ok((await el(a)).hidden && (await el(b)).hidden && !(await el(c)).hidden, 'group hide wrong');
    ok((await hi()) === h0 + 1, 'group hide took more than one step');
    await page.click(row('g:' + gid) + ' button[title="Show"]');
    await wait();
    await page.click(row('g:' + gid) + ' .layer-name');
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+Shift+g');
    await wait();
    ok(!(await el(a)).groupName && !(await el(a)).groupId, 'ungroup kept the group name');
    ok((await rowKeys()).join() === [c, b, a].join(), 'ungrouped rows not flat', await rowKeys());
  });

  await step('layers: Shift-click selects a range, Ctrl-click toggles, and canvas selection updates rows in place', async () => {
    await open();
    const ids = await put([1, 2, 3, 4, 5].map((i) => ['rect', { x: 100 + i * 220, y: 200, w: 180, h: 180 }]));
    await layers();
    const keys = await rowKeys();
    ok(keys.join() === [...ids].reverse().join(), 'rows not front to back');
    await page.click(row(keys[1]) + ' .layer-name');
    await page.keyboard.down('Shift');
    await page.click(row(keys[3]) + ' .layer-name');
    await page.keyboard.up('Shift');
    await wait();
    ok((await sel()).join() === keys.slice(1, 4).sort().join(), 'shift range wrong', await sel());
    // the range runs from the anchor, so a second Shift-click re-ranges
    await page.keyboard.down('Shift');
    await page.click(row(keys[0]) + ' .layer-name');
    await page.keyboard.up('Shift');
    await wait();
    ok((await sel()).join() === keys.slice(0, 2).sort().join(), 'shift range not from the anchor', await sel());
    await page.keyboard.down('Control');
    await page.click(row(keys[4]) + ' .layer-name');
    await page.click(row(keys[0]) + ' .layer-name');
    await page.keyboard.up('Control');
    await wait();
    ok((await sel()).join() === [keys[1], keys[4]].sort().join(), 'ctrl toggle wrong', await sel());
    // a canvas click re-marks the same row nodes
    await ev(() => document.querySelectorAll('.ed-panel .layer').forEach((r) => (r._mark = 1)));
    await clickEl(keys[2]);
    const st = await ev(() => [...document.querySelectorAll('.ed-panel .layer')].map((r) => [r._mark, r.classList.contains('on')]));
    ok(st.every((x) => x[0] === 1), 'rows rebuilt for a selection change');
    ok(st.map((x) => x[1]).join() === 'false,false,true,false,false', 'row marks not updated', st);
    // a range after a canvas click starts at what the canvas selected
    await page.keyboard.down('Shift');
    await page.click(row(keys[4]) + ' .layer-name');
    await page.keyboard.up('Shift');
    await wait();
    ok((await sel()).join() === keys.slice(2).sort().join(), 'shift range after a canvas click', await sel());
    // a new element appears at once (live refresh)
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('r');
    await wait();
    ok((await rowKeys()).length === 6, 'new element not listed live', await rowKeys());
    ok(await ev(() => document.querySelector('.ed-panel .layer').classList.contains('on')), 'new element row not marked selected');
    // switching page lists that page
    await ev(() => { A.E.addPage(1); });
    await wait(300);
    ok((await rowKeys()).length === 0 && (await ev(() => !!document.querySelector('.ed-panel .layers p.muted'))), 'new page still lists the old layers');
    await page.click('.tl-block >> nth=0');
    await wait(300);
    ok((await ev(() => A.E.pi)) === 0 && (await rowKeys()).length === 6, 'going back to page 1 did not list its layers', await rowKeys());
  });

  await step('layers: drag reorders across the list (one step), moves members out of and into groups, and respects locks', async () => {
    await open();
    const [a, b, c, d] = await put([
      ['rect', { x: 100, y: 200, w: 180, h: 180, fill: '#ff0000' }],
      ['rect', { x: 400, y: 200, w: 180, h: 180, fill: '#00ff00' }],
      ['rect', { x: 700, y: 200, w: 180, h: 180, fill: '#0000ff' }],
      ['rect', { x: 1000, y: 200, w: 180, h: 180, fill: '#ffff00' }],
    ]);
    await layers();
    const drag = async (from, to, where = 'above') => {
      const s = await page.locator(row(from) + ' .layer-name').boundingBox(), t = await page.locator(row(to)).boundingBox();
      await page.mouse.move(s.x + 10, s.y + s.height / 2);
      await page.mouse.down();
      await page.mouse.move(s.x + 14, s.y + s.height / 2 + 4, { steps: 3 });
      const y = where === 'above' ? t.y + 5 : t.y + t.height - 5;
      await page.mouse.move(t.x + 60, y, { steps: 8 });
      await page.mouse.up();
      await wait(250);
    };
    // bottom (a, the back) to the top of the list: to the front
    let h0 = await hi();
    await drag(a, d, 'above');
    ok((await order()).join() === [b, c, d, a].join(), 'drag to the top did not bring it to the front', await order());
    ok((await rowKeys())[0] === a, 'list not refreshed after the drop');
    ok((await hi()) === h0 + 1, 'drag took more than one undo step');
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+z');
    ok((await order()).join() === [a, b, c, d].join(), 'undo did not restore the order', await order());
    // group c+d, drag b in among the members: it joins; drag it out below a: it leaves
    await ev(([c, d]) => { A.E.byId(c).groupId = A.E.byId(d).groupId = 'g_test'; A.E.changed(); }, [c, d]);
    await wait();
    ok((await rowKeys()).join() === ['g:g_test', d, c, b, a].join(), 'group rows', await rowKeys());
    await drag(b, c, 'above');
    ok((await el(b)).groupId === 'g_test', 'element dropped among members did not join the group');
    ok((await order()).join() === [a, c, b, d].join(), 'joined element not between the members', await order());
    await drag(b, a, 'below');
    ok(!(await el(b)).groupId && (await order()).join() === [b, a, c, d].join(), 'element dragged out kept its group or position', [await el(b), await order()]);
    // a group dragged moves whole; dropped on another row it stays its own group
    await drag('g:g_test', a, 'below');
    ok((await order()).join() === [b, c, d, a].join(), 'group did not move whole', await order());
    ok((await el(c)).groupId === 'g_test' && (await el(d)).groupId === 'g_test', 'group membership changed');
    // dragging one of two members out dissolves the group
    await drag(c, a, 'above');
    ok(!(await el(c)).groupId && !(await el(d)).groupId, 'one-member group left behind', [await el(c), await el(d)]);
    // locks: a locked element does not move, a locked page refuses any drop
    const before = (await order()).join();
    await ev((id) => { A.E.byId(id).locked = true; A.E.changed(); }, b);
    await drag(b, (await rowKeys())[0], 'above');
    ok((await order()).join() === before, 'locked element moved');
    await ev(() => { A.E.page().locked = true; A.E.changed({ structure: true }); });
    await drag(a, (await rowKeys())[0], 'above');
    ok((await order()).join() === before, 'locked page reordered');
  });

  await step('layers: keyboard – arrows move focus, Enter selects, Alt+arrows reorder, F2 renames, arrows never nudge', async () => {
    await open();
    const [a, b, c] = await put([
      ['rect', { x: 100, y: 200, w: 180, h: 180 }],
      ['rect', { x: 400, y: 200, w: 180, h: 180 }],
      ['rect', { x: 700, y: 200, w: 180, h: 180 }],
    ]);
    await layers();
    await page.focus(row(c));
    await page.keyboard.press('ArrowDown');
    ok(await ev((k) => document.activeElement.dataset.key === k, b), 'ArrowDown did not move focus');
    await page.keyboard.press('Enter');
    await wait();
    ok((await sel()).join() === b, 'Enter did not select the row');
    const x0 = (await el(b)).x;
    await page.keyboard.press('Shift+ArrowDown');
    await wait();
    ok((await el(b)).x === x0 && (await ev((k) => document.activeElement.dataset.key === k, a)), 'arrow on a row nudged or lost focus');
    await page.keyboard.press('Shift+Enter');
    await wait();
    ok((await sel()).join() === [a, b].sort().join(), 'Shift+Enter did not select the range');
    await page.keyboard.press('Home');
    ok(await ev((k) => document.activeElement.dataset.key === k, c), 'Home');
    const h0 = await hi();
    await page.keyboard.press('Alt+ArrowDown');
    await wait();
    ok((await order()).join() === [a, c, b].join(), 'Alt+ArrowDown did not send it back', await order());
    ok(await ev((k) => document.activeElement.dataset.key === k, c), 'focus did not follow the moved row');
    ok((await hi()) === h0 + 1, 'keyboard move took more than one step');
    await page.keyboard.press('Alt+ArrowUp');
    await wait();
    ok((await order()).join() === [a, b, c].join(), 'Alt+ArrowUp did not bring it forward', await order());
    await page.keyboard.press('F2');
    await page.keyboard.type('Top');
    await page.keyboard.press('Enter');
    await wait();
    ok((await el(c)).name === 'Top', 'F2 rename failed');
    // Delete on a focused row deletes the selection as anywhere on the canvas
    await page.keyboard.press('Enter');
    await page.keyboard.press('Delete');
    await wait();
    ok(!(await el(c)), 'Delete with a row focused did nothing');
  });

  await step('find: Ctrl+F finds text, shape text and table cells across pages; next/previous select and show the match', async () => {
    await open();
    await ev(() => {
      const M = A.M, d = A.E.d;
      while (d.pages.length < 3) d.pages.push(M.newPage({}));
      const t = (o) => { const el = M.newText(o); el.h = A.R.textHeight(el); return el; };
      d.pages[0].elements.push(t({ id: 'f1', text: 'Hello world', x: 100, y: 100, w: 900, size: 60 }), t({ id: 'fh', text: 'hello hidden', x: 100, y: 400, w: 900, size: 60, hidden: true }));
      d.pages[1].elements.push(M.newShape('rect', { ...M.textDefaults, id: 'f2', x: 100, y: 100, w: 700, h: 300, fill: '#ffde59', text: 'hello there', align: 'center' }));
      d.pages[1].elements.push(M.newTable(2, 2, { id: 'f3', x: 100, y: 600, w: 600, h: 120, cells: [['Say Hello', '=hello'], ['x', 'y']] }));
      d.pages[2].elements.push(t({ id: 'f4', text: 'Othello', x: 100, y: 100, w: 900, size: 60 }));
      A.E.sel = [];
      A.E.changed({ structure: true });
    });
    await wait(300);
    await page.keyboard.press('Control+f');
    await page.waitForSelector('.find-bar');
    ok(await ev(() => document.activeElement.classList.contains('find-q')), 'find field not focused');
    await page.keyboard.type('hello');
    await wait();
    const count = () => ev(() => document.querySelector('.find-count').textContent);
    ok((await count()) === '1 of 4', 'count wrong (hidden and formula cells are left out)', await count());
    ok((await sel()).join() === 'f1' && (await ev(() => A.E.pi)) === 0, 'first match not selected');
    await page.keyboard.press('Enter');
    await wait();
    ok((await sel()).join() === 'f2' && (await ev(() => A.E.pi)) === 1 && (await count()) === '2 of 4', 'next did not go to the shape on page 2', [await sel(), await count()]);
    await page.keyboard.press('Enter');
    await wait();
    ok((await sel()).join() === 'f3' && (await count()) === '3 of 4', 'table cell not found');
    await page.click('.find-bar button[title="Next (Enter)"]');
    await wait();
    ok((await sel()).join() === 'f4' && (await ev(() => A.E.pi)) === 2, 'next button');
    ok(await ev(() => { const b = document.querySelector('.page-block.active .sel-box').getBoundingClientRect(), s = A.E.scrollEl.getBoundingClientRect(); return b.top >= s.top && b.bottom <= s.bottom; }), 'match not scrolled into view');
    await page.click('.find-bar .find-q');
    await page.keyboard.press('Enter');
    await wait();
    ok((await sel()).join() === 'f1' && (await count()) === '1 of 4', 'next did not wrap to the first');
    await page.keyboard.press('Shift+Enter');
    await wait();
    ok((await sel()).join() === 'f4', 'previous did not wrap to the last');
    ok(await ev(() => document.activeElement.classList.contains('find-q')), 'find field lost focus while moving');
    // match case and whole word
    await page.click('.find-bar label:has-text("Match case") input');
    await wait();
    ok((await count()).endsWith('of 2'), 'match case count', await count());
    await page.click('.find-bar label:has-text("Match case") input');
    await page.click('.find-bar label:has-text("Whole word") input');
    await wait();
    ok((await count()).endsWith('of 3'), 'whole word count', await count());
    ok(!(await sel()).includes('f4'), 'whole word matched inside Othello');
    await page.click('.find-bar label:has-text("Whole word") input');
    // Esc closes; Ctrl+F in a text being edited searches for its selection
    await page.keyboard.press('Escape');
    ok(!(await ev(() => !!document.querySelector('.find-bar'))), 'Esc did not close the bar');
    await ev(() => A.E.setPage(2));
    await wait(300);
    await page.dblclick(`.page-block.active .page-svg [data-id="f4"]`);
    await page.waitForSelector('textarea.text-edit');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Control+f');
    await wait();
    ok((await ev(() => [document.querySelector('.find-q').value, !A.E.editingId])).join() === 'Ot,true', 'Ctrl+F in text did not search its selection');
    await page.keyboard.press('Escape');
  });

  await step('find: replace one at a time and replace all as one undo step; locked pages and elements keep their text', async () => {
    await open();
    await ev(() => {
      const M = A.M, d = A.E.d;
      while (d.pages.length < 3) d.pages.push(M.newPage({}));
      const t = (o) => { const el = M.newText(o); el.h = A.R.textHeight(el); return el; };
      d.pages[0].elements.push(t({ id: 'r1', text: 'cat and cat', x: 100, y: 100, w: 900, size: 60 }));
      d.pages[1].elements.push(M.newShape('rect', { ...M.textDefaults, id: 'r2', x: 100, y: 100, w: 700, h: 300, text: 'Cat nap', align: 'center' }));
      d.pages[1].elements.push(M.newTable(2, 2, { id: 'r3', x: 100, y: 600, w: 600, h: 120, cells: [['cat', 'dog'], ['=cat', 'concat']] }));
      d.pages[2].elements.push(t({ id: 'r4', text: 'locked cat', x: 100, y: 100, w: 900, size: 60 }), t({ id: 'r5', text: 'cat locked', x: 100, y: 400, w: 900, size: 60, locked: true }));
      A.E.sel = [];
      A.E.changed({ structure: true });
    });
    await wait(300);
    await page.keyboard.press('Control+h');
    await page.waitForSelector('.find-bar.replace');
    // the last search is kept, so Ctrl+H goes straight to the replace field
    ok(await ev(() => document.activeElement.classList.contains('find-r') && document.querySelector('.find-q').value === 'Ot'), 'Ctrl+H did not go to the replace field');
    await page.click('.find-bar .find-q');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('cat');
    await page.click('.find-bar .find-r');
    await page.keyboard.type('dog');
    ok((await ev(() => document.querySelector('.find-count').textContent)) === '1 of 7', 'count', await ev(() => document.querySelector('.find-count').textContent));
    // Enter in the replace field replaces the current match and moves on
    let h0 = await hi();
    await page.keyboard.press('Enter');
    await wait();
    ok((await el('r1')).text === 'dog and cat', 'replace one', (await el('r1')).text);
    ok((await hi()) === h0 + 1, 'replace one took more than one step');
    ok((await ev(() => document.querySelector('.find-count').textContent)) === '1 of 6', 'did not move on to the next match', await ev(() => document.querySelector('.find-count').textContent));
    await page.click('.find-bar button:text-is("Replace")');
    await wait();
    ok((await el('r1')).text === 'dog and dog', 'replace button', (await el('r1')).text);
    // replace all: one step, locked page and element untouched, formulas untouched
    await ev(() => { A.E.d.pages[2].locked = true; });
    h0 = await hi();
    await page.click('.find-bar button:text-is("Replace all")');
    await wait();
    const [r2, r3, r4, r5] = await Promise.all(['r2', 'r3', 'r4', 'r5'].map(el));
    ok(r2.text === 'dog nap' && r3.cells[0][0] === 'dog' && r3.cells[1][0] === '=cat' && r3.cells[1][1] === 'condog', 'replace all on page 2', [r2.text, r3.cells]);
    ok(r4.text === 'locked cat' && r5.text === 'cat locked', 'locked text replaced', [r4.text, r5.text]);
    ok((await hi()) === h0 + 1, 'replace all took more than one step', [h0, await hi()]);
    ok(await ev(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('locked'))), 'skipped locked matches not reported');
    // one undo puts every replaced text back
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+z');
    await wait();
    ok((await el('r2')).text === 'Cat nap' && (await el('r3')).cells[0][0] === 'cat' && (await el('r1')).text === 'dog and dog', 'undo of replace all', [(await el('r2')).text, (await el('r1')).text]);
    // Ctrl+Enter in the replace field replaces all, whole word leaves 'concat'
    await ev(() => { A.E.d.pages[2].locked = false; A.E.changed({ all: true }); });
    await page.click('.find-bar label:has-text("Whole word") input');
    await page.click('.find-bar .find-r');
    await page.keyboard.press('Control+Enter');
    await wait();
    ok((await el('r3')).cells[1][1] === 'concat' && (await el('r4')).text === 'locked dog' && (await el('r5')).text === 'cat locked', 'Ctrl+Enter replace all with whole word', [await el('r3'), await el('r4')]);
    ok((await ev(() => document.querySelector('.find-count').textContent)) === '1 result', 'count after replace all', await ev(() => document.querySelector('.find-count').textContent));
    await page.click('.find-bar button[title="Close (Esc)"]');
  });

  await step('find: the bar opens from the file menu and the quick menu, and fits a 390px phone', async () => {
    await open();
    await put([['text', { text: 'Phone find', x: 100, y: 100, w: 800, size: 60 }]]);
    await page.keyboard.press('/');
    await page.waitForSelector('.modal .qm-list');
    await page.keyboard.type('find and');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.find-bar.replace');
    ok(await ev(() => !!document.activeElement.closest('.find-bar')), 'quick menu find not focused');
    await page.keyboard.press('Escape');
    await page.click('.ed-top button.top-btn:text-is("File")');
    await wait();
    await menu('Find and replace');
    ok(await ev(() => !!document.querySelector('.find-bar') && document.activeElement.classList.contains('find-q')), 'file menu did not open find');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await wait(300);
      await page.keyboard.press('Control+f');
      await page.waitForSelector('.find-bar');
      await page.keyboard.type('phone');
      await page.click('.find-bar .find-more');
      await wait();
      const r = await ev(() => {
        const bar = document.querySelector('.find-bar').getBoundingClientRect();
        const bad = [...document.querySelectorAll('.find-bar button, .find-bar input')].filter((x) => x.getClientRects().length).filter((x) => { const b = x.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.left < 0 || b.right > innerWidth || !x.contains(hit) && !(x.type === 'checkbox' && x.closest('label').contains(hit)); }).map((x) => x.title || x.placeholder || x.type);
        return { left: bar.left, right: bar.right, top: bar.top, tb: A.EU.toolbar.getBoundingClientRect().bottom, overflow: document.documentElement.scrollWidth - innerWidth, bad, count: document.querySelector('.find-count').textContent };
      });
      ok(r.left >= 0 && r.right <= 390 && r.overflow <= 0 && !r.bad.length, 'find bar does not fit the phone', r);
      ok(r.top >= r.tb - 1, 'find bar covers the toolbar', r);
      ok(r.count === '1 of 1', 'phone find count', r);
      await page.keyboard.press('Escape');
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });

  await step('text: justify stretches every line but the last of each paragraph, in the render and the edit field', async () => {
    await open();
    const [t] = await put([['text', { text: 'The quick brown fox jumps over the lazy dog again and again and again\nShort line', x: 100, y: 100, w: 700, size: 48 }]]);
    await clickEl(t);
    // the alignment button cycles left → center → right → justify
    for (let i = 0; i < 3; i++) await tb('Alignment');
    ok((await el(t)).align === 'justify', 'alignment cycle never reaches justify', (await el(t)).align);
    ok(await ev(() => !!document.querySelector('.ed-toolbar button[title="Alignment"] svg path[d^="M4 6h16M4 10h16"]')), 'justify icon not shown');
    const lines = await ev((id) => {
      const el = A.E.byId(id), g = document.querySelector(`.page-block.active .page-svg [data-id="${id}"]`);
      const text = g.querySelector('text'), x0 = text.getBBox().x;
      // each line starts with a positioned tspan; measure each line's extent
      const spans = [...text.querySelectorAll('tspan[x]')];
      return { w: el.w, spans: spans.map((s) => { let w = s.getComputedTextLength(), n = s.nextElementSibling; while (n && !n.hasAttribute('x')) { w += n.getComputedTextLength(); n = n.nextElementSibling; } return { x: +s.getAttribute('x'), w, ws: s.getAttribute('word-spacing') }; }) };
    }, t);
    ok(lines.spans.length >= 3, 'expected wrapped lines', lines);
    const last = lines.spans.length - 1;
    for (let i = 0; i < last; i++) {
      const s = lines.spans[i];
      if (i === last - 1) continue;
      ok(s.ws && Math.abs(s.x + s.w - lines.w) < 3, 'justified line does not reach the right edge', { i, s, w: lines.w });
    }
    ok(!lines.spans[last - 1].ws && !lines.spans[last].ws, 'last line of a paragraph stretched', lines.spans);
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Enter');
    await page.waitForSelector('textarea.text-edit');
    ok((await ev(() => document.querySelector('textarea.text-edit').style.textAlign)) === 'justify', 'edit field not justified');
    await page.keyboard.press('Escape');
    // bullets keep their spacing; shape text justifies inside its padding
    await ev((id) => { const el = A.E.byId(id); el.list = 'bullet'; A.R.fitText(el); A.E.changed(); }, t);
    const b = await ev((id) => [...document.querySelectorAll(`.page-block.active .page-svg [data-id="${id}"] text tspan`)].slice(0, 2).map((s) => [s.textContent, s.getAttribute('word-spacing')]), t);
    ok(b[0][0].startsWith('•') && !b[0][1] && b[1][1], 'bullet stretched or text not', b);
    // the exported page carries the stretch too
    ok(await ev((id) => A.R.pageSVG(A.E.d, A.E.page(), {}).includes('word-spacing'), t), 'export render lacks justify');
  });
}
