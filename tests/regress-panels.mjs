// Regression checks for the editor panels (panels.js): template and project page inserts, uploads modes,
// photo tools, table editing, layers, effects, animate, brand fonts and AI rewrite.
import fs from 'fs';
import path from 'path';
export default async function ({ page, step, OUT }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const open = async (type, title) => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev(([t, title]) => A.Home.newDesign({ type: t, title }), [type, title]);
    await page.waitForFunction(() => A.E.d && A.E.blocks[A.E.pi]?.svg.isConnected);
    await wait(300);
    await ev(() => document.activeElement?.blur?.());
  };
  const center = async (id) => {
    const b = await page.locator(`.page-block.active .page-svg [data-id="${id}"]`).first().boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const clickEl = async (id, o) => { const c = await center(id); await page.mouse.click(c.x, c.y, o); await wait(); };
  // the rail button toggles, so only click it when that panel is not showing
  const rail = async (p) => {
    if (!(await ev((p) => A.EU.panelOpen && A.EU.panel === p, p))) await page.click(`.rail-btn[data-p="${p}"]`);
    await wait();
  };
  const tb = async (title) => { await page.click(`.ed-toolbar button[title="${title}"]`); await wait(); };
  const menu = async (label) => { await page.click(`.menu-item:has-text("${label}")`); await wait(300); };
  const els = () => ev(() => JSON.parse(JSON.stringify(A.E.els())));
  // a PNG file on disk for the real file chooser
  const pngFile = async (name, w, h, color) => {
    const b64 = await ev(([w, h, color]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, [w, h, color]);
    const p = path.join(OUT, name);
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    return p;
  };
  const uploadVia = async (file) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.panel-body button:has-text("Upload files")')]);
    await fc.setFiles(file);
  };
  // the connector's ends are on the shapes it joins, on page i
  const connected = (i) => ev((i) => {
    const pg = A.E.d.pages[i], l = pg.elements.find((e) => e.type === 'line');
    const ids = pg.elements.map((e) => e.id);
    return { c1: ids.includes(l.c1), c2: ids.includes(l.c2), ends: A.R.lineEnds(l, pg) };
  }, i);
  const savedTemplates = await ev(() => A.app.userTemplates);
  const savedBrand = await ev(() => A.app.brand);
  await ev(() => { A.AI._t = { ready: A.AI.ready, rewrite: A.AI.rewrite, translate: A.AI.translate, assistant: A.AI.assistant }; });
  const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  await step('panels: a user template with a connector keeps it joined; replacing a page drops its comments (state-15, render-20, ui-12, state-21)', async () => {
    await open('presentation');
    await ev((thumb) => {
      const M = A.M;
      const a = M.newShape('rect', { x: 100, y: 100, w: 300, h: 200 }), b = M.newShape('ellipse', { x: 1200, y: 600, w: 300, h: 300 });
      const l = M.newLine({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 }, c1: a.id, c2: b.id, end: 'triangle' });
      M.syncLineBox(l);
      const design = JSON.parse(JSON.stringify({ ...A.E.d, pages: [M.newPage({ elements: [a, b, l] })], comments: [] }));
      A.app.userTemplates = [{ id: 'ut_panels_conn', name: 'Panels connector tpl', type: design.type, w: design.width, h: design.height, tags: 'my template', thumb, design }, ...(A.app.userTemplates || [])];
    }, GIF);
    await rail('design');
    await page.fill('.panel-body input.search', 'panels connector');
    await page.click('.tpl-card[title="Panels connector tpl"]');
    await menu('Add as new page(s)');
    ok((await ev(() => [A.E.d.pages.length, A.E.pi])).join() === '2,1', 'template page not added after the current one');
    let s = await connected(1);
    ok(s.c1 && s.c2, 'inserted connector points at missing shapes', s);
    ok(s.ends.p1.x >= 100 && s.ends.p2.x >= 1200, 'connector not drawn between its shapes', s.ends);
    // replace the inserted page; its comment goes with it
    await ev(() => { A.E.d.comments.push({ id: 'c_panels', pageId: A.E.page().id, elId: null, x: 10, y: 10, author: 'You', text: 'x', ts: Date.now(), replies: [], resolved: false }); A.E.changed(); });
    await page.click('.tpl-card[title="Panels connector tpl"]');
    await menu('Replace current page');
    ok((await ev(() => A.E.d.pages.length)) === 2, 'replace changed the page count');
    s = await connected(1);
    ok(s.c1 && s.c2, 'connector detached after Replace current page', s);
    ok((await ev(() => A.E.d.comments.filter((c) => c.id === 'c_panels').length)) === 0, 'comment of the replaced page left dangling');
  });

  await step("panels: Projects 'Add its pages here' keeps connectors joined (state-15, ui-12)", async () => {
    await open('whiteboard', 'Panels connector source');
    await ev(async () => {
      const M = A.M;
      const a = M.newShape('rect', { x: 200, y: 200, w: 300, h: 200 }), b = M.newShape('rect', { x: 1200, y: 700, w: 300, h: 200 });
      const l = M.newLine({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 }, c1: a.id, c2: b.id });
      M.syncLineBox(l);
      A.E.page().elements.push(a, b, l);
      A.E.changed();
      await A.E.save();
    });
    await open('whiteboard', 'Panels connector target');
    await rail('projects');
    await page.click('.proj-item:has-text("Panels connector source")');
    await menu('Add its pages here');
    await page.waitForFunction(() => A.E.d.pages.length === 2);
    const s = await connected(1);
    ok(s.c1 && s.c2, 'imported connector points at missing shapes', s);
    ok(s.ends.p1.x >= 200 && s.ends.p2.x >= 1000, 'imported connector drawn at stale points', s.ends);
  });

  await step('panels: a user template photo not loaded this session shows the photo (ui-13)', async () => {
    await open('presentation');
    const id = await ev(async (thumb) => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 300;
      const g = c.getContext('2d'); g.fillStyle = '#00bf63'; g.fillRect(0, 0, 400, 300);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      // stored directly, as after a reload: no object URL yet
      const a = { id: 'a_panels_tpl' + Date.now(), blob, type: 'image/png', name: 'tpl.png', kind: 'image', w: 400, h: 300, createdAt: Date.now(), hidden: true, tag: '' };
      await A.S.put('assets', a);
      const im = A.M.newImage(a, { x: 300, y: 200, w: 800, h: 600 });
      const design = JSON.parse(JSON.stringify({ ...A.E.d, pages: [A.M.newPage({ elements: [im] })], comments: [] }));
      A.app.userTemplates = [{ id: 'ut_panels_photo', name: 'Panels photo tpl', type: design.type, w: design.width, h: design.height, tags: 'my template', thumb, design }, ...A.app.userTemplates];
      return a.id;
    }, GIF);
    ok((await ev((id) => A.S.assetURL(id), id)) === '', 'test asset already has a URL');
    await rail('design');
    await page.fill('.panel-body input.search', 'panels photo');
    await page.click('.tpl-card[title="Panels photo tpl"]');
    await menu('Replace current page');
    const r = await ev(() => {
      const el = A.E.els().find((e) => e.type === 'image');
      const g = document.querySelector(`.page-block.active .page-svg [data-id="${el.id}"]`);
      return { href: g?.querySelector('image')?.getAttribute('href') || '', placeholder: !!g?.querySelector('rect[fill="#e5e5ea"]') };
    });
    ok(r.href.startsWith('blob:') && !r.placeholder, 'template photo drawn as a placeholder', r);
  });

  await step('panels: Layers thumbnails carry their gradients, filters and clips (render-23, ui-26)', async () => {
    await open('presentation');
    const ids = await ev(() => {
      const M = A.M;
      const g = M.newShape('rect', { x: 100, y: 100, w: 400, h: 300, fill: 'grad:#ff0000:#0000ff:90' });
      const s = M.newShape('ellipse', { x: 700, y: 100, w: 300, h: 300, fill: '#8c52ff', shadow: true });
      const t = M.newText({ text: 'Neon', x: 100, y: 600, w: 600, size: 90, color: '#ff66c4', effect: { type: 'neon', intensity: 60 } });
      t.h = A.R.textHeight(t);
      A.E.page().elements.push(g, s, t);
      A.E.changed();
      return [g.id, s.id, t.id];
    });
    await clickEl(ids[0]);
    await tb('Position');
    await page.click('.panel-body .p-tab:has-text("Layers")');
    await wait();
    const refs = await ev(() => [...document.querySelectorAll('.layer-thumb svg')].map((svg) => {
      const used = [...svg.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      return { used: used.length, missing: used.filter((id) => !svg.querySelector('#' + CSS.escape(id))) };
    }));
    ok(refs.length === 3, 'expected 3 layer rows', refs);
    ok(refs.filter((r) => r.used).length >= 3, 'thumbnails lost their paint/filter references', refs);
    ok(refs.every((r) => !r.missing.length), 'thumbnail references defs it does not contain', refs);
  });

  await step('panels: Tab moves to the next table cell and keeps typing there (ui-7)', async () => {
    await open('presentation');
    const id = await ev(() => {
      const t = A.M.newTable(3, 3, { x: 200, y: 200, w: 900, h: 300, cells: [['', '', '=A1+B1'], ['', '', ''], ['', '', '']] });
      A.E.page().elements.push(t);
      A.E.changed();
      return t.id;
    });
    const n0 = (await els()).length;
    const c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForSelector('.tbl-cell');
    const cell = (k) => page.locator('.tbl-cell').nth(k);
    await cell(3).click();
    await page.keyboard.type('cat');
    await page.keyboard.press('Tab');
    await page.keyboard.type('rat');
    await page.keyboard.press('Tab');
    await wait();
    let r = await ev((id) => ({ cells: A.E.byId(id).cells, n: A.E.els().length, active: document.activeElement?.className, panel: A.EU.panel }), id);
    ok(r.cells[1][0] === 'cat' && r.cells[1][1] === 'rat', 'typing after Tab did not reach the next cell', r);
    ok(r.n === n0 && r.panel === 'table' && r.active === 'tbl-cell', 'focus left the table editor', r);
    // formula results refresh in place
    await cell(0).click();
    await page.keyboard.type('2');
    await page.keyboard.press('Tab');
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
    await wait();
    r = await ev(() => ({ title: document.querySelectorAll('.tbl-cell')[2].title, active: document.activeElement === document.querySelectorAll('.tbl-cell')[2] }));
    ok(r.title === '5' && r.active, 'formula title stale or focus lost', r);
  });

  await step('panels: uploading in Background, Replace and Frame mode uses the new photo (ui-8)', async () => {
    await open('presentation');
    const file = await pngFile('panels-upload.png', 300, 200, '#ff3131');
    // background
    await ev(() => A.E.deselect());
    await tb('Background image');
    await uploadVia(file);
    await page.waitForFunction(() => A.E.page().bg?.asset, null, { timeout: 5000 });
    let e = await els();
    ok(!e.some((x) => x.type === 'image'), 'background upload also added a loose image', e.map((x) => x.type));
    // replace
    const imgId = await ev(async () => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400;
      c.getContext('2d').fillRect(0, 0, 400, 400);
      const a = await A.S.addAsset(await new Promise((r) => c.toBlob(r, 'image/png')), { name: 'orig.png' });
      const el = A.E.addImageAsset(a);
      A.E.deselect();
      return el.id;
    });
    const before = (await els()).find((x) => x.id === imgId);
    await clickEl(imgId, { button: 'right' });
    await menu('Replace image');
    await uploadVia(file);
    await page.waitForFunction(([id, a]) => A.E.byId(id).asset !== a, [imgId, before.asset], { timeout: 5000 });
    e = await els();
    const im = e.find((x) => x.id === imgId);
    ok(e.filter((x) => x.type === 'image').length === 1, 'replace upload added another image', e.map((x) => x.type));
    ok(im.nw === 300 && im.nh === 200 && Math.abs(im.h / im.w - 2 / 3) < 0.01, 'replaced photo has the wrong size', im);
    // frame
    const frId = await ev(() => { const s = A.M.newShape('rect', { x: 1300, y: 600, w: 300, h: 300, fill: '#d9d9de' }); A.E.page().elements.push(s); A.E.deselect(); A.E.changed(); return s.id; });
    await clickEl(frId, { button: 'right' });
    await menu('Use as photo frame');
    await uploadVia(file);
    await page.waitForFunction((id) => A.E.byId(id).asset, frId, { timeout: 5000 });
    e = await els();
    ok(e.filter((x) => x.type === 'image').length === 1, 'frame upload added a loose image', e.map((x) => x.type));
  });

  await step('panels: Upscale 2x keeps the crop of a cropped photo (ui-9)', async () => {
    await open('presentation');
    const id = await ev(async () => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 400;
      const g = c.getContext('2d'); g.fillStyle = '#2b5876'; g.fillRect(0, 0, 800, 400); g.fillStyle = '#fff'; g.beginPath(); g.arc(400, 200, 150, 0, 7); g.fill();
      const a = await A.S.addAsset(await new Promise((r) => c.toBlob(r, 'image/png')), { name: 'wide.png' });
      const el = A.E.addImageAsset(a);
      A.E.deselect();
      return el.id;
    });
    await clickEl(id);
    await tb('Crop');
    await page.click('.panel-body .chip:has-text("1:1")');
    await wait();
    const cropped = (await els()).find((x) => x.id === id);
    ok(Math.abs(cropped.crop.w - 0.5) < 0.01 && Math.abs(cropped.w - cropped.h) < 1, 'crop 1:1 did not apply', cropped);
    await tb('Edit photo');
    await page.click('.panel-body .p-tab:has-text("Tools")');
    await page.click('.panel-body .app-item:has-text("Upscale")');
    await page.waitForFunction(([id, a]) => A.E.byId(id).asset !== a, [id, cropped.asset], { timeout: 15000 });
    const up = (await els()).find((x) => x.id === id);
    ok(JSON.stringify(up.crop) === JSON.stringify(cropped.crop), 'upscale reset the crop', up.crop);
    const shown = (up.crop.w * up.nw) / (up.crop.h * up.nh);
    ok(up.nw === 1600 && Math.abs(up.w / up.h - shown) < 0.01, 'upscaled photo is stretched', { w: up.w, h: up.h, nw: up.nw, nh: up.nh, shown });
  });

  await step('panels: Animate keeps the picked Page tab after choosing an animation (ui-15)', async () => {
    await open('presentation');
    const [a, b] = await ev(() => {
      const s1 = A.M.newShape('rect', { x: 100, y: 100, w: 300, h: 300 }), s2 = A.M.newShape('rect', { x: 900, y: 100, w: 300, h: 300 });
      A.E.page().elements.push(s1, s2);
      A.E.changed();
      return [s1.id, s2.id];
    });
    await clickEl(a);
    await tb('Animate');
    const tab = () => page.locator('.panel-body .p-tab.on').textContent();
    ok((await tab()) === 'Element', 'animate did not open on Element');
    await page.click('.panel-body .p-tab:has-text("Page")');
    await page.click('.panel-body .anim-item:has-text("Fade") >> nth=0');
    await wait();
    await ev(() => A.Present.stopPreview());
    ok((await ev(() => A.E.page().anim)) === 'fade', 'page animation not set');
    ok((await tab()) === 'Page', 'tab jumped back to Element');
    await clickEl(b);
    ok((await tab()) === 'Element', 'a new selection kept the old tab');
  });

  await step('panels: Delay shows the delay the element actually waits (present-14)', async () => {
    await open('presentation');
    const ids = await ev(() => {
      const list = [0, 1, 2, 3, 4].map((i) => A.M.newShape('rect', { x: 80 + i * 340, y: 300, w: 300, h: 300 }));
      list[4].anim = { in: 'fade' };
      A.E.page().elements.push(...list);
      A.E.page().anim = 'fade';
      A.E.changed();
      return list.map((e) => e.id);
    });
    // when R.anim starts fading the element in
    const starts = (id) => ev((id) => {
      const pg = A.E.page(), el = A.E.byId(id), idx = pg.elements.filter((e) => !e.hidden).indexOf(el);
      for (let t = 0; t < 5; t += 0.01) if (A.R.anim(el, t, pg.duration || 5, idx, pg).o > 0.001) return t;
      return null;
    }, id);
    const delayShown = () => page.locator('.panel-body .slider-row:has-text("Delay") input.num').inputValue();
    for (const id of [ids[3], ids[4]]) {
      await clickEl(id);
      await tb('Animate');
      const shown = +(await delayShown()), t0 = await starts(id);
      ok(t0 !== null && Math.abs(shown - t0) <= 0.02, 'Delay slider does not match the applied delay', { shown, t0 });
    }
  });

  await step('panels: Effects start from the new effect’s defaults (ui-24)', async () => {
    await open('presentation');
    const id = await ev(() => { const t = A.M.newText({ text: 'Effects', x: 200, y: 200, w: 800, size: 100 }); t.h = A.R.textHeight(t); A.E.page().elements.push(t); A.E.changed(); return t.id; });
    await clickEl(id);
    await tb('Effects');
    await page.click('.fx-item:has-text("Shadow")');
    await wait();
    const tr = page.locator('.panel-body .slider-row:has-text("Transparency") input.num');
    await tr.fill('90');
    await tr.press('Enter');
    await wait();
    ok((await ev((id) => A.E.byId(id).effect.transparency, id)) === 90, 'shadow transparency not set');
    await page.click('.fx-item:has-text("Background")');
    await wait();
    const eff = await ev((id) => A.E.byId(id).effect, id);
    ok(JSON.stringify(eff) === '{"type":"background"}', 'background effect inherited shadow settings', eff);
    ok((await tr.inputValue()) === '0', 'background transparency slider not at its default');
    // picking the current effect again keeps its settings
    await tr.fill('40');
    await tr.press('Enter');
    await page.click('.fx-item:has-text("Background")');
    await wait();
    ok((await ev((id) => A.E.byId(id).effect.transparency, id)) === 40, 'clicking the active effect reset it');
  });

  await step('panels: brand font buttons on a locked page change nothing (ui-22)', async () => {
    await open('presentation');
    await ev(() => { A.app.brand = { ...(A.app.brand || {}), fonts: { heading: 'Georgia' } }; });
    const id = await ev(() => { const t = A.M.newText({ text: 'Existing', x: 200, y: 200, w: 800, size: 60, font: 'Inter' }); t.h = A.R.textHeight(t); A.E.page().elements.push(t); A.E.changed(); return t.id; });
    await rail('text');
    const brandBtn = '.panel-body .font-set:has-text("Georgia")';
    await page.click(brandBtn);
    let e = await els();
    ok(e.length === 2 && e[1].font === 'Georgia', 'brand heading not added on an unlocked page', e.map((x) => x.font));
    await ev((id) => { A.E.page().elements = A.E.els().filter((x) => x.id === id); A.E.page().locked = true; A.E.select([id]); A.E.changed({ structure: true }); }, id);
    await page.click(brandBtn);
    e = await els();
    ok(e.length === 1 && e[0].font === 'Inter', 'locked page: brand button restyled the selection', e.map((x) => x.font));
    await ev(() => A.E.deselect());
    await page.click(brandBtn);
    ok((await els()).length === 1, 'locked page: brand button added text');
    await ev(() => { A.E.page().locked = false; A.E.changed({ structure: true }); });
  });

  await step('panels: AI rewrite goes to the text selected at click time (ui-27)', async () => {
    await open('presentation');
    await ev(() => { A.AI.ready = () => true; A.AI.rewrite = async (t, how) => { await new Promise((r) => setTimeout(r, 400)); return how.split(' ')[0] + ': ' + t; }; });
    const [hd, sub] = await ev(() => {
      const a = A.M.newText({ text: 'Project Atlas', x: 200, y: 150, w: 900, size: 80 }), b = A.M.newText({ text: 'A clear plan', x: 200, y: 500, w: 900, size: 40 });
      a.h = A.R.textHeight(a); b.h = A.R.textHeight(b);
      A.E.page().elements.push(a, b);
      A.E.changed();
      return [a.id, b.id];
    });
    const texts = () => ev(([a, b]) => [A.E.byId(a).text, A.E.byId(b).text], [hd, sub]);
    // panel opened with nothing selected still offers rewrite once text is selected
    await rail('ai');
    await clickEl(sub);
    await page.click('.panel-body .chip:has-text("Shorter")');
    await page.waitForFunction((id) => A.E.byId(id).text.startsWith('shorter:'), sub, { timeout: 5000 });
    // the selection moves on while the rewrite runs
    await clickEl(hd);
    await clickEl(sub);
    await page.click('.panel-body .chip:has-text("Formal")');
    await clickEl(hd);
    await page.waitForFunction((id) => A.E.byId(id).text.startsWith('more:'), sub, { timeout: 5000 });
    const t = await texts();
    ok(t[0] === 'Project Atlas' && t[1] === 'more: shorter: A clear plan', 'rewrite went to the wrong text', t);
  });

  await step('panels: an AI rewrite of the text being edited ends the edit and keeps the rewrite (ui-27)', async () => {
    await open('presentation');
    await ev(() => { A.AI.ready = () => true; A.AI.rewrite = async () => { await new Promise((r) => setTimeout(r, 300)); return 'REWRITTEN'; }; });
    const id = await ev(() => { const t = A.M.newText({ text: 'Original words', x: 200, y: 200, w: 900, size: 80 }); t.h = A.R.textHeight(t); A.E.page().elements.push(t); A.E.changed(); return t.id; });
    await rail('ai');
    const c = await center(id);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForSelector('textarea.text-edit');
    await page.click('.panel-body .chip:has-text("Shorter")');
    await page.waitForFunction((id) => A.E.byId(id).text === 'REWRITTEN', id, { timeout: 5000 });
    await page.keyboard.type('!');
    await page.keyboard.press('Escape');
    const t = await ev((id) => A.E.byId(id).text, id);
    ok(t.startsWith('REWRITTEN'), 'the open text box wrote the old text back', t);
  });

  await step('panels: Font sets, Translate and the assistant keep curved text sized from its arc (text-9)', async () => {
    await open('presentation');
    const id = await ev(() => { const t = A.M.newText({ text: 'Curved words', x: 300, y: 200, w: 400, size: 60, curve: 60 }); A.R.fitText(t); A.E.page().elements.push(t); A.E.changed(); return t.id; });
    const fit = async (what) => {
      const r = await ev((id) => { const el = A.E.byId(id), g = A.R.curveGeom(el); return { w: el.w, h: el.h, gw: g.w, gh: g.h, font: el.font, size: el.size, text: el.text }; }, id);
      ok(Math.abs(r.w - r.gw) < 0.5 && Math.abs(r.h - r.gh) < 0.5, 'curved box not refitted after ' + what, r);
      return r;
    };
    const f0 = await fit('opening');
    await rail('design');
    await page.click('.ed-panel .p-tab:text-is("Styles")');
    await page.click('.ed-panel .font-set >> nth=2');
    ok((await fit('a font set')).font !== f0.font, 'font set not applied');
    await ev(async () => { A.AI.translate = async (strs) => strs.map(() => 'Mots courbés'); await A.EU.translateDesign(A.E.d, 'French'); A.E.changed(); });
    ok((await fit('Translate')).text === 'Mots courbés', 'not translated');
    await ev((id) => { A.AI.ready = () => true; A.AI.assistant = async () => ({ reply: 'Bigger', ops: [{ op: 'update', id, props: { size: 90 } }] }); }, id);
    await rail('ai');
    await page.fill('.ed-panel input[placeholder^="Ask the assistant"]', 'Make it bigger');
    await page.keyboard.press('Enter');
    await page.waitForFunction((id) => A.E.byId(id).size === 90, id, { timeout: 5000 });
    await fit('an assistant update');
  });

  await ev(([tpls, brand]) => {
    A.app.userTemplates = tpls;
    A.app.brand = brand;
    Object.assign(A.AI, A.AI._t);
    delete A.AI._t;
  }, [savedTemplates, savedBrand]);
}
