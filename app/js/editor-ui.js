'use strict';
// Editor chrome: top bar, side rail, context toolbar, colour picker, context menu,
// download / share / resize / history dialogs, timeline and bottom bar.
(function (A) {
  const U = A.U, M = A.M, R = A.R, S = A.S, E = A.E, h = U.h;
  const EU = (A.EU = { panel: null, panelArg: null, panelOpen: true });

  const RAIL = [
    ['design', 'Design', 'design'], ['elements', 'Elements', 'shapes'], ['text', 'Text', 'text'], ['brand', 'Brand', 'brand'],
    ['uploads', 'Uploads', 'upload'], ['draw', 'Draw', 'draw'], ['projects', 'Projects', 'folder'], ['apps', 'Apps', 'apps'], ['ai', 'AI', 'sparkle'],
  ];

  // ---------- skeleton ----------
  EU.build = () => {
    const root = U.$('#app');
    root.innerHTML = '';
    A.app.view = 'editor';
    const d = E.d;
    // an earlier session's save warning stays (it holds that session's edits), reworded so it isn't taken for this one's
    if (EU.saveErr?.isConnected) EU.saveErr.firstChild.nodeValue = 'Earlier changes to “' + EU.saveErr.design + '” could not be saved. Download a copy to keep them.';
    EU.saveErr = null;
    EU.saveIcon = h('span.save-state', { title: 'All changes saved' }, U.ic('cloudok', 20));
    EU.undoBtn = h('button.icon-btn', { title: 'Undo (Ctrl+Z)', onclick: () => E.undo() }, U.ic('undo'));
    EU.redoBtn = h('button.icon-btn', { title: 'Redo (Ctrl+Y)', onclick: () => E.redo() }, U.ic('redo'));
    // handlers read E.d when used: undo, redo and version restores replace the design object
    const title = (EU.titleInput = h('input.title-input', {
      value: d.title,
      title: 'Rename design',
      onchange: (e) => {
        E.d.title = e.target.value = e.target.value.trim() || 'Untitled design';
        E.scheduleSave();
      },
      onkeydown: (e) => e.key === 'Enter' && e.target.blur(),
    }));
    const isPrint = d.type === 'print';
    const top = h(
      'header.ed-top',
      h('div.ed-top-left',
        h('button.icon-btn.light', { title: 'Home', onclick: () => A.app.go('#/home') }, U.ic('home')),
        h('button.top-btn', { onclick: (e) => fileMenu(e.currentTarget) }, 'File'),
        h('button.top-btn', { onclick: () => EU.resizeDialog() }, U.ic('resize', 16), h('span.hide-sm', ' Resize')),
        EU.undoBtn, EU.redoBtn, EU.saveIcon
      ),
      h('div.ed-top-center', title),
      h('div.ed-top-right',
        h('div.avatars', h('span.avatar', { title: (A.app.profile?.name || 'You') + ' (editing)' }, (A.app.profile?.name || 'You').slice(0, 1).toUpperCase())),
        E.isWB() ? h('button.icon-btn.light', { title: 'Timer', onclick: (e) => timerPopover(e.currentTarget) }, U.ic('timer')) : null,
        h('button.icon-btn.light', { title: 'Comments', onclick: () => EU.openPanel('comments') }, U.ic('comment')),
        h('button.icon-btn.light.hide-sm', { title: 'Insights', onclick: (e) => statsPopover(e.currentTarget) }, U.ic('chart')),
        h('button.top-btn.hide-sm', { onclick: () => (isPrint ? A.X.print(E.d, E.d.pages.filter((p) => !p.hidden)) : A.Present.start()) }, U.ic(isPrint ? 'print' : 'play', 16), isPrint ? ' Print' : ' Present'),
        h('button.btn.share', { onclick: () => EU.shareDialog() }, U.ic('share', 16), ' Share')
      )
    );
    EU.rail = h('nav.ed-rail', RAIL.map(([id, label, icon]) => h('button.rail-btn', { 'data-p': id, onclick: () => EU.togglePanel(id) }, U.ic(icon, 22), h('span', label))));
    EU.panelEl = h('aside.ed-panel');
    EU.panelCollapse = h('button.panel-collapse', { title: 'Hide panel', onclick: () => EU.closePanel() }, U.ic('back', 16));
    EU.toolbar = h('div.ed-toolbar');
    E.pagesEl = h('div.ed-pages' + (E.layout() === 'strip' ? '.strip' : ''));
    E.scrollEl = h('div.ed-scroll', E.pagesEl);
    E.scrollEl.addEventListener('dragover', (e) => e.preventDefault());
    E.scrollEl.addEventListener('drop', E.onDrop);
    E.scrollEl.addEventListener('pointerdown', (e) => {
      if (e.target === E.scrollEl || e.target === E.pagesEl) E.deselect();
    });
    // Ctrl+wheel and trackpad pinch zoom in proportion to the gesture (pinches send many small deltas),
    // once per frame and around the cursor
    let wheel = null;
    E.scrollEl.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (!wheel) {
        wheel = { k: 0 };
        requestAnimationFrame(() => {
          if (E.d) E.setZoom(E.zoom * U.clamp(Math.exp(-wheel.k), 0.5, 2), wheel.at);
          wheel = null;
        });
      }
      wheel.k += e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.002);
      wheel.at = { x: e.clientX, y: e.clientY };
    }, { passive: false });
    EU.timeline = h('div.ed-timeline');
    EU.bottom = h('div.ed-bottom');
    const main = h('main.ed-main', EU.toolbar, E.scrollEl, EU.timeline, EU.bottom);
    root.appendChild(h('div.editor', top, h('div.ed-body', EU.rail, h('div.panel-wrap', EU.panelEl, EU.panelCollapse), main)));
    EU.panel = null;
    const startPanel = innerWidth > 900 ? (d.pages[0].elements.length ? 'elements' : 'design') : null;
    if (startPanel) EU.openPanel(startPanel);
    else EU.closePanel();
    EU.refreshAll();
  };
  EU.refreshAll = () => {
    EU.refreshToolbar();
    EU.refreshUndo();
    EU.refreshTimeline();
    EU.refreshBottom();
    if (EU.titleInput && document.activeElement !== EU.titleInput) EU.titleInput.value = E.d.title;
    // a closed panel stays closed (re-running the Draw panel would switch the pen back on)
    if (EU.panel && EU.panelOpen && EU.panelEl.isConnected) showPanel();
  };
  EU.saveState = (s) => {
    if (!EU.saveIcon) return;
    EU.saveIcon.innerHTML = U.icon(s === 'saved' ? 'cloudok' : 'cloud', 20);
    EU.saveIcon.className = 'save-state ' + s;
    EU.saveIcon.title = s === 'saved' ? 'All changes saved' : s === 'error' ? 'Could not save – storage may be full' : 'Saving…';
    // one sticky warning per run of failed saves, offering a way to keep the work
    if (s === 'saved') { EU.saveErr?.remove?.(); EU.saveErr = null; }
    if (s !== 'error' || EU.saveErr) return;
    // the live design while its session lasts (an undo replaces E.d), else the copy that failed to save
    const d = E.d, icon = EU.saveIcon;
    EU.saveErr = U.toast('Your changes could not be saved – storage may be full. Download a copy to keep them.', 'error', {
      sticky: true,
      action: { label: 'Download design file', onClick: async () => { const x = EU.saveIcon === icon && E.d?.id === d.id ? E.d : d; U.download(await S.exportDesignFile(x), U.safeName(x.title) + '.atelier.json'); } },
    });
    EU.saveErr.design = d.title;
  };
  EU.refreshUndo = () => {
    if (!EU.undoBtn) return;
    EU.undoBtn.disabled = E.hi <= 0;
    EU.redoBtn.disabled = E.hi >= E.hist.length - 1;
  };
  EU.refreshTool = () => {
    document.body.classList.toggle('tool-draw', E.tool === 'draw');
    document.body.classList.toggle('tool-comment', E.tool === 'comment');
    document.body.classList.toggle('tool-motion', E.tool === 'motion');
  };

  // ---------- panels ----------
  EU.togglePanel = (id) => (EU.panel === id && EU.panelOpen ? EU.closePanel() : EU.openPanel(id));
  EU.openPanel = (id, arg) => {
    if (EU.panel === 'draw' && id !== 'draw') { E.tool = null; EU.refreshTool(); }
    EU.panel = id;
    EU.panelArg = arg;
    EU.panelOpen = true;
    document.body.classList.add('panel-open');
    // reopening Animate starts from its argument or the selection, not the tab picked last time
    if (id === 'animate') A.P.state.animTab = null;
    EU.renderPanel();
  };
  EU.closePanel = () => {
    EU.panelOpen = false;
    document.body.classList.remove('panel-open');
    if (EU.panel === 'draw') { E.tool = null; EU.refreshTool(); }
    U.$$('.rail-btn').forEach((b) => b.classList.remove('on'));
  };
  EU.renderPanel = () => {
    if (!EU.panelEl) return;
    U.$$('.rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.p === EU.panel));
    const fn = A.P[EU.panel];
    EU.panelEl.innerHTML = '';
    if (!fn) return;
    const { title, body, back } = fn(EU.panelArg) || {};
    EU.panelEl.appendChild(h('div.panel-head', back ? h('button.icon-btn.sm', { title: 'Back', onclick: back }, U.ic('back', 16)) : null, h('h3', title || ''), h('button.icon-btn.sm.panel-x', { title: 'Close panel', onclick: () => EU.closePanel() }, U.ic('x', 16))));
    EU.panelEl.appendChild(h('div.panel-body', body));
  };
  EU.refreshPanel = () => {
    if (EU.panelOpen && ['position', 'animate', 'effects', 'imageEdit', 'chart', 'table', 'comments', 'crop'].includes(EU.panel)) showPanel();
  };
  EU.onSelectionChange = () => {
    if (EU.panelOpen && ['position', 'animate', 'effects', 'imageEdit', 'chart', 'table', 'crop'].includes(EU.panel)) showPanel();
  };
  // A typed panel whose selection no longer fits (another click, an undo) gives way to Elements.
  function showPanel() {
    const els = E.selEls();
    const fits = { effects: (x) => x.type === 'text', imageEdit: (x) => x.type === 'image' || x.asset, crop: (x) => x.type === 'image', chart: (x) => x.type === 'chart', table: (x) => x.type === 'table' }[EU.panel];
    // typed panels edit every selected element, so all must fit; crop, chart and table data are per element
    const ok = !fits || (els.length > 0 && els.every(fits) && (els.length === 1 || ['effects', 'imageEdit'].includes(EU.panel)));
    if (ok) EU.renderPanel();
    else EU.openPanel('elements');
  }
  EU.onPageClick = () => {};

  // ---------- helpers used by toolbar & panels ----------
  const textLike = (el) => el.type === 'text' || (el.type === 'shape' && el.text);
  EU.apply = (fn, commit = true) => {
    const els = E.editEls();
    if (!els.length) return;
    for (const el of els) {
      fn(el);
      if (el.type === 'text') {
        if (el.curve) { const g = R.curveGeom(el); el.w = g.w; el.h = g.h; }
        else el.h = R.textHeight(el);
      }
    }
    E.changed({ commit, toolbar: commit });
    if (E.editingId) E.restyleText();
  };
  EU.slider = (label, value, min, max, step, onInput, fmt = (v) => v) => {
    const out = h('span.slider-val', String(fmt(value)));
    const inp = h('input', { type: 'range', min, max, step, value });
    const num = h('input.num', { type: 'number', min, max, step, value });
    inp.addEventListener('input', () => { num.value = inp.value; out.textContent = fmt(+inp.value); onInput(+inp.value, false); });
    inp.addEventListener('change', () => onInput(+inp.value, true));
    num.addEventListener('change', () => { inp.value = num.value; onInput(+num.value, true); });
    return h('div.slider-row', h('div.slider-top', h('label', label), num), inp);
  };
  EU.tbBtn = (icon, title, onClick, { active = false, label = '', cls = '' } = {}) =>
    h('button.tb-btn' + (active ? '.on' : '') + (cls ? '.' + cls : ''), { title, onclick: onClick }, icon ? U.ic(icon, 18) : null, label ? h('span.tb-label', label) : null);
  EU.swatchBtn = (color, title, onPick, { text = false, opts = {} } = {}) => {
    const b = h('button.tb-btn.swatch-btn', { title });
    const css = R.cssPaint(color);
    if (text) b.append(h('span.text-a', 'A'), h('span.text-bar', { style: { background: css } }));
    else b.append(h('span.swatch' + (!color || color === 'none' ? '.none' : ''), { style: { background: css } }));
    b.onclick = () => EU.colorPicker(b, color, onPick, opts);
    return b;
  };
  EU.docColors = () => {
    const set = new Set();
    for (const p of E.d.pages) {
      if (p.bg?.color && U.isColor(p.bg.color)) set.add(p.bg.color.toLowerCase());
      for (const e of p.elements) for (const k of ['fill', 'color', 'stroke']) if (U.isColor(e[k])) set.add(e[k].toLowerCase());
    }
    return [...set].slice(0, 24);
  };
  const GRADS = ['grad:#8c52ff:#ff66c4:135', 'grad:#00c6ff:#0072ff:135', 'grad:#f7971e:#ffd200:135', 'grad:#11998e:#38ef7d:135', 'grad:#ee0979:#ff6a00:135', 'grad:#232526:#414345:135', 'grad:#fbc2eb:#a6c1ee:135', 'grad:#ffffff:#8c52ff:0:radial'];
  EU.colorPicker = (anchor, current, onPick, { gradients = true, none = false } = {}) => {
    const sw = (c) => h('button.color-sw' + (c === current ? '.on' : ''), { title: c.startsWith('grad:') ? 'Gradient' : c, style: { background: R.cssPaint(c) }, onclick: () => onPick(c, true) });
    const cur = U.isColor(current) ? current : '#8c52ff';
    const hex = h('input.input.hex', { value: U.isColor(current) ? current : '', placeholder: '#rrggbb' });
    hex.addEventListener('change', () => {
      let v = hex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (U.isColor(v)) { onPick(v, true); A.app.addRecentColor(v); }
      else U.toast('Enter a hex colour like #ff6600', 'error');
    });
    const native = h('input.native-color', { type: 'color', value: cur.length === 4 ? '#' + cur.slice(1).split('').map((c) => c + c).join('') : cur });
    native.addEventListener('input', () => { hex.value = native.value; onPick(native.value, false); });
    native.addEventListener('change', () => { onPick(native.value, true); A.app.addRecentColor(native.value); });
    const brand = A.app.brand?.colors || [];
    const recent = A.app.settings.recentColors || [];
    const sec = (t, list) => (list.length ? h('div.cp-sec', h('div.cp-title', t), h('div.cp-grid', list.map(sw))) : null);
    U.popover(anchor, h('div.color-picker',
      h('div.cp-row', h('label.native-wrap', { title: 'Pick any colour' }, native, U.ic('plus', 16)), hex, none ? h('button.btn.sm', { onclick: () => onPick('none', true) }, 'None') : null),
      sec('Recent', recent),
      sec('Document colours', EU.docColors()),
      sec('Brand colours', brand),
      sec('Default colours', M.PALETTE),
      gradients ? sec('Gradients', GRADS) : null
    ), { cls: 'cp-pop' });
  };
  EU.fontPicker = (anchor, current, onPick) => {
    const search = h('input.input', { placeholder: 'Search fonts' });
    const list = h('div.font-list');
    const b = A.app.brand?.fonts || {};
    const brandFonts = [...new Set([b.heading, b.subheading, b.body].filter(Boolean))];
    const render = () => {
      const q = search.value.toLowerCase();
      list.innerHTML = '';
      const add = (title, names) => {
        names = names.filter((n) => n.toLowerCase().includes(q));
        if (!names.length) return;
        list.appendChild(h('div.cp-title', title));
        names.forEach((n) => list.appendChild(h('button.font-item' + (n === current ? '.on' : ''), { style: { fontFamily: M.fontStack(n) }, onclick: () => { onPick(n); U.closePop(); } }, n)));
      };
      add('Brand fonts', brandFonts);
      add('Uploaded fonts', M.customFonts.map((f) => f.name));
      add('All fonts', M.FONTS.map((f) => f[0]));
    };
    search.addEventListener('input', render);
    render();
    U.popover(anchor, h('div.font-picker', search, list, h('button.btn.sm.full', { onclick: () => { U.closePop(); EU.openPanel('uploads'); } }, U.ic('upload', 14), ' Upload a font')));
    setTimeout(() => search.focus(), 20);
  };
  EU.sliderPopover = (anchor, rows) => U.popover(anchor, h('div.slider-pop', rows));

  // ---------- context toolbar ----------
  EU.refreshToolbar = () => {
    const tb = EU.toolbar;
    if (!tb || !E.d) return;
    tb.innerHTML = '';
    const els = E.selEls();
    const page = E.page();
    const add = (...n) => n.forEach((x) => x && tb.appendChild(x));
    const sep = () => h('span.tb-sep');
    if (!els.length) {
      add(
        // the picker stays open across undo, which replaces the page object
        EU.swatchBtn(page.bg?.color || '#ffffff', 'Background colour', (c, fin) => { if (E.canEdit && !E.canEdit()) return; const pg = E.page(); pg.bg = { ...(pg.bg || {}), color: c }; E.changed({ commit: fin, toolbar: fin }); }),
        EU.tbBtn('image', 'Background image', () => EU.openPanel('uploads', 'background'), { label: 'Background image' }),
        page.bg?.asset ? EU.tbBtn('x', 'Remove background image', () => { if (E.canEdit && !E.canEdit()) return; delete E.page().bg.asset; E.changed(); }, { label: 'Remove image' }) : null,
        sep(),
        EU.tbBtn('animate', 'Animate page', () => EU.openPanel('animate', 'page'), { label: 'Animate' }),
        E.layout() === 'strip' || E.d.type === 'presentation' ? durationInput(page) : null,
        E.layout() === 'strip' ? EU.tbBtn('transition', 'Transition into this page', (e) => transitionMenu(e.currentTarget, page), { label: 'Transition' }) : null,
        sep(),
        EU.tbBtn(page.locked ? 'lock' : 'unlock', page.locked ? 'Unlock page' : 'Lock page', () => { page.locked = !page.locked; E.changed({ structure: true }); }),
        h('span.tb-hint.hide-sm', E.isWB() ? 'Tip: press S for a sticky note, T for text' : 'Tip: press / to search tools')
      );
      return;
    }
    const el = els[0];
    const same = els.every((x) => x.type === el.type);
    if (page.locked) {
      add(h('span.tb-hint', U.ic('lock', 16), ' Page locked'), EU.tbBtn('unlock', 'Unlock page', () => { E.page().locked = false; E.changed({ structure: true }); }, { label: 'Unlock page' }));
      return;
    }
    if (els.some((x) => x.locked)) {
      add(h('span.tb-hint', U.ic('lock', 16), ' Locked'), EU.tbBtn('unlock', 'Unlock', () => { E.selEls().forEach((x) => (x.locked = false)); E.changed(); }, { label: 'Unlock' }));
      return;
    }
    // shape text being typed for the first time is still empty
    const editing = E.editingId === el.id;
    if (same && (el.type === 'text' || (el.type === 'shape' && (el.text || editing)))) textTools(add, sep, el);
    if (same && el.type === 'shape') {
      if (el.asset) {
        add(EU.tbBtn('sliders', 'Edit image', () => EU.openPanel('imageEdit'), { label: 'Edit image' }), EU.tbBtn('x', 'Remove image from frame', () => EU.apply((x) => delete x.asset), { label: 'Detach' }));
      } else add(EU.swatchBtn(el.fill, 'Fill colour', (c, fin) => EU.apply((x) => (x.fill = c), fin), { opts: { none: true } }));
      add(borderBtn(el));
      if (['rect', 'rounded'].includes(el.shape)) add(radiusBtn(el, 'radius'));
      if (!el.text && !editing) add(EU.tbBtn('text', 'Add text', () => E.editText(el)));
      add(EU.tbBtn('effects', 'Shadow', () => EU.apply((x) => (x.shadow = !x.shadow)), { active: !!el.shadow }));
    }
    if (same && el.type === 'image') {
      add(
        EU.tbBtn('sliders', 'Edit photo', () => EU.openPanel('imageEdit'), { label: 'Edit' }),
        els.length === 1 ? EU.tbBtn('crop', 'Crop', () => EU.openPanel('crop'), { label: 'Crop' }) : null,
        EU.tbBtn('flip', 'Flip', (e) => U.menu(e.currentTarget, [{ label: 'Flip horizontal', icon: 'flip', onClick: () => E.flip('h') }, { label: 'Flip vertical', icon: 'flip', onClick: () => E.flip('v') }]), { label: 'Flip' }),
        radiusBtn(el, 'radius'),
        EU.tbBtn('effects', 'Shadow', () => EU.apply((x) => (x.shadow = !x.shadow)), { active: !!el.shadow })
      );
    }
    if (same && el.type === 'line') {
      add(
        EU.swatchBtn(el.stroke, 'Line colour', (c, fin) => EU.apply((x) => (x.stroke = c), fin), { opts: { gradients: false } }),
        lineStyleBtn(el),
        headSelect('start', el), headSelect('end', el),
        EU.tbBtn('line', 'Elbowed connector', () => EU.apply((x) => { x.elbow = !x.elbow; x.curved = false; }), { active: el.elbow, label: 'Elbow' }),
        EU.tbBtn('line', 'Curved line', () => EU.apply((x) => { x.curved = !x.curved; x.elbow = false; }), { active: el.curved, label: 'Curve' })
      );
    }
    if (same && el.type === 'draw') add(EU.swatchBtn(el.stroke, 'Colour', (c, fin) => EU.apply((x) => (x.stroke = c), fin), { opts: { gradients: false } }), sizeBtn('Thickness', el.strokeWidth, 1, 80, (v, f) => EU.apply((x) => (x.strokeWidth = v), f)));
    if (same && el.type === 'icon') add(EU.swatchBtn(el.fill, 'Colour', (c, fin) => EU.apply((x) => (x.fill = c), fin)), EU.tbBtn('flip', 'Flip horizontal', () => E.flip('h')));
    if (same && el.type === 'emoji') add(EU.tbBtn('flip', 'Flip horizontal', () => E.flip('h')));
    if (same && el.type === 'chart') {
      add(
        EU.tbBtn('chart', 'Edit chart data', () => EU.openPanel('chart'), { label: 'Edit data' }),
        selectTb(['bar', 'line', 'area', 'pie', 'donut'], el.chart, (v) => EU.apply((x) => (x.chart = v))),
        EU.swatchBtn(el.colors?.[0], 'Main colour', (c, fin) => EU.apply((x) => (x.colors = [c, ...(x.colors || []).slice(1)]), fin), { opts: { gradients: false } })
      );
    }
    if (same && el.type === 'table') {
      add(
        EU.tbBtn('table', 'Edit table', () => EU.openPanel('table'), { label: 'Edit table' }),
        EU.swatchBtn(el.headerFill, 'Header colour', (c, fin) => EU.apply((x) => (x.headerFill = c), fin), { opts: { gradients: false } }),
        EU.swatchBtn(el.fill, 'Cell colour', (c, fin) => EU.apply((x) => (x.fill = c), fin), { opts: { gradients: false } }),
        EU.swatchBtn(el.color, 'Text colour', (c, fin) => EU.apply((x) => (x.color = c), fin), { text: true, opts: { gradients: false } }),
        fontBtn(el)
      );
    }
    if (els.length > 1) {
      const grouped = els.every((x) => x.groupId && x.groupId === els[0].groupId);
      add(EU.tbBtn('group', grouped ? 'Ungroup' : 'Group', () => (grouped ? E.ungroup() : E.group()), { label: grouped ? 'Ungroup' : 'Group' }));
      add(EU.tbBtn('alignc', 'Align', (e) => alignMenu(e.currentTarget), { label: 'Align' }));
    }
    add(
      sep(),
      EU.tbBtn('animate', 'Animate', () => EU.openPanel('animate'), { label: 'Animate' }),
      EU.tbBtn('position', 'Position', () => EU.openPanel('position'), { label: 'Position' }),
      EU.tbBtn('transp', 'Transparency', (e) => EU.sliderPopover(e.currentTarget, [EU.slider('Transparency', Math.round((el.opacity ?? 1) * 100), 0, 100, 1, (v, f) => EU.apply((x) => (x.opacity = v / 100), f), (v) => v + '%')])),
      el.link ? EU.tbBtn('link', 'Link: ' + el.link, () => EU.linkDialog(), { active: true }) : null,
      EU.tbBtn('more', 'More', (e) => EU.contextMenu(e.currentTarget))
    );
  };
  function durationInput(page) {
    const inp = h('input.num.dur', { type: 'number', min: 0.5, max: 600, step: 0.5, value: page.duration || 5, title: 'Page duration (seconds)' });
    inp.addEventListener('change', () => { page.duration = U.clamp(+inp.value || 5, 0.5, 600); E.changed({ toolbar: false }); EU.refreshTimeline(); });
    return h('label.tb-dur', U.ic('timer', 16), inp, 's');
  }
  // the menu can stay open across an undo, which replaces the page object
  function transitionMenu(anchor, page) {
    const set = (v) => { const pg = E.d.pages.find((x) => x.id === page.id); if (pg) { pg.transition = v; E.changed({ all: true }); } };
    U.menu(anchor, M.TRANSITIONS.map(([v, l]) => ({ label: l + (page.transition === v ? '  ✓' : ''), onClick: () => set(v) })));
  }
  function textTools(add, sep, el) {
    add(
      fontBtn(el),
      sizeStepper(el),
      EU.swatchBtn(el.color, 'Text colour', (c, fin) => EU.apply((x) => (x.color = c), fin), { text: true }),
      EU.tbBtn('bold', 'Bold (Ctrl+B)', () => EU.apply((x) => (x.bold = !el.bold)), { active: el.bold }),
      EU.tbBtn('italic', 'Italic (Ctrl+I)', () => EU.apply((x) => (x.italic = !el.italic)), { active: el.italic }),
      EU.tbBtn('underline', 'Underline (Ctrl+U)', () => EU.apply((x) => (x.underline = !el.underline)), { active: el.underline }),
      EU.tbBtn('strike', 'Strikethrough', () => EU.apply((x) => (x.strike = !el.strike)), { active: el.strike }),
      EU.tbBtn('case', 'Uppercase', () => EU.apply((x) => (x.upper = !el.upper)), { active: el.upper }),
      EU.tbBtn({ left: 'alignl', center: 'alignc', right: 'alignr', justify: 'alignj' }[el.align] || 'alignl', 'Alignment', () => {
        const order = ['left', 'center', 'right'];
        const next = order[(order.indexOf(el.align) + 1) % order.length];
        EU.apply((x) => (x.align = next));
      }),
      EU.tbBtn('list', 'List', () => {
        const order = ['none', 'bullet', 'number'];
        const next = order[(order.indexOf(el.list || 'none') + 1) % 3];
        EU.apply((x) => (x.list = next));
      }, { active: el.list && el.list !== 'none' }),
      EU.tbBtn('spacing', 'Spacing', (e) => EU.sliderPopover(e.currentTarget, [
        EU.slider('Letter spacing', el.spacing || 0, -200, 800, 10, (v, f) => EU.apply((x) => (x.spacing = v), f)),
        EU.slider('Line spacing', el.lh || 1.3, 0.5, 2.5, 0.05, (v, f) => EU.apply((x) => (x.lh = v), f)),
      ])),
      el.type === 'text' ? EU.tbBtn('effects', 'Effects', () => EU.openPanel('effects'), { label: 'Effects' }) : null,
      sep()
    );
  }
  function fontBtn(el) {
    const b = h('button.tb-btn.font-btn', { title: 'Font', style: { fontFamily: M.fontStack(el.font) } }, h('span', el.font || 'Inter'), U.ic('down', 14));
    b.onclick = () => EU.fontPicker(b, el.font, (f) => EU.apply((x) => (x.font = f)));
    return b;
  }
  function sizeStepper(el) {
    const inp = h('input.num.fs', { type: 'number', min: 1, max: 2000, value: U.round(el.size, 1), title: 'Font size' });
    inp.addEventListener('change', () => EU.apply((x) => (x.size = U.clamp(+inp.value || 12, 1, 2000))));
    const step = (d) => EU.apply((x) => (x.size = U.clamp(Math.round(x.size + d), 1, 2000)));
    return h('div.stepper', h('button', { title: 'Smaller', onclick: () => step(-1) }, '−'), inp, h('button', { title: 'Bigger', onclick: () => step(1) }, '+'));
  }
  function sizeBtn(label, val, min, max, fn) {
    return EU.tbBtn('spacing', label, (e) => EU.sliderPopover(e.currentTarget, [EU.slider(label, val, min, max, 1, fn)]));
  }
  function borderBtn(el) {
    return EU.tbBtn('frame', 'Border', (e) => {
      // a style click rebuilds the rows, so the highlight and the weight show the new values
      const rows = (el) => {
        const styles = h('div.seg', ['none', 'solid', 'dashed', 'dotted'].map((s) => h('button.seg-btn' + ((s === 'none' ? !el.strokeWidth : el.strokeWidth && (el.dash || 'solid') === s) ? '.on' : ''), {
          onclick: () => {
            EU.apply((x) => { if (s === 'none') x.strokeWidth = 0; else { x.dash = s; if (!x.strokeWidth) x.strokeWidth = Math.max(2, Math.round(Math.min(x.w, x.h) / 40)); } });
            const x = E.selEls()[0];
            if (x) pop.firstChild.replaceChildren(...rows(x));
          },
        }, s[0].toUpperCase() + s.slice(1))));
        const colorBtn = EU.swatchBtn(el.stroke || '#000', 'Border colour', (c, fin) => EU.apply((x) => (x.stroke = c), fin), { opts: { gradients: false } });
        return [h('label.mini-label', 'Border style'), styles, EU.slider('Border weight', el.strokeWidth || 0, 0, 60, 1, (v, f) => EU.apply((x) => (x.strokeWidth = v), f)), h('div.row', h('label.mini-label', 'Colour'), colorBtn)];
      };
      const pop = EU.sliderPopover(e.currentTarget, rows(el));
    });
  }
  function radiusBtn(el, key) {
    return EU.tbBtn('custom', 'Corner rounding', (e) => EU.sliderPopover(e.currentTarget, [EU.slider('Corner rounding', el[key] || 0, 0, Math.round(Math.min(el.w, el.h) / 2), 1, (v, f) => EU.apply((x) => (x[key] = v), f))]));
  }
  function lineStyleBtn(el) {
    return EU.tbBtn('spacing', 'Line style', (e) => {
      const styles = h('div.seg', ['solid', 'dashed', 'dotted'].map((s) => h('button.seg-btn' + ((el.dash || 'solid') === s ? '.on' : ''), { onclick: () => EU.apply((x) => (x.dash = s)) }, s)));
      EU.sliderPopover(e.currentTarget, [styles, EU.slider('Line weight', el.strokeWidth, 1, 80, 1, (v, f) => EU.apply((x) => { x.strokeWidth = v; M.syncLineBox(x); }, f))]);
    });
  }
  function headSelect(which, el) {
    return selectTb(['none', 'arrow', 'triangle', 'circle', 'square', 'bar'], el[which] || 'none', (v) => EU.apply((x) => (x[which] = v)), which === 'start' ? 'Start' : 'End');
  }
  function selectTb(opts, val, fn, label) {
    const s = h('select.tb-select', { title: label || '' }, opts.map((o) => h('option', { value: o, selected: o === val ? true : null }, (label ? label + ': ' : '') + o)));
    s.addEventListener('change', () => fn(s.value));
    return s;
  }
  // to: 'page', or 'auto' (the page for one element or group, else the Position panel's 'Align to')
  function alignMenu(anchor, to = 'auto') {
    const us = E.units(), multi = us.length > 1;
    const target = to === 'page' ? 'page' : E.alignTo === 'key' && !E.keyUnit(us) ? 'selection' : E.alignTo;
    // Alt+letter aligns as 'auto' does
    const it = (label, icon, how, key) => ({ label, icon, shortcut: to === 'auto' || !multi ? 'Alt+' + key : '', onClick: () => E.align(how, { to }) });
    U.menu(anchor, [
      multi ? { header: { selection: 'Align to selection', key: 'Align to key object', page: 'Align to page' }[target] } : null,
      it('Align left', 'alignl', 'left', 'A'),
      it('Align centre', 'alignc', 'center', 'H'),
      it('Align right', 'alignr', 'right', 'D'),
      it('Align top', 'up', 'top', 'W'),
      it('Align middle', 'spacing', 'middle', 'V'),
      it('Align bottom', 'down', 'bottom', 'S'),
      multi ? { divider: true } : null,
      multi ? { label: 'Distribute horizontally', icon: 'split', onClick: () => E.distribute('h') } : null,
      multi ? { label: 'Distribute vertically', icon: 'spacing', onClick: () => E.distribute('v') } : null,
      multi ? { label: 'Tidy up', icon: 'grid', onClick: () => E.tidy() } : null,
    ]);
  }

  // ---------- context (right-click) menu ----------
  EU.contextMenu = (anchor) => {
    const els = E.selEls();
    const el = els[0];
    const grouped = els.length > 1 && els.every((x) => x.groupId && x.groupId === els[0].groupId);
    // E.toggleLock unlocks a locked page first, then any locked element
    const unlock = E.page().locked ? 'Unlock page' : els.some((x) => x.locked) ? 'Unlock' : '';
    if (!els.length) {
      return U.menu(anchor, [
        { label: 'Paste', icon: 'copy', shortcut: 'Ctrl+V', onClick: () => E.paste(), disabled: !E.clip },
        { label: 'Select all', icon: 'grid', shortcut: 'Ctrl+A', onClick: () => E.selectAll() },
        { divider: true },
        { label: 'Add page', icon: 'addpage', onClick: () => E.addPage(E.pi + 1) },
        { label: 'Duplicate page', icon: 'copy', onClick: () => E.duplicatePage(E.pi) },
        { label: 'Delete page', icon: 'trash', onClick: () => E.deletePage(E.pi), danger: true },
        { divider: true },
        { label: 'Add comment', icon: 'comment', onClick: () => { E.tool = 'comment'; EU.refreshTool(); U.toast('Click where you want to comment'); } },
      ]);
    }
    U.menu(anchor, [
      { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => E.copy() },
      { label: 'Paste', icon: 'copy', shortcut: 'Ctrl+V', onClick: () => E.paste(), disabled: !E.clip },
      { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', onClick: () => E.duplicate() },
      { label: 'Delete', icon: 'trash', shortcut: 'Del', onClick: () => E.deleteSel(), danger: true },
      { divider: true },
      { label: 'Copy style', icon: 'effects', shortcut: 'Ctrl+Alt+C', onClick: () => E.copyStyle() },
      { label: 'Paste style', icon: 'effects', shortcut: 'Ctrl+Alt+V', onClick: () => E.pasteStyle(), disabled: !E.styleClip },
      { divider: true },
      { label: 'Bring forward', icon: 'forward', shortcut: 'Ctrl+]', onClick: () => E.order('forward') },
      { label: 'Bring to front', icon: 'tofront', shortcut: 'Ctrl+Shift+]', onClick: () => E.order('front') },
      { label: 'Send backward', icon: 'backward', shortcut: 'Ctrl+[', onClick: () => E.order('backward') },
      { label: 'Send to back', icon: 'backward', shortcut: 'Ctrl+Shift+[', onClick: () => E.order('back') },
      E.units(els).length > 1 ? { label: 'Align elements…', icon: 'alignc', onClick: () => alignMenu(anchor) } : null,
      { label: 'Align to page…', icon: 'alignc', onClick: () => alignMenu(anchor, 'page') },
      el.type !== 'line' ? { label: 'Flip horizontal', icon: 'flip', shortcut: 'Shift+H', onClick: () => E.flip('h') } : null,
      el.type !== 'line' ? { label: 'Flip vertical', icon: 'flip', shortcut: 'Shift+V', onClick: () => E.flip('v') } : null,
      { divider: true },
      els.length > 1 ? { label: grouped ? 'Ungroup' : 'Group', icon: 'group', shortcut: grouped ? 'Ctrl+Shift+G' : 'Ctrl+G', onClick: () => (grouped ? E.ungroup() : E.group()) } : null,
      { label: unlock || 'Lock', icon: unlock ? 'unlock' : 'lock', shortcut: 'Ctrl+Shift+L', onClick: () => E.toggleLock() },
      { label: els.every((x) => x.hidden) ? 'Show' : 'Hide', icon: els.every((x) => x.hidden) ? 'eye' : 'eyeoff', shortcut: 'Ctrl+Shift+H', onClick: () => E.toggleHidden() },
      { label: el.link ? 'Edit link' : 'Link', icon: 'link', onClick: () => EU.linkDialog() },
      { label: 'Comment', icon: 'comment', onClick: () => EU.addComment(el) },
      el.type === 'image' ? { label: 'Set image as background', icon: 'image', onClick: () => E.setBackgroundFromImage() } : null,
      el.type === 'image' ? { label: 'Replace image', icon: 'upload', onClick: () => EU.openPanel('uploads', 'replace') } : null,
      ['shape'].includes(el.type) && !el.asset ? { label: 'Use as photo frame', icon: 'frame', onClick: () => { EU.apply((x) => (x.frame = true)); EU.openPanel('uploads', 'frame'); } } : null,
    ]);
  };
  EU.linkDialog = async () => {
    const el = E.selEls()[0];
    if (!el) return;
    const v = await U.prompt('Link (website, mailto: or page number like #3)', el.link || '', 'https://');
    if (v === null) return;
    EU.apply((x) => (v.trim() ? (x.link = v.trim()) : delete x.link));
  };

  // ---------- file menu ----------
  function fileMenu(anchor) {
    const d = E.d;
    U.menu(anchor, [
      { header: d.title + ' · ' + d.width + ' × ' + d.height + ' px' },
      { label: 'Create new design', icon: 'plus', onClick: () => A.Home.createMenu(anchor) },
      { label: E.showRulers ? 'Hide rulers' : 'Show rulers', icon: 'custom', shortcut: '', onClick: () => { E.showRulers = !E.showRulers; E.drawOverlay(); } },
      { label: 'Add guide…', icon: 'grid', onClick: async () => { const v = await U.prompt('Guide position, e.g. "x 540" or "y 300"', 'x ' + Math.round(d.width / 2)); const m = v && v.match(/([xy])\s*(-?\d+)/i); if (m) { d.guides.push({ axis: m[1].toLowerCase(), pos: +m[2] }); E.changed({ toolbar: false }); } } },
      { label: 'Clear guides', icon: 'x', onClick: () => { d.guides = []; E.changed({ toolbar: false }); }, disabled: !d.guides.length },
      { divider: true },
      { label: 'Version history', icon: 'history', onClick: () => EU.historyDialog() },
      { label: 'Save a version now', icon: 'restore', onClick: async () => { const l = await U.prompt('Name this version', new Date().toLocaleString()); if (l !== null) { await E.snapshot(l || 'Saved version'); U.toast('Version saved', 'ok'); } } },
      { label: 'Make a copy', icon: 'copy', onClick: async () => { await E.save(); const c = U.clone(E.d); c.id = U.uid('d_'); c.title = d.title + ' (copy)'; c.createdAt = Date.now(); await S.saveDesign(c); A.app.go('#/design/' + c.id); U.toast('Copy created', 'ok'); } },
      { label: 'Download', icon: 'download', onClick: () => EU.downloadDialog() },
      { label: 'Save as design file (.atelier.json)', icon: 'file', onClick: async () => U.download(await S.exportDesignFile(E.d), U.safeName(d.title) + '.atelier.json') },
      { label: 'Save as template', icon: 'template', onClick: () => A.app.saveUserTemplate(E.d) },
      { divider: true },
      { label: 'Keyboard shortcuts', icon: 'help', shortcut: '', onClick: () => A.Home.shortcuts() },
      // trash the open copy: closing the editor saves it again (its last version is taken first, so it is not a trashed copy)
      { label: 'Move to trash', icon: 'trash', danger: true, onClick: async () => { if (await U.confirm('Move this design to the trash? It stays there for 30 days.', 'Move to trash', true)) { E.finishText(); E.flushCommit(); await E.snapshot(); E.d.deletedAt = Date.now(); await E.save(); A.app.go('#/home'); } } },
    ]);
  }

  // ---------- popovers ----------
  function statsPopover(anchor) {
    const d = E.d;
    let words = 0, chars = 0, els = 0;
    for (const p of d.pages)
      for (const e of p.elements) {
        els++;
        if (e.text) { words += e.text.trim().split(/\s+/).filter(Boolean).length; chars += e.text.length; }
      }
    const row = (k, v) => h('div.stat-row', h('span', k), h('b', String(v)));
    U.popover(anchor, h('div.stats',
      h('h4', 'Design insights'),
      row('Pages', d.pages.length), row('Elements', els), row('Words', words), row('Characters', chars),
      row('Reading time', Math.max(1, Math.round(words / 220)) + ' min'),
      row('Total duration', A.X.totalDuration(d.pages) + ' s'),
      row('Comments', (d.comments || []).length),
      row('Created', new Date(d.createdAt).toLocaleString()),
      row('Last edited', new Date(d.updatedAt).toLocaleString())
    ), { align: 'right' });
  }
  let timer = null;
  function timerPopover(anchor) {
    const mins = h('input.input', { type: 'number', min: 1, max: 120, value: 5 });
    U.popover(anchor, h('div.slider-pop', h('label.mini-label', 'Timer (minutes)'), mins, h('div.row',
      h('button.btn.primary', { onclick: () => { startTimer(+mins.value * 60); U.closePop(); } }, 'Start'),
      h('button.btn', { onclick: () => { stopTimer(); U.closePop(); } }, 'Stop')
    )), { align: 'right' });
  }
  function startTimer(sec) {
    stopTimer();
    const chip = h('div.timer-chip');
    document.body.appendChild(chip);
    const end = Date.now() + sec * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      chip.textContent = '⏱ ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (!left) { stopTimer(); U.toast("Time's up!", 'ok'); try { new AudioContext().resume(); } catch (e) {} }
    };
    tick();
    timer = { chip, id: setInterval(tick, 500) };
  }
  function stopTimer() {
    if (timer) { clearInterval(timer.id); timer.chip.remove(); timer = null; }
  }

  // ---------- comments ----------
  EU.addComment = (el, point) => {
    const c = { id: U.uid('c_'), pageId: E.page().id, elId: el ? el.id : null, x: point ? point.x : E.d.width / 2, y: point ? point.y : 40, author: A.app.profile?.name || 'You', text: '', ts: Date.now(), replies: [], resolved: false, draft: true };
    EU.openPanel('comments', c);
  };

  // ---------- quick menu ("/") ----------
  EU.quickMenu = () => {
    const cmds = [
      ['Add heading', () => E.addText('heading')], ['Add subheading', () => E.addText('subheading')], ['Add body text', () => E.addText('body')],
      ['Rectangle', () => E.addShape('rect')], ['Circle', () => E.addShape('ellipse')], ['Triangle', () => E.addShape('triangle')], ['Star', () => E.addShape('star')],
      ['Line', () => E.addLine()], ['Arrow', () => E.addLine({ end: 'arrow' })], ['Sticky note', () => E.add(M.newSticky())],
      ['Bar chart', () => E.add(M.newChart('bar'))], ['Pie chart', () => E.add(M.newChart('pie'))], ['Line chart', () => E.add(M.newChart('line'))], ['Table', () => E.add(M.newTable())],
      ['Add page', () => E.addPage(E.pi + 1)], ['Duplicate page', () => E.duplicatePage(E.pi)],
      ['Tidy up', () => E.tidy()], ['Space evenly horizontally', () => E.distribute('h')], ['Space evenly vertically', () => E.distribute('v')], ['Hide / show', () => E.toggleHidden()],
      ['Draw', () => EU.openPanel('draw')], ['Upload files', () => EU.openPanel('uploads')], ['Templates', () => EU.openPanel('design')], ['Brand kit', () => EU.openPanel('brand')], ['AI tools', () => EU.openPanel('ai')], ['Apps', () => EU.openPanel('apps')],
      ['Present', () => A.Present.start()], ['Download', () => EU.downloadDialog()], ['Share', () => EU.shareDialog()], ['Resize', () => EU.resizeDialog()], ['Version history', () => EU.historyDialog()],
      ['Toggle rulers', () => { E.showRulers = !E.showRulers; E.drawOverlay(); }], ['Zoom to fit', () => { E.fit(); E.renderAll(); }], ['Keyboard shortcuts', () => A.Home.shortcuts()],
    ];
    const inp = h('input.input', { placeholder: 'Search tools and actions…' });
    const list = h('div.qm-list');
    let m;
    const render = () => {
      const q = inp.value.toLowerCase();
      list.innerHTML = '';
      cmds.filter(([n]) => n.toLowerCase().includes(q)).slice(0, 12).forEach(([n, fn], i) => list.appendChild(h('button.qm-item' + (i === 0 ? '.on' : ''), { onclick: () => { m.close(); fn(); } }, n)));
    };
    inp.addEventListener('input', render);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('.qm-item')?.click(); });
    render();
    m = U.modal({ title: 'Quick actions', body: h('div', inp, list) });
  };

  // ---------- download ----------
  EU.downloadDialog = (preset) => {
    const d = E.d;
    const formats = [
      ['png', 'PNG – best for images'], ['jpg', 'JPG – small file size'], ['pdf', 'PDF Standard – documents'], ['pdfprint', 'PDF Print – high quality printing'], ['svg', 'SVG – vector graphics'],
      ['video', 'MP4 / WebM video'], ['gif', 'GIF – animated'], ['pptx', 'PowerPoint (.pptx)'], ['html', 'Website (HTML file)'], ['design', 'Design file (.atelier.json)'],
    ];
    const def = preset || (d.type === 'video' ? 'video' : d.type === 'presentation' ? 'pdf' : d.type === 'print' ? 'pdfprint' : 'png');
    const fmt = h('select.input', formats.map(([v, l]) => h('option', { value: v, selected: v === def ? true : null }, l)));
    const size = h('input', { type: 'range', min: 0.5, max: 4, step: 0.25, value: 1 });
    const sizeLbl = h('span.muted'), sizeVal = h('span');
    const transparent = h('input', { type: 'checkbox' });
    const compress = h('input', { type: 'checkbox' });
    const bleed = h('input', { type: 'checkbox' });
    const marks = h('input', { type: 'checkbox' });
    const pageChecks = d.pages.map((p, i) => h('input', { type: 'checkbox', checked: !p.hidden, 'data-i': i }));
    const progress = h('div.progress', h('div.bar'));
    const opts = h('div.dl-opts');
    // only the labels change while the slider is dragged: rebuilding the options would end the drag
    const updSize = () => {
      sizeVal.textContent = size.value;
      sizeLbl.textContent = `${Math.round(d.width * size.value)} × ${Math.round(d.height * size.value)} px`;
    };
    const upd = () => {
      const f = fmt.value;
      updSize();
      opts.innerHTML = '';
      if (['png', 'jpg', 'pdf', 'pdfprint', 'pptx', 'video'].includes(f)) opts.append(h('label.field', h('span', 'Size ×', sizeVal), size, sizeLbl));
      if (f === 'png') opts.append(h('label.check', transparent, ' Transparent background'));
      // PNG is lossless: the browser ignores a quality setting for it
      if (['jpg', 'pdf', 'pdfprint'].includes(f)) opts.append(h('label.check', compress, ' Compress file (lower quality)'));
      if (f === 'pdfprint') opts.append(h('label.check', bleed, ' Print bleed'), h('label.check', marks, ' Crop marks'));
      if (f === 'video') opts.append(h('p.muted', 'Video plays each page for its duration with animations. Recording happens in real time.'));
      if (f === 'html') opts.append(h('p.muted', 'Creates one self-contained web page. Each page becomes a section; links stay clickable. You can host it for free on GitHub Pages.'));
    };
    fmt.addEventListener('change', upd);
    size.addEventListener('input', updSize);
    upd();
    const pagesBox = h('details.pages-box', h('summary', 'Select pages'), h('div.page-checks', pageChecks.map((c, i) => h('label.check', c, ' Page ' + (i + 1) + (d.pages[i].title ? ' – ' + d.pages[i].title : '')))));
    let busy = false;
    U.modal({
      title: 'Download',
      body: h('div.dl', h('label.field', h('span', 'File type'), fmt), opts, pagesBox, progress),
      actions: [{ label: 'Cancel' }, {
        label: 'Download', primary: true,
        onClick: async () => {
          if (busy) return false;
          busy = true;
          const pages = pageChecks.filter((c) => c.checked).map((c) => d.pages[+c.dataset.i]);
          if (!pages.length) { busy = false; U.toast('Select at least one page'); return false; }
          const bar = progress.querySelector('.bar');
          progress.classList.add('on');
          const onProgress = (p) => (bar.style.width = Math.round(p * 100) + '%');
          try {
            // a box ticked for another format and then hidden doesn't apply (JPG has no transparency)
            const f = fmt.value;
            await EU.runExport(f, pages, { scale: +size.value, transparent: f === 'png' && transparent.checked, compress: compress.checked, bleed: bleed.checked, marks: marks.checked, onProgress });
            U.toast('Download ready', 'ok');
          } catch (e) {
            console.error(e);
            U.toast('Export failed: ' + e.message, 'error');
          }
          busy = false;
        },
      }],
    });
  };
  EU.runExport = async (f, pages, o = {}) => {
    const d = E.d, X = A.X;
    E.finishText();
    const name = U.safeName(d.title);
    const q = o.compress ? 0.7 : 0.92;
    if (f === 'png' || f === 'jpg') {
      if (pages.length === 1) return U.download(await X.pageBlob(d, pages[0], { format: f, scale: o.scale, transparent: o.transparent, quality: q }), `${name}.${f}`);
      const files = [];
      for (let i = 0; i < pages.length; i++) { o.onProgress?.(i / pages.length); files.push({ name: `${name}-${i + 1}.${f}`, data: await X.pageBlob(d, pages[i], { format: f, scale: o.scale, transparent: o.transparent, quality: q }) }); }
      return U.download(await X.zip(files), `${name}.zip`);
    }
    if (f === 'svg') {
      if (pages.length === 1) return U.download(new Blob([await R.standaloneSVG(d, pages[0])], { type: 'image/svg+xml' }), `${name}.svg`);
      const files = [];
      for (let i = 0; i < pages.length; i++) files.push({ name: `${name}-${i + 1}.svg`, data: await R.standaloneSVG(d, pages[i]) });
      return U.download(await X.zip(files), `${name}-svg.zip`);
    }
    if (f === 'pdf') return U.download(await X.pdf(d, pages, { scale: 1.5 * o.scale, quality: q, onProgress: o.onProgress }), `${name}.pdf`);
    if (f === 'pdfprint') return U.download(await X.pdf(d, pages, { scale: 3.125 * Math.max(1, o.scale / 2), quality: o.compress ? 0.8 : 0.97, bleed: o.bleed, marks: o.marks, onProgress: o.onProgress }), `${name}-print.pdf`);
    if (f === 'gif') return U.download(await X.gifFromDesign(d, pages, { onProgress: o.onProgress }), `${name}.gif`);
    if (f === 'video') { const v = await X.video(d, pages, { scale: Math.min(o.scale, 1), onProgress: o.onProgress }); return U.download(v.blob, `${name}.${v.ext}`); }
    if (f === 'pptx') return U.download(await X.pptx(d, pages, { scale: Math.max(1, o.scale), onProgress: o.onProgress }), `${name}.pptx`);
    if (f === 'html') return U.download(await X.website(d, pages), `${name}.html`);
    if (f === 'design') return U.download(await S.exportDesignFile(d), `${name}.atelier.json`);
  };

  // ---------- share ----------
  EU.shareDialog = () => {
    const d = E.d;
    let m;
    const act = (icon, label, fn) => h('button.share-act', { onclick: () => { m.close(); fn(); } }, h('span.share-ic', U.ic(icon, 22)), h('span', label));
    const canShare = !!navigator.canShare;
    m = U.modal({
      title: 'Share this design',
      body: h('div.share',
        h('div.share-people', h('span.avatar', (A.app.profile?.name || 'You')[0].toUpperCase()), h('div', h('b', A.app.profile?.name || 'You'), h('div.muted', 'Owner · on this device'))),
        h('p.note', U.ic('lock', 16), ' Atelier keeps your work private on your device – there are no accounts or cloud servers. To collaborate, send a design file: anyone with Atelier can open it, edit it and send it back.'),
        h('div.share-grid',
          act('download', 'Download', () => EU.downloadDialog()),
          act('file', 'Design file', async () => U.download(await S.exportDesignFile(d), U.safeName(d.title) + '.atelier.json')),
          act('play', 'Present', () => A.Present.start()),
          act('print', 'Print', () => A.X.print(d, d.pages.filter((p) => !p.hidden))),
          act('web', 'Public view (website)', () => EU.runExport('html', d.pages.filter((p) => !p.hidden))),
          act('template', 'Template link', () => A.app.saveUserTemplate(d)),
          canShare ? act('share', 'Share to apps', async () => {
            try {
              const blob = await A.X.pageBlob(d, E.page(), { format: 'png', scale: 1 });
              const file = new File([blob], U.safeName(d.title) + '.png', { type: 'image/png' });
              if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: d.title });
              else U.download(blob, file.name);
            } catch (e) { if (e.name !== 'AbortError') U.toast('Sharing was cancelled'); }
          }) : act('social', 'Social post image', async () => U.download(await A.X.pageBlob(d, E.page(), { format: 'png' }), U.safeName(d.title) + '.png')),
          act('calendar', 'Schedule post', () => A.Home.schedule(d))
        )
      ),
    });
  };

  // ---------- resize ----------
  EU.resizeDialog = () => {
    const d = E.d;
    const presets = [];
    M.TYPES.forEach((t) => (t.presets || [[t.label, t.w, t.h]]).forEach(([n, w, hh]) => presets.push([n, w, hh])));
    let W = d.width, H = d.height;
    const unit = h('select.input.sm', ['px', 'in', 'cm', 'mm'].map((u) => h('option', { value: u }, u)));
    const k = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
    const wIn = h('input.input', { type: 'number', value: W, min: 1 });
    const hIn = h('input.input', { type: 'number', value: H, min: 1 });
    // the fields hold values in unit `u`; a unit change converts what was typed
    let u = 'px';
    const read = () => { W = Math.round(+wIn.value * k[u]); H = Math.round(+hIn.value * k[u]); };
    unit.addEventListener('change', () => { read(); u = unit.value; wIn.value = U.round(W / k[u], 2); hIn.value = U.round(H / k[u], 2); });
    const list = h('div.preset-list', presets.map(([n, w, hh]) => h('button.preset', { onclick: (ev) => { W = w; H = hh; unit.value = u = 'px'; wIn.value = w; hIn.value = hh; U.$$('.preset', list).forEach((b) => b.classList.remove('on')); ev.currentTarget.classList.add('on'); } }, h('b', n), h('span.muted', `${w} × ${hh}`))));
    const translate = h('select.input', h('option', { value: '' }, 'Keep language'), ...['Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Arabic', 'Hindi'].map((l) => h('option', { value: l }, 'Translate to ' + l)));
    const doIt = async (copy) => {
      read();
      if (!(W > 0 && H > 0)) return U.toast('Enter a valid size');
      await E.save();
      let target = copy ? U.clone(E.d) : E.d;
      if (copy) { target.id = U.uid('d_'); target.title = d.title + ` (${W}×${H})`; target.createdAt = Date.now(); target.type = 'custom'; }
      E.resizeDesign(target, W, H);
      if (translate.value) {
        try { await A.EU.translateDesign(target, translate.value); } catch (e) { U.toast(e.message, 'error'); }
      }
      if (copy) { await S.saveDesign(target); A.app.go('#/design/' + target.id); }
      else { E.fit(); E.changed({ structure: true }); }
      U.toast('Resized', 'ok');
    };
    U.modal({
      title: 'Resize & translate',
      wide: true,
      body: h('div.resize', h('div.row.custom-size', h('label.field', h('span', 'Width'), wIn), h('label.field', h('span', 'Height'), hIn), h('label.field', h('span', 'Units'), unit)), h('h4', 'Presets'), list, h('label.field', h('span', 'Language (uses AI)'), translate)),
      actions: [{ label: 'Copy & resize', onClick: () => doIt(true) }, { label: 'Resize this design', primary: true, onClick: () => doIt(false) }],
    });
  };
  EU.translateDesign = async (design, lang) => {
    const items = M.allText(design);
    if (!items.length) return;
    const strings = items.map((it) => (it.cell ? it.el.cells[it.cell[0]][it.cell[1]] : it.el.text));
    U.toast('Translating…');
    const out = await A.AI.translate(strings, lang);
    items.forEach((it, i) => {
      if (it.cell) it.el.cells[it.cell[0]][it.cell[1]] = String(out[i]);
      else { it.el.text = String(out[i]); if (it.el.type === 'text') R.fitText(it.el); }
    });
  };

  // ---------- version history ----------
  EU.historyDialog = async () => {
    await E.snapshot();
    const vs = await S.listVersions(E.d.id);
    const list = h('div.versions');
    let m;
    if (!vs.length) list.append(h('p.muted', 'No versions yet. Versions are saved automatically every few minutes while you edit, and when you leave the editor.'));
    for (const v of vs) {
      const img = h('img.v-thumb', { alt: '' });
      const vd = JSON.parse(v.data);
      if (vd.thumb) img.src = vd.thumb;
      list.append(h('div.version', img, h('div.v-info', h('b', v.label || new Date(v.ts).toLocaleString()), h('div.muted', U.timeAgo(v.ts) + ' · ' + vd.pages.length + ' page(s)')), h('button.btn.sm', {
        onclick: async () => {
          E.finishText();
          await E.snapshot('Before restoring');
          const restored = JSON.parse(v.data);
          // only the content goes back: the name, star, folder, creation date and trash state stay as they are now
          for (const key of ['id', 'title', 'starred', 'folderId', 'createdAt', 'deletedAt']) restored[key] = E.d[key];
          E.d = restored;
          E.pi = 0; E.sel = [];
          await S.ensureAssetURLs(S.designAssetIds(E.d));
          E.changed({ structure: true });
          m.close();
          U.toast('Version restored', 'ok');
        },
      }, 'Restore')));
    }
    m = U.modal({ title: 'Version history', body: list, wide: true });
  };

  // ---------- timeline (presentations & videos) ----------
  EU.refreshTimeline = () => {
    const tl = EU.timeline;
    if (!tl || !E.d) return;
    tl.innerHTML = '';
    if (E.layout() !== 'strip') { tl.style.display = 'none'; return; }
    tl.style.display = '';
    const PX = innerWidth < 700 ? 22 : 34;
    const playing = A.Present.previewing;
    const track = h('div.tl-track');
    E.d.pages.forEach((p, i) => {
      if (i > 0) track.append(h('button.tl-trans' + (p.transition && p.transition !== 'none' ? '.on' : ''), { title: 'Transition: ' + (p.transition || 'none'), onclick: (e) => transitionMenu(e.currentTarget, p) }, U.ic('transition', 12)));
      const thumb = h('div.tl-thumb', { html: R.pageSVG(E.d, p, { width: 120, idp: 't' + i + '_' }) });
      const handle = h('div.tl-grip', { title: 'Drag to change duration' });
      const block = h('div.tl-block' + (i === E.pi ? '.on' : '') + (p.hidden ? '.hidden-page' : ''), { style: { background: R.cssPaint(p.bg?.color || '#fff'), width: Math.max(48, (p.duration || 5) * PX) + 'px' }, onclick: () => E.setPage(i) }, thumb, h('span.tl-dur', (p.duration || 5) + 's'), handle);
      block.draggable = true;
      block.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-page', String(i)); });
      block.addEventListener('dragover', (e) => e.preventDefault());
      block.addEventListener('drop', (e) => {
        // only a dragged page block reorders: files and panel items carry no page index ('' would read as page 1)
        const raw = e.dataTransfer.getData('text/x-page'), from = +raw;
        if (raw === '' || isNaN(from) || from === i) return;
        e.preventDefault();
        const [pg] = E.d.pages.splice(from, 1);
        E.d.pages.splice(i, 0, pg);
        E.pi = i;
        E.changed({ structure: true });
      });
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // only the pointer that grabbed the grip resizes, and a cancelled gesture ends the drag
        handle.setPointerCapture?.(e.pointerId);
        const x0 = e.clientX, d0 = p.duration || 5;
        const mv = (ev) => { if (ev.pointerId !== e.pointerId) return; p.duration = U.clamp(U.round(d0 + (ev.clientX - x0) / PX, 1), 0.5, 600); block.style.width = Math.max(48, p.duration * PX) + 'px'; block.querySelector('.tl-dur').textContent = p.duration + 's'; };
        const up = (ev) => {
          if (ev.pointerId !== e.pointerId) return;
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
          E.changed({ toolbar: false }); EU.refreshTimeline();
        };
        addEventListener('pointermove', mv);
        addEventListener('pointerup', up);
        addEventListener('pointercancel', up);
      });
      track.append(block);
    });
    track.append(h('button.tl-add', { title: 'Add page', onclick: () => E.addPage(E.pi + 1) }, U.ic('plus', 18)));
    const audio = E.d.audio ? h('div.tl-audio', U.ic('music', 14), ' Soundtrack', h('button.icon-btn.sm', { title: 'Remove audio', onclick: () => { delete E.d.audio; E.changed({ all: true }); } }, U.ic('x', 12))) : h('button.tl-audio.add', { onclick: () => EU.openPanel('uploads', 'audio') }, U.ic('music', 14), ' Add audio');
    tl.append(
      h('div.tl-controls',
        h('button.icon-btn.play', { title: playing ? 'Pause' : 'Play page preview', onclick: () => (playing ? A.Present.stopPreview() : A.Present.preview()) }, U.ic(playing ? 'pause' : 'play', 18)),
        h('button.icon-btn.sm', { title: 'Split page at its midpoint', onclick: () => splitPage() }, U.ic('split', 16)),
        h('span.muted.tl-total', 'Total ' + A.X.totalDuration(E.d.pages) + 's')
      ),
      h('div.tl-scroll', track, audio)
    );
  };
  function splitPage() {
    const p = E.page();
    const d = p.duration || 5;
    if (d < 1) return U.toast('Page is too short to split');
    E.finishText();
    // one undo step: the second half is a copy of the page (as E.duplicatePage makes it) taking the rest of the time
    const q = U.clone(p), ids = {};
    q.id = U.uid('p_');
    q.elements.forEach((e) => (ids[e.id] = e.id = U.uid('e_')));
    q.elements.forEach((e) => {
      if (e.c1) e.c1 = ids[e.c1];
      if (e.c2) e.c2 = ids[e.c2];
    });
    p.duration = U.round(d / 2, 1);
    q.duration = U.round(d - p.duration, 1);
    E.addPage(E.pi + 1, q);
    U.toast('Page split into two scenes');
  }

  // ---------- bottom bar ----------
  EU.refreshBottom = () => {
    const b = EU.bottom;
    if (!b) return;
    b.innerHTML = '';
    const zoomIn = h('input.zoom-range', { type: 'range', min: 5, max: 400, value: Math.round(E.zoom * 100), title: 'Zoom' });
    zoomIn.addEventListener('input', () => E.setZoom(+zoomIn.value / 100));
    EU.zoomLabel = h('button.zoom-label', { title: 'Zoom to fit', onclick: () => { E.fit(); E.renderAll(); } }, Math.round(E.zoom * 100) + '%');
    EU.zoomRange = zoomIn;
    EU.pageInfo = h('button.page-info', { title: 'Page grid view', onclick: () => gridView() });
    b.append(...[
      E.d.type === 'presentation' ? h('button.btn.sm.ghost', { onclick: () => notesEditor() }, U.ic('doc', 14), ' Notes') : null,
      h('div.flex1'),
      h('button.icon-btn.sm', { title: 'Zoom out', onclick: () => E.setZoom(E.zoom / 1.2) }, U.ic('zoomout', 16)),
      zoomIn,
      h('button.icon-btn.sm', { title: 'Zoom in', onclick: () => E.setZoom(E.zoom * 1.2) }, U.ic('zoomin', 16)),
      EU.zoomLabel,
      EU.pageInfo,
      h('button.icon-btn.sm.hide-sm', { title: 'Full screen', onclick: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) }, U.ic('fullscreen', 16)),
    ].filter(Boolean));
    EU.refreshPageInfo();
  };
  EU.refreshZoom = () => {
    if (EU.zoomLabel) EU.zoomLabel.textContent = Math.round(E.zoom * 100) + '%';
    if (EU.zoomRange) EU.zoomRange.value = Math.round(E.zoom * 100);
  };
  EU.refreshPageInfo = () => {
    if (EU.pageInfo && E.d) EU.pageInfo.textContent = `Page ${E.pi + 1} / ${E.d.pages.length}`;
  };
  function notesEditor() {
    const p = E.page();
    const ta = h('textarea.input.notes', { placeholder: 'Speaker notes for this page (visible in presenter view)' });
    ta.value = p.notes || '';
    U.modal({ title: `Notes – page ${E.pi + 1}`, body: ta, actions: [{ label: 'Done', primary: true, onClick: () => { p.notes = ta.value; E.changed({ toolbar: false }); } }] });
  }
  function gridView() {
    let m;
    const grid = h('div.page-grid', E.d.pages.map((p, i) => {
      const card = h('div.pg-card' + (i === E.pi ? '.on' : ''), { draggable: 'true', onclick: () => { m.close(); E.setPage(i); } }, h('div.pg-thumb', { html: R.pageSVG(E.d, p, { width: 200, idp: 'g' + i + '_' }) }), h('span', `${i + 1}${p.title ? ' · ' + p.title : ''}`));
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-page', String(i)));
      card.addEventListener('dragover', (e) => e.preventDefault());
      card.addEventListener('drop', (e) => {
        const raw = e.dataTransfer.getData('text/x-page'), from = +raw;
        if (raw === '') return;
        e.preventDefault();
        if (isNaN(from) || from === i) return;
        const [pg] = E.d.pages.splice(from, 1);
        E.d.pages.splice(i, 0, pg);
        E.pi = i;
        E.changed({ structure: true });
        m.close();
        gridView();
      });
      return card;
    }));
    m = U.modal({ title: 'Pages (drag to reorder)', body: grid, wide: true });
  }

  EU.dropItem = (item) => {
    if (item.kind === 'shape') E.addShape(item.shape);
  };
})(window.A);
