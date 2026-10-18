'use strict';
// Left-side editor panels (rail panels and contextual panels).
(function (A) {
  const U = A.U, M = A.M, R = A.R, S = A.S, E = A.E, EU = A.EU, h = U.h;
  const P = (A.P = {});

  const section = (title, ...kids) => h('div.p-sec', title ? h('div.p-sec-title', title) : null, ...kids);
  const tabs = (items, active, onPick) => h('div.p-tabs', items.map(([id, label]) => h('button.p-tab' + (id === active ? '.on' : ''), { onclick: () => onPick(id) }, label)));
  const searchBox = (ph, onInput) => {
    const inp = h('input.input.search', { placeholder: ph, type: 'search' });
    inp.addEventListener('input', () => onInput(inp.value.toLowerCase()));
    return h('div.p-search', U.ic('search', 16), inp);
  };
  const svgThumb = (inner, vb = '0 0 100 100') => h('span.el-thumb', { html: `<svg viewBox="${vb}" width="100%" height="100%">${inner}</svg>` });
  const sel1 = () => E.selEls()[0];
  // An item that adds on click, or where it is dropped on a page (dragged with the mouse, or held and dragged by touch).
  const item = (sel, attrs, add, ...kids) => EU.draggable(h(sel, { ...attrs, onclick: () => add() }, ...kids), { add });
  // page edits made from a panel respect the page lock
  const setBg = (patch) => {
    if (!E.canEdit()) return false;
    E.page().bg = { ...(E.page().bg || {}), ...patch };
    E.changed();
    return true;
  };
  const state = (P.state = { designTab: 'templates', elQuery: '', iconColor: '#1a1a1a', uploadsTab: 'images', imgTab: 'filters', posTab: 'arrange', animTab: null, aiChat: [], app: null });

  // ---------- Design (templates & styles) ----------
  P.design = () => {
    const body = h('div');
    body.append(tabs([['templates', 'Templates'], ['styles', 'Styles']], state.designTab, (t) => { state.designTab = t; EU.renderPanel(); }));
    if (state.designTab === 'templates') {
      const grid = h('div.tpl-grid');
      const render = (q = '') => {
        grid.innerHTML = '';
        const all = [...(A.app.userTemplates || []), ...A.TEMPLATES];
        const ratio = E.d.width / E.d.height;
        const list = all.filter((t) => (!q || (t.name + ' ' + (t.tags || '')).toLowerCase().includes(q)))
          .sort((a, b) => Math.abs(a.w / a.h - ratio) - Math.abs(b.w / b.h - ratio));
        for (const t of list) {
          const card = h('button.tpl-card', { title: t.name, onclick: (e) => applyTemplate(t, e.currentTarget) }, h('img', { src: t.thumb || A.templatePreview(t), alt: t.name, loading: 'lazy' }), h('span', t.name));
          grid.appendChild(card);
        }
      };
      render();
      body.append(searchBox('Search templates', render), grid);
    } else {
      body.append(section('Colour palettes', h('div.palette-list', M.STYLE_PALETTES.map(([name, cols]) => h('button.palette', { title: 'Apply ' + name + ' colours to this page', onclick: () => recolor(cols) }, h('div.pal-cols', cols.map((c) => h('span', { style: { background: c } }))), h('span', name))))));
      if (A.app.brand?.colors?.length) body.append(section('Brand colours', h('button.palette', { onclick: () => recolor(A.app.brand.colors) }, h('div.pal-cols', A.app.brand.colors.slice(0, 6).map((c) => h('span', { style: { background: c } }))), h('span', 'Apply brand palette'))));
      body.append(section('Font sets', h('div.font-sets', M.FONT_PAIRS.map(([hf, bf, name]) => h('button.font-set', { onclick: () => applyFonts(hf, bf) }, h('b', { style: { fontFamily: M.fontStack(hf) } }, name), h('span', { style: { fontFamily: M.fontStack(bf) } }, hf + ' & ' + bf))))));
      body.append(section('Background', h('div.bg-grid', ['#ffffff', '#f5efe6', '#111111', '#0a3d62', '#ffde59', '#ff66c4', 'grad:#8c52ff:#ff66c4:135', 'grad:#00c6ff:#0072ff:135', 'grad:#11998e:#38ef7d:135', 'grad:#f7971e:#ffd200:135', 'grad:#232526:#414345:135', 'grad:#fbc2eb:#a6c1ee:135'].map((c) => item('button.bg-sw', { style: { background: R.cssPaint(c) }, title: 'Background' }, () => setBg({ color: c }))))));
    }
    return { title: 'Design', body };
  };
  function applyTemplate(t, anchor) {
    U.menu(anchor, [
      { label: 'Replace current page', icon: 'restore', onClick: () => insertTemplate(t, true) },
      { label: 'Add as new page(s)', icon: 'addpage', onClick: () => insertTemplate(t, false) },
    ]);
  }
  // New ids for copied pages; connectors are re-pointed at the copies of their shapes.
  const freshIds = (pages) => pages.forEach((p) => {
    p.id = U.uid('p_');
    const map = {};
    p.elements.forEach((e) => (map[e.id] = e.id = U.uid('e_')));
    p.elements.forEach((e) => {
      if (e.c1) e.c1 = map[e.c1];
      if (e.c2) e.c2 = map[e.c2];
    });
  });
  async function insertTemplate(t, replace) {
    if (replace && !E.canEdit()) return;
    const td = t.design ? U.clone(t.design) : A.templateDesign(t);
    if (td.width !== E.d.width || td.height !== E.d.height) E.resizeDesign(td, E.d.width, E.d.height);
    freshIds(td.pages);
    await S.ensureAssetURLs(S.designAssetIds(td));
    if (replace) {
      const gone = E.page().id;
      E.d.pages.splice(E.pi, 1, ...td.pages);
      E.d.comments = (E.d.comments || []).filter((c) => c.pageId !== gone);
    } else E.d.pages.splice(++E.pi, 0, ...td.pages);
    E.sel = [];
    E.changed({ structure: true });
  }
  function recolor(palette) {
    if (!E.canEdit()) return;
    const page = E.page();
    const counts = {};
    const bump = (c) => U.isColor(c) && (counts[c.toLowerCase()] = (counts[c.toLowerCase()] || 0) + 1);
    bump(page.bg?.color);
    page.elements.forEach((e) => { bump(e.fill); bump(e.color); bump(e.stroke); });
    const order = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const light = [...palette].sort((a, b) => U.luminance(b) - U.luminance(a));
    const map = {};
    order.forEach((c, i) => (map[c] = U.luminance(c) > 0.85 ? light[0] : U.luminance(c) < 0.12 ? light[light.length - 1] : palette[i % palette.length]));
    const sw = (c) => (U.isColor(c) && map[c.toLowerCase()]) || c;
    if (page.bg) page.bg.color = sw(page.bg.color);
    page.elements.forEach((e) => { if (e.locked) return; if (e.fill) e.fill = sw(e.fill); if (e.color) e.color = sw(e.color); if (e.stroke) e.stroke = sw(e.stroke); });
    // keep text readable on its background
    E.changed();
  }
  function applyFonts(hf, bf) {
    if (!E.canEdit()) return;
    const texts = E.els().filter((e) => !e.locked && (e.type === 'text' || (e.type === 'shape' && e.text)));
    if (!texts.length) return U.toast('No text on this page yet');
    const max = Math.max(...texts.map((e) => e.size));
    texts.forEach((e) => { e.font = e.size >= max * 0.6 ? hf : bf; if (e.type === 'text') R.fitText(e); });
    E.changed();
  }

  // ---------- Elements ----------
  const FRAME_SHAPES = ['rect', 'ellipse', 'rounded', 'heart', 'star', 'hexagon', 'blob', 'arch', 'diamond', 'triangle'];
  P.elements = () => {
    const body = h('div');
    const content = h('div');
    const render = (q = state.elQuery) => {
      state.elQuery = q;
      content.innerHTML = '';
      const match = (s) => !q || s.toLowerCase().includes(q);
      const W = E.d.width;
      const lineItems = [
        ['Line', 'line', () => E.addLine()], ['Arrow', 'arrow line', () => E.addLine({ end: 'triangle' })], ['Double arrow', 'arrow', () => E.addLine({ start: 'triangle', end: 'triangle' })],
        ['Dashed', 'dashed line', () => E.addLine({ dash: 'dashed' })], ['Dotted', 'dotted line', () => E.addLine({ dash: 'dotted', strokeWidth: Math.max(4, W / 200) })], ['Connector', 'elbow connector arrow', () => E.addLine({ elbow: true, end: 'arrow' })],
      ].filter(([n, t]) => match(n + ' ' + t));
      if (lineItems.length) content.append(section('Lines & arrows', h('div.el-grid', lineItems.map(([n, , fn]) => item('button.el-item', { title: n }, fn, svgThumb(lineThumb(n)))))));
      const shapes = M.SHAPES.filter(([k, n]) => match(n + ' shape ' + k));
      if (shapes.length) content.append(section('Shapes', h('div.el-grid', shapes.map(([k, n]) => item('button.el-item', { title: n }, () => E.addShape(k), svgThumb(`<path d="${R.shapePath(k, 80, 80)}" transform="translate(10 10)" fill="#555"/>`))))));
      if (match('sticky note whiteboard post-it')) content.append(section('Sticky notes', h('div.el-grid', ['#ffe066', '#a0e7e5', '#ffaebc', '#b4f8c8', '#cdb4db', '#ffffff'].map((c) => item('button.el-item', { title: 'Sticky note' }, () => E.add(M.newSticky({ fill: c, w: Math.max(160, W / 10), h: Math.max(160, W / 10), size: Math.max(18, W / 80) }), { edit: true }), svgThumb(`<rect x="14" y="14" width="72" height="72" rx="4" fill="${c}" stroke="#ccc"/>`))))));
      const icons = Object.keys(M.ICONS).filter((k) => match(k + ' graphic icon illustration'));
      if (icons.length) content.append(section('Graphics',
        h('div.color-filter', h('span.muted', 'Colour'), ...['#1a1a1a', '#8c52ff', '#ff3131', '#00bf63', '#38b6ff', '#ffbd59', '#ff66c4'].map((c) => h('button.color-sw.sm' + (state.iconColor === c ? '.on' : ''), { style: { background: c }, title: c, onclick: () => { state.iconColor = c; render(); } }))),
        h('div.el-grid', icons.map((k) => item('button.el-item', { title: k }, () => E.add(M.newIcon(k, { fill: state.iconColor, w: W / 6, h: W / 6 })), svgThumb(`<path d="${M.ICONS[k]}" fill="${state.iconColor}"/>`, '-2 -2 28 28'))))));
      const stickers = M.STICKERS.filter(() => match('sticker emoji'));
      if (stickers.length) content.append(section('Stickers', h('div.el-grid.emoji', stickers.map((s) => item('button.el-item', { title: 'Sticker' }, () => E.add({ ...M.newText(), type: 'emoji', text: s, w: W / 7, h: W / 7 }), h('span.emo', s))))));
      if (match('frame photo image')) content.append(section('Frames', h('p.muted.small', 'Drop a photo onto a frame, or select a frame and click an upload.'), h('div.el-grid', FRAME_SHAPES.map((k) => item('button.el-item', { title: 'Frame' }, () => E.add(M.newShape(k, { w: W / 3, h: W / 3, fill: '#d9d9de', frame: true, text: '' })), svgThumb(`<path d="${R.shapePath(k, 80, 80)}" transform="translate(10 10)" fill="#c8c8d0"/><path d="M30 64l14-16 10 10 8-8 10 14z" fill="#9a9aa6"/>`))))));
      if (match('grid photo collage layout')) content.append(section('Grids', h('div.el-grid', GRIDS.map((g) => item('button.el-item', { title: 'Photo grid' }, () => addGrid(g), svgThumb(g.map(([x, y, w, hh]) => `<rect x="${10 + x * 80}" y="${10 + y * 80}" width="${w * 80 - 3}" height="${hh * 80 - 3}" fill="#c8c8d0"/>`).join('')))))));
      if (match('chart graph data bar pie line')) content.append(section('Charts', h('div.el-grid', [['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['donut', 'Donut']].map(([k, n]) => item('button.el-item', { title: n + ' chart' }, () => E.add(M.newChart(k, { w: W * 0.5, h: W * 0.35 })), svgThumb(chartThumb(k)))))));
      if (match('table grid data spreadsheet')) content.append(section('Tables', h('div.el-grid', [[3, 3], [4, 3], [5, 4], [6, 2]].map(([r, c]) => item('button.el-item', { title: `${r}×${c} table` }, () => E.add(M.newTable(r, c, { w: W * 0.5, h: r * W * 0.04, size: Math.max(12, W / 70) })), h('span.small', `${r} × ${c}`))))));
      if (match('mockup phone laptop device browser')) content.append(section('Mockups', h('div.el-grid', [['phone', 'Phone'], ['laptop', 'Laptop'], ['browser', 'Browser']].map(([k, n]) => item('button.el-item', { title: n + ' mockup' }, () => addMockup(k), h('span.small', n))))));
      if (match('background gradient pattern')) content.append(section('Backgrounds', h('div.bg-grid', ['grad:#8c52ff:#ff66c4:135', 'grad:#00c6ff:#0072ff:135', 'grad:#f7971e:#ffd200:135', 'grad:#11998e:#38ef7d:135', 'grad:#ee0979:#ff6a00:135', 'grad:#fbc2eb:#a6c1ee:135', 'grad:#ffffff:#c3cfe2:0:radial', 'grad:#141e30:#243b55:135'].map((c) => item('button.bg-sw', { style: { background: R.cssPaint(c) }, title: 'Background' }, () => setBg({ color: c }))))));
      if (!content.children.length) content.append(h('p.muted', 'No elements match "' + q + '".'));
    };
    const sb = searchBox('Search elements', render);
    sb.querySelector('input').value = state.elQuery;
    render();
    body.append(sb, content);
    return { title: 'Elements', body };
  };
  const lineThumb = (n) => {
    const m = '<defs><marker id="mt" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#555"/></marker></defs>';
    if (n === 'Connector') return m + '<path d="M15 30H50V70H85" fill="none" stroke="#555" stroke-width="5" marker-end="url(#mt)"/>';
    const da = n === 'Dashed' ? 'stroke-dasharray="12 8"' : n === 'Dotted' ? 'stroke-dasharray="0.1 10" stroke-linecap="round"' : '';
    const me = n.includes('rrow') ? 'marker-end="url(#mt)"' : '', ms = n === 'Double arrow' ? 'marker-start="url(#mt)"' : '';
    return m + `<line x1="12" y1="50" x2="88" y2="50" stroke="#555" stroke-width="${n === 'Dotted' ? 7 : 5}" ${da} ${me} ${ms}/>`;
  };
  const chartThumb = (k) => {
    if (k === 'pie' || k === 'donut') return `<circle cx="50" cy="50" r="36" fill="#8c52ff"/><path d="M50 50L50 14A36 36 0 0 1 84 60Z" fill="#00bf63"/>` + (k === 'donut' ? '<circle cx="50" cy="50" r="18" fill="#fff"/>' : '');
    if (k === 'line' || k === 'area') return (k === 'area' ? '<path d="M14 80L14 60L38 40L62 52L86 22L86 80Z" fill="#8c52ff" opacity=".25"/>' : '') + '<polyline points="14,60 38,40 62,52 86,22" fill="none" stroke="#8c52ff" stroke-width="5"/>';
    return '<rect x="14" y="50" width="14" height="32" fill="#8c52ff"/><rect x="34" y="30" width="14" height="52" fill="#00bf63"/><rect x="54" y="58" width="14" height="24" fill="#ff914d"/><rect x="74" y="18" width="14" height="64" fill="#38b6ff"/>';
  };
  const GRIDS = [
    [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
    [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]],
    [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]],
    [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  ];
  function addGrid(g) {
    const W = E.d.width, H = E.d.height, gap = Math.round(Math.min(W, H) * 0.01);
    const els = g.map(([x, y, w, hh]) => M.newShape('rect', { x: x * W + gap / 2, y: y * H + gap / 2, w: w * W - gap, h: hh * H - gap, fill: '#d9d9de', frame: true }));
    const gid = U.uid('g_');
    els.forEach((e) => (e.groupId = gid));
    E.add(els, { center: false });
  }
  function addMockup(kind) {
    const W = E.d.width;
    let els = [];
    if (kind === 'phone') {
      const w = W * 0.25, hh = w * 2;
      els = [M.newShape('rect', { x: 0, y: 0, w, h: hh, radius: w * 0.14, fill: '#1a1a1a', shadow: true }), M.newShape('rect', { x: w * 0.05, y: w * 0.05, w: w * 0.9, h: hh - w * 0.1, radius: w * 0.11, fill: '#d9d9de', frame: true })];
    } else if (kind === 'laptop') {
      const w = W * 0.5, hh = w * 0.62;
      els = [M.newShape('rect', { x: 0, y: 0, w, h: hh, radius: w * 0.03, fill: '#2b2b2f' }), M.newShape('rect', { x: w * 0.03, y: w * 0.03, w: w * 0.94, h: hh - w * 0.06, fill: '#d9d9de', frame: true }), M.newShape('trapezoid', { x: -w * 0.08, y: hh, w: w * 1.16, h: w * 0.05, fill: '#9a9aa6' })];
    } else {
      const w = W * 0.55, hh = w * 0.65;
      els = [M.newShape('rect', { x: 0, y: 0, w, h: hh, radius: 12, fill: '#ffffff', stroke: '#d0d0d8', strokeWidth: 2, shadow: true }), M.newShape('rect', { x: 0, y: 0, w, h: w * 0.06, radius: 12, fill: '#ececf1' }), ...['#ff5f57', '#febc2e', '#28c840'].map((c, i) => M.newShape('ellipse', { x: w * 0.02 + i * w * 0.035, y: w * 0.017, w: w * 0.025, h: w * 0.025, fill: c })), M.newShape('rect', { x: 0, y: w * 0.06, w, h: hh - w * 0.06, fill: '#d9d9de', frame: true })];
    }
    const gid = U.uid('g_');
    els.forEach((e) => (e.groupId = gid));
    E.add(els);
  }

  // ---------- Text ----------
  P.text = () => {
    const body = h('div',
      item('button.btn.primary.full', {}, () => E.addText('body'), U.ic('text', 16), ' Add a text box'),
      section('Default text styles',
        item('button.text-add.heading', {}, () => E.addText('heading'), 'Add a heading'),
        item('button.text-add.sub', {}, () => E.addText('subheading'), 'Add a subheading'),
        item('button.text-add.body', {}, () => E.addText('body'), 'Add a little bit of body text')
      )
    );
    const b = A.app.brand?.fonts;
    if (b && (b.heading || b.body)) body.append(section('Brand fonts', h('div.font-sets', [['heading', 'Heading'], ['subheading', 'Subheading'], ['body', 'Body']].filter(([k]) => b[k]).map(([k, n]) => item('button.font-set', {}, () => E.addText(k), h('b', { style: { fontFamily: M.fontStack(b[k]) } }, n), h('span', b[k]))))));
    body.append(section('Font combinations', h('div.combo-grid', M.FONT_PAIRS.map(([hf, bf, name]) => item('button.combo', {}, () => addCombo(hf, bf, name), h('b', { style: { fontFamily: M.fontStack(hf) } }, name), h('span', { style: { fontFamily: M.fontStack(bf) } }, 'Pair with ' + bf))))));
    const styles = [
      ['Neon glow', { color: '#ff66c4', effect: { type: 'neon', intensity: 60 }, bold: true }, '#1a1033'],
      ['Hollow', { color: '#1a1a1a', effect: { type: 'hollow', thickness: 50 }, font: 'Impact' }],
      ['Splice', { color: '#1a1a1a', effect: { type: 'splice', color: '#ffbd59' }, font: 'Impact' }],
      ['Highlight', { color: '#1a1a1a', effect: { type: 'background', color: '#ffde59' }, bold: true }],
      ['Glitch', { color: '#1a1a1a', effect: { type: 'glitch' }, font: 'Impact' }],
      ['Curved', { color: '#5e17eb', curve: 45, bold: true }],
    ];
    body.append(section('Text effects', h('div.combo-grid', styles.map(([name, o, bg]) => item('button.combo', { style: bg ? { background: bg, color: '#fff' } : {} }, () => addStyled(name, o), h('b', name))))));
    return { title: 'Text', body };
  };
  function addCombo(hf, bf, name) {
    const W = E.d.width, s = Math.max(14, W / 1080 * 36);
    const a = M.sample(M.newText({ text: name, font: hf, size: s * 2.4, bold: true, w: W * 0.6, align: 'center' }));
    a.h = R.textHeight(a);
    const b = M.sample(M.newText({ text: 'A few words to set the mood.', font: bf, size: s, w: W * 0.6, y: a.y + a.h + s * 0.5, align: 'center' }));
    b.h = R.textHeight(b);
    const gid = U.uid('g_');
    a.groupId = b.groupId = gid;
    E.add([a, b]);
  }
  function addStyled(name, o) {
    const W = E.d.width;
    const el = M.sample(M.newText({ text: name, size: Math.max(20, W / 14), w: W * 0.6, align: 'center', ...o }));
    if (el.curve) { const g = R.curveGeom(el); el.w = g.w; el.h = g.h; }
    else el.h = R.textHeight(el);
    E.add(el, { edit: true });
  }

  // ---------- Brand ----------
  P.brand = () => {
    const b = A.app.brand || {};
    const body = h('div');
    if (!b.colors?.length && !b.logos?.length && !b.fonts?.heading) body.append(h('div.empty', h('p', 'Set up your Brand Kit with logos, colours and fonts so they are always one click away.')));
    // a brand photo or logo is added on click, or dropped where it is wanted (into a frame there)
    const brandImg = (id, alt, frac) => {
      const img = h('img', { src: S.assetURL(id) || null, alt, draggable: 'false' });
      S.ensureAssetURLs([id]).then(() => (img.src = S.assetURL(id)));
      const add = async () => { const a = await S.get('assets', id); if (a) E.addImageAsset(a, { frac }); };
      // (added once loaded, so a mouse click lets go of the focus here: Space can't add it again)
      return EU.draggable(h('button.img-item', { onclick: (e) => { if (e.detail) e.currentTarget.blur(); add(); } }, img), { add, asset: { id } });
    };
    if (b.logos?.length) body.append(section('Logos', h('div.img-grid', b.logos.map((id) => brandImg(id, 'logo', 0.3)))));
    if (b.colors?.length) body.append(section('Brand colours', h('p.muted.small', 'Click to apply to the selection.'), h('div.cp-grid', b.colors.map((c) => h('button.color-sw', { style: { background: c }, title: c, onclick: () => applyColor(c) })))));
    if (b.fonts?.heading || b.fonts?.body) body.append(section('Brand fonts', ...[['heading', 'Heading'], ['subheading', 'Subheading'], ['body', 'Body']].filter(([k]) => b.fonts[k]).map(([k, n]) => item('button.text-add', { style: { fontFamily: M.fontStack(b.fonts[k]) } }, () => E.addText(k), n + ' – ' + b.fonts[k]))));
    if (b.photos?.length) body.append(section('Brand photos', h('div.img-grid', b.photos.map((id) => brandImg(id, '')))));
    if (b.voice) body.append(section('Brand voice', h('p.small', b.voice)));
    body.append(h('button.btn.full', { onclick: () => A.app.go('#/brand') }, U.ic('brand', 16), ' Edit Brand Kit'));
    return { title: 'Brand', body };
  };
  function applyColor(c) {
    const els = E.selEls();
    if (!els.length) return setBg({ color: c });
    EU.apply((x) => {
      if (x.type === 'text') x.color = c;
      else if (x.type === 'line' || x.type === 'draw') x.stroke = c;
      else if ('fill' in x) x.fill = c;
    });
  }

  // ---------- Uploads ----------
  P.uploads = (mode) => {
    const body = h('div');
    const modeHint = { background: 'Click an image to set it as the page background.', replace: 'Click an image to replace the selected photo.', frame: 'Click an image to place it in the selected frame.', audio: 'Upload or pick audio to use as the soundtrack.' }[mode];
    if (modeHint) body.append(h('div.notice', modeHint, h('button.link', { onclick: () => EU.openPanel('uploads') }, 'Cancel')));
    body.append(h('button.btn.primary.full', { onclick: () => upload(mode) }, U.ic('upload', 16), ' Upload files'), h('p.muted.small', 'Images, SVG, audio, fonts (.ttf .otf .woff) and Atelier design files. Drag & drop onto the page also works.'));
    const tab = mode === 'audio' ? 'audio' : state.uploadsTab;
    body.append(tabs([['images', 'Images'], ['audio', 'Audio'], ['fonts', 'Fonts']], tab, (t) => { state.uploadsTab = t; EU.openPanel('uploads', mode === 'audio' && t !== 'audio' ? null : mode); }));
    const list = h('div');
    body.append(list);
    (async () => {
      if (tab === 'images') {
        const imgs = await S.listAssets('image');
        await S.ensureAssetURLs(imgs.map((a) => a.id));
        if (!imgs.length) list.append(h('p.muted', 'No images yet.'));
        list.append(h('div.img-grid', imgs.map((a) => {
          // dragged, it goes where it is dropped (into a frame there), whatever the click does in this mode
          const btn = EU.draggable(h('button.img-item', { title: a.name, onclick: () => useImage(a, mode) }, h('img', { src: S.assetURL(a.id), alt: a.name, loading: 'lazy', draggable: 'false' })), { add: () => E.addImageAsset(a), asset: a });
          btn.addEventListener('contextmenu', (e) => { e.preventDefault(); U.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Delete upload', icon: 'trash', danger: true, onClick: async () => { a.hidden = true; await S.put('assets', a); EU.renderPanel(); } }]); });
          return btn;
        })));
      } else if (tab === 'audio') {
        const auds = await S.listAssets('audio');
        if (!auds.length) list.append(h('p.muted', 'No audio yet.'));
        for (const a of auds) list.append(h('div.audio-item', U.ic('music', 16), h('span.flex1', a.name), h('button.btn.sm' + (E.d.audio === a.id ? '.primary' : ''), { onclick: () => { E.d.audio = E.d.audio === a.id ? null : a.id; E.changed({ all: true }); EU.renderPanel(); } }, E.d.audio === a.id ? 'In use' : 'Use')));
      } else {
        const fonts = await S.listAssets('font');
        if (!fonts.length) list.append(h('p.muted', 'Upload .ttf, .otf, .woff or .woff2 files to use your own fonts.'));
        for (const a of fonts) list.append(h('div.audio-item', U.ic('text', 16), h('span.flex1', { style: { fontFamily: M.fontStack(a.tag || a.name) } }, a.tag || a.name)));
      }
    })();
    return { title: 'Uploads', body };
  };
  async function upload(mode) {
    // background, replace and frame take one photo and use it like a clicked upload
    const pick = mode && mode !== 'audio';
    const files = await U.pickFiles(pick ? 'image/*,.svg' : 'image/*,audio/*,.ttf,.otf,.woff,.woff2,.json,.svg', !pick);
    for (const f of files) {
      const a = await A.app.importFile(f, { toEditor: !pick });
      if (pick && a?.kind === 'image') useImage(a, mode);
    }
    EU.renderPanel();
  }
  function useImage(a, mode) {
    const el = sel1();
    if (mode === 'background') return setBg({ asset: a.id }) && EU.openPanel('uploads');
    // replacing a photo or filling a frame edits that element, so its lock and the page lock apply
    const swap = el && ((mode === 'replace' && el.type === 'image') || (el.type === 'shape' && (el.frame || mode === 'frame')));
    if (swap && !E.editEls().includes(el)) return;
    if (mode === 'replace' && el?.type === 'image') { el.asset = a.id; el.nw = a.w; el.nh = a.h; el.crop = { x: 0, y: 0, w: 1, h: 1 }; el.h = el.w * (a.h / a.w); E.changed(); return EU.openPanel('uploads'); }
    if (el && el.type === 'shape' && (el.frame || mode === 'frame')) { el.asset = a.id; el.frame = true; E.changed(); return; }
    E.addImageAsset(a);
  }

  // ---------- Draw ----------
  P.draw = () => {
    E.tool = 'draw';
    EU.refreshTool();
    E.deselect();
    const pen = E.pen;
    const tool = (id, label, icon) => h('button.draw-tool' + (pen.pen === id ? '.on' : ''), { onclick: () => { pen.pen = id; EU.renderPanel(); } }, U.ic(icon, 26), h('span', label));
    const body = h('div',
      h('div.draw-tools', tool('pen', 'Pen', 'pen'), tool('marker', 'Marker', 'marker'), tool('highlighter', 'Highlighter', 'highlighter'), tool('eraser', 'Eraser', 'eraser')),
      section('Colour', h('div.cp-grid', ['#1a1a1a', '#ffffff', '#ff3131', '#ff914d', '#ffde59', '#00bf63', '#38b6ff', '#5e17eb', '#ff66c4', ...(A.app.brand?.colors || [])].map((c) => h('button.color-sw' + (pen.color === c ? '.on' : ''), { style: { background: c }, onclick: () => { pen.color = c; EU.renderPanel(); } })), h('label.native-wrap', { title: 'Custom colour' }, h('input.native-color', { type: 'color', value: pen.color, onchange: (e) => { pen.color = e.target.value; EU.renderPanel(); } }), U.ic('plus', 14)))),
      section('', EU.slider('Thickness', pen.size, 1, 60, 1, (v) => (pen.size = v))),
      h('p.muted.small', 'Draw directly on the page. Each stroke becomes an element you can move, recolour or delete.'),
      h('button.btn.full', { onclick: () => { E.tool = null; EU.refreshTool(); EU.openPanel('elements'); } }, 'Done drawing')
    );
    return { title: 'Draw', body };
  };

  // ---------- Projects ----------
  P.projects = () => {
    const body = h('div', h('p.muted.small', 'Reuse pages from your other designs. They are scaled to fit this design.'));
    const list = h('div.proj-list');
    body.append(list);
    S.listDesigns().then((ds) => {
      ds = ds.filter((d) => d.id !== E.d.id);
      if (!ds.length) list.append(h('p.muted', 'No other designs yet.'));
      for (const d of ds)
        list.append(h('button.proj-item', {
          onclick: async (e) => U.menu(e.currentTarget, [
            { label: 'Add its pages here', icon: 'addpage', onClick: async () => { const c = U.clone(d); E.resizeDesign(c, E.d.width, E.d.height); freshIds(c.pages); await S.ensureAssetURLs(S.designAssetIds(c)); E.d.pages.splice(E.pi + 1, 0, ...c.pages); E.pi++; E.changed({ structure: true }); } },
            { label: 'Open design', icon: 'fwd', onClick: () => A.app.go('#/design/' + d.id) },
          ]),
        }, h('img', { src: d.thumb || '', alt: '' }), h('span', d.title)));
    });
    return { title: 'Projects', body };
  };

  // ---------- Apps ----------
  const APPS = [
    ['gradient', 'Gradient maker', 'Create smooth gradient images', 'sparkle'],
    ['pattern', 'Pattern maker', 'Dots, stripes, grids, waves and more', 'grid'],
    ['palette', 'Palette generator', 'Harmonious colour palettes from one colour', 'brand'],
    ['lorem', 'Placeholder text', 'Fill layouts with sample text', 'text'],
    ['qr', 'Link card', 'A styled button that opens a link', 'link'],
    ['miniapp', 'Mini-app builder (AI)', 'Describe a widget and AI builds it', 'code'],
  ];
  P.apps = () => {
    const back = () => { state.app = null; EU.renderPanel(); };
    if (state.app) return { title: APPS.find((a) => a[0] === state.app)[1], body: appBody(state.app), back };
    const body = h('div.app-list', APPS.map(([id, name, desc, icon]) => h('button.app-item', { onclick: () => { state.app = id; EU.renderPanel(); } }, h('span.app-ic', U.ic(icon, 22)), h('div', h('b', name), h('div.muted.small', desc)))));
    return { title: 'Apps', body };
  };
  function appBody(id) {
    const W = E.d.width, H = E.d.height;
    if (id === 'gradient') {
      const a = h('input.native-color', { type: 'color', value: '#8c52ff' }), b = h('input.native-color', { type: 'color', value: '#ff66c4' });
      const ang = h('input', { type: 'range', min: 0, max: 360, value: 135 });
      const kind = h('select.input', h('option', { value: 'linear' }, 'Linear'), h('option', { value: 'radial' }, 'Radial'));
      const prev = h('div.app-preview');
      const upd = () => (prev.style.background = R.cssPaint(`grad:${a.value}:${b.value}:${ang.value}:${kind.value}`));
      [a, b, ang, kind].forEach((x) => x.addEventListener('input', upd));
      upd();
      return h('div', prev, h('div.row', a, b, kind), h('label.field', h('span', 'Angle'), ang),
        h('button.btn.primary.full', { onclick: () => setBg({ color: `grad:${a.value}:${b.value}:${ang.value}:${kind.value}` }) }, 'Set as background'),
        h('button.btn.full', { onclick: async () => { const blob = await A.I.gradientBlob(a.value, b.value, +ang.value, 1200, 1200, kind.value); E.addImageAsset(await S.addAsset(blob, { name: 'Gradient' })); } }, 'Add as image'));
    }
    if (id === 'pattern') {
      const kind = h('select.input', ['dots', 'grid', 'stripes', 'checks', 'zigzag', 'waves', 'triangles'].map((k) => h('option', { value: k }, k)));
      const fg = h('input.native-color', { type: 'color', value: '#8c52ff' }), bg = h('input.native-color', { type: 'color', value: '#f4f1ff' });
      const sc = h('input', { type: 'range', min: 10, max: 160, value: 40 });
      const img = h('img.app-preview');
      const upd = async () => { const blob = await A.I.patternBlob(kind.value, fg.value, bg.value, +sc.value, 300, 300); img.src = URL.createObjectURL(blob); };
      [kind, fg, bg, sc].forEach((x) => x.addEventListener('change', upd));
      upd();
      const make = async () => S.addAsset(await A.I.patternBlob(kind.value, fg.value, bg.value, +sc.value * Math.max(1, W / 1080), Math.round(W), Math.round(H)), { name: 'Pattern' });
      return h('div', img, h('label.field', h('span', 'Pattern'), kind), h('div.row', h('span', 'Colours'), fg, bg), h('label.field', h('span', 'Scale'), sc),
        h('button.btn.primary.full', { onclick: async () => { if (!E.canEdit()) return; const a = await make(); await S.ensureAssetURLs([a.id]); setBg({ asset: a.id }); } }, 'Set as background'),
        h('button.btn.full', { onclick: async () => E.addImageAsset(await make()) } , 'Add as image'));
    }
    if (id === 'palette') {
      const base = h('input.native-color', { type: 'color', value: '#8c52ff' });
      const out = h('div');
      const upd = () => {
        const [r, g, b] = U.hexToRgb(base.value).map((v) => v / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let hh = 0;
        if (max !== min) hh = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
        hh = (hh * 60 + 360) % 360;
        const sets = {
          Complementary: [U.hsl(hh, 70, 50), U.hsl(hh, 60, 75), U.hsl(hh + 180, 70, 50), U.hsl(hh + 180, 60, 80), U.hsl(hh, 20, 15)],
          Analogous: [U.hsl(hh - 30, 70, 55), U.hsl(hh, 70, 50), U.hsl(hh + 30, 70, 55), U.hsl(hh, 40, 90), U.hsl(hh, 30, 15)],
          Triadic: [U.hsl(hh, 70, 50), U.hsl(hh + 120, 70, 50), U.hsl(hh + 240, 70, 50), U.hsl(hh, 20, 95), U.hsl(hh, 20, 12)],
          Monochrome: [U.hsl(hh, 70, 20), U.hsl(hh, 70, 35), U.hsl(hh, 70, 50), U.hsl(hh, 70, 70), U.hsl(hh, 70, 90)],
        };
        out.innerHTML = '';
        for (const [n, cols] of Object.entries(sets)) out.append(h('div.palette', h('div.pal-cols', cols.map((c) => h('span', { style: { background: c }, title: c }))), h('span', n), h('div.row', h('button.btn.sm', { onclick: () => recolor(cols) }, 'Apply to page'), h('button.btn.sm', { onclick: async () => { A.app.brand.colors = [...new Set([...(A.app.brand.colors || []), ...cols])]; await A.app.saveBrand(); U.toast('Added to Brand Kit', 'ok'); } }, 'Save to brand'))));
      };
      base.addEventListener('input', upd);
      upd();
      return h('div', h('div.row', h('span', 'Base colour'), base), out);
    }
    if (id === 'lorem') {
      const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
      const n = h('input', { type: 'range', min: 1, max: 5, value: 1 });
      return h('div', h('label.field', h('span', 'Paragraphs'), n), h('button.btn.primary.full', { onclick: () => { const t = Array(+n.value).fill(LOREM).join('\n\n'); const el = M.newText({ text: t, w: W * 0.6, size: Math.max(12, W / 60) }); el.h = R.textHeight(el); E.add(el); } }, 'Add placeholder text'));
    }
    if (id === 'qr') {
      const url = h('input.input', { placeholder: 'https://example.com' });
      const label = h('input.input', { placeholder: 'Button label', value: 'Visit website' });
      return h('div', h('label.field', h('span', 'Link'), url), h('label.field', h('span', 'Label'), label), h('button.btn.primary.full', { onclick: () => {
        if (!url.value) return U.toast('Enter a link');
        E.add(M.newShape('rounded', { w: W * 0.3, h: W * 0.07, fill: A.app.brand?.colors?.[0] || '#5e17eb', text: label.value, size: Math.max(14, W / 50), color: '#ffffff', bold: true, align: 'center', link: url.value }));
      } }, 'Add link button'), h('p.muted.small', 'Links stay clickable in PDF-free website exports and in present mode.'));
    }
    if (id === 'miniapp') return P.miniApp();
    return h('div');
  }
  P.miniApp = () => {
    const prompt = h('textarea.input', { placeholder: 'e.g. A countdown timer to New Year with big numbers', rows: 3 });
    const frame = h('iframe.mini-frame', { sandbox: 'allow-scripts', title: 'Mini app preview' });
    let html = '';
    const status = h('p.muted.small');
    return h('div', aiNotice(), prompt, h('button.btn.primary.full', { onclick: async () => {
      if (!A.AI.ready()) return U.toast('Add an API key in Settings → AI first');
      status.textContent = 'Building…';
      try { html = await A.AI.miniApp(prompt.value); frame.srcdoc = html; status.textContent = 'Done. It runs in a sandbox with no network access.'; } catch (e) { status.textContent = e.message; }
    } }, U.ic('sparkle', 16), ' Build'), status, frame, h('button.btn.full', { onclick: () => html && U.download(new Blob([html], { type: 'text/html' }), 'mini-app.html') }, 'Download HTML'));
  };

  // ---------- AI ----------
  const aiNotice = () => (A.AI.ready() ? null : h('div.notice', 'AI features are optional and use your own Anthropic API key. ', h('button.link', { onclick: () => A.Home.settings('ai') }, 'Add a key in Settings')));
  P.ai = () => {
    const body = h('div', aiNotice());
    // Write
    const wp = h('textarea.input', { rows: 3, placeholder: 'e.g. A catchy headline for a summer lemonade stand' });
    const wout = h('div.ai-out');
    const run = async (fn, btn) => {
      if (!A.AI.ready()) return A.Home.settings('ai');
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = 'Working…';
      try { await fn(); } catch (e) { U.toast(e.message, 'error'); }
      btn.disabled = false;
      btn.textContent = old;
    };
    const writeBtn = h('button.btn.primary', { onclick: () => run(async () => {
      const t = await A.AI.write(wp.value);
      wout.innerHTML = '';
      wout.append(h('p', t), h('button.btn.sm', { onclick: () => { const el = M.newText({ text: t, w: E.d.width * 0.6, size: Math.max(14, E.d.width / 36) }); el.h = R.textHeight(el); E.add(el); } }, 'Add to page'));
    }, writeBtn) }, 'Write');
    body.append(section('Write for me', wp, writeBtn, wout));
    // rewrites the text selected at click time, even if the selection moves on while it runs
    const rewrite = async (how) => {
      const st = sel1(), pid = E.page().id;
      if (!st || !(st.type === 'text' || (st.type === 'shape' && st.text))) return U.toast('Select a text box to rewrite it');
      if (!E.canEdit()) return;
      const t = await A.AI.rewrite(st.text, how);
      // an edit session on it would keep the old text in its text box and write that back on the next key
      if (E.d && E.editingId === st.id) E.finishText();
      const x = E.d?.pages.find((p) => p.id === pid)?.elements.find((e) => e.id === st.id);
      if (!x) return;
      x.text = t;
      if (x.type === 'text') R.fitText(x);
      E.changed({ all: true });
    };
    const opts = [['shorter', 'Shorter'], ['longer and more detailed', 'Longer'], ['more formal and professional', 'Formal'], ['more fun and playful', 'Fun'], ['free of spelling and grammar mistakes', 'Fix spelling']];
    body.append(section('Rewrite selected text', h('div.chip-row', opts.map(([how, l]) => { const b = h('button.chip', { onclick: () => run(() => rewrite(how), b) }, l); return b; }))));
    // Design
    const dp = h('textarea.input', { rows: 3, placeholder: 'e.g. Bakery grand opening poster, warm colours' });
    const pages = h('select.input.sm', [1, 2, 3, 5].map((n) => h('option', { value: n }, n + ' page' + (n > 1 ? 's' : ''))));
    const desBtn = h('button.btn.primary', { onclick: () => run(async () => {
      const r = await A.AI.design(dp.value, E.d.width, E.d.height, +pages.value);
      if (!r.pages.length) throw new Error('No pages were generated. Try rewording.');
      const blank = E.d.pages.length === 1 && !E.d.pages[0].elements.length;
      if (blank) E.d.pages = r.pages; else E.d.pages.splice(E.pi + 1, 0, ...r.pages);
      if (blank && r.title && E.d.title === 'Untitled design') E.d.title = r.title;
      E.pi = blank ? 0 : E.pi + 1;
      E.changed({ structure: true });
      U.toast('Design generated', 'ok');
    }, desBtn) }, 'Generate');
    body.append(section('Generate a design', dp, h('div.row', pages, desBtn)));
    // Graphic
    const gp = h('input.input', { placeholder: 'e.g. A friendly cartoon sun wearing sunglasses' });
    const gBtn = h('button.btn.primary', { onclick: () => run(async () => {
      const g = await A.AI.graphic(gp.value);
      const a = await S.addAsset(new Blob([g.svg], { type: 'image/svg+xml' }), { name: 'AI graphic', w: g.w, h: g.h });
      await S.ensureAssetURLs([a.id]);
      E.addImageAsset(a, { frac: 0.5 });
    }, gBtn) }, 'Create');
    body.append(section('Generate a graphic', gp, gBtn));
    // Translate
    const lang = h('select.input', ['Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Arabic', 'Hindi', 'English'].map((l) => h('option', { value: l }, l)));
    const tBtn = h('button.btn', { onclick: () => run(async () => { await EU.translateDesign(E.d, lang.value); E.changed({ all: true }); U.toast('Translated', 'ok'); }, tBtn) }, 'Translate design');
    body.append(section('Translate', h('div.row', lang, tBtn)));
    // Assistant
    const log = h('div.chat-log');
    const renderLog = () => {
      log.innerHTML = '';
      for (const m of state.aiChat) log.append(h('div.chat-msg.' + m.role, m.role === 'user' ? m.content : m.display || m.content));
      log.scrollTop = log.scrollHeight;
    };
    renderLog();
    const ci = h('input.input', { placeholder: 'Ask the assistant to edit this page…' });
    const send = () => run(async () => {
      if (!ci.value.trim()) return;
      state.aiChat.push({ role: 'user', content: ci.value });
      ci.value = '';
      renderLog();
      const hist = state.aiChat.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const r = await A.AI.assistant(hist, E.d, E.page());
      applyOps(r.ops || []);
      state.aiChat.push({ role: 'assistant', content: JSON.stringify({ reply: r.reply, ops: r.ops || [] }), display: r.reply || 'Done.' });
      renderLog();
    }, sendBtn);
    const sendBtn = h('button.btn.primary', { onclick: send }, 'Send');
    ci.addEventListener('keydown', (e) => e.key === 'Enter' && send());
    body.append(section('Design assistant', log, h('div.row', ci, sendBtn), state.aiChat.length ? h('button.link', { onclick: () => { state.aiChat = []; renderLog(); } }, 'Clear chat') : null));
    body.append(section('Photo AI tools', h('p.muted.small', 'Background remover, magic eraser, expand and upscale run on your device – select a photo and choose Edit.')));
    body.append(section('Mini-app builder', h('button.btn.full', { onclick: () => { EU.openPanel('apps'); state.app = 'miniapp'; EU.renderPanel(); } }, U.ic('code', 16), ' Open mini-app builder')));
    return { title: 'AI tools', body };
  };
  function applyOps(ops) {
    let structure = false;
    for (const op of ops) {
      try {
        if (op.op === 'add') E.page().elements.push(...A.AI.toElements([op.element]));
        if (op.op === 'update') {
          const el = E.byId(op.id);
          if (el) {
            const p = { ...op.props };
            delete p.id;
            delete p.type;
            Object.assign(el, p);
            if (el.type === 'text') R.fitText(el);
          }
        }
        if (op.op === 'delete') E.page().elements = E.els().filter((e) => e.id !== op.id);
        if (op.op === 'background') E.page().bg = { ...(E.page().bg || {}), color: op.color };
        if (op.op === 'addPage') { E.d.pages.splice(E.pi + 1, 0, M.newPage({ bg: { color: op.background || '#ffffff' }, elements: A.AI.toElements(op.elements || []) })); structure = true; }
      } catch (e) { console.warn('op failed', op, e); }
    }
    E.sel = E.sel.filter((id) => E.byId(id));
    E.changed({ structure });
  }

  // ---------- Position ----------
  P.position = () => {
    const body = h('div', tabs([['arrange', 'Arrange'], ['layers', 'Layers']], state.posTab, (t) => { state.posTab = t; EU.renderPanel(); }));
    const els = E.selEls();
    if (state.posTab === 'arrange') {
      if (!els.length) { body.append(h('p.muted', 'Select an element to arrange it.')); return { title: 'Position', body }; }
      const btn = (icon, label, fn) => h('button.arr-btn', { onclick: fn }, U.ic(icon, 16), label);
      body.append(section('Layer order', h('div.arr-grid', btn('forward', 'Forward', () => E.order('forward')), btn('backward', 'Backward', () => E.order('backward')), btn('tofront', 'To front', () => E.order('front')), btn('backward', 'To back', () => E.order('back')))));
      body.append(section(els.length > 1 ? 'Align elements' : 'Align to page', h('div.arr-grid', btn('up', 'Top', () => E.align('top')), btn('alignl', 'Left', () => E.align('left')), btn('spacing', 'Middle', () => E.align('middle')), btn('alignc', 'Centre', () => E.align('center')), btn('down', 'Bottom', () => E.align('bottom')), btn('alignr', 'Right', () => E.align('right')))));
      if (els.length > 2) body.append(section('Space evenly', h('div.arr-grid', btn('split', 'Horizontally', () => E.distribute('h')), btn('spacing', 'Vertically', () => E.distribute('v')))));
      if (els.length === 1) {
        const el = els[0];
        const shown = (key) => U.round(key === 'rot' ? el.rot || 0 : el[key], 1);
        const fields = [];
        const field = (label, key, fn) => {
          const inp = h('input.input', { type: 'number', value: shown(key) });
          // the panel isn't rebuilt while it is in use, so the other fields (Height after Width) are updated here
          // a locked element or page refuses the value, and the field shows the real one again
          inp.addEventListener('change', () => {
            const free = E.editEls().includes(el);
            if (free) { fn(+inp.value); E.changed(); }
            fields.forEach(([k, x]) => (x !== inp || !free) && (x.value = shown(k)));
          });
          fields.push([key, inp]);
          return h('label.field.half', h('span', label), inp);
        };
        const ratio = el.h / el.w;
        const lock = h('input', { type: 'checkbox', checked: ['image', 'icon', 'emoji'].includes(el.type) });
        const wF = field('Width', 'w', (v) => { const old = el.w; el.w = Math.max(1, v); if (lock.checked) el.h = el.w * ratio; if (el.type === 'text') { el.size = U.round(el.size * (el.w / old), 1); R.fitText(el); } });
        const hF = field('Height', 'h', (v) => { el.h = Math.max(1, v); if (lock.checked) el.w = el.h / ratio; });
        body.append(section('Advanced', el.type === 'line' ? h('p.muted.small', 'Drag the line ends to reshape it. Hold Shift for 45° angles.') : h('div.adv-grid', wF, hF, field('X', 'x', (v) => (el.x = v)), field('Y', 'y', (v) => (el.y = v)), field('Rotate °', 'rot', (v) => (el.rot = v))), el.type !== 'line' ? h('label.check', lock, ' Lock aspect ratio') : null));
      }
    } else {
      const list = h('div.layers');
      const items = [...E.els()].reverse();
      items.forEach((el) => {
        const ctx = { asset: (id) => S.assetURL(id), idp: 'l' + el.id, defs: [], page: E.page() };
        const inner = R.elementSVG(el, ctx);
        const row = h('div.layer' + (E.sel.includes(el.id) ? '.on' : ''), { draggable: 'true', onclick: (e) => E.select([el.id], e.shiftKey) },
          h('span.layer-thumb', { html: `<svg viewBox="${Math.round(el.x)} ${Math.round(el.y)} ${Math.max(1, Math.round(el.w))} ${Math.max(1, Math.round(el.h))}" width="40" height="30"><defs>${ctx.defs.join('')}</defs>${inner}</svg>` }),
          h('span.layer-name', layerName(el)),
          h('button.icon-btn.sm', { title: el.hidden ? 'Show' : 'Hide', onclick: (e) => { e.stopPropagation(); if (!E.canEdit()) return; el.hidden = !el.hidden; E.changed(); EU.renderPanel(); } }, U.ic(el.hidden ? 'eyeoff' : 'eye', 14)),
          h('button.icon-btn.sm', { title: el.locked ? 'Unlock' : 'Lock', onclick: (e) => { e.stopPropagation(); if (!E.canEdit()) return; el.locked = !el.locked; E.changed(); EU.renderPanel(); } }, U.ic(el.locked ? 'lock' : 'unlock', 14))
        );
        row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-layer', el.id));
        row.addEventListener('dragover', (e) => e.preventDefault());
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData('text/x-layer');
          if (!E.canEdit()) return;
          const arr = E.els();
          const from = arr.findIndex((x) => x.id === id), to = arr.findIndex((x) => x.id === el.id);
          if (from < 0 || from === to) return;
          const [m] = arr.splice(from, 1);
          arr.splice(to, 0, m);
          E.changed();
          EU.renderPanel();
        });
        list.append(row);
      });
      if (!items.length) list.append(h('p.muted', 'This page is empty.'));
      body.append(h('p.muted.small', 'Top of the list is in front. Drag to reorder.'), list);
    }
    return { title: 'Position', body };
  };
  const layerName = (el) => el.name || (el.text && el.type !== 'emoji' ? '“' + el.text.slice(0, 24) + '”' : el.type === 'shape' ? (el.frame ? 'Frame' : 'Shape') : el.type === 'emoji' ? 'Sticker ' + el.text : el.type[0].toUpperCase() + el.type.slice(1));

  // ---------- Effects (text) ----------
  P.effects = () => {
    const el = sel1();
    if (!el || el.type !== 'text') return { title: 'Effects', body: h('p.muted', 'Select a text box to add effects.') };
    const eff = el.effect || { type: 'none' };
    const set = (patch, fin = true) => EU.apply((x) => { x.effect = { ...(x.effect || {}), ...patch }; }, fin);
    const grid = h('div.fx-grid', M.EFFECTS.map(([id, name]) => {
      const sample = M.newText({ text: 'Ag', size: 60, w: 120, color: '#333', font: 'Impact', effect: { type: id } });
      return h('button.fx-item' + (eff.type === id ? '.on' : ''), { onclick: () => { EU.apply((x) => { if (x.effect?.type !== id) x.effect = { type: id }; }); EU.renderPanel(); } }, h('span.fx-prev', { html: R.pageSVG({ width: 120, height: 90, pages: [] }, { elements: [{ ...sample, x: 10, y: 4, h: 80 }], bg: { color: '#f2f2f5' } }, { width: 120, idp: 'fx' + id }) }), h('span', name));
    }));
    const params = h('div');
    const sl = (label, key, def, min = 0, max = 100) => EU.slider(label, eff[key] ?? def, min, max, 1, (v, f) => set({ [key]: v }, f));
    const colorRow = (label, def) => h('div.row', h('label.mini-label', label), EU.swatchBtn(eff.color || def, label, (c, f) => { set({ color: c }, f); if (f) EU.renderPanel(); }, { opts: { gradients: false } }));
    if (eff.type === 'shadow') params.append(sl('Offset', 'offset', 50), sl('Direction', 'direction', 45, -180, 180), sl('Blur', 'blur', 20), sl('Transparency', 'transparency', 60), colorRow('Colour', '#000000'));
    if (eff.type === 'lift') params.append(sl('Intensity', 'intensity', 50));
    if (eff.type === 'hollow') params.append(sl('Thickness', 'thickness', 50));
    if (eff.type === 'splice') params.append(sl('Thickness', 'thickness', 50), sl('Offset', 'offset', 50), sl('Direction', 'direction', 45, -180, 180), colorRow('Colour', '#ffbd59'));
    if (eff.type === 'echo') params.append(sl('Offset', 'offset', 50), sl('Direction', 'direction', 45, -180, 180), colorRow('Colour', el.color));
    if (eff.type === 'glitch') params.append(sl('Offset', 'offset', 40));
    if (eff.type === 'neon') params.append(sl('Intensity', 'intensity', 50));
    if (eff.type === 'background') params.append(sl('Roundness', 'roundness', 30), sl('Spread', 'spread', 50), sl('Transparency', 'transparency', 0), colorRow('Colour', '#ffde59'));
    const curve = EU.slider('Curve', el.curve || 0, -100, 100, 1, (v, f) => EU.apply((x) => { x.curve = v; }, f));
    return { title: 'Effects', body: h('div', section('Style', grid), params, section('Shape', curve, h('p.muted.small', 'Curved text works best for short, single-line text.'))) };
  };

  // ---------- Animate ----------
  P.animate = (arg) => {
    const el = sel1();
    // a picked tab holds while the selection stays the same
    const key = E.sel.join();
    const mode = (state.animTab?.key === key && state.animTab.tab) || (arg === 'page' || !el ? 'page' : 'element');
    const body = h('div');
    if (el) body.append(tabs([['element', 'Element'], ['page', 'Page']], mode, (t) => { state.animTab = { tab: t, key }; EU.renderPanel(); }));
    const playBtn = h('button.btn.full', { onclick: () => A.Present.preview() }, U.ic('play', 16), ' Play preview');
    if (mode === 'element' && el) {
      const a = el.anim || {}, page = E.page();
      // the delay it really waits: with none of its own, an element in a page animation waits for its layer's turn
      const delay = R.animDelay(el, Math.max(0, E.els().filter((x) => !x.hidden).indexOf(el)), page.duration || 5, page);
      const set = (patch) => { EU.apply((x) => (x.anim = { ...(x.anim || {}), ...patch })); EU.renderPanel(); };
      const grid = (list, key) => h('div.anim-grid', list.map(([id, name]) => h('button.anim-item' + ((a[key] || 'none') === id ? '.on' : ''), { onclick: () => { set({ [key]: id }); if (id !== 'none') A.Present.preview(); } }, name)));
      body.append(section('Enter', grid(M.ANIM_IN.filter(([id]) => id !== 'typewriter' || el.type === 'text' || el.text), 'in')));
      if (a.in && a.in !== 'none' && ['rise', 'pan', 'drift'].includes(a.in)) body.append(h('div.seg', ['up', 'down', 'left', 'right'].map((d) => h('button.seg-btn' + ((a.dir || (a.in === 'pan' ? 'right' : 'up')) === d ? '.on' : ''), { onclick: () => set({ dir: d }) }, d))));
      body.append(section('Emphasis (loops)', grid(M.ANIM_EMPH, 'emph')));
      body.append(section('Exit', grid(M.ANIM_OUT, 'out')));
      body.append(section('Timing', EU.slider('Speed', a.speed || 1, 0.25, 3, 0.25, (v, f) => EU.apply((x) => (x.anim = { ...(x.anim || {}), speed: v }), f), (v) => v + '×'), EU.slider('Delay (s)', U.round(delay, 2), 0, 10, 0.1, (v, f) => EU.apply((x) => (x.anim = { ...(x.anim || {}), delay: v }), f))));
      body.append(section('Create an animation', h('p.muted.small', 'Record a motion path: click the button, then drag the element along the route.'), h('div.row', h('button.btn', { onclick: () => E.startMotion() }, U.ic('animate', 16), ' Record motion'), a.motion ? h('button.btn', { onclick: () => set({ motion: null }) }, 'Clear path') : null)));
    } else {
      const page = E.page();
      body.append(section('Page animation', h('p.muted.small', 'Animates every element on this page that has no animation of its own.'), h('div.anim-grid', M.ANIM_IN.filter(([id]) => id !== 'typewriter').map(([id, name]) => h('button.anim-item' + ((page.anim || 'none') === id ? '.on' : ''), { onclick: () => { page.anim = id; E.changed(); EU.renderPanel(); if (id !== 'none') A.Present.preview(); } }, name)))));
      body.append(section('Transition into this page', h('div.anim-grid', M.TRANSITIONS.map(([id, name]) => h('button.anim-item' + ((page.transition || 'none') === id ? '.on' : ''), { onclick: () => { page.transition = id; E.changed({ all: true }); EU.renderPanel(); } }, name)))));
      body.append(section('Duration', EU.slider('Seconds', page.duration || 5, 0.5, 60, 0.5, (v, f) => { page.duration = v; if (f) { E.changed({ toolbar: false }); EU.refreshTimeline(); } })));
      body.append(h('button.btn.full', { onclick: () => { E.d.pages.forEach((p) => (p.anim = page.anim, p.transition = page.transition)); E.changed({ all: true }); U.toast('Applied to all pages', 'ok'); } }, 'Apply to all pages'));
    }
    body.append(playBtn);
    return { title: 'Animate', body };
  };

  // ---------- Image edit ----------
  P.imageEdit = () => {
    const el = sel1();
    if (!el || !(el.type === 'image' || el.asset)) return { title: 'Edit photo', body: h('p.muted', 'Select a photo to edit it.') };
    const body = h('div', tabs([['filters', 'Filters'], ['adjust', 'Adjust'], ['effects', 'Effects'], ['tools', 'Tools']], state.imgTab, (t) => { state.imgTab = t; EU.renderPanel(); }));
    const url = S.assetURL(el.asset);
    if (state.imgTab === 'filters') {
      const strength = el.filterStrength ?? 100;
      body.append(h('div.filter-grid', M.FILTER_PRESETS.map(([name, adj]) => h('button.filter-item' + ((el.preset || 'None') === name ? '.on' : ''), { onclick: () => { EU.apply((x) => { x.preset = name; x.filterStrength = 100; x.adj = { ...adj }; }); EU.renderPanel(); } }, h('img', { src: url, style: { filter: R.adjCSS(adj) }, alt: '' }), h('span', name)))));
      if (el.preset && el.preset !== 'None') {
        const base = M.FILTER_PRESETS.find((p) => p[0] === el.preset)?.[1] || {};
        body.append(EU.slider('Intensity', strength, 0, 100, 1, (v, f) => EU.apply((x) => { x.filterStrength = v; x.adj = Object.fromEntries(Object.entries(base).map(([k, val]) => [k, Math.round((val * v) / 100)])); }, f)));
      }
    } else if (state.imgTab === 'adjust') {
      const adj = el.adj || {};
      body.append(...M.ADJUST.map(([k, label, min = -100, max = 100]) => EU.slider(label, adj[k] || 0, min, max, 1, (v, f) => EU.apply((x) => (x.adj = { ...(x.adj || {}), [k]: v }), f))));
      body.append(h('button.btn.full', { onclick: () => { EU.apply((x) => { x.adj = {}; x.preset = 'None'; }); EU.renderPanel(); } }, 'Reset adjustments'));
    } else if (state.imgTab === 'effects') {
      body.append(section('Duotone', h('div.duo-grid', h('button.duo' + (!el.duo ? '.on' : ''), { onclick: () => { EU.apply((x) => delete x.duo); EU.renderPanel(); } }, 'None'), ...M.DUOTONES.map((d) => h('button.duo' + (el.duo && el.duo[0] === d[0] ? '.on' : ''), { style: { background: `linear-gradient(90deg,${d[0]},${d[1]})` }, onclick: () => { EU.apply((x) => (x.duo = d)); EU.renderPanel(); } })))));
      body.append(section('Shadow', h('label.check', h('input', { type: 'checkbox', checked: !!el.shadow, onchange: (e) => EU.apply((x) => (x.shadow = e.target.checked)) }), ' Drop shadow')));
      if (el.type === 'image') body.append(section('Corners', EU.slider('Rounding', el.radius || 0, 0, Math.round(Math.min(el.w, el.h) / 2), 1, (v, f) => EU.apply((x) => (x.radius = v), f))));
      body.append(section('Blur & vignette', EU.slider('Blur', el.adj?.blur || 0, 0, 20, 1, (v, f) => EU.apply((x) => (x.adj = { ...(x.adj || {}), blur: v }), f)), EU.slider('Vignette', el.adj?.vignette || 0, 0, 100, 1, (v, f) => EU.apply((x) => (x.adj = { ...(x.adj || {}), vignette: v }), f))));
    } else {
      const tool = (icon, name, desc, fn) => {
        const b = h('button.app-item', { onclick: async () => {
          b.classList.add('busy');
          try { await fn(); } catch (e) { console.error(e); U.toast(e.message || 'That did not work', 'error'); }
          b.classList.remove('busy');
        } }, h('span.app-ic', U.ic(icon, 20)), h('div', h('b', name), h('div.muted.small', desc)));
        return b;
      };
      // the same picture at another resolution keeps its crop; an expanded one is shown whole
      const replaceWith = async (blob, label, reframe = false) => {
        if (!blob) return;
        const a = await S.addAsset(blob, { name: label, hidden: false });
        await S.ensureAssetURLs([a.id]);
        const ratio = a.h / a.w, oldRatio = (el.nh || a.h) / (el.nw || a.w);
        el.asset = a.id;
        if (el.type === 'image') {
          el.nw = a.w; el.nh = a.h;
          if (reframe || Math.abs(ratio - oldRatio) > 0.01) { el.crop = { x: 0, y: 0, w: 1, h: 1 }; el.h = el.w * ratio; }
        }
        E.changed();
        EU.renderPanel();
        U.toast(label + ' – done', 'ok');
      };
      const blob = async () => (await S.get('assets', el.asset)).blob;
      body.append(
        tool('wand', 'Background remover', 'Removes plain or studio backgrounds', async () => replaceWith(await A.I.removeBackground(await blob()), 'Background removed')),
        tool('eraser', 'Magic eraser', 'Brush over objects to remove them', async () => replaceWith(await A.I.eraserModal(await blob()), 'Edited photo')),
        tool('fullscreen', 'Magic expand', 'Extend the photo beyond its edges', async () => replaceWith(await A.I.expand(await blob(), 0.2), 'Expanded photo', true)),
        tool('zoomin', 'Upscale 2×', 'Doubles the resolution with sharpening', async () => replaceWith(await A.I.upscale(await blob(), 2), 'Upscaled photo')),
        tool('upload', 'Replace photo', 'Pick another image', async () => EU.openPanel('uploads', el.type === 'image' ? 'replace' : 'frame')),
        ...(el.type === 'image' ? [tool('image', 'Set as background', 'Fill the page with this photo', async () => E.setBackgroundFromImage())] : [])
      );
    }
    return { title: 'Edit photo', body };
  };

  // ---------- Crop ----------
  P.crop = () => {
    const el = sel1();
    if (!el || el.type !== 'image') return { title: 'Crop', body: h('p.muted', 'Select a photo to crop it.') };
    const c = el.crop || { x: 0, y: 0, w: 1, h: 1 };
    const setRatio = (r) => {
      // r = width/height of the frame; keep the crop centred (each photo from its own natural size)
      EU.apply((x) => {
        if (x.type !== 'image') return;
        const natural = x.nw / x.nh;
        let cw = 1, ch = 1;
        if (r) { if (r > natural) ch = natural / r; else cw = r / natural; }
        x.crop = { x: (1 - cw) / 2, y: (1 - ch) / 2, w: cw, h: ch };
        x.h = x.w * ((ch * x.nh) / (cw * x.nw));
      });
      EU.renderPanel();
    };
    const ratios = [['Original', null], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16], ['3:2', 3 / 2]];
    const zoom = Math.round(100 / Math.max(c.w, c.h));
    const body = h('div',
      h('p.muted.small', 'Tip: drag the side handles on the photo to crop freely.'),
      section('Aspect ratio', h('div.chip-row', ratios.map(([l, r]) => h('button.chip', { onclick: () => setRatio(r) }, l)))),
      section('Zoom & position',
        EU.slider('Zoom', zoom, 100, 400, 1, (v, f) => EU.apply((x) => {
          if (x.type !== 'image') return;
          const k = 100 / v, aspect = x.crop.w / x.crop.h;
          let w = Math.min(1, k * (aspect >= 1 ? 1 : aspect)), hh = w / aspect;
          if (hh > 1) { hh = 1; w = aspect; }
          const cx = x.crop.x + x.crop.w / 2, cy = x.crop.y + x.crop.h / 2;
          x.crop = { w, h: hh, x: U.clamp(cx - w / 2, 0, 1 - w), y: U.clamp(cy - hh / 2, 0, 1 - hh) };
        }, f), (v) => v + '%'),
        EU.slider('Horizontal', Math.round(c.w >= 1 ? 50 : (c.x / (1 - c.w)) * 100), 0, 100, 1, (v, f) => EU.apply((x) => x.type === 'image' && (x.crop = { ...x.crop, x: (1 - x.crop.w) * (v / 100) }), f)),
        EU.slider('Vertical', Math.round(c.h >= 1 ? 50 : (c.y / (1 - c.h)) * 100), 0, 100, 1, (v, f) => EU.apply((x) => x.type === 'image' && (x.crop = { ...x.crop, y: (1 - x.crop.h) * (v / 100) }), f))
      ),
      section('Rotate & flip', h('div.row', h('button.btn', { onclick: () => EU.apply((x) => (x.rot = ((x.rot || 0) + 90) % 360)) }, 'Rotate 90°'), h('button.btn', { onclick: () => E.flip('h') }, 'Flip H'), h('button.btn', { onclick: () => E.flip('v') }, 'Flip V'))),
      h('button.btn.full', { onclick: () => { setRatio(null); } }, 'Reset crop')
    );
    return { title: 'Crop', body };
  };

  // ---------- Chart data ----------
  P.chart = () => {
    const el = sel1();
    if (!el || el.type !== 'chart') return { title: 'Chart', body: h('p.muted', 'Select a chart to edit its data.') };
    const rows = h('div.chart-rows');
    el.data.forEach((d, i) => {
      const label = h('input.input', { value: d.label });
      const val = h('input.input.num', { type: 'number', value: d.value });
      label.addEventListener('change', () => { d.label = label.value; E.changed(); });
      val.addEventListener('change', () => { d.value = +val.value || 0; E.changed(); });
      const col = el.colors[i % el.colors.length];
      rows.append(h('div.chart-row', EU.swatchBtn(col, 'Colour', (c, f) => { el.colors[i % el.colors.length] = c; E.changed({ commit: f }); if (f) EU.renderPanel(); }, { opts: { gradients: false } }), label, val, h('button.icon-btn.sm', { title: 'Remove row', onclick: () => { el.data.splice(i, 1); E.changed(); EU.renderPanel(); } }, U.ic('x', 14))));
    });
    const typeSel = h('select.input', ['bar', 'line', 'area', 'pie', 'donut'].map((t) => h('option', { value: t, selected: el.chart === t ? true : null }, t)));
    typeSel.addEventListener('change', () => { el.chart = typeSel.value; E.changed(); });
    const paste = h('textarea.input', { rows: 3, placeholder: 'Or paste data: one "label, value" per line' });
    return {
      title: 'Chart',
      body: h('div', h('label.field', h('span', 'Chart type'), typeSel), section('Data', rows, h('button.btn.sm', { onclick: () => { el.data.push({ label: 'New', value: 10 }); E.changed(); EU.renderPanel(); } }, U.ic('plus', 14), ' Add row')),
        section('Paste data', paste, h('button.btn.sm', { onclick: () => { const d = paste.value.split('\n').map((l) => l.split(/[,\t;]/)).filter((p) => p.length >= 2).map(([l, v]) => ({ label: l.trim(), value: parseFloat(v) || 0 })); if (d.length) { el.data = d; E.changed(); EU.renderPanel(); } } }, 'Use pasted data')),
        section('Text', h('div.row', h('label.mini-label', 'Text colour'), EU.swatchBtn(el.textColor, 'Text colour', (c, f) => { el.textColor = c; E.changed({ commit: f }); }, { text: true, opts: { gradients: false } }))))
    };
  };

  // ---------- Table ----------
  P.table = () => {
    const el = sel1();
    if (!el || el.type !== 'table') return { title: 'Table', body: h('p.muted', 'Select a table to edit it.') };
    const rows = el.cells.length, cols = el.cells[0].length;
    const grid = h('div.tbl-edit', { style: { gridTemplateColumns: `24px repeat(${cols}, minmax(70px, 1fr))` } });
    grid.append(h('span'));
    for (let c = 0; c < cols; c++) grid.append(h('span.tbl-h', R.colName(c)));
    const inputs = [];
    // one memo per pass evaluates each formula once
    const memo = new Map();
    for (let r = 0; r < rows; r++) {
      grid.append(h('span.tbl-h', String(r + 1)));
      for (let c = 0; c < cols; c++) {
        const inp = h('input.tbl-cell', { value: el.cells[r][c], title: R.evalCell(el.cells, r, c, memo) });
        // update in place: re-rendering the grid would drop the focus Tab is moving to the next cell
        inp.addEventListener('change', () => { el.cells[r][c] = inp.value; E.changed({ toolbar: false }); const m = new Map(); inputs.forEach((x, k) => (x.title = R.evalCell(el.cells, Math.floor(k / cols), k % cols, m))); });
        inputs.push(inp);
        grid.append(inp);
      }
    }
    const rowH = el.h / rows, colW = el.w / cols;
    return {
      title: 'Table',
      body: h('div',
        h('div.row', h('button.btn.sm', { onclick: () => { el.cells.push(Array(cols).fill('')); el.h += rowH; E.changed(); EU.renderPanel(); } }, '+ Row'), h('button.btn.sm', { onclick: () => { if (rows > 1) { el.cells.pop(); el.h -= rowH; E.changed(); EU.renderPanel(); } } }, '− Row'), h('button.btn.sm', { onclick: () => { el.cells.forEach((r) => r.push('')); el.w += colW; E.changed(); EU.renderPanel(); } }, '+ Col'), h('button.btn.sm', { onclick: () => { if (cols > 1) { el.cells.forEach((r) => r.pop()); el.w -= colW; E.changed(); EU.renderPanel(); } } }, '− Col')),
        h('div.tbl-scroll', grid),
        h('p.muted.small', 'Formulas: start with "=" – e.g. =A1+B1, =SUM(B2:B6), AVERAGE, MIN, MAX, COUNT.'),
        h('label.check', h('input', { type: 'checkbox', checked: !!el.headerFill, onchange: (e) => { el.headerFill = e.target.checked ? '#8c52ff' : ''; E.changed(); } }), ' Header row'),
        h('label.check', h('input', { type: 'checkbox', checked: !!el.stripe, onchange: (e) => { el.stripe = e.target.checked ? '#f4f1ff' : ''; E.changed(); } }), ' Striped rows'),
        EU.slider('Text size', el.size, 6, 72, 1, (v, f) => EU.apply((x) => (x.size = v), f))
      ),
    };
  };

  // ---------- Comments ----------
  P.comments = (arg) => {
    const d = E.d;
    const me = A.app.profile?.name || 'You';
    const body = h('div');
    const fmt = (t) => {
      const span = h('span');
      String(t).split(/(@[\w.-]+)/g).forEach((p) => span.append(p.startsWith('@') ? h('b.mention', p) : p));
      return span;
    };
    if (arg && arg.draft) {
      const ta = h('textarea.input', { rows: 3, placeholder: 'Add a comment. Use @name to mention or assign someone.' });
      body.append(section('New comment' + (arg.elId ? ' on element' : ''), ta, h('div.row', h('button.btn.primary', { onclick: () => { if (!ta.value.trim()) return; const c = { ...arg, text: ta.value.trim() }; delete c.draft; d.comments.push(c); E.changed({ toolbar: false }); EU.openPanel('comments'); } }, 'Comment'), h('button.btn', { onclick: () => EU.openPanel('comments') }, 'Cancel'))));
      setTimeout(() => ta.focus(), 30);
    }
    const showResolved = state.showResolved;
    body.append(h('div.row', h('button.btn.sm', { onclick: () => { E.tool = 'comment'; EU.refreshTool(); U.toast('Click on the page where you want to comment'); } }, U.ic('plus', 14), ' Add comment'), h('label.check.small', h('input', { type: 'checkbox', checked: !!showResolved, onchange: (e) => { state.showResolved = e.target.checked; EU.renderPanel(); } }), ' Show resolved')));
    const list = (d.comments || []).filter((c) => showResolved || !c.resolved);
    if (!list.length) body.append(h('p.muted', 'No comments yet.'));
    for (const c of list) {
      const pageIdx = d.pages.findIndex((p) => p.id === c.pageId);
      const reply = h('input.input.sm', { placeholder: 'Reply…' });
      reply.addEventListener('keydown', (e) => { if (e.key === 'Enter' && reply.value.trim()) { c.replies.push({ author: me, text: reply.value.trim(), ts: Date.now() }); E.changed({ toolbar: false }); EU.renderPanel(); } });
      body.append(h('div.comment' + (c.resolved ? '.resolved' : '') + (arg === c.id ? '.on' : ''),
        h('div.c-head', h('span.avatar.sm', c.author[0].toUpperCase()), h('b', c.author), h('span.muted.small', ' · ' + U.timeAgo(c.ts) + (pageIdx >= 0 ? ' · Page ' + (pageIdx + 1) : ''))),
        h('div.c-text', { onclick: () => { if (pageIdx >= 0) E.setPage(pageIdx); if (c.elId && E.byId(c.elId)) E.select([c.elId]); } }, fmt(c.text)),
        ...c.replies.map((r) => h('div.c-reply', h('b', r.author + ': '), fmt(r.text))),
        h('div.row', reply),
        h('div.row.c-actions', h('button.link', { onclick: () => { c.resolved = !c.resolved; E.changed({ toolbar: false }); EU.renderPanel(); } }, c.resolved ? 'Reopen' : 'Resolve'), h('button.link.danger', { onclick: () => { d.comments = d.comments.filter((x) => x !== c); E.changed({ toolbar: false }); EU.renderPanel(); } }, 'Delete'))
      ));
    }
    return { title: 'Comments', body };
  };
})(window.A);
