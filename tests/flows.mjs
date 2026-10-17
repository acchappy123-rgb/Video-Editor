// Editor flows used by tests/smoke.mjs
import fs from 'fs';
import path from 'path';
export default async function ({ page, step, shot, OUT }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const dl = async (fmt, name, extra = {}) => {
    const [d] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      ev(([f, o]) => A.EU.runExport(f, A.E.d.pages, o), [fmt, extra]),
    ]);
    const p = path.join(OUT, name || d.suggestedFilename());
    await d.saveAs(p);
    const size = fs.statSync(p).size;
    if (size < 200) throw new Error(fmt + ' export too small: ' + size);
    return p;
  };

  await step('open template into editor', async () => {
    await page.click('.tpl-card >> nth=3'); // Pitch deck
    await page.waitForSelector('.page-svg');
    await page.waitForTimeout(500);
    await shot('02-editor-deck');
  });
  await step('toolbar + selection on click', async () => {
    const id = await ev(() => A.E.els().find((e) => e.type === 'text').id);
    const box = await page.locator(`.page-svg [data-id="${id}"]`).boundingBox();
    await page.mouse.click(box.x + 20, box.y + 20);
    await page.waitForSelector('.sel-box');
    await page.waitForSelector('.font-btn');
    await shot('03-text-selected');
  });
  await step('drag moves element and snaps', async () => {
    const before = await ev(() => ({ ...A.E.selEls()[0] }));
    const box = await page.locator('.sel-box').boundingBox();
    await page.mouse.move(box.x + 30, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 6 });
    await shot('04-dragging');
    await page.mouse.up();
    const after = await ev(() => ({ ...A.E.selEls()[0] }));
    if (after.x === before.x && after.y === before.y) throw new Error('did not move');
  });
  await step('undo restores position', async () => {
    const x1 = await ev(() => A.E.selEls()[0]?.x ?? A.E.els().find((e) => e.type === 'text').x);
    await page.keyboard.press('Control+z');
    const x0 = await ev(() => A.E.els().find((e) => e.type === 'text').x);
    if (x0 === x1) throw new Error('undo did nothing');
  });
  await step('add shapes/text via shortcuts', async () => {
    await ev(() => A.E.deselect());
    await page.keyboard.press('r');
    await page.keyboard.press('c');
    await page.keyboard.press('l');
    const n = await ev(() => A.E.els().length);
    if (n < 6) throw new Error('only ' + n + ' elements');
  });
  await step('resize with corner handle', async () => {
    await ev(() => { const s = A.E.els().find((e) => e.type === 'shape' && e.shape === 'ellipse'); A.E.select([s.id]); });
    const w0 = await ev(() => A.E.selEls()[0].w);
    const hb = await page.locator('.handle.se').boundingBox();
    await page.mouse.move(hb.x + 7, hb.y + 7);
    await page.mouse.down();
    await page.mouse.move(hb.x + 60, hb.y + 40, { steps: 5 });
    await page.mouse.up();
    const w1 = await ev(() => A.E.selEls()[0].w);
    if (!(w1 > w0)) throw new Error('not resized');
  });
  await step('rotate handle', async () => {
    const rb = await page.locator('.rot-handle').boundingBox();
    await page.mouse.move(rb.x + 13, rb.y + 13);
    await page.mouse.down();
    await page.mouse.move(rb.x + 120, rb.y - 40, { steps: 5 });
    await page.mouse.up();
    const r = await ev(() => A.E.selEls()[0].rot);
    if (!r) throw new Error('rotation 0');
    await shot('05-rotated');
  });
  await step('text editing via double-click', async () => {
    await ev(() => A.E.addText('heading'));
    await page.waitForTimeout(100);
    const box = await page.locator('.sel-box').boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector('textarea.text-edit');
    await page.keyboard.type('Hello Atelier');
    await page.keyboard.press('Escape');
    const t = await ev(() => A.E.els().filter((e) => e.type === 'text').map((e) => e.text));
    if (!t.includes('Hello Atelier')) throw new Error('text not saved: ' + t.join('|'));
  });
  await step('text effects all render', async () => {
    await ev(() => {
      const types = ['shadow', 'lift', 'hollow', 'splice', 'echo', 'glitch', 'neon', 'background'];
      const els = types.map((t, i) => { const el = A.M.newText({ text: t.toUpperCase(), x: 60 + (i % 4) * 440, y: 120 + Math.floor(i / 4) * 160, w: 420, size: 72, bold: true, color: '#5e17eb', effect: { type: t } }); el.h = A.R.textHeight(el); return el; });
      const c = A.M.newText({ text: 'CURVED TEXT ROCKS', x: 600, y: 520, w: 600, size: 60, curve: 60, color: '#ff3131' });
      const g = A.R.curveGeom(c); c.w = g.w; c.h = g.h;
      A.E.addPage(A.E.d.pages.length);
      A.E.page().elements.push(...els, c);
      A.E.changed({ structure: true });
    });
    await page.waitForTimeout(300);
    await shot('06-effects');
  });
  await step('elements page: charts, table, icons, sticky, line connector, draw', async () => {
    await ev(() => {
      const M = A.M;
      A.E.addPage(A.E.d.pages.length);
      const a = M.newShape('rounded', { x: 100, y: 100, w: 300, h: 160, fill: '#ffde59', text: 'Start', size: 40, align: 'center', color: '#222' });
      const b = M.newShape('ellipse', { x: 700, y: 400, w: 260, h: 260, fill: '#38b6ff', text: 'End', size: 40, align: 'center', color: '#fff' });
      const l = M.newLine({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 }, c1: a.id, c2: b.id, end: 'triangle', elbow: true, strokeWidth: 6 });
      M.syncLineBox(l);
      const els = [a, b, l, M.newChart('bar', { x: 1100, y: 80, w: 700, h: 400 }), M.newChart('donut', { x: 1100, y: 560, w: 700, h: 400 }),
        M.newTable(4, 3, { x: 100, y: 700, w: 520, h: 220, cells: [['A', 'B', 'Sum'], ['1', '2', '=A2+B2'], ['3', '4', '=A3+B3'], ['', 'Total', '=SUM(C2:C3)']] }),
        M.newIcon('heart', { x: 450, y: 120, w: 150, h: 150, fill: '#ff3131' }), M.newSticky({ x: 700, y: 80, votes: 3 }),
        { ...M.newText(), type: 'emoji', text: '🚀', x: 450, y: 320, w: 140, h: 140 },
        M.newDraw({ x: 600, y: 800, w: 400, h: 200, pts: [[0, 1], [0.25, 0], [0.5, 1], [0.75, 0], [1, 1]], strokeWidth: 10, stroke: '#00bf63' })];
      A.E.page().elements.push(...els);
      A.E.page().bg = { color: 'grad:#ffffff:#efe6fd:135' };
      A.E.changed({ structure: true });
    });
    await page.waitForTimeout(300);
    const cell = await ev(() => A.R.evalCell(A.E.els().find((e) => e.type === 'table').cells, 3, 2));
    if (cell !== '10') throw new Error('formula result ' + cell);
    await shot('07-elements');
  });
  await step('upload image + filters + crop render', async () => {
    await ev(async () => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 600;
      const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 800, 600); gr.addColorStop(0, '#ff9a9e'); gr.addColorStop(1, '#2b5876'); g.fillStyle = gr; g.fillRect(0, 0, 800, 600);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(400, 300, 150, 0, 7); g.fill();
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const a = await A.S.addAsset(blob, { name: 'test.png' });
      A.E.addPage(A.E.d.pages.length);
      const im1 = A.E.addImageAsset(a); im1.x = 60; im1.y = 60; im1.adj = { saturation: -100, contrast: 30, vignette: 60 }; im1.radius = 40;
      const im2 = A.E.addImageAsset(a); im2.x = 900; im2.y = 60; im2.duo = ['#3a0ca3', '#f72585']; im2.crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }; im2.w = 400; im2.h = 300; im2.shadow = true;
      const fr = A.M.newShape('heart', { x: 300, y: 600, w: 400, h: 380, frame: true, asset: a.id });
      A.E.page().elements.push(fr);
      A.E.page().bg = { color: '#fff', asset: a.id, adj: { blur: 8 }, overlay: '#000', overlayOpacity: 0.3 };
      A.E.changed();
    });
    await page.waitForTimeout(400);
    await shot('08-images');
  });
  await step('local photo tools run', async () => {
    const ok = await ev(async () => {
      const a = (await A.S.listAssets('image'))[0];
      const r1 = await A.I.removeBackground(a.blob);
      const r2 = await A.I.upscale(a.blob, 2);
      const r3 = await A.I.expand(a.blob, 0.2);
      const c = await A.I.toCanvas(a.blob, 200); const m = new Uint8Array(c.width * c.height); m.fill(1, 1000, 3000); A.I.inpaint(c, m);
      return [r1.size, r2.size, r3.size].every((s) => s > 1000);
    });
    if (!ok) throw new Error('photo tools failed');
  });
  await step('panels open without errors', async () => {
    for (const p of ['design', 'elements', 'text', 'brand', 'uploads', 'draw', 'projects', 'apps', 'ai', 'position', 'animate', 'comments']) {
      if (['design', 'elements', 'text', 'brand', 'uploads', 'draw', 'projects', 'apps', 'ai'].includes(p)) await page.click(`.rail-btn[data-p="${p}"]`);
      else await ev((x) => A.EU.openPanel(x), p);
      await page.waitForTimeout(120);
    }
    await ev(() => { A.E.select([A.E.els().find((e) => e.type === 'image').id]); });
    for (const p of ['imageEdit', 'crop', 'position', 'animate']) { await ev((x) => A.EU.openPanel(x), p); await page.waitForTimeout(100); }
    for (const t of ['filters', 'adjust', 'effects', 'tools']) { await ev((x) => { A.P.state.imgTab = x; A.EU.openPanel('imageEdit'); }, t); await page.waitForTimeout(80); }
    await shot('09-image-panel');
    await ev(() => { A.E.setPage(1); A.E.select([A.E.els().find((e) => e.type === 'text').id]); A.EU.openPanel('effects'); });
    await page.waitForTimeout(150);
    await shot('10-effects-panel');
    await ev(() => { A.E.setPage(A.E.d.pages.findIndex((p) => p.elements.some((e) => e.type === 'table'))); A.E.select([A.E.els().find((e) => e.type === 'chart').id]); A.EU.openPanel('chart'); });
    await ev(() => { A.E.select([A.E.els().find((e) => e.type === 'table').id]); A.EU.openPanel('table'); });
    await ev(() => { A.E.select([A.E.els().find((e) => e.type === 'line').id]); });
    await page.waitForTimeout(100);
    await shot('11-line-selected');
    await ev(() => { A.E.deselect(); A.EU.openPanel('elements'); });
  });
  await step('group, align, distribute, order, copy/paste', async () => {
    await ev(() => {
      const ids = A.E.els().filter((e) => e.type === 'shape').map((e) => e.id);
      A.E.select(ids); A.E.group(); A.E.ungroup(); A.E.align('left'); A.E.undo();
      A.E.selectAll(); A.E.distribute('h'); A.E.undo(); A.E.order('front'); A.E.copy(); A.E.paste(); A.E.deleteSel(); A.E.undo();
    });
  });
  await step('animation preview + present mode', async () => {
    await ev(() => { A.E.setPage(0); A.Present.preview(); });
    await page.waitForTimeout(400);
    await ev(() => A.Present.stopPreview());
    await ev(() => A.Present.start({ fullscreen: false }));
    await page.waitForSelector('.present');
    await page.waitForTimeout(500);
    await shot('12-present');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    await shot('13-presenter-view');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.present', { state: 'detached' });
  });
  await step('comments + version history + resize dialogs', async () => {
    await ev(() => { A.E.d.comments.push({ id: 'c1', pageId: A.E.page().id, elId: null, x: 300, y: 200, author: 'You', text: 'Looks good @sam', ts: Date.now(), replies: [], resolved: false }); A.E.changed(); A.EU.openPanel('comments'); });
    await page.waitForTimeout(100);
    await shot('14-comments');
    await ev(() => A.EU.historyDialog());
    await page.waitForSelector('.modal');
    await page.keyboard.press('Escape');
    await ev(() => A.EU.resizeDialog());
    await page.waitForSelector('.modal');
    await shot('15-resize');
    await page.keyboard.press('Escape');
    await ev(() => A.EU.downloadDialog());
    await page.waitForSelector('.modal');
    await shot('16-download');
    await page.keyboard.press('Escape');
    await ev(() => A.EU.shareDialog());
    await page.waitForSelector('.modal');
    await shot('17-share');
    await page.keyboard.press('Escape');
  });
  for (const [fmt, name] of [['png', 'export.zip'], ['jpg', 'export-jpg.zip'], ['svg', 'export-svg.zip'], ['pdf', 'export.pdf'], ['pdfprint', 'export-print.pdf'], ['pptx', 'export.pptx'], ['html', 'export.html'], ['design', 'export.atelier.json']])
    await step('export ' + fmt, async () => { await dl(fmt, name, { scale: 1, bleed: true, marks: true }); });
  await step('export gif (first page only)', async () => {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), ev(() => A.EU.runExport('gif', [A.E.d.pages[0]], {}))]);
    await d.saveAs(path.join(OUT, 'export.gif'));
  });
  await step('export single png', async () => {
    const [d] = await Promise.all([page.waitForEvent('download'), ev(() => A.EU.runExport('png', [A.E.d.pages[2]], { scale: 1 }))]);
    await d.saveAs(path.join(OUT, 'page3.png'));
  });
  await step('export video (short)', async () => {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), ev(() => { const p = { ...A.E.d.pages[0], duration: 1.5 }; return A.EU.runExport('video', [p], { scale: 0.5 }); })]);
    await d.saveAs(path.join(OUT, 'export-video.' + (d.suggestedFilename().split('.').pop())));
  });
  await step('autosave + back home shows card', async () => {
    await ev(() => A.E.saveNow.flush());
    await page.waitForTimeout(800);
    await page.click('.ed-top .icon-btn >> nth=0');
    await page.waitForSelector('.card');
    await page.waitForTimeout(300);
    await shot('18-home-with-design');
  });
  await step('import design file round-trip', async () => {
    const json = fs.readFileSync(path.join(OUT, 'export.atelier.json'), 'utf8');
    const n = await ev(async (j) => { const d = await A.S.importDesignFile(JSON.parse(j)); return d.pages.length; }, json);
    if (n < 4) throw new Error('pages ' + n);
  });
  await step('other home pages', async () => {
    for (const r of ['projects', 'templates', 'brand', 'apps', 'planner', 'ai']) { await page.goto(page.url().split('#')[0] + '#/' + r); await page.waitForTimeout(250); await shot('19-' + r); }
    await ev(() => A.Home.settings('ai'));
    await page.waitForTimeout(150);
    await shot('20-settings');
    await page.keyboard.press('Escape');
  });
  await step('new whiteboard + doc + video + sheet + custom', async () => {
    for (const t of ['whiteboard', 'doc', 'video', 'sheet', 'website']) {
      await ev((x) => A.Home.newDesign({ type: x }), t);
      await page.waitForSelector('.page-svg');
      await page.waitForTimeout(250);
      await shot('21-new-' + t);
      await ev(() => A.app.go('#/home'));
      await page.waitForSelector('.hero');
    }
  });
  await step('mobile layout', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(page.url().split('#')[0] + '#/home');
    await page.waitForSelector('.hero');
    await shot('22-mobile-home');
    await page.click('.card');
    await page.waitForSelector('.page-svg');
    await page.waitForTimeout(300);
    await shot('23-mobile-editor');
    await page.click('.rail-btn[data-p="elements"]');
    await page.waitForTimeout(300);
    await shot('24-mobile-panel');
  });
}
