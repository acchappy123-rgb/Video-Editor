// Regression checks (shell): home pages, dialogs and menus, routing, saving on unload, imports, backups and toasts.
import fs from 'fs';
import path from 'path';
export default async function ({ page, step, ctx, url, OUT }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const go = async (hash, sel) => {
    await ev((x) => A.app.go(x), hash);
    await page.waitForSelector(sel);
    await wait(200);
  };
  const open = async (type = 'social') => {
    await ev((t) => A.Home.newDesign({ type: t }), type);
    await page.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await wait(300);
    return ev(() => A.E.d.id);
  };
  const blur = () => ev(() => document.activeElement?.blur?.());
  // a stored design (not opened); extra fields are merged in
  const mk = (title, extra = {}, type = 'social') => ev(async ([t, x, ty]) => {
    const d = Object.assign(A.M.newDesign({ type: ty, title: t }), x);
    await A.S.saveDesign(d);
    return d.id;
  }, [title, extra, type]);
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
  const modals = () => ev(() => document.querySelectorAll('.modal-back').length);
  const pick = async (trigger, file) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), trigger()]);
    await fc.setFiles(file);
  };
  const png = async (name, color) => {
    const data = await ev((c) => { const k = document.createElement('canvas'); k.width = 40; k.height = 30; const g = k.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 40, 30); return k.toDataURL('image/png'); }, color);
    const p = path.join(OUT, name);
    fs.writeFileSync(p, Buffer.from(data.split(',')[1], 'base64'));
    return p;
  };
  const tag = Math.random().toString(36).slice(2, 6);

  await step('shell: an edit right before reload or closing the tab is kept; leaving warns only while unsaved (state-8, home-2, rank 4)', async () => {
    const dialogs = [];
    const onDialog = (d) => { dialogs.push(d.type()); d.accept(); };
    page.on('dialog', onDialog);
    try {
      const id = await open('social');
      await blur();
      await page.keyboard.press('r');
      await page.keyboard.press('Shift+ArrowRight');
      const x = await ev(() => A.E.selEls()[0].x);
      await wait(30);
      await page.reload();
      await page.waitForSelector('.page-svg');
      const el = await ev(async (i) => (await A.S.get('designs', i)).pages[0].elements[0], id);
      ok(el && el.x === x, 'nudge lost on reload', { x, stored: el?.x });
      ok(dialogs.includes('beforeunload'), 'no warning while the save was pending', dialogs);
      // an edit that has been saved leaves without a warning
      await wait(300);
      await blur();
      await page.keyboard.press('c');
      await page.waitForSelector('.save-state.saved', { timeout: 5000 });
      dialogs.length = 0;
      await page.reload();
      await page.waitForSelector('.page-svg');
      ok(!dialogs.length, 'warned although everything was saved', dialogs);
      // closing the tab
      const p = await ctx.newPage();
      p.on('dialog', (d) => d.accept());
      await p.goto(url + '#/design/' + id, { waitUntil: 'commit' });
      await p.waitForSelector('.page-svg', { timeout: 30000 });
      await p.waitForTimeout(400);
      const cid = await p.evaluate(() => A.E.els().find((e) => e.shape === 'ellipse').id);
      await p.evaluate((i) => { document.activeElement?.blur?.(); A.E.select([i]); }, cid);
      for (let i = 0; i < 3; i++) await p.keyboard.press('Shift+ArrowDown');
      const y = await p.evaluate(() => A.E.selEls()[0].y);
      await p.waitForTimeout(30);
      await p.close({ runBeforeUnload: true });
      await page.waitForFunction(async ([i, c, yy]) => (await A.S.get('designs', i)).pages[0].elements.find((e) => e.id === c)?.y === yy, [id, cid, y], { timeout: 3000 }).catch(() => {});
      const y2 = await ev(async ([i, c]) => (await A.S.get('designs', i)).pages[0].elements.find((e) => e.id === c)?.y, [id, cid]);
      ok(y2 === y, 'nudge lost when the tab closed', { y, stored: y2 });
    } finally {
      page.off('dialog', onDialog);
    }
    await go('#/home', '.hero');
  });

  await step('shell: an imported design file cannot inject markup; odd ids are replaced and connectors follow (render-1, home-17)', async () => {
    const bad = 'x"><image href="data:," onerror="window.__pwned=(window.__pwned||0)+1"/><g data-z="';
    const shape = (id, o) => ({ id, type: 'shape', shape: 'rect', x: 100, y: 100, w: 200, h: 200, rot: 0, opacity: 1, fill: '#ff0000', stroke: '#000000', strokeWidth: 0, dash: 'solid', radius: 0, ...o });
    const design = {
      id: 'd_sender', title: 'Evil import ' + tag, type: 'social', width: 1080, height: 1080, starred: true, folderId: 'f_sender_only', guides: [],
      pages: [{ id: 'p"><img src=x onerror="window.__pwned=1">', bg: { color: '#ffffff' }, duration: 5, transition: 'none', elements: [
        shape(bad),
        shape('ok_shape', { shape: 'ellipse', x: 600, strokeWidth: '2"><image href="data:," onerror="window.__pwned=1"/>' }),
        { id: 'ln"', type: 'line', x: 0, y: 0, w: 10, h: 10, rot: 0, opacity: 1, p1: { x: 300, y: 200 }, p2: { x: 600, y: 200 }, stroke: '#000000', strokeWidth: 6, dash: 'solid', start: 'none', end: 'arrow', elbow: false, c1: bad, c2: 'ok_shape' },
      ] }],
      comments: [{ id: 'c"x', pageId: 'p"><img src=x onerror="window.__pwned=1">', elId: bad, text: 'hi', author: 'Sender', ts: 1, replies: [] }],
    };
    const file = path.join(OUT, 'shell-evil.atelier.json');
    fs.writeFileSync(file, JSON.stringify({ app: 'atelier-design', version: 1, design, assets: [] }));
    await go('#/home', '.hero');
    await pick(() => page.click('.type-btn:has-text("Upload")'), file);
    await page.waitForFunction((t) => A.E.d?.title === t && document.querySelector('.page-svg'), design.title);
    await wait(500);
    const r = await ev(() => {
      const p = A.E.d.pages[0], [rect, circle, line] = p.elements;
      return { pwned: window.__pwned || 0, ids: [p.id, ...p.elements.map((e) => e.id), ...A.E.d.comments.map((c) => c.id)], c1: line.c1 === rect.id, c2: line.c2, sw: circle.strokeWidth, cpage: A.E.d.comments[0].pageId === p.id, cel: A.E.d.comments[0].elId === rect.id, starred: A.E.d.starred, folderId: A.E.d.folderId, drawn: document.querySelectorAll('.page-block.active .page-svg [data-id]').length };
    });
    ok(!r.pwned, 'imported ids ran script', r);
    ok(r.ids.every((i) => /^[\w-]+$/.test(i)), 'odd ids kept', r);
    ok(r.c1 && r.c2 === 'ok_shape' && r.cpage && r.cel, 'references not remapped', r);
    ok(r.sw === 0 && r.drawn >= 3, 'numbers not coerced or elements not drawn', r);
    ok(r.starred === false && r.folderId === null, "imported design kept the sender's star/folder", r);
    // a backup is sanitised the same way, versions included
    const b = await ev(async ([dz, bd]) => {
      const d = JSON.parse(dz);
      d.id = 'd_shell_bk';
      const v = { id: 'v_shell_bk', designId: d.id, ts: Date.now(), label: '', data: JSON.stringify(d) };
      await A.S.importBackup({ app: 'atelier', version: 1, designs: [d], versions: [v] });
      const sd = await A.S.get('designs', 'd_shell_bk'), vd = JSON.parse((await A.S.get('versions', 'v_shell_bk')).data);
      const out = [sd, vd].map((x) => ({ ids: x.pages[0].elements.map((e) => e.id), c1: x.pages[0].elements[2].c1 === x.pages[0].elements[0].id, bad: JSON.stringify(x.pages[0].elements.map((e) => e.id)).includes(bd) }));
      await A.S.deleteForever('d_shell_bk');
      return out;
    }, [JSON.stringify(design), bad]);
    ok(b.every((x) => !x.bad && x.c1 && x.ids.every((i) => /^[\w-]+$/.test(i))), 'backup not sanitised', b);
    const id = await ev(() => A.E.d.id);
    await go('#/home', '.hero');
    await ev((i) => A.S.deleteForever(i), id);
  });

  await step('shell: a control character pasted into text no longer breaks exports and the thumbnail (render-6)', async () => {
    await open('social');
    const [id] = await put([['text', { text: 'Hello', x: 100, y: 100, w: 600, size: 60 }]]);
    const c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
    await page.keyboard.press('End');
    await page.keyboard.insertText(' Line one\u000bLine two\u000c!');
    await page.keyboard.press('Escape');
    await wait(200);
    const r = await ev(async (i) => {
      const svg = await A.R.standaloneSVG(A.E.d, A.E.page());
      const bad = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror');
      let blob = null;
      try { blob = await A.X.pageBlob(A.E.d, A.E.page(), { format: 'png', scale: 0.25 }); } catch (e) { blob = e.message; }
      return { text: A.E.byId(i)?.text, parse: bad?.textContent || '', blob: blob?.size || blob, thumb: (await A.R.thumbnail(A.E.d)).length };
    }, id);
    ok(r.text?.includes('Line two'), 'typed text missing', r);
    ok(!r.parse, 'SVG does not parse', r);
    ok(r.blob > 100 && r.thumb > 100, 'PNG export or thumbnail failed', r);
    await go('#/home', '.hero');
  });

  await step('shell: an over-large canvas fails with a clear message, not a createObjectURL error (render-12)', async () => {
    const msg = await ev(async () => {
      const c = document.createElement('canvas');
      c.width = 30000;
      c.height = 30000;
      try { await A.U.canvasToBlob(c); return 'resolved'; } catch (e) { return e.message; }
    });
    ok(/too large/i.test(msg), 'unclear failure', msg);
  });

  await step('shell: the planner uses local calendar days (home-4)', async () => {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Pacific/Kiritimati' });
    try {
      await go('#/planner', '.cal-grid');
      const local = await ev(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; });
      const ymd = (dd) => `${local.y}-${String(local.m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      const today = await ev(() => document.querySelector('.cal-day.today .cal-num')?.textContent);
      ok(today === String(local.d), 'wrong day highlighted', { today, local });
      await page.locator('.cal-day:not(.other)', { has: page.locator('.cal-num', { hasText: /^20$/ }) }).click({ position: { x: 8, y: 30 } });
      await page.waitForSelector('.modal input[type=date]');
      const prefill = await page.inputValue('.modal input[type=date]');
      ok(prefill === ymd(20), 'clicked day 20 but the date is', prefill);
      // without a design the calendar shows the caption
      await page.selectOption('.modal select', '');
      await page.fill('.modal textarea', 'Planner tz ' + tag);
      await page.click('.modal-foot .btn:has-text("Save")');
      await wait(300);
      const cell = await ev((t) => [...document.querySelectorAll('.cal-day')].find((c) => c.textContent.includes(t))?.querySelector('.cal-num').textContent, 'Planner tz ' + tag);
      ok(cell === '20', 'post drawn in cell', cell);
      await page.click('.page-title .btn:has-text("Schedule")');
      await page.waitForSelector('.modal input[type=date]');
      const def = await page.inputValue('.modal input[type=date]');
      ok(def === ymd(local.d), 'Schedule defaults to', def);
      await page.keyboard.press('Escape');
    } finally {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' });
      await cdp.detach();
    }
    await ev(async (t) => { A.app.planner = A.app.planner.filter((x) => x.caption !== t); await A.S.setKv('planner', A.app.planner); }, 'Planner tz ' + tag);
  });

  await step('shell: restoring a backup of the open design reloads it instead of being undone on close (home-5)', async () => {
    const id = await mk('Version from backup ' + tag);
    const file = path.join(OUT, 'shell-backup.json');
    fs.writeFileSync(file, await ev(async () => (await A.S.exportBackup()).text()));
    await go('#/design/' + id, '.page-svg');
    await page.click('.title-input', { clickCount: 3 });
    await page.keyboard.type('Edited after backup');
    await page.keyboard.press('Enter');
    await ev(() => A.Home.settings('data'));
    await pick(() => page.click('.modal button:has-text("Restore backup")'), file);
    await page.waitForFunction((t) => A.E.d?.title === t && document.querySelector('.title-input')?.value === t, 'Version from backup ' + tag, { timeout: 10000 });
    await go('#/home', '.hero');
    const t = await ev(async (i) => (await A.S.get('designs', i)).title, id);
    ok(t === 'Version from backup ' + tag, 'restore undone by the open editor copy', t);
  });

  await step('shell: files dropped outside the canvas in the editor are imported, never opened by the browser (home-6)', async () => {
    const file = await png('shell-drop.png', '#ff0000');
    await open('social');
    await ev(() => { window.__drops = []; addEventListener('drop', (e) => window.__drops.push(e.defaultPrevented)); });
    const cdp = await ctx.newCDPSession(page);
    const b = await page.locator('.ed-top').boundingBox();
    const data = { items: [], files: [path.resolve(file)], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: b.x + b.width / 2, y: b.y + b.height / 2, data });
    await cdp.detach();
    await page.waitForFunction(() => A.E.els().some((e) => e.type === 'image'), null, { timeout: 5000 }).catch(() => {});
    const r = await ev(() => ({ drops: window.__drops, images: A.E.els().filter((e) => e.type === 'image').length }));
    ok(r.drops.length && r.drops.every(Boolean), 'drop not default-prevented', r);
    ok(r.images === 1, 'dropped image not imported', r);
    await go('#/home', '.hero');
  });

  await step('shell: a design file carries the custom fonts it uses (home-7)', async () => {
    await go('#/brand', '.brand-fonts');
    await pick(() => page.click('.brand-sec button:has-text("Upload a font")'), '/usr/share/fonts/truetype/crosextra/Caladea-Italic.ttf');
    await page.waitForFunction(() => A.M.customFonts.some((f) => f.name === 'Caladea Italic'));
    const r = await ev(async () => {
      const d = A.M.newDesign({ type: 'social', title: 'Font file' });
      d.pages[0].elements.push(A.M.newText({ text: 'Fancy', font: 'Caladea Italic' }));
      const json = JSON.parse(await (await A.S.exportDesignFile(d)).text());
      const font = A.M.customFonts.find((f) => f.name === 'Caladea Italic');
      // on another device: the font is not there until the file brings it
      await A.S.del('assets', font.asset);
      await A.app.loadFonts();
      const before = A.M.customFonts.length;
      const imported = await A.app.importFile(new File([JSON.stringify(json)], 'font.atelier.json', { type: 'application/json' }), { toEditor: true });
      const out = { kinds: json.assets.map((a) => a.kind), before, after: A.M.customFonts.map((f) => f.name) };
      await A.S.deleteForever(imported.id);
      await A.S.del('assets', font.asset);
      await A.app.loadFonts();
      return out;
    });
    ok(r.kinds.includes('font'), 'font not packaged', r);
    ok(r.after.includes('Caladea Italic'), 'font not available after import', r);
    await go('#/home', '.hero');
  });

  await step('shell: a dialog closed by navigating leaves no Escape listener behind and settles its promise (home-9)', async () => {
    await page.click('.side-link:has-text("Projects")');
    await page.waitForSelector('.p-tabs');
    await page.click('.side-link:has-text("Home")');
    await page.waitForSelector('.hero');
    await page.click('.side-link:has-text("Settings")');
    await page.waitForSelector('.modal');
    await ev(() => { window.__answer = 'open'; A.U.confirm('Still there?').then((r) => (window.__answer = r)); });
    await page.goBack();
    await page.waitForSelector('.p-tabs');
    await wait(200);
    ok((await modals()) === 0, 'dialogs left open');
    ok((await ev(() => window.__answer)) === false, 'confirm promise left pending');
    await open('social');
    const [id] = await put([['rect', { x: 200, y: 200, w: 300, h: 300 }]]);
    const c = await center(id);
    await page.mouse.click(c.x, c.y);
    ok((await ev(() => A.E.sel.length)) === 1, 'not selected');
    await page.keyboard.press('Escape');
    ok((await ev(() => A.E.sel.length)) === 0, 'first Escape was swallowed');
    await go('#/home', '.hero');
  });

  await step('shell: Escape closes only the topmost dialog; dialogs take and keep focus (home-10, home-11)', async () => {
    await ev(() => { window.__clear = A.S.clearAll; A.S.clearAll = () => new Promise(() => (window.__wiped = true)); });
    try {
      await page.click('.side-link:has-text("Settings")');
      await page.waitForSelector('.modal');
      ok(await ev(() => document.querySelector('.modal').contains(document.activeElement)), 'Settings did not take focus');
      await page.click('.modal .p-tab:has-text("Data")');
      await page.click('.modal button:has-text("Delete all data")');
      await page.waitForFunction(() => document.querySelectorAll('.modal-back').length === 2);
      const inTop = () => ev(() => [...document.querySelectorAll('.modal')].pop().contains(document.activeElement));
      ok(await inTop(), 'confirm did not take focus');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await wait(100);
      ok((await modals()) === 2, 'Enter re-pressed the button behind the confirm', await modals());
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
        await page.keyboard.press('Tab');
        ok(await inTop(), 'Tab left the dialog', await ev(() => document.activeElement?.outerHTML.slice(0, 80)));
      }
      await page.keyboard.press('Escape');
      ok((await modals()) === 1, 'Escape closed more than the confirm', await modals());
      ok(await ev(() => document.activeElement?.textContent === 'Delete all data'), 'focus not returned to the opener');
      await page.keyboard.press('Escape');
      ok((await modals()) === 0, 'Settings still open');
      ok(!(await ev(() => window.__wiped)), 'data was wiped');
    } finally {
      await ev(() => { A.S.clearAll = window.__clear; });
    }
  });

  await step('shell: Escape closes menus and popovers, and only them (home-12)', async () => {
    await go('#/home', '.hero');
    for (const sel of ['.btn.create', '.avatar-btn', '.home-top .icon-btn[title="Notifications"]']) {
      await page.click(sel);
      await page.waitForSelector('.popover');
      await page.keyboard.press('Escape');
      ok(!(await ev(() => document.querySelector('.popover'))), 'popover stayed open: ' + sel);
    }
    // inside a dialog the menu closes first
    await page.click('.side-link:has-text("Settings")');
    await page.waitForSelector('.modal');
    await ev(() => A.U.menu(document.querySelector('.modal h2'), [{ label: 'One' }]));
    await page.keyboard.press('Escape');
    ok(!(await ev(() => document.querySelector('.popover'))) && (await modals()) === 1, 'Escape did not close just the menu');
    await page.keyboard.press('Escape');
    // in the editor Escape closes the File menu and keeps the selection
    await open('social');
    const [id] = await put([['rect', { x: 200, y: 200, w: 300, h: 300 }]]);
    const c = await center(id);
    await page.mouse.click(c.x, c.y);
    await page.click('.ed-top .top-btn:has-text("File")');
    await page.waitForSelector('.popover');
    await page.keyboard.press('Escape');
    ok(!(await ev(() => document.querySelector('.popover'))) && (await ev(() => A.E.sel.length)) === 1, 'File menu Escape');
    await go('#/home', '.hero');
  });

  await step("shell: Enter on a card's Star or More button does not open the design (home-13)", async () => {
    const t = 'Card keys ' + tag;
    await mk(t);
    await go('#/projects', '.card');
    const card = page.locator('.card', { hasText: t });
    await card.locator('.star').focus();
    await page.keyboard.press('Enter');
    await wait(300);
    ok((await ev(() => A.app.view)) === 'home', 'Star + Enter opened the design');
    ok(await ev(async (x) => (await A.S.listDesigns()).find((d) => d.title === x).starred, t), 'Star + Enter did not star');
    await page.locator('.card', { hasText: t }).locator('.icon-btn[title="More"]').focus();
    await page.keyboard.press('Enter');
    await wait(300);
    ok((await ev(() => A.app.view)) === 'home' && (await ev(() => !!document.querySelector('.popover'))), 'More + Enter opened the design or no menu');
    await page.keyboard.press('Escape');
    await page.locator('.card', { hasText: t }).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.page-svg');
    await go('#/home', '.hero');
  });

  await step('shell: home search reflects trashed and renamed designs (home-14)', async () => {
    const g = 'Gamma flyer ' + tag, a = 'Alpha poster ' + tag, z = 'Zebra poster ' + tag;
    await mk(g);
    await mk(a);
    await go('#/projects', '.p-tabs');
    await go('#/home', '.hero');
    await page.locator('.card', { hasText: g }).locator('.icon-btn[title="More"]').click();
    await page.click('.popover .menu-item:has-text("Move to trash")');
    await wait(300);
    await page.locator('.card', { hasText: a }).locator('.icon-btn[title="More"]').click();
    await page.click('.popover .menu-item:has-text("Rename")');
    await page.waitForSelector('.modal input');
    await page.fill('.modal input', z);
    await page.keyboard.press('Enter');
    await wait(300);
    const results = async (q) => {
      await page.fill('.hero-input', q);
      await wait(100);
      return ev(() => [...document.querySelectorAll('.hero-results .result')].map((r) => r.textContent));
    };
    const rg = await results(g.toLowerCase());
    ok(!rg.some((x) => x.includes('your design')), 'trashed design offered', rg);
    const rz = await results(z.toLowerCase());
    ok(rz.some((x) => x.includes(z)), 'renamed design not found', rz);
    await page.fill('.hero-input', '');
  });

  await step('shell: uploading from Projects > Uploads stays on Uploads (home-15)', async () => {
    const file = await png('shell-upload.png', '#00aa00');
    await go('#/projects', '.p-tabs');
    await page.click('.p-tab:has-text("Uploads")');
    await page.waitForSelector('.upload-grid');
    await pick(() => page.click('.btn.primary:has-text("Upload")'), file);
    await page.waitForSelector('.upload-card:has-text("shell-upload.png")', { timeout: 5000 });
    ok((await ev(() => document.querySelector('.p-tab.on')?.textContent)) === 'Uploads', 'switched tab');
  });

  await step('shell: deleting an upload removes it from the Brand Kit (home-16)', async () => {
    const file = await png('shell-logo.png', '#0000ff');
    await go('#/brand', '.brand-sec');
    const n0 = await ev(() => (A.app.brand.logos || []).length);
    await pick(() => page.locator('.brand-sec').first().locator('.add-tile').click(), file);
    await page.waitForFunction((n) => (A.app.brand.logos || []).length === n + 1, n0);
    const id = await ev(() => A.app.brand.logos.at(-1));
    await go('#/projects', '.p-tabs');
    await page.click('.p-tab:has-text("Uploads")');
    await page.locator('.upload-card', { hasText: 'shell-logo.png' }).locator('.icon-btn[title="Delete"]').click();
    await page.click('.modal-foot .btn:has-text("Delete")');
    await wait(300);
    const r = await ev(async (i) => ({ live: A.app.brand.logos.includes(i), stored: ((await A.S.kv('brand', {})).logos || []).includes(i) }), id);
    ok(!r.live && !r.stored, 'dead id kept in the Brand Kit', r);
    await go('#/brand', '.brand-sec');
    ok(!(await ev(() => [...document.querySelectorAll('.brand-img img')].some((i) => !i.getAttribute('src')))), 'broken tile shown');
  });

  let tplId = null;
  await step('shell: Save as template uses a fresh thumbnail (home-18)', async () => {
    const fid = await ev(async () => { const f = { id: A.U.uid('f_'), name: 'Clients', createdAt: Date.now() }; await A.S.put('folders', f); return f.id; });
    const id = await mk('Starred source ' + tag, { starred: true, folderId: fid });
    await go('#/design/' + id, '.page-svg');
    await ev(() => A.E.save());
    await put([['rect', { x: 0, y: 0, w: 1080, h: 1080, fill: '#ff0000' }]]);
    await page.click('.ed-top .top-btn:has-text("File")');
    await page.click('.popover .menu-item:has-text("Save as template")');
    await page.waitForSelector('.modal input');
    await page.fill('.modal input', 'Shell template ' + tag);
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => A.app.userTemplates.some((t) => t.name === n), 'Shell template ' + tag);
    tplId = await ev((n) => A.app.userTemplates.find((x) => x.name === n).id, 'Shell template ' + tag);
    const px = await ev(async (n) => {
      const t = A.app.userTemplates.find((x) => x.name === n);
      const img = await A.U.loadImage(t.thumb);
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      return [...g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data.slice(0, 3)];
    }, 'Shell template ' + tag);
    await go('#/home', '.hero');
    ok(px[0] > 200 && px[1] < 60 && px[2] < 60, 'template thumbnail is stale', px);
  });

  await step('shell: a design made from a user template starts unstarred and outside folders (home-17)', async () => {
    ok(tplId, 'no template from the previous step');
    await go('#/templates', '.tpl-grid');
    await page.locator('.tpl-card', { hasText: 'Shell template ' + tag }).click();
    await page.waitForSelector('.page-svg');
    await wait(200);
    const r = await ev(() => ({ starred: A.E.d.starred, folderId: A.E.d.folderId }));
    ok(!r.starred && r.folderId == null, 'inherited star/folder', r);
    await go('#/home', '.hero');
    await ev(async (i) => { A.app.userTemplates = A.app.userTemplates.filter((t) => t.id !== i); await A.S.setKv('userTemplates', A.app.userTemplates); }, tplId);
  });

  await step('shell: a full backup keeps versions and settings but never the API key (home-20)', async () => {
    const r = await ev(async () => {
      const s0 = { ...A.app.settings };
      Object.assign(A.app.settings, { theme: 'dark', apiKey: 'sk-ant-local-secret' });
      await A.app.saveSettings();
      const d = A.M.newDesign({ type: 'social', title: 'Backup versions' });
      await A.S.saveDesign(d);
      await A.S.addVersion(d, 'v1');
      const text = await (await A.S.exportBackup()).text();
      const json = JSON.parse(text);
      const s = json.kv.find((k) => k.key === 'settings');
      const out = { versions: (json.versions || []).filter((v) => v.designId === d.id).length, theme: s?.value.theme, leaked: text.includes('sk-ant-local-secret') };
      // restore where another key and theme are set and the version is gone
      Object.assign(A.app.settings, { theme: 'light', apiKey: 'sk-ant-other' });
      await A.app.saveSettings();
      for (const v of await A.S.listVersions(d.id)) await A.S.del('versions', v.id);
      await A.app.restoreBackup(json);
      out.after = { theme: A.app.settings.theme, key: A.app.settings.apiKey, versions: (await A.S.listVersions(d.id)).length, attr: document.documentElement.getAttribute('data-theme') };
      A.app.settings = s0;
      await A.app.saveSettings();
      A.app.applyTheme();
      await A.S.deleteForever(d.id);
      return out;
    });
    ok(r.versions === 1 && r.theme === 'dark' && !r.leaked, 'backup content', r);
    ok(r.after.theme === 'dark' && r.after.attr === 'dark' && r.after.key === 'sk-ant-other' && r.after.versions === 1, 'restore', r);
    await page.waitForSelector('.hero');
  });

  await step('shell: download file names keep non-ASCII letters (home-21)', async () => {
    const t = 'Привет мир ' + tag;
    await mk(t);
    await go('#/projects', '.card');
    // the name the app asks for (headless Chromium in a POSIX locale saves any non-ASCII name as 'download')
    await ev(() => {
      window.__names = [];
      const click = (window.__aclick = HTMLAnchorElement.prototype.click);
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__names.push(this.download); return click.call(this); };
    });
    try {
      await page.locator('.card', { hasText: t }).locator('.icon-btn[title="More"]').click();
      await Promise.all([page.waitForEvent('download'), page.click('.popover .menu-item:has-text("Download design file")')]);
      const names = await ev(() => window.__names);
      ok(names[0] === `Привет-мир-${tag}.atelier.json`, 'file name', names);
    } finally {
      await ev(() => { HTMLAnchorElement.prototype.click = window.__aclick; });
    }
  });

  await step('shell: editing an already-reminded post does not remind again (home-22)', async () => {
    const cap = 'Launch post ' + tag;
    await ev(async (c) => {
      A.app.planner = [...A.app.planner, { id: 's_' + c.slice(-4), designId: '', date: A.U.ymd(), time: '00:00', caption: c, channel: 'Insta', notified: true }];
      await A.S.setKv('planner', A.app.planner);
    }, cap);
    await go('#/planner', '.cal-grid');
    await page.click(`.cal-item:has-text("${cap}")`);
    await page.waitForSelector('.modal textarea');
    await page.fill('.modal textarea', cap + ' v2');
    await page.click('.modal-foot .btn:has-text("Save")');
    await wait(300);
    await page.reload();
    await page.waitForSelector('.cal-grid');
    await wait(500);
    const r = await ev((c) => ({ item: A.app.planner.find((x) => x.caption === c + ' v2'), again: A.app.notifications.filter((n) => n.text.includes('on Insta')).length }), cap);
    ok(r.item?.notified === true && r.again === 0, 'reminded again', r);
    await ev(async (c) => { A.app.planner = A.app.planner.filter((x) => !x.caption.startsWith(c)); await A.S.setKv('planner', A.app.planner); }, cap);
  });

  await step('shell: saving or deleting a post keeps the planner on the month being viewed (home-23)', async () => {
    await go('#/planner', '.cal-grid');
    await page.click('.icon-btn[title="Next month"]');
    await wait(200);
    const label = () => ev(() => document.querySelector('.page-title .row b').textContent);
    const m = await label();
    await page.locator('.cal-day:not(.other)', { has: page.locator('.cal-num', { hasText: /^10$/ }) }).click({ position: { x: 8, y: 30 } });
    await page.selectOption('.modal select', '');
    await page.fill('.modal textarea', 'Next month ' + tag);
    await page.click('.modal-foot .btn:has-text("Save")');
    await wait(300);
    ok((await label()) === m, 'jumped to', await label());
    await page.click(`.cal-item:has-text("Next month ${tag}")`);
    await page.click('.modal-foot .btn:has-text("Delete")');
    await wait(300);
    ok((await label()) === m, 'delete jumped to', await label());
    ok(!(await ev((c) => A.app.planner.some((x) => x.caption === c), 'Next month ' + tag)), 'not deleted');
  });

  await step("shell: 'Empty trash' with a type filter empties the whole trash (home-24)", async () => {
    await mk('T-social ' + tag, { deletedAt: Date.now() });
    await mk('T-print ' + tag, { deletedAt: Date.now() }, 'print');
    await go('#/projects', '.p-tabs');
    await page.click('.p-tab:has-text("Trash")');
    await page.waitForSelector('.filters select');
    await page.selectOption('.filters select >> nth=0', 'social');
    await page.waitForSelector('.btn.danger:has-text("Empty trash")');
    await page.click('.btn.danger:has-text("Empty trash")');
    await page.click('.modal-foot .btn:has-text("Empty trash")');
    await wait(400);
    const left = await ev(async () => (await A.S.listDesigns({ trash: true })).map((d) => d.title));
    ok(!left.length, 'trash left', left);
  });

  await step('shell: a new display name shows in the sidebar and avatar at once (home-25)', async () => {
    await go('#/projects', '.p-tabs');
    await page.click('.p-tab:has-text("Starred")');
    await page.click('.side-link.me');
    await page.waitForSelector('.modal input');
    await page.fill('.modal input', 'Zoe');
    await page.keyboard.press('Tab');
    await wait(200);
    await page.keyboard.press('Escape');
    const r = await ev(() => ({ me: document.querySelector('.side-link.me').textContent, av: document.querySelector('.avatar-btn .avatar').textContent, tab: document.querySelector('.p-tab.on')?.textContent }));
    ok(r.me === 'ZZoe' && r.av === 'Z' && r.tab === 'Starred', 'shell not updated', r);
    await ev(async () => { A.app.profile = { ...A.app.profile, name: 'You' }; await A.S.setKv('profile', A.app.profile); });
  });

  await step('shell: toasts can carry an action and stay until closed (rank 4)', async () => {
    await go('#/home', '.hero');
    await ev(() => {
      window.__act = 0;
      A.U.toast('Sticky one', 'error', { sticky: true, action: { label: 'Do it', onClick: () => window.__act++ } });
      A.U.toast('Sticky two', 'error', { sticky: true });
      A.U.toast('Plain toast');
    });
    await wait(3600);
    const has = (t) => ev((x) => [...document.querySelectorAll('.toast')].some((e) => e.textContent.includes(x)), t);
    ok((await has('Sticky one')) && (await has('Sticky two')) && !(await has('Plain toast')), 'sticky toasts gone or plain one stayed');
    await page.locator('.toast', { hasText: 'Sticky one' }).locator('button', { hasText: 'Do it' }).click();
    await page.locator('.toast', { hasText: 'Sticky two' }).locator('.toast-close').click();
    await wait(700);
    ok((await ev(() => window.__act)) === 1 && !(await has('Sticky one')) && !(await has('Sticky two')), 'action or close did not work');
  });

  await step('shell: Tab in the Download dialog reaches every control, Select pages included (home-11)', async () => {
    await open('presentation');
    await page.click('.btn.share');
    await page.click('.share-act:has-text("Download")');
    await page.waitForSelector('.modal');
    const seen = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      seen.push(await ev(() => { const a = document.activeElement; return (a.closest('.modal') ? '' : 'OUT ') + a.tagName + ' ' + (a.textContent || '').trim().slice(0, 20); }));
    }
    await page.keyboard.press('Escape');
    ok(seen.some((x) => x.startsWith('SUMMARY')) && seen.includes('BUTTON Cancel') && seen.includes('BUTTON Download') && !seen.some((x) => x.startsWith('OUT')), 'Tab order', seen);
    await go('#/home', '.hero');
  });

  await step('shell: design files and fonts dropped on the canvas are imported; imports load each font once (home-6, home-7)', async () => {
    await open('social');
    const json = await ev(async (t) => (await A.S.exportDesignFile(A.M.newDesign({ type: 'social', title: t }))).text(), 'Dropped ' + tag);
    const file = path.join(OUT, 'shell-drop.atelier.json');
    fs.writeFileSync(file, json);
    const designs = () => ev(async () => (await A.S.listDesigns()).length);
    const n0 = await designs();
    const cdp = await ctx.newCDPSession(page);
    const drop = async (f) => {
      const b = await page.locator('.page-block.active .page-frame').boundingBox();
      const data = { items: [], files: [path.resolve(f)], dragOperationsMask: 1 };
      for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: b.x + b.width / 2, y: b.y + b.height / 2, data });
    };
    await drop(file);
    await page.waitForSelector('.toast:has-text("Imported")', { timeout: 5000 });
    ok((await designs()) === n0 + 1, 'dropped design file not imported', { n0, n: await designs() });
    await drop('/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf');
    await page.waitForFunction(() => A.M.customFonts.some((f) => f.name === 'Caladea Bold'), null, { timeout: 5000 });
    await cdp.detach();
    const size = await ev(() => document.fonts.size);
    for (let i = 0; i < 3; i++) await ev(async (txt) => { const d = await A.app.importFile(new File([txt], 'again.atelier.json', { type: 'application/json' }), { toEditor: true }); await A.S.deleteForever(d.id); }, json);
    ok((await ev(() => document.fonts.size)) === size, 'imports added FontFaces again', { size, now: await ev(() => document.fonts.size) });
    const left = await ev(async (t) => {
      for (const d of await A.S.listDesigns()) if (d.title === t) await A.S.deleteForever(d.id);
      await A.S.del('assets', A.M.customFonts.find((f) => f.name === 'Caladea Bold').asset);
      await A.app.loadFonts();
      return { custom: A.M.customFonts.some((f) => f.name === 'Caladea Bold'), faces: [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Caladea Bold') };
    }, 'Dropped ' + tag);
    ok(!left.custom && !left.faces, 'a deleted font stayed loaded', left);
    await go('#/home', '.hero');
  });

  await step('shell: a crafted design file or backup cannot break startup, Home or search (home-6)', async () => {
    const fid = 'a_font_' + tag;
    const design = { title: 7, type: 'social', width: 1080, height: 1080, pages: [{ title: 5, elements: [] }] };
    const assets = [{ id: fid, kind: 'font', name: 5, blob: 'data:font/ttf;base64,AAAA' }, { id: 'a bad"id', kind: 'image', name: 'x', blob: 'data:image/png;base64,AAAA' }, { id: 'a_noblob_' + tag, kind: 'image', blob: 5 }];
    const file = path.join(OUT, 'shell-crafted.atelier.json');
    fs.writeFileSync(file, JSON.stringify({ app: 'atelier-design', version: 1, design, assets }));
    const kv0 = await ev(async () => ({ profile: await A.S.get('kv', 'profile'), notifications: await A.S.get('kv', 'notifications') }));
    let did;
    try {
      await go('#/home', '.hero');
      await pick(() => page.click('.type-btn:has-text("Upload")'), file);
      await page.waitForFunction(() => A.E.d?.title === '7' && document.querySelector('.page-svg'));
      did = await ev(() => A.E.d.id);
      const st = await ev(async (fid) => ({ font: (await A.S.get('assets', fid))?.name, bad: (await A.S.all('assets')).filter((a) => !/^[\w-]+$/.test(a.id) || !(a.blob instanceof Blob)).length, page: A.E.d.pages[0].title }), fid);
      ok(st.font === '5' && !st.bad && st.page === '5', 'imported assets or titles not cleaned', st);
      await ev(() => A.S.importBackup({ app: 'atelier', version: 1, kv: [{ key: 'profile', value: { name: 5 } }, { key: 'notifications', value: 'x' }, { key: 'toString', value: 1 }] }));
      await go('#/home', '.hero');
      await page.reload();
      await page.waitForSelector('.hero', { timeout: 10000 });
      await page.fill('.hero-input', '7');
      await wait(150);
      const res = await ev(() => [...document.querySelectorAll('.hero-results .result')].map((r) => r.textContent));
      ok(res.some((x) => x.includes('7')), 'search for the imported design', res);
      await page.fill('.hero-input', '');
    } finally {
      await ev(async ([kv0, fid, did]) => {
        for (const k of ['profile', 'notifications']) await (kv0[k] ? A.S.put('kv', kv0[k]) : A.S.del('kv', k));
        await A.S.del('assets', fid);
        if (did) await A.S.deleteForever(did);
      }, [kv0, fid, did]);
    }
  });
}
