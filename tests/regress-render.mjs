// Regression checks for the renderer (render.js): text hit areas and layout, effects, typewriter, formulas,
// charts, animation timing, connector ends, font CSS and escaping.
import fs from 'fs';
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 120) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  // Opens a new design whose first page holds `els` (partial element objects, built with the A.M factories).
  const open = async (type, els = []) => {
    await ev(() => A.app.go('#/home'));
    await page.waitForSelector('.hero');
    await ev(async ([type, els]) => {
      const M = A.M;
      const mk = (o) => {
        const el = o.type === 'text' ? M.newText(o) : o.type === 'chart' ? M.newChart(o.chart, o) : M.newShape(o.shape || 'rect', o);
        if (el.type === 'text') A.R.fitText(el);
        return el;
      };
      await A.Home.newDesign({ type, pages: [M.newPage({ elements: els.map(mk) })] });
    }, [type, els]);
    await page.waitForSelector('.page-svg');
    await page.waitForFunction(() => A.E.d && Object.keys(A.E.blocks).length && A.E.blocks[0].svg.isConnected);
    await wait(300);
    await ev(() => document.activeElement?.blur?.());
  };
  // client position of a page point on the active page
  const at = (x, y) => ev(([x, y]) => { const r = A.E.blocks[A.E.pi].svg.getBoundingClientRect(); return { x: r.left + x * A.E.zoom, y: r.top + y * A.E.zoom }; }, [x, y]);
  const get = (id) => ev((id) => JSON.parse(JSON.stringify(A.E.byId(id))), id);
  const drag = async (a, b, steps = 8) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps });
    await page.mouse.up();
  };

  await step('render: a text box takes clicks, drags and double-clicks anywhere inside it (transform-5, text-7)', async () => {
    await open('presentation', [{ type: 'text', id: 'tx', text: 'Hi\nthere', x: 100, y: 100, w: 1200, size: 60 }]);
    let e = await get('tx');
    // to the right of the short lines, and in the gap between them
    for (const [fx, fy] of [[0.8, 0.75], [0.5, 0.5], [0.02, 0.5]]) {
      await ev(() => A.E.deselect());
      const p = await at(e.x + e.w * fx, e.y + e.h * fy);
      await page.mouse.click(p.x, p.y);
      const sel = await ev(() => A.E.sel);
      ok(sel.length === 1 && sel[0] === 'tx', `click at ${fx},${fy} of the box did not select it`, sel);
    }
    const z = await ev(() => A.E.zoom);
    const p = await at(e.x + e.w * 0.8, e.y + e.h * 0.75);
    await drag(p, { x: p.x + 100 * z, y: p.y + 50 * z });
    const e1 = await get('tx');
    ok(Math.abs(e1.x - e.x - 100) < 3 && Math.abs(e1.y - e.y - 50) < 3, 'drag from a blank spot did not move the text', { from: [e.x, e.y], to: [e1.x, e1.y] });
    e = e1;
    await ev(() => A.E.deselect());
    const q = await at(e.x + e.w * 0.8, e.y + e.h * 0.75);
    await page.mouse.dblclick(q.x, q.y);
    await page.waitForSelector('textarea.text-edit');
    ok((await ev(() => A.E.editingId)) === 'tx', 'double-click on a blank spot did not edit');
    await page.keyboard.press('Escape');
  });

  await step("render: editing a shape's text keeps the shape drawn (text-3)", async () => {
    await open('doc', [{ shape: 'rect', id: 'sh', x: 200, y: 200, w: 400, h: 300, fill: '#8c52ff' }]);
    const c = await at(400, 350);
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForSelector('textarea.text-edit');
    await page.keyboard.type('Inside shape');
    await page.keyboard.press('Control+b'); // re-renders the page while editing
    await wait();
    const drawn = () => ev(() => {
      const g = document.querySelector('.page-block.active .page-svg [data-id="sh"]');
      return { body: !!g?.querySelector('path[fill="#8c52ff"]'), texts: g ? [...g.querySelectorAll('text')].map((t) => t.textContent) : null };
    });
    let s = await drawn();
    ok(s.body && s.texts.length === 0, 'shape hidden (or its text drawn twice) while editing', s);
    // a click inside the shape but outside the textarea still hits the shape
    const corner = await at(215, 215);
    await page.mouse.click(corner.x, corner.y);
    await wait();
    ok((await ev(() => A.E.sel)).includes('sh'), 'click inside the edited shape deselected it');
    await ev(() => A.E.finishText());
    await wait();
    s = await drawn();
    ok(s.body && s.texts.join('').includes('Inside shape'), 'shape text not drawn after editing', s);
  });

  await step('render: a long word after other words is broken inside the box (text-8)', async () => {
    const url = 'https://example.com/a/very/long/path/that/keeps/going';
    await open('presentation', [{ type: 'text', id: 'lw', text: 'see ' + url, x: 100, y: 100, w: 500, size: 48 }, { type: 'text', id: 'nw', text: 'one two three four five six seven', x: 100, y: 600, w: 300, size: 40 }]);
    const r = await ev(() => {
      const L = (id) => A.R.layoutText(A.E.byId(id), A.E.byId(id).w).lines.map((l) => [l.t, l.w]);
      const bw = (id) => document.querySelector(`.page-svg [data-id="${id}"] text`).getBBox().width;
      return { lw: L('lw'), nw: L('nw'), bbox: bw('lw') };
    });
    ok(r.lw.length >= 3 && r.lw[0][0] === 'see' && r.lw.every(([, w]) => w <= 500.5), 'long word not broken', r.lw);
    ok(r.lw.slice(1).map(([t]) => t).join('') === url, 'characters lost when breaking', r.lw);
    ok(r.bbox <= 502, 'rendered text wider than its box', r.bbox);
    // ordinary words still wrap whole
    ok(r.nw.length > 1 && r.nw.map(([t]) => t).join(' ') === 'one two three four five six seven' && r.nw.every(([, w]) => w <= 300.5), 'word wrap changed', r.nw);
  });

  await step('render: curved text box keeps its arc size after Ctrl+B (text-9)', async () => {
    await open('presentation', [{ type: 'text', id: 'cv', text: 'Curved words', x: 300, y: 200, w: 400, size: 60, curve: 60 }]);
    const fit = await ev(() => { const el = A.E.byId('cv'), g = A.R.curveGeom(el); return [el.w, el.h, g.w, g.h]; });
    ok(Math.abs(fit[0] - fit[2]) < 0.01 && Math.abs(fit[1] - fit[3]) < 0.01, 'R.fitText did not size curved text', fit);
    await ev(() => A.E.select(['cv']));
    await ev(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+b');
    const r = await ev(() => { const el = A.E.byId('cv'), g = A.R.curveGeom(el); return { bold: el.bold, w: el.w, h: el.h, gw: g.w, gh: g.h }; });
    ok(r.bold && Math.abs(r.w - r.gw) < 0.5 && Math.abs(r.h - r.gh) < 0.5, 'curved box not refitted after Ctrl+B', r);
  });

  await step('render: curved text renders every text effect (text-10, render-16)', async () => {
    const r = await ev(() => {
      const M = A.M, R = A.R;
      const out = {};
      for (const [type] of M.EFFECTS) {
        const el = M.newText({ text: 'Curved', size: 60, curve: 50, effect: { type } });
        R.fitText(el);
        const ctx = { idp: 'k', defs: [] };
        const svg = R.textSVG(el, ctx, { x: 0, y: 0, w: el.w, h: el.h });
        out[type] = { texts: (svg.match(/<text /g) || []).length, paths: (svg.match(/<textPath /g) || []).length, filter: /filter="url\(#/.test(svg), stroke: / stroke="(?!none)/.test(svg), defs: ctx.defs.length };
      }
      return out;
    });
    ok(Object.values(r).every((x) => x.texts === x.paths && x.texts >= 1), 'a curved layer is not on its path', r);
    ok(r.shadow.filter && r.lift.filter && r.neon.filter, 'curved shadow/lift/neon missing', r);
    ok(r.hollow.stroke && r.splice.stroke && r.splice.texts === 2 && r.background.stroke, 'curved hollow/splice/background missing', r);
    ok(r.echo.texts === 3 && r.glitch.texts === 3 && r.none.texts === 1, 'curved echo/glitch missing', r);
    // through the Effects panel
    await open('presentation', [{ type: 'text', id: 'cf', text: 'Curved', x: 300, y: 200, w: 400, size: 60, curve: 50 }]);
    await ev(() => { A.E.select(['cf']); A.EU.openPanel('effects'); });
    await page.locator('.fx-item', { hasText: 'Shadow' }).click();
    await wait();
    const f = await ev(() => ({ effect: A.E.byId('cf').effect?.type, filtered: !!document.querySelector('.page-svg [data-id="cf"] text[filter]') }));
    ok(f.effect === 'shadow' && f.filtered, 'Shadow picked in the panel is not drawn on curved text', f);
  });

  await step('render: gradient text colour works with Hollow, Splice and Neon (text-11, render-15)', async () => {
    const r = await ev(async () => {
      const M = A.M, R = A.R, color = 'grad:#8c52ff:#ff66c4:135';
      const one = async (type) => {
        const el = M.newText({ id: 'gt', text: 'HOLLOW', x: 10, y: 10, w: 380, size: 80, bold: true, color, effect: { type } });
        R.fitText(el);
        const d = { width: 400, height: 140, pages: [M.newPage({ elements: [el] })] };
        const svg = R.pageSVG(d, d.pages[0], { idp: 'h' });
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const strokes = [...doc.querySelectorAll('text[stroke]')].map((t) => t.getAttribute('stroke'));
        const resolved = strokes.every((s) => { const m = s.match(/^url\(#(.+)\)$/); return m && doc.getElementById(m[1]); });
        const g = (await R.pageCanvas(d, d.pages[0], 1)).getContext('2d').getImageData(0, 0, 400, 140).data;
        let ink = 0;
        for (let i = 0; i < g.length; i += 4) if (g[i] < 235 || g[i + 1] < 235 || g[i + 2] < 235) ink++;
        const stops = (id) => [...(doc.getElementById(id)?.querySelectorAll('stop') || [])].map((s) => s.getAttribute('stop-color'));
        return { strokes, resolved, ink, base: stops('hggtt'), light: stops('hggttl') };
      };
      return { hollow: await one('hollow'), splice: await one('splice'), neon: await one('neon') };
    });
    ok(r.hollow.strokes.length === 1 && r.hollow.resolved && r.hollow.ink > 500, 'hollow gradient outline missing', r.hollow);
    ok(r.splice.strokes.length === 1 && r.splice.resolved, 'splice gradient outline missing', r.splice);
    const lum = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    ok(r.neon.base.length === 2 && r.neon.light.length === 2 && r.neon.light.every((c, i) => lum(c) > lum(r.neon.base[i])), 'neon highlight not a lightened gradient', r.neon);
  });

  await step('render: typewriter shows whole lists and whole characters (text-12, render-5, render-17, present-3)', async () => {
    const r = await ev(() => {
      const M = A.M, R = A.R;
      const raw = (el, chars) => R.textSVG(el, { idp: 'w', defs: [] }, { x: 0, y: 0, w: el.w, h: el.h }, chars);
      const lines = (el, chars) => {
        const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${raw(el, chars)}</svg>`, 'image/svg+xml');
        return [...doc.querySelectorAll(el.curve ? 'textPath' : 'tspan')].map((t) => t.textContent);
      };
      const at = (el, t) => lines(el, R.anim(el, t, 5, 0, null).chars);
      const bullet = M.newText({ text: 'Alpha\nBeta\nGamma', list: 'bullet', anim: { in: 'typewriter' } });
      const number = M.newText({ text: 'One\nTwo\nThree\nFour', list: 'number', anim: { in: 'typewriter' } });
      const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
      const broken = [];
      for (const el of [M.newText({ text: '🚀 Go 👍🏽', anim: { in: 'typewriter' } }), M.newText({ text: '🚀🚀🚀', curve: 40, anim: { in: 'typewriter' } })])
        for (let t = 0; t < 2; t += 0.02) { const s = raw(el, R.anim(el, t, 5, 0, null).chars); if (lone.test(s)) broken.push(escape(s.replace(/<[^>]*>/g, ''))); }
      // flags, skin tones and family emoji appear whole, never one code point at a time
      const full = 'Go 🇫🇷 👍🏽 👨‍👩‍👧 é', ends = new Set([0]);
      let n = 0;
      for (const g of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(full)) ends.add((n += g.segment.length));
      const split = [];
      for (const el of [M.newText({ text: full, anim: { in: 'typewriter' } }), M.newText({ text: full, curve: 40, anim: { in: 'typewriter' } })])
        for (let t = 0; t < 2; t += 0.01) { const s = lines(el, R.anim(el, t, 5, 0, null).chars).join('').trim(); if (!full.startsWith(s) || !ends.has(s.length)) split.push(s); }
      return {
        bullet: [at(bullet, 4.9), lines(bullet, null)], number: [at(number, 4.9), lines(number, null)], bullet100: at(bullet, 100),
        partial: lines(bullet, 6), broken, split,
      };
    });
    ok(JSON.stringify(r.bullet[0]) === JSON.stringify(r.bullet[1]) && JSON.stringify(r.bullet100) === JSON.stringify(r.bullet[1]), 'bullet list never finishes', r.bullet);
    ok(JSON.stringify(r.number[0]) === JSON.stringify(r.number[1]), 'numbered list never finishes', r.number);
    ok(JSON.stringify(r.partial) === JSON.stringify(['•  Alpha', '•  B', ' ']), 'bullet should appear with its first character', r.partial);
    ok(!r.broken.length, 'frames with half a surrogate pair', r.broken.slice(0, 3));
    ok(!r.split.length, 'frames with part of an emoji', [...new Set(r.split)].slice(0, 4));
    // in present mode the whole list appears
    await open('presentation', [{ type: 'text', id: 'tw', text: 'Alpha\nBeta\nGamma', list: 'bullet', x: 200, y: 200, w: 800, size: 60, anim: { in: 'typewriter' } }]);
    await ev(() => A.Present.start({ fullscreen: false, autoplay: false }));
    await page.waitForSelector('.present .pr-layer');
    await wait(1500);
    const shown = await ev(() => document.querySelector('.present .pr-layer [data-id="tw"]')?.textContent || '');
    await page.keyboard.press('Escape');
    await wait(300);
    ok(shown.includes('Gamma') && shown.includes('Beta'), 'present mode left the list unfinished', shown);
  });

  await step('render: table formulas are memoised, catch cycles, pass errors on, and name columns past Z (render-2, render-3, render-18)', async () => {
    const r = await ev(() => {
      const R = A.R, M = A.M, E = (cells, r, c) => R.evalCell(cells, r, c);
      // compound interest: each row reads the row above twice (exponential without memoisation)
      const cells = [['Year', 'Balance'], ['0', '100']];
      for (let i = 3; i <= 24; i++) cells.push([String(i - 2), `=B${i - 1}+B${i - 1}*0.05`]);
      const orig = R.evalCell;
      let calls = 0;
      R.evalCell = (...a) => (calls++, orig(...a));
      try { R.elementSVG(M.newTable(cells.length, 2, { cells }), { idp: 'q', defs: [], asset: () => '' }); } finally { R.evalCell = orig; }
      const wide = [[...Array(26).fill('1'), '5', '=AA1*2']];
      return {
        calls, cellCount: cells.length * 2, last: E(cells, cells.length - 1, 1),
        circ: [E([['1', '2'], ['=SUM(A1:B2)', '=SUM(A1:B2)']], 1, 0), E([['=A1+1']], 0, 0), E([['=B1', '=A1']], 0, 0), E([['1'], ['2'], ['=SUM(A1:A3)']], 2, 0)],
        errs: [E([['=1/0', '=A1+5']], 0, 1), E([['=1/0', '2', '=SUM(A1:B1)']], 0, 2), E([['=X', '=A1*2']], 0, 1)],
        plain: [E([['Head'], ['2'], ['3'], ['=SUM(A1:A3)']], 3, 0), E([['abc', '=A1+1']], 0, 1), E([['=1E2+1']], 0, 0), E([['#1 seller', '=A1+1']], 0, 1)],
        cols: [0, 25, 26, 27, 51, 52, 701, 702].map(R.colName), wide: E(wide, 0, 27),
        // a range far past the table costs no more than the table
        huge: (() => { const t = performance.now(), v = [E([['1', '2'], ['3', '=SUM(A1:A100000000)']], 1, 1), E([['1', '2'], ['=SUM(B1:ZZZ99999)', '5']], 1, 0)]; return { v, ms: performance.now() - t }; })(),
      };
    });
    ok(r.calls < r.cellCount * 4, 'formulas re-evaluated per reference', { calls: r.calls, cells: r.cellCount });
    ok(Math.abs(+r.last - 100 * 1.05 ** 22) < 0.01, 'chained formula result', r.last);
    ok(r.circ.every((v) => v === '#CIRC'), 'cycles not reported', r.circ);
    ok(JSON.stringify(r.errs) === JSON.stringify(['#DIV/0', '#DIV/0', '#ERR']), 'errors not passed on', r.errs);
    ok(JSON.stringify(r.plain) === JSON.stringify(['5', '1', '101', '1']), 'ordinary formulas changed', r.plain);
    ok(JSON.stringify(r.cols) === JSON.stringify(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']) && r.wide === '10', 'column names past Z', r);
    ok(r.huge.v.join() === '4,7' && r.huge.ms < 100, 'huge range', r.huge);
  });

  await step('render: charts draw negative values, tiny sizes and a see-through donut hole (render-4, render-25, render-19)', async () => {
    const r = await ev(async () => {
      const M = A.M, R = A.R;
      const svgOf = (el) => R.elementSVG(el, { idp: 'c', defs: [], asset: () => '' });
      const dom = (s) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${s}</svg>`, 'image/svg+xml').documentElement;
      const data = [{ label: 'A', value: 10 }, { label: 'B', value: -8 }, { label: 'C', value: 5 }];
      const bar = dom(svgOf(M.newChart('bar', { w: 600, h: 400, data })));
      const bars = [...bar.querySelectorAll('rect[rx]')].map((b) => ({ y: +b.getAttribute('y'), h: +b.getAttribute('height') }));
      const ys = [...bar.querySelectorAll('text')].map((t) => +t.getAttribute('y'));
      const line = dom(svgOf(M.newChart('line', { w: 600, h: 400, data })));
      const pts = line.querySelector('polyline').getAttribute('points').split(' ').map((p) => +p.split(',')[1]);
      const tiny = ['bar', 'line', 'area', 'pie', 'donut'].flatMap((k) => [30, 8].map((s) => svgOf(M.newChart(k, { w: s, h: s, data }))));
      const donut = M.newChart('donut', { x: 0, y: 0, w: 300, h: 300 });
      const d = { width: 300, height: 300, pages: [M.newPage({ elements: [donut], bg: { color: '#0a3d62' } })] };
      const px = async (opts) => [...(await R.pageCanvas(d, d.pages[0], 1, opts)).getContext('2d').getImageData(150, 150, 1, 1).data];
      return { bars, ys, pts, negAttr: tiny.filter((s) => /\s(?:width|height|r|rx)="-/.test(s)).length, hole: await px({}), holeT: await px({ transparent: true }) };
    });
    ok(r.bars.length === 3 && r.bars.every((b) => b.h > 0 && b.y >= 0 && b.y + b.h <= 400), 'bars missing or outside the chart', r.bars);
    ok(r.bars[1].y >= r.bars[0].y + r.bars[0].h - 0.5 && r.bars[1].y >= r.bars[2].y + r.bars[2].h - 0.5, 'negative bar not below the baseline', r.bars);
    ok(r.ys.every((y) => y >= 0 && y <= 400) && r.pts.every((y) => y >= 0 && y <= 400), 'labels or line points outside the chart', r);
    ok(r.pts[1] > r.pts[2] && r.pts[2] > r.pts[0], 'line points out of order', r.pts);
    ok(r.negAttr === 0, 'tiny charts have negative sizes', r.negAttr);
    ok(Math.abs(r.hole[0] - 10) < 3 && Math.abs(r.hole[1] - 61) < 3 && Math.abs(r.hole[2] - 98) < 3, 'donut hole does not show the page', r.hole);
    ok(r.holeT[3] === 0, 'donut hole opaque in a transparent export', r.holeT);
    // tiny charts in the editor (console errors fail the run)
    await open('presentation', [{ type: 'chart', chart: 'bar', x: 100, y: 100, w: 30, h: 30 }, { type: 'chart', chart: 'line', x: 200, y: 100, w: 8, h: 8 }, { type: 'chart', chart: 'donut', x: 300, y: 100, w: 8, h: 8 }]);
    await wait(200);
  });

  await step('render: animation delays match the panel, Pan follows its direction, exits can be held (render-14, render-21, present-15, render-22, present-4)', async () => {
    const r = await ev(() => {
      const M = A.M, R = A.R;
      const own = Array.from({ length: 50 }, () => M.newShape('rect', { anim: { in: 'fade' } }));
      const p1 = M.newPage({ elements: own, duration: 5 });
      const plain = Array.from({ length: 50 }, () => M.newShape('rect'));
      const p2 = M.newPage({ elements: plain, duration: 5, anim: 'fade' });
      // hidden layers do not push the stagger back
      const mixed = Array.from({ length: 50 }, (_, i) => M.newShape('rect', { id: 'm' + i, hidden: i < 40 }));
      const p3 = M.newPage({ elements: mixed, duration: 5, anim: 'fade' });
      const svg3 = R.pageSVG({ width: 400, height: 300 }, p3, { t: 2, idp: 'm' });
      const pan = ['up', 'down', 'left', 'right', undefined].map((dir) => { const s = R.anim(M.newShape('rect', { anim: { in: 'pan', dir } }), 0.1, 5, 0, null); return [Math.sign(Math.round(s.dx)), Math.sign(Math.round(s.dy))]; });
      const ex = M.newShape('rect', { id: 'ex', anim: { out: 'fade' } });
      const p4 = M.newPage({ elements: [ex], duration: 2 });
      const op = (opts) => (R.pageSVG({ width: 400, height: 300 }, p4, { idp: 'z', ...opts }).match(/data-id="ex" [^>]*opacity="([\d.]+)"/) || [])[1] ?? '1';
      return {
        own: [0, 10, 49].map((i) => R.anim(own[i], 1, 5, i, p1).o),
        stagger: [R.anim(plain[0], 0.05, 5, 0, p2).o > 0, R.anim(plain[1], 0.05, 5, 1, p2).o, R.anim(plain[49], 4.95, 5, 49, p2).o],
        lastVisible: /data-id="m49" [^>]*opacity=/.test(svg3), pan, exit: [op({ t: 1 }), op({ t: 3 }), op({ t: 30, dur: null })],
      };
    });
    ok(r.own.every((o) => o === 1), 'elements with their own animation start late', r.own);
    ok(r.stagger[0] && r.stagger[1] === 0 && r.stagger[2] === 1, 'page animation stagger wrong, or ends after the page', r.stagger);
    ok(!r.lastVisible, 'hidden layers delay the page animation', r.lastVisible);
    ok(JSON.stringify(r.pan) === JSON.stringify([[0, 1], [0, -1], [1, 0], [-1, 0], [-1, 0]]), 'pan directions', r.pan);
    ok(JSON.stringify(r.exit) === JSON.stringify(['1', '0', '1']), 'exit animation timing / dur:null', r.exit);
  });

  await step('render: connector ends meet rotated and round outlines (render-24, transform-14)', async () => {
    const r = await ev(() => {
      const M = A.M, R = A.R;
      const a = M.newShape('rect', { x: 100, y: 100, w: 200, h: 200 });
      const b = M.newShape('ellipse', { x: 700, y: 400, w: 260, h: 260 });
      const rot = M.newShape('rect', { x: 300, y: 300, w: 400, h: 400, rot: 45 });
      const dia = M.newShape('diamond', { x: 1000, y: 100, w: 200, h: 100 });
      const els = [a, b, rot, dia];
      const page = { elements: els };
      const ends = (o) => R.lineEnds(M.newLine(o), page);
      const e1 = ends({ c1: a.id, c2: b.id, end: 'triangle' }).p2;
      const e2 = ends({ p1: { x: 500, y: 500 }, p2: { x: 1200, y: 500 }, c1: rot.id }).p1;
      const e3 = ends({ p1: { x: 0, y: 0 }, p2: { x: 1300, y: 250 }, c1: dia.id }).p1;
      return { ellipse: Math.hypot(e1.x - 830, e1.y - 530), rotated: e2, diamond: Math.abs(e3.x - 1100) / 100 + Math.abs(e3.y - 150) / 50 };
    });
    ok(Math.abs(r.ellipse - 130) < 0.5, 'arrow does not touch the circle', r.ellipse);
    ok(Math.abs(r.rotated.x - (500 + 200 * Math.SQRT2)) < 0.5 && Math.abs(r.rotated.y - 500) < 0.5, 'end ignores the rotation', r.rotated);
    ok(Math.abs(r.diamond - 1) < 0.01, 'end not on the diamond outline', r.diamond);
  });

  await step("render: a font named with '&' keeps exports working (render-7)", async () => {
    const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find((f) => fs.existsSync(f));
    ok(font, 'no test font file on this machine');
    const r = await ev(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await A.app.importFile(new File([bytes], 'Rock & Roll.ttf', { type: 'font/ttf' }));
      const f = A.M.customFonts.find((x) => x.name === 'Rock & Roll');
      if (!f) return { registered: false };
      try {
        const el = A.M.newText({ text: 'Rock', font: 'Rock & Roll', x: 10, y: 10, w: 300, size: 40 });
        const d = { width: 320, height: 80, pages: [A.M.newPage({ elements: [el] })] };
        const svg = await A.R.standaloneSVG(d, d.pages[0]);
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const blob = await A.X.pageBlob(d, d.pages[0]);
        return { registered: true, parseErr: doc.querySelector('parsererror')?.textContent || '', css: doc.querySelector('style')?.textContent.slice(0, 40), size: blob.size };
      } finally {
        await A.S.del('assets', f.asset);
        await A.app.loadFonts();
      }
    }, fs.readFileSync(font).toString('base64'));
    ok(r.registered, 'font upload did not register "Rock & Roll"', r);
    ok(!r.parseErr && r.css.startsWith('@font-face{font-family:"Rock & Roll"') && r.size > 100, 'export SVG with the font is broken', r);
  });

  await step("render: page links, frame borders, line hit width and canvas limits (render.js parts of render-11, ui-25, touch-7, render-12)", async () => {
    const r = await ev(async () => {
      const M = A.M, R = A.R;
      const els = [M.newShape('rect', { id: 'in', link: '#3' }), M.newShape('rect', { id: 'out', link: 'https://example.com' }), M.newShape('ellipse', { id: 'fr', asset: 'none', strokeWidth: 4, stroke: '#000', dash: 'dashed' }), M.newLine({ id: 'ln', strokeWidth: 2 })];
      const d = { width: 400, height: 300, pages: [M.newPage({ elements: els })] };
      const doc = (opts) => new DOMParser().parseFromString(R.pageSVG(d, d.pages[0], { idp: 'x', links: true, ...opts }), 'image/svg+xml');
      const a = doc({});
      const hit = (dd) => +dd.querySelector('[data-id="ln"] path').getAttribute('stroke-width');
      let big = '';
      try { await R.pageCanvas({ width: 20000, height: 20000, pages: [] }, M.newPage(), 1); } catch (e) { big = e.message; }
      return {
        targets: [...a.querySelectorAll('a')].map((x) => [x.getAttribute('href'), x.getAttribute('target')]),
        frameDash: !!a.querySelector('[data-id="fr"] path[stroke-dasharray]'), hit: [hit(a), hit(doc({ hit: 40 }))], big,
      };
    });
    ok(JSON.stringify(r.targets) === JSON.stringify([['#3', null], ['https://example.com', '_blank']]), 'link targets', r.targets);
    ok(r.frameDash, 'frame border ignores its dash style');
    ok(r.hit[0] === 16 && r.hit[1] === 40, 'line hit width option', r.hit);
    ok(/too large/.test(r.big), 'oversized canvas error', r.big);
  });

  await step('render: element ids and numbers are escaped in the markup (render-1)', async () => {
    const r = await ev(async () => {
      const M = A.M, R = A.R;
      window.__pwned = 0;
      const bad = 'x"><image href="data:," onerror="window.__pwned++"/><g data-z="';
      const inject = '1"/><image href="data:," onerror="window.__pwned++"/><g a="';
      const els = [
        M.newShape('rect', { id: bad, x: 10, y: 10, w: 100, h: 80, fill: 'grad:#ff0000:#0000ff:90', shadow: true }),
        M.newText({ id: bad + 't', text: 'Hi', x: 150, y: 10, w: 200, effect: { type: 'shadow' }, curve: 30 }),
        M.newLine({ id: bad + 'l', p1: { x: 10, y: 200 }, p2: { x: 300, y: 200 }, end: 'arrow' }),
        M.newSticky({ id: 's', x: 300, y: 100, votes: inject }),
      ];
      const d = { width: 600, height: 300, pages: [M.newPage({ id: bad + 'p', elements: els, bg: { color: 'grad:#fff:#000:90' } })] };
      const svg = R.pageSVG(d, d.pages[0], { idp: 'e' });
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      // numbers written raw would inject too (checked as markup only: NaN sizes are not valid in a live page)
      const img = M.newImage({ id: 'i', w: 100, h: 100 }, { x: 10, y: 10, nw: inject, nh: inject });
      const numeric = [R.pageSVG({ width: inject, height: inject }, M.newPage(), { idp: 'w' }), R.pageSVG({ width: 300, height: 200 }, M.newPage({ elements: [img] }), { idp: 'i', asset: () => 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' })];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0';
      host.innerHTML = svg;
      document.body.appendChild(host);
      await new Promise((res) => setTimeout(res, 200));
      const refs = [...host.querySelectorAll('*')].flatMap((n) => [...n.attributes].map((a) => a.value.match(/url\(#([^)]+)\)/)?.[1]).filter(Boolean));
      const out = {
        pwned: window.__pwned, parseErr: !!doc.querySelector('parsererror'), images: host.querySelectorAll('image').length, handlers: doc.querySelectorAll('[onerror]').length,
        ids: [...host.querySelectorAll('[data-id]')].map((n) => n.getAttribute('data-id')), dangling: refs.filter((id) => !host.querySelector(`[id="${CSS.escape(id)}"]`)),
        numeric: numeric.map((s) => /<image[^>]*\sonerror=/.test(s)),
      };
      host.remove();
      return out;
    });
    ok(r.pwned === 0 && !r.parseErr && r.images === 0 && r.handlers === 0, 'markup injection through ids or votes', r);
    ok(r.ids.includes('x"><image href="data:," onerror="window.__pwned++"/><g data-z="'), 'data-id does not round-trip', r.ids);
    ok(!r.dangling.length, 'def references broken by odd ids', r.dangling);
    ok(!r.numeric.some(Boolean), 'design or image sizes written raw', r.numeric);
  });
}
