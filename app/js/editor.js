'use strict';
// Editor core: document state, page rendering, selection, transforms, smart guides,
// history (undo/redo), clipboard and keyboard shortcuts.
(function (A) {
  const U = A.U, M = A.M, R = A.R, S = A.S;
  const E = (A.E = { d: null, pi: 0, sel: [], zoom: 1, tool: null, clip: null, hist: [], hi: -1, blocks: {}, editingId: null, showRulers: false, previewT: null });

  E.page = () => E.d.pages[E.pi];
  E.els = () => E.page().elements;
  E.byId = (id, page = E.page()) => page.elements.find((e) => e.id === id);
  E.selEls = () => E.sel.map((id) => E.byId(id)).filter(Boolean);
  E.layout = () => M.layoutOf(E.d);
  E.isWB = () => !!M.type(E.d.type).whiteboard;

  // ---------- open / save ----------
  E.open = async (id) => {
    const d = await S.get('designs', id);
    if (!d || d.deletedAt) {
      U.toast('That design could not be found', 'error');
      return A.app.go('#/home');
    }
    d.pages = d.pages?.length ? d.pages : [M.newPage()];
    d.comments = d.comments || [];
    d.guides = d.guides || [];
    E.d = d;
    E.pi = 0;
    E.sel = [];
    E.tool = null;
    E.hist = [JSON.stringify(d)];
    E.hi = 0;
    E.dirtySinceVersion = false;
    await S.ensureAssetURLs(S.designAssetIds(d));
    A.EU.build();
    requestAnimationFrame(() => {
      E.fit();
      E.buildPages();
    });
    clearInterval(E.versionTimer);
    E.versionTimer = setInterval(() => E.snapshot(), 5 * 60 * 1000);
  };
  E.close = async () => {
    if (!E.d) return;
    clearInterval(E.versionTimer);
    E.saveNow.flush?.();
    await E.save();
    await E.snapshot();
    A.Present?.stopPreview?.();
    E.d = null;
  };
  E.save = async () => {
    if (!E.d) return;
    const d = E.d;
    A.EU.saveState('saving');
    try {
      d.thumb = await R.thumbnail(d);
      await S.saveDesign(d);
      A.EU.saveState('saved');
    } catch (e) {
      console.error(e);
      A.EU.saveState('error');
    }
  };
  E.saveNow = U.debounce(() => E.save(), 900);
  E.scheduleSave = () => {
    E.dirtySinceVersion = true;
    A.EU.saveState('pending');
    E.saveNow();
  };
  E.snapshot = async (label = '') => {
    if (!E.d || (!E.dirtySinceVersion && !label)) return;
    E.dirtySinceVersion = false;
    await S.addVersion(E.d, label);
  };

  // ---------- history ----------
  E.pushHistory = () => {
    const s = JSON.stringify(E.d);
    if (s === E.hist[E.hi]) return;
    E.hist = E.hist.slice(0, E.hi + 1);
    E.hist.push(s);
    if (E.hist.length > 120) E.hist.shift();
    E.hi = E.hist.length - 1;
    A.EU.refreshUndo();
  };
  const restore = (s) => {
    E.d = JSON.parse(s);
    E.pi = Math.min(E.pi, E.d.pages.length - 1);
    E.sel = E.sel.filter((id) => E.byId(id));
    E.buildPages();
    A.EU.refreshAll();
    E.scheduleSave();
  };
  E.undo = () => {
    if (E.hi <= 0) return;
    E.hi--;
    restore(E.hist[E.hi]);
  };
  E.redo = () => {
    if (E.hi >= E.hist.length - 1) return;
    E.hi++;
    restore(E.hist[E.hi]);
  };

  // Call after mutating the document.
  E.changed = ({ commit = true, all = false, toolbar = true, structure = false } = {}) => {
    if (structure) E.buildPages();
    else if (all) E.renderAll();
    else E.renderPage(E.pi);
    E.drawOverlay();
    if (toolbar) A.EU.refreshToolbar();
    if (commit) E.pushHistory();
    E.scheduleSave();
    if (structure || all) A.EU.refreshTimeline?.();
  };

  // ---------- pages DOM ----------
  E.buildPages = () => {
    const wrap = E.pagesEl;
    if (!wrap) return;
    wrap.innerHTML = '';
    E.blocks = {};
    const strip = E.layout() === 'strip';
    const list = strip ? [E.pi] : E.d.pages.map((_, i) => i);
    for (const i of list) {
      const b = pageBlock(i);
      wrap.appendChild(b.el);
      E.blocks[i] = b;
    }
    if (!strip)
      wrap.appendChild(U.h('button.add-page-btn', { onclick: () => E.addPage() }, U.ic('plus', 18), ' Add page'));
    E.renderAll();
    A.EU.refreshTimeline?.();
    A.EU.refreshPageInfo?.();
  };
  function pageBlock(i) {
    const page = E.d.pages[i];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'page-svg');
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    const overlay = U.h('div.page-overlay');
    const frame = U.h('div.page-frame', svg, overlay);
    const titleIn = U.h('input.pg-title', {
      value: page.title || '',
      placeholder: 'Add page title',
      onchange: (e) => {
        page.title = e.target.value;
        E.changed({ toolbar: false });
      },
    });
    const btn = (icon, title, fn, on) => U.h('button.icon-btn.sm' + (on ? '.on' : ''), { title, onclick: fn }, U.ic(icon, 16));
    const head = U.h(
      'div.page-head',
      U.h('span.page-num', 'Page ' + (i + 1)),
      U.h('span.page-dash', ' – '),
      titleIn,
      U.h(
        'div.page-tools',
        btn('up', 'Move page up', () => E.movePage(i, -1)),
        btn('down', 'Move page down', () => E.movePage(i, 1)),
        btn(page.hidden ? 'eyeoff' : 'eye', page.hidden ? 'Show page' : 'Hide page', () => { page.hidden = !page.hidden; E.changed({ structure: true }); }, page.hidden),
        btn(page.locked ? 'lock' : 'unlock', page.locked ? 'Unlock page' : 'Lock page', () => { page.locked = !page.locked; E.changed({ structure: true }); }, page.locked),
        btn('copy', 'Duplicate page', () => E.duplicatePage(i)),
        btn('trash', 'Delete page', () => E.deletePage(i)),
        btn('addpage', 'Add page after', () => E.addPage(i + 1))
      )
    );
    const el = U.h('div.page-block' + (i === E.pi ? '.active' : '') + (page.hidden ? '.hidden-page' : ''), { 'data-pi': i }, head, frame);
    const rulers = U.h('div.rulers');
    frame.appendChild(rulers);
    frame.addEventListener('pointerdown', (e) => E.onPointerDown(e, i));
    frame.addEventListener('dblclick', (e) => E.onDblClick(e, i));
    frame.addEventListener('contextmenu', (e) => E.onContext(e, i));
    frame.addEventListener('pointermove', (e) => E.onHover(e, i));
    frame.addEventListener('pointerleave', () => E.hoverBox && (E.hoverBox.style.display = 'none'));
    return { el, svg, overlay, frame, rulers };
  }
  E.renderAll = () => {
    for (const i in E.blocks) E.renderPage(+i);
    E.drawOverlay();
  };
  E.renderPage = (i, opts = {}) => {
    const b = E.blocks[i];
    if (!b) return;
    const page = E.d.pages[i];
    const W = E.d.width, H = E.d.height, z = E.zoom;
    const t = opts.t ?? (i === E.pi ? E.previewT : null);
    const parts = R.pageParts(E.d, page, { idp: 'p' + i + '_', t, skip: E.editingId ? new Set([E.editingId]) : null });
    b.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    b.svg.setAttribute('width', W * z);
    b.svg.setAttribute('height', H * z);
    b.svg.innerHTML = `<defs>${parts.defs}</defs>${parts.bg}${parts.els}`;
    b.frame.style.width = W * z + 'px';
    b.frame.style.height = H * z + 'px';
    b.el.classList.toggle('active', i === E.pi);
  };

  // ---------- zoom ----------
  E.setZoom = (z, keepCenter = true) => {
    z = U.clamp(z, 0.05, 8);
    const wrap = E.scrollEl;
    const cx = wrap ? (wrap.scrollLeft + wrap.clientWidth / 2) / E.zoom : 0, cy = wrap ? (wrap.scrollTop + wrap.clientHeight / 2) / E.zoom : 0;
    E.zoom = z;
    E.renderAll();
    if (wrap && keepCenter) {
      wrap.scrollLeft = cx * z - wrap.clientWidth / 2;
      wrap.scrollTop = cy * z - wrap.clientHeight / 2;
    }
    A.EU.refreshZoom();
  };
  E.fit = () => {
    const wrap = E.scrollEl;
    if (!wrap) return;
    const pad = innerWidth < 700 ? 24 : 80;
    const zw = (wrap.clientWidth - pad) / E.d.width;
    const zh = (wrap.clientHeight - pad - 40) / E.d.height;
    E.zoom = U.clamp(Math.min(zw, E.layout() === 'strip' || E.isWB() ? zh : zw * 1, zh * (E.layout() === 'vertical' ? 1.0 : 1)), 0.05, 2);
    A.EU.refreshZoom();
  };

  // ---------- pages ----------
  E.setPage = (i, scroll = true) => {
    if (i < 0 || i >= E.d.pages.length) return;
    const changed = i !== E.pi;
    E.pi = i;
    if (changed) E.sel = [];
    if (E.layout() === 'strip') {
      if (changed) E.buildPages();
    } else {
      for (const k in E.blocks) E.blocks[k].el.classList.toggle('active', +k === i);
      if (scroll) E.blocks[i]?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    E.drawOverlay();
    A.EU.refreshToolbar();
    A.EU.refreshTimeline?.();
    A.EU.refreshPageInfo?.();
  };
  E.addPage = (at = E.d.pages.length, page) => {
    const p = page || M.newPage({ bg: { color: E.page()?.bg?.color && !E.page().bg.asset ? E.page().bg.color : '#ffffff' } });
    E.d.pages.splice(at, 0, p);
    E.pi = at;
    E.sel = [];
    E.changed({ structure: true });
    setTimeout(() => E.blocks[at]?.el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
  };
  E.duplicatePage = (i) => {
    const p = U.clone(E.d.pages[i]);
    p.id = U.uid('p_');
    const map = {};
    p.elements.forEach((e) => (map[e.id] = e.id = U.uid('e_')));
    p.elements.forEach((e) => {
      if (e.c1) e.c1 = map[e.c1];
      if (e.c2) e.c2 = map[e.c2];
    });
    E.addPage(i + 1, p);
  };
  E.deletePage = (i) => {
    if (E.d.pages.length === 1) {
      E.d.pages[0] = M.newPage();
    } else E.d.pages.splice(i, 1);
    E.pi = Math.min(E.pi, E.d.pages.length - 1);
    E.sel = [];
    E.changed({ structure: true });
  };
  E.movePage = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= E.d.pages.length) return;
    const [p] = E.d.pages.splice(i, 1);
    E.d.pages.splice(j, 0, p);
    E.pi = j;
    E.changed({ structure: true });
  };

  // ---------- geometry ----------
  E.toPage = (e, i = E.pi) => {
    const b = E.blocks[i];
    const r = b.svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / E.zoom, y: (e.clientY - r.top) / E.zoom };
  };
  E.bbox = (el) => {
    if (el.type === 'line') {
      const { p1, p2 } = R.lineEnds(el, E.page());
      return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
    }
    if (!el.rot) return { x: el.x, y: el.y, w: el.w, h: el.h };
    const a = (el.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const w = el.w * c + el.h * s, h = el.w * s + el.h * c;
    return { x: el.x + el.w / 2 - w / 2, y: el.y + el.h / 2 - h / 2, w, h };
  };
  E.unionBox = (els) => {
    if (!els.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const e of els) {
      const b = E.bbox(e);
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };
  const groupMembers = (el) => (el.groupId ? E.els().filter((e) => e.groupId === el.groupId).map((e) => e.id) : [el.id]);

  // ---------- selection ----------
  E.select = (ids, add = false) => {
    E.sel = add ? [...new Set([...E.sel, ...ids])] : ids;
    if (E.editingId && !E.sel.includes(E.editingId)) E.finishText();
    E.drawOverlay();
    A.EU.refreshToolbar();
    A.EU.onSelectionChange?.();
  };
  E.deselect = () => E.select([]);

  // ---------- overlay (selection box, handles, guides, comment pins) ----------
  E.drawOverlay = () => {
    for (const k in E.blocks) {
      const b = E.blocks[k];
      b.overlay.innerHTML = '';
      drawGuides(b, +k);
      drawRulers(b);
      drawCommentPins(b, +k);
    }
    const b = E.blocks[E.pi];
    if (!b) return;
    E.hoverBox = U.h('div.hover-box');
    b.overlay.appendChild(E.hoverBox);
    const els = E.selEls();
    if (!els.length || E.editingId === null && false) return;
    if (!els.length) return;
    const z = E.zoom;
    const locked = els.some((e) => e.locked) || E.page().locked;
    if (els.length === 1 && els[0].type === 'line') {
      const el = els[0];
      const { p1, p2 } = R.lineEnds(el, E.page());
      for (const [k, p] of [['p1', p1], ['p2', p2]]) {
        const hd = U.h('div.handle.end' + (locked ? '.locked' : ''), { 'data-h': k, style: { left: p.x * z + 'px', top: p.y * z + 'px' } });
        hd.addEventListener('pointerdown', (e) => startLineEnd(e, el, k));
        b.overlay.appendChild(hd);
      }
      const box = E.bbox(el);
      b.overlay.appendChild(U.h('div.sel-outline', { style: { left: box.x * z - 4 + 'px', top: box.y * z - 4 + 'px', width: box.w * z + 8 + 'px', height: box.h * z + 8 + 'px' } }));
      miniMenu(b, box, locked);
      return;
    }
    const single = els.length === 1 ? els[0] : null;
    const isGroup = !single && els.every((e) => e.groupId && e.groupId === els[0].groupId);
    const box = single ? { x: single.x, y: single.y, w: single.w, h: single.h } : E.unionBox(els);
    const rot = single ? single.rot || 0 : 0;
    const sb = U.h('div.sel-box' + (isGroup ? '.group' : '') + (locked ? '.locked' : ''), {
      style: { left: box.x * z + 'px', top: box.y * z + 'px', width: box.w * z + 'px', height: box.h * z + 'px', transform: `rotate(${rot}deg)` },
    });
    if (!single) for (const e of els) { const bb = E.bbox(e); b.overlay.appendChild(U.h('div.sel-member', { style: { left: bb.x * z + 'px', top: bb.y * z + 'px', width: bb.w * z + 'px', height: bb.h * z + 'px' } })); }
    if (!locked && E.editingId == null) {
      const t = single?.type;
      const corners = !(t === 'text' && single.curve) ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'ne', 'sw', 'se'];
      let sides = ['n', 's', 'e', 'w'];
      if (!single) sides = [];
      else if (t === 'text') sides = single.curve ? [] : ['e', 'w'];
      else if (t === 'emoji') sides = [];
      const small = box.w * z < 40 || box.h * z < 40;
      for (const h of [...corners, ...(small ? [] : sides)]) {
        const hd = U.h('div.handle.' + h + (sides.includes(h) ? '.side' : ''), { 'data-h': h });
        hd.addEventListener('pointerdown', (e) => startResize(e, h));
        sb.appendChild(hd);
      }
      if (single) {
        const rh = U.h('div.rot-handle', { title: 'Rotate' }, U.ic('restore', 14));
        rh.addEventListener('pointerdown', startRotate);
        const mh = U.h('div.move-handle', { title: 'Move' }, U.ic('fullscreen', 14));
        mh.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          startMove(e, E.pi);
        });
        sb.appendChild(U.h('div.rot-wrap', rh, mh));
      }
    }
    b.overlay.appendChild(sb);
    miniMenu(b, E.unionBox(els), locked);
  };
  function miniMenu(b, box, locked) {
    if (E.editingId || E.dragging) return;
    const z = E.zoom;
    const els = E.selEls();
    const btn = (icon, title, fn, txt) => U.h('button.mini-btn', { title, onpointerdown: (e) => e.stopPropagation(), onclick: fn }, txt ? U.h('span.mini-txt', txt) : U.ic(icon, 16));
    const m = U.h(
      'div.mini-menu',
      { style: { left: (box.x + box.w / 2) * z + 'px', top: Math.max(-44, box.y * z - 50) + 'px' } },
      els.length === 1 && els[0].sticky ? btn('vote', 'Vote', () => { els[0].votes = (els[0].votes || 0) + 1; E.changed(); }) : null,
      els.length > 1 && !els.every((e) => e.groupId && e.groupId === els[0].groupId) ? btn('group', 'Group (Ctrl+G)', () => E.group(), 'Group') : null,
      els.length > 1 && els.every((e) => e.groupId && e.groupId === els[0].groupId) ? btn('group', 'Ungroup (Ctrl+Shift+G)', () => E.ungroup(), 'Ungroup') : null,
      btn('comment', 'Comment', () => A.EU.addComment(els[0])),
      btn(locked ? 'lock' : 'unlock', locked ? 'Unlock' : 'Lock', () => E.toggleLock()),
      btn('copy', 'Duplicate (Ctrl+D)', () => E.duplicate()),
      btn('trash', 'Delete', () => E.deleteSel()),
      btn('more', 'More', (e) => E.onContext(e, E.pi, true))
    );
    b.overlay.appendChild(m);
  }
  function drawGuides(b, i) {
    if (!E.d.guides?.length) return;
    const z = E.zoom;
    for (const g of E.d.guides) {
      const el = U.h('div.user-guide.' + g.axis, { style: g.axis === 'x' ? { left: g.pos * z + 'px' } : { top: g.pos * z + 'px' }, title: 'Double-click to remove guide' });
      el.addEventListener('dblclick', () => {
        E.d.guides = E.d.guides.filter((x) => x !== g);
        E.changed({ toolbar: false });
      });
      b.overlay.appendChild(el);
    }
  }
  function drawRulers(b) {
    b.rulers.innerHTML = '';
    b.rulers.style.display = E.showRulers ? '' : 'none';
    if (!E.showRulers) return;
    const z = E.zoom;
    const step = [10, 25, 50, 100, 250, 500, 1000].find((s) => s * z >= 50) || 1000;
    const mk = (axis) => {
      const r = U.h('div.ruler.' + axis);
      const len = axis === 'x' ? E.d.width : E.d.height;
      for (let v = 0; v <= len; v += step) r.appendChild(U.h('span.tick', { style: axis === 'x' ? { left: v * z + 'px' } : { top: v * z + 'px' } }, String(v)));
      r.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const rect = r.getBoundingClientRect();
        const pos = axis === 'x' ? (e.clientX - rect.left) / z : (e.clientY - rect.top) / z;
        E.d.guides.push({ axis, pos: Math.round(pos) });
        E.changed({ toolbar: false });
      });
      r.title = 'Click to add a guide';
      return r;
    };
    b.rulers.append(mk('x'), mk('y'));
  }
  function drawCommentPins(b, i) {
    const page = E.d.pages[i];
    const z = E.zoom;
    const list = (E.d.comments || []).filter((c) => c.pageId === page.id && !c.resolved);
    for (const c of list) {
      const el = c.elId && E.byId(c.elId, page);
      const x = el ? el.x + el.w : c.x, y = el ? el.y : c.y;
      const pin = U.h('button.comment-pin', { style: { left: x * z + 'px', top: y * z + 'px' }, title: c.text, onpointerdown: (e) => e.stopPropagation(), onclick: () => A.EU.openPanel('comments', c.id) }, String((c.replies?.length || 0) + 1));
      b.overlay.appendChild(pin);
    }
  }

  // ---------- pointer interactions ----------
  const hitId = (e, i) => {
    const t = e.target.closest && e.target.closest('[data-id]');
    if (!t || !E.blocks[i].svg.contains(t)) return null;
    return t.getAttribute('data-id');
  };
  E.onHover = (e, i) => {
    if (E.dragging || i !== E.pi || !E.hoverBox) return;
    const id = hitId(e, i);
    const el = id && E.byId(id);
    if (!el || E.sel.includes(id)) return (E.hoverBox.style.display = 'none');
    const b = E.bbox(el), z = E.zoom;
    Object.assign(E.hoverBox.style, { display: 'block', left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' });
  };
  E.onPointerDown = (e, i) => {
    if (e.button === 2) {
      const id = hitId(e, i);
      if (i !== E.pi) E.setPage(i, false);
      if (id && !E.sel.includes(id)) E.select(groupMembers(E.byId(id)));
      return;
    }
    if (e.button !== 0) return;
    if (e.target.closest('.handle,.rot-handle,.move-handle,.mini-menu,.comment-pin,.ruler,.user-guide')) return;
    if (i !== E.pi) E.setPage(i, false);
    if (E.editingId) E.finishText();
    if (E.tool === 'draw') return startDraw(e, i);
    if (E.tool === 'comment') {
      const p = E.toPage(e, i);
      const id = hitId(e, i);
      E.tool = null;
      A.EU.refreshTool();
      return A.EU.addComment(id ? E.byId(id) : null, p);
    }
    const id = hitId(e, i);
    const el = id && E.byId(id);
    if (E.tool === 'motion') {
      if (el) return recordMotion(e, el);
      E.tool = null;
      A.EU.refreshTool();
    }
    if (!el) {
      if (!e.shiftKey) E.deselect();
      A.EU.onPageClick?.();
      return startMarquee(e, i);
    }
    const ids = E.enteredGroup === el.groupId && el.groupId ? [el.id] : groupMembers(el);
    if (e.shiftKey) {
      const has = ids.every((x) => E.sel.includes(x));
      E.select(has ? E.sel.filter((x) => !ids.includes(x)) : [...E.sel, ...ids]);
      return;
    }
    if (!ids.every((x) => E.sel.includes(x))) {
      E.enteredGroup = null;
      E.select(ids);
    }
    startMove(e, i);
  };
  E.onDblClick = (e, i) => {
    const id = hitId(e, i);
    const el = id && E.byId(id);
    if (!el || el.locked || E.page().locked) return;
    if (el.groupId && E.enteredGroup !== el.groupId) {
      E.enteredGroup = el.groupId;
      E.select([el.id]);
    }
    if (el.type === 'text' || el.type === 'shape') E.editText(el);
    else if (el.type === 'table') A.EU.openPanel('table');
    else if (el.type === 'chart') A.EU.openPanel('chart');
    else if (el.type === 'image') A.EU.openPanel('imageEdit');
  };
  E.onContext = (e, i, fromButton) => {
    e.preventDefault();
    A.EU.contextMenu(fromButton ? e.currentTarget : { x: e.clientX, y: e.clientY });
  };

  function session(onMove, onUp) {
    const move = (ev) => onMove(ev);
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      E.dragging = false;
      onUp && onUp(ev);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  // Move with smart guides. Alt/Option-drag copies.
  function startMove(e, i) {
    if (E.page().locked) return;
    let els = E.selEls();
    if (els.some((x) => x.locked)) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false, copied = false;
    let orig = [];
    const snapshot = () => (orig = els.map((el) => ({ el, x: el.x, y: el.y, p1: el.p1 && { ...el.p1 }, p2: el.p2 && { ...el.p2 } })));
    snapshot();
    const box0 = E.unionBox(els);
    session(
      (ev) => {
        const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
        if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
        if (!started) {
          started = true;
          E.dragging = true;
          if (ev.altKey && !copied) {
            copied = true;
            const clones = els.map((x) => M.cloneElement(x, 0, 0));
            const gmap = {};
            clones.forEach((c) => c.groupId && (c.groupId = gmap[c.groupId] ||= U.uid('g_')));
            E.page().elements.push(...clones);
            E.sel = clones.map((c) => c.id);
            els = clones;
            snapshot();
          }
        }
        let mx = dx, my = dy;
        const guides = [];
        if (!ev.ctrlKey && !ev.metaKey) {
          const snap = smartSnap({ x: box0.x + dx, y: box0.y + dy, w: box0.w, h: box0.h }, new Set(E.sel));
          mx += snap.dx;
          my += snap.dy;
          guides.push(...snap.guides);
        }
        for (const o of orig) {
          o.el.x = o.x + mx;
          o.el.y = o.y + my;
          if (o.p1) {
            o.el.p1 = { x: o.p1.x + mx, y: o.p1.y + my };
            o.el.p2 = { x: o.p2.x + mx, y: o.p2.y + my };
            if (els.length === 1) { delete o.el.c1; delete o.el.c2; }
          }
        }
        E.renderPage(E.pi);
        E.drawOverlay();
        showGuides(guides, { x: box0.x + mx, y: box0.y + my, w: box0.w, h: box0.h });
      },
      () => {
        if (!started) return;
        if (E.isWB()) growBoard();
        E.changed();
      }
    );
  }
  function growBoard() {
    const b = E.unionBox(E.els());
    if (!b) return;
    let grew = false;
    if (b.x + b.w > E.d.width - 100) { E.d.width = Math.ceil(b.x + b.w + 600); grew = true; }
    if (b.y + b.h > E.d.height - 100) { E.d.height = Math.ceil(b.y + b.h + 400); grew = true; }
    if (grew) U.toast('Whiteboard extended');
  }

  // Snap a moving box to page edges/centre, other elements and user guides.
  function smartSnap(box, exclude) {
    const th = 6 / E.zoom;
    const W = E.d.width, H = E.d.height;
    const xs = [{ v: 0 }, { v: W / 2, c: 1 }, { v: W }], ys = [{ v: 0 }, { v: H / 2, c: 1 }, { v: H }];
    for (const g of E.d.guides || []) (g.axis === 'x' ? xs : ys).push({ v: g.pos });
    for (const el of E.els()) {
      if (exclude.has(el.id) || el.hidden) continue;
      const b = E.bbox(el);
      xs.push({ v: b.x, b }, { v: b.x + b.w / 2, b }, { v: b.x + b.w, b });
      ys.push({ v: b.y, b }, { v: b.y + b.h / 2, b }, { v: b.y + b.h, b });
    }
    const best = (cands, edges) => {
      let r = null;
      for (const c of cands)
        for (const e of edges) {
          const d = c.v - e;
          if (Math.abs(d) <= th && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, v: c.v, b: c.b };
        }
      return r;
    };
    const bx = best(xs, [box.x, box.x + box.w / 2, box.x + box.w]);
    const by = best(ys, [box.y, box.y + box.h / 2, box.y + box.h]);
    const guides = [];
    if (bx) guides.push({ axis: 'x', v: bx.v, b: bx.b });
    if (by) guides.push({ axis: 'y', v: by.v, b: by.b });
    return { dx: bx ? bx.d : 0, dy: by ? by.d : 0, guides };
  }
  function showGuides(guides, box) {
    const b = E.blocks[E.pi];
    const z = E.zoom;
    for (const g of guides) {
      b.overlay.appendChild(U.h('div.snap-guide.' + g.axis, { style: g.axis === 'x' ? { left: g.v * z + 'px' } : { top: g.v * z + 'px' } }));
      if (g.b) {
        // spacing label between the moving box and the aligned element
        if (g.axis === 'x') {
          const gap = box.y > g.b.y + g.b.h ? box.y - (g.b.y + g.b.h) : g.b.y - (box.y + box.h);
          if (gap > 0) {
            const y = box.y > g.b.y ? g.b.y + g.b.h + gap / 2 : box.y + box.h + gap / 2;
            b.overlay.appendChild(U.h('div.gap-label', { style: { left: g.v * z + 6 + 'px', top: y * z - 9 + 'px' } }, String(Math.round(gap))));
          }
        } else {
          const gap = box.x > g.b.x + g.b.w ? box.x - (g.b.x + g.b.w) : g.b.x - (box.x + box.w);
          if (gap > 0) {
            const x = box.x > g.b.x ? g.b.x + g.b.w + gap / 2 : box.x + box.w + gap / 2;
            b.overlay.appendChild(U.h('div.gap-label', { style: { left: x * z - 14 + 'px', top: g.v * z + 6 + 'px' } }, String(Math.round(gap))));
          }
        }
      }
    }
  }

  function startMarquee(e, i) {
    const p0 = E.toPage(e, i);
    const b = E.blocks[i];
    const z = E.zoom;
    const rect = U.h('div.marquee');
    let started = false;
    const base = e.shiftKey ? [...E.sel] : [];
    session(
      (ev) => {
        const p = E.toPage(ev, i);
        if (!started && Math.hypot(p.x - p0.x, p.y - p0.y) * z < 4) return;
        if (!started) { started = true; E.dragging = true; b.overlay.appendChild(rect); }
        const x = Math.min(p.x, p0.x), y = Math.min(p.y, p0.y), w = Math.abs(p.x - p0.x), h = Math.abs(p.y - p0.y);
        Object.assign(rect.style, { left: x * z + 'px', top: y * z + 'px', width: w * z + 'px', height: h * z + 'px' });
        const hits = E.els().filter((el) => {
          const bb = E.bbox(el);
          return !el.hidden && bb.x < x + w && bb.x + bb.w > x && bb.y < y + h && bb.y + bb.h > y;
        });
        const ids = new Set(base);
        hits.forEach((h2) => groupMembers(h2).forEach((id) => ids.add(id)));
        E.sel = [...ids];
      },
      () => {
        rect.remove();
        if (started) E.select(E.sel);
      }
    );
  }

  const PROPORTIONAL = new Set(['image', 'icon', 'emoji', 'text']);
  function startResize(e, h) {
    e.stopPropagation();
    e.preventDefault();
    const els = E.selEls();
    const single = els.length === 1 ? els[0] : null;
    const hx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0;
    const hy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
    const corner = hx && hy;
    E.dragging = true;
    if (single) {
      const el = single;
      const o = U.clone(el);
      const th = ((el.rot || 0) * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const ax = cx + cos * (-hx * o.w / 2) - sin * (-hy * o.h / 2);
      const ay = cy + sin * (-hx * o.w / 2) + cos * (-hy * o.h / 2);
      const sx = e.clientX, sy = e.clientY;
      session(
        (ev) => {
          const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
          const lx = cos * dx + sin * dy, ly = -sin * dx + cos * dy;
          let nw = hx ? Math.max(8, o.w + hx * lx) : o.w;
          let nh = hy ? Math.max(8, o.h + hy * ly) : o.h;
          const prop = corner && (PROPORTIONAL.has(el.type) || ev.shiftKey || el.sticky) && !(ev.shiftKey && PROPORTIONAL.has(el.type));
          if (prop) {
            const k = Math.max(nw / o.w, nh / o.h);
            nw = o.w * k;
            nh = o.h * k;
          }
          if (el.type === 'image' && !corner) {
            // side handles crop the image
            const c = { ...o.crop };
            const pxPerX = o.w / c.w, pxPerY = o.h / c.h;
            if (hx === 1) { c.w = U.clamp(nw / pxPerX, 0.02, 1 - c.x); nw = c.w * pxPerX; }
            if (hx === -1) { const right = c.x + c.w; c.w = U.clamp(nw / pxPerX, 0.02, right); c.x = right - c.w; nw = c.w * pxPerX; }
            if (hy === 1) { c.h = U.clamp(nh / pxPerY, 0.02, 1 - c.y); nh = c.h * pxPerY; }
            if (hy === -1) { const bottom = c.y + c.h; c.h = U.clamp(nh / pxPerY, 0.02, bottom); c.y = bottom - c.h; nh = c.h * pxPerY; }
            el.crop = c;
          }
          if (el.type === 'text') {
            if (corner) {
              const k = nw / o.w;
              el.size = Math.max(4, U.round(o.size * k, 1));
              if (o.effect) el.effect = o.effect;
            }
            el.w = nw;
            nh = el.curve ? R.curveGeom({ ...el }).h : R.textHeight({ ...el, w: nw });
            if (el.curve) { nw = R.curveGeom(el).w; }
          }
          if (el.type === 'shape' && el.text && corner && prop) el.size = Math.max(4, U.round(o.size * (nw / o.w), 1));
          if (el.type === 'table' && corner) el.size = Math.max(6, U.round(o.size * Math.min(nw / o.w, nh / o.h), 1));
          const ncx = ax + cos * (hx * nw / 2) - sin * (hy * nh / 2);
          const ncy = ay + sin * (hx * nw / 2) + cos * (hy * nh / 2);
          el.w = nw;
          el.h = nh;
          el.x = (hx || el.type === 'text' ? ncx : cx) - nw / 2;
          el.y = (hy || el.type === 'text' ? ncy : cy) - nh / 2;
          if (el.type === 'text' && !hy) {
            // keep the top edge in place when only the width changes
            el.x = ncx - nw / 2;
            el.y = o.y;
          }
          E.renderPage(E.pi);
          E.drawOverlay();
          sizeLabel(el);
        },
        () => E.changed()
      );
    } else {
      const box = E.unionBox(els);
      const ax = hx === 1 ? box.x : box.x + box.w, ay = hy === 1 ? box.y : box.y + box.h;
      const orig = els.map((el) => U.clone(el));
      const sx = e.clientX, sy = e.clientY;
      session(
        (ev) => {
          const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
          const k = Math.max(0.05, Math.max((box.w + hx * dx) / box.w, (box.h + hy * dy) / box.h));
          els.forEach((el, i) => {
            const o = orig[i];
            el.x = ax + (o.x - ax) * k;
            el.y = ay + (o.y - ay) * k;
            el.w = o.w * k;
            el.h = o.h * k;
            if (o.size) el.size = U.round(o.size * k, 1);
            if (o.strokeWidth && el.type !== 'line') el.strokeWidth = o.strokeWidth * k;
            if (o.p1) {
              el.p1 = { x: ax + (o.p1.x - ax) * k, y: ay + (o.p1.y - ay) * k };
              el.p2 = { x: ax + (o.p2.x - ax) * k, y: ay + (o.p2.y - ay) * k };
            }
          });
          E.renderPage(E.pi);
          E.drawOverlay();
        },
        () => E.changed()
      );
    }
  }
  function sizeLabel(el) {
    const b = E.blocks[E.pi], z = E.zoom;
    const bb = E.bbox(el);
    b.overlay.appendChild(U.h('div.size-label', { style: { left: (bb.x + bb.w / 2) * z + 'px', top: (bb.y + bb.h) * z + 40 + 'px' } }, `w ${Math.round(el.w)}  h ${Math.round(el.h)}`));
  }
  function startRotate(e) {
    e.stopPropagation();
    e.preventDefault();
    const el = E.selEls()[0];
    if (!el) return;
    const r = E.blocks[E.pi].svg.getBoundingClientRect();
    const c = { x: r.left + (el.x + el.w / 2) * E.zoom, y: r.top + (el.y + el.h / 2) * E.zoom };
    const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    const r0 = el.rot || 0;
    E.dragging = true;
    session(
      (ev) => {
        const a = Math.atan2(ev.clientY - c.y, ev.clientX - c.x);
        let deg = r0 + ((a - a0) * 180) / Math.PI;
        deg = ((deg % 360) + 540) % 360 - 180;
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        else for (const s of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) if (Math.abs(deg - s) < 3) deg = s;
        el.rot = U.round(deg, 1);
        E.renderPage(E.pi);
        E.drawOverlay();
        const b = E.blocks[E.pi], z = E.zoom;
        b.overlay.appendChild(U.h('div.size-label', { style: { left: (el.x + el.w / 2) * z + 'px', top: (el.y + el.h) * z + 60 + 'px' } }, Math.round(deg) + '°'));
      },
      () => E.changed()
    );
  }
  function startLineEnd(e, el, k) {
    e.stopPropagation();
    e.preventDefault();
    if (el.locked) return;
    E.dragging = true;
    const ck = k === 'p1' ? 'c1' : 'c2';
    session(
      (ev) => {
        const p = E.toPage(ev);
        // snap to shapes to form connectors
        const target = E.els().find((o) => o.id !== el.id && o.type !== 'line' && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h);
        if (target) el[ck] = target.id;
        else delete el[ck];
        let q = { x: p.x, y: p.y };
        if (ev.shiftKey) {
          const other = k === 'p1' ? el.p2 : el.p1;
          const ang = Math.round(Math.atan2(q.y - other.y, q.x - other.x) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(q.x - other.x, q.y - other.y);
          q = { x: other.x + Math.cos(ang) * len, y: other.y + Math.sin(ang) * len };
        }
        el[k] = q;
        M.syncLineBox(el);
        E.renderPage(E.pi);
        E.drawOverlay();
      },
      () => E.changed()
    );
  }

  // ---------- draw tool ----------
  E.pen = { pen: 'pen', color: '#1a1a1a', size: 6 };
  function startDraw(e, i) {
    if (E.page().locked) return;
    const pts = [E.toPage(e, i)];
    if (E.pen.pen === 'eraser') {
      session(
        (ev) => {
          const p = E.toPage(ev, i);
          const before = E.els().length;
          E.page().elements = E.els().filter((el) => !(el.type === 'draw' && p.x >= el.x - 6 && p.x <= el.x + el.w + 6 && p.y >= el.y - 6 && p.y <= el.y + el.h + 6 && nearStroke(el, p)));
          if (E.els().length !== before) E.renderPage(i);
        },
        () => E.changed()
      );
      return;
    }
    const el = M.newDraw({ stroke: E.pen.color, strokeWidth: E.pen.pen === 'highlighter' ? E.pen.size * 3 : E.pen.pen === 'marker' ? E.pen.size * 1.8 : E.pen.size, pen: E.pen.pen });
    E.page().elements.push(el);
    const sync = () => {
      const pad = el.strokeWidth / 2;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x1 = Math.min(...xs) - pad, y1 = Math.min(...ys) - pad, x2 = Math.max(...xs) + pad, y2 = Math.max(...ys) + pad;
      el.x = x1; el.y = y1; el.w = Math.max(1, x2 - x1); el.h = Math.max(1, y2 - y1);
      el.pts = pts.map((p) => [U.round((p.x - x1) / el.w, 4), U.round((p.y - y1) / el.h, 4)]);
    };
    session(
      (ev) => {
        const p = E.toPage(ev, i);
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) * E.zoom < 2) return;
        pts.push(p);
        sync();
        E.renderPage(i);
      },
      () => {
        if (pts.length < 2) pts.push({ x: pts[0].x + 0.5, y: pts[0].y + 0.5 });
        sync();
        E.changed();
      }
    );
  }
  function nearStroke(el, p) {
    return (el.pts || []).some(([x, y]) => Math.hypot(el.x + x * el.w - p.x, el.y + y * el.h - p.y) < Math.max(10, el.strokeWidth));
  }

  // ---------- motion path recording ("create an animation") ----------
  function recordMotion(e, el) {
    const sx = e.clientX, sy = e.clientY, t0 = performance.now();
    const ox = el.x, oy = el.y;
    const pts = [{ t: 0, dx: 0, dy: 0 }];
    E.dragging = true;
    session(
      (ev) => {
        const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
        pts.push({ t: U.round((performance.now() - t0) / 1000, 3), dx: U.round(dx, 1), dy: U.round(dy, 1) });
        el.x = ox + dx;
        el.y = oy + dy;
        E.renderPage(E.pi);
      },
      () => {
        el.x = ox;
        el.y = oy;
        E.tool = null;
        A.EU.refreshTool();
        if (pts.length > 3) {
          el.anim = { ...(el.anim || {}), motion: pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) };
          U.toast('Motion recorded – press Play to preview', 'ok');
        }
        E.changed();
        A.EU.refreshPanel();
      }
    );
  }
  E.startMotion = () => {
    if (!E.selEls()[0]) return U.toast('Select an element first');
    E.tool = 'motion';
    A.EU.refreshTool();
    U.toast('Drag the element along the path you want it to follow');
  };

  // ---------- text editing ----------
  E.editText = (el) => {
    if (E.editingId) E.finishText();
    if (el.type === 'shape' && !el.text) {
      Object.assign(el, { ...M.textDefaults, color: U.luminance(String(el.fill).startsWith('#') ? el.fill : '#888888') > 0.6 ? '#1a1a1a' : '#ffffff', align: 'center', size: Math.max(16, Math.round(Math.min(el.w, el.h) / 6)), text: '' });
    }
    E.editingId = el.id;
    E.sel = [el.id];
    E.renderPage(E.pi);
    E.drawOverlay();
    const b = E.blocks[E.pi], z = E.zoom;
    const shape = el.type === 'shape';
    const px = shape ? Math.min(el.w * 0.1, 24) : 0;
    const ta = U.h('textarea.text-edit', { spellcheck: 'true' });
    ta.value = el.text || '';
    const style = () => {
      const lines = R.layoutText(el, el.w - px * 2);
      Object.assign(ta.style, {
        left: (el.x + px) * z + 'px',
        top: (el.y + (shape ? Math.max(0, (el.h - lines.height) / 2) : 0)) * z + 'px',
        width: (el.w - px * 2) * z + 'px',
        height: Math.max(lines.height, el.size * (el.lh || 1.3)) * z + 'px',
        fontFamily: M.fontStack(el.font),
        fontSize: el.size * z + 'px',
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? 'italic' : 'normal',
        textDecoration: [el.underline && 'underline', el.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
        textTransform: el.upper ? 'uppercase' : 'none',
        lineHeight: el.lh || 1.3,
        letterSpacing: ((el.spacing || 0) / 1000) * el.size * z + 'px',
        textAlign: el.align === 'justify' ? 'left' : el.align,
        color: String(el.color).startsWith('grad:') ? el.color.split(':')[1] : el.color,
        transform: `rotate(${el.rot || 0}deg)`,
        transformOrigin: `${(el.w / 2 - px) * z}px ${(el.h / 2) * z}px`,
      });
    };
    style();
    ta.addEventListener('input', () => {
      el.text = ta.value;
      if (el.type === 'text') {
        if (el.curve) { const g = R.curveGeom(el); el.w = g.w; el.h = g.h; }
        else el.h = R.textHeight(el);
      }
      style();
      E.drawOverlayKeep(ta);
    });
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') E.finishText();
      if ((ev.ctrlKey || ev.metaKey) && ['b', 'i', 'u'].includes(ev.key.toLowerCase())) {
        ev.preventDefault();
        const k = { b: 'bold', i: 'italic', u: 'underline' }[ev.key.toLowerCase()];
        el[k] = !el[k];
        style();
        A.EU.refreshToolbar();
      }
    });
    ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    E.textArea = ta;
    E.textAreaStyle = style;
    b.overlay.appendChild(ta);
    ta.focus();
    if (el.text === 'Text' || el.text === 'Add a heading' || el.text === 'Add a subheading' || el.text === 'Add a little bit of body text' || el.text === 'Add an idea') ta.select();
    else ta.setSelectionRange(ta.value.length, ta.value.length);
    A.EU.refreshToolbar();
  };
  E.drawOverlayKeep = (ta) => {
    const b = E.blocks[E.pi];
    E.drawOverlay();
    b.overlay.appendChild(ta);
    ta.focus();
  };
  E.restyleText = () => E.textAreaStyle && E.textAreaStyle();
  E.finishText = () => {
    if (!E.editingId) return;
    const el = E.byId(E.editingId);
    E.editingId = null;
    E.textArea?.remove();
    E.textArea = null;
    E.textAreaStyle = null;
    if (el && el.type === 'text' && !el.text.trim()) {
      E.page().elements = E.els().filter((x) => x !== el);
      E.sel = [];
    } else if (el && el.type === 'text') el.h = el.curve ? R.curveGeom(el).h : R.textHeight(el);
    E.changed();
  };

  // ---------- element operations ----------
  E.visibleCenter = () => {
    const b = E.blocks[E.pi];
    if (!b || !E.scrollEl) return { x: E.d.width / 2, y: E.d.height / 2 };
    const r = b.svg.getBoundingClientRect(), w = E.scrollEl.getBoundingClientRect();
    const cx = (Math.max(r.left, w.left) + Math.min(r.right, w.right)) / 2, cy = (Math.max(r.top, w.top) + Math.min(r.bottom, w.bottom)) / 2;
    return { x: U.clamp((cx - r.left) / E.zoom, 0, E.d.width), y: U.clamp((cy - r.top) / E.zoom, 0, E.d.height) };
  };
  E.add = (els, { center = true, edit = false } = {}) => {
    if (!E.d) return;
    if (E.page().locked) return U.toast('This page is locked');
    els = Array.isArray(els) ? els : [els];
    if (center) {
      const box = E.unionBox(els);
      const c = E.visibleCenter();
      const dx = c.x - (box.x + box.w / 2), dy = c.y - (box.y + box.h / 2);
      for (const el of els) {
        el.x += dx;
        el.y += dy;
        if (el.p1) { el.p1.x += dx; el.p1.y += dy; el.p2.x += dx; el.p2.y += dy; }
      }
    }
    E.page().elements.push(...els);
    E.sel = els.map((e) => e.id);
    E.changed();
    A.EU.onSelectionChange?.();
    if (edit && els.length === 1) setTimeout(() => E.editText(els[0]), 20);
  };
  // Fit an element so it isn't larger than ~60% of the page.
  E.fitSize = (el, frac = 0.6) => {
    const k = Math.min(1, (E.d.width * frac) / el.w, (E.d.height * frac) / el.h);
    el.w *= k;
    el.h *= k;
    return el;
  };
  E.addText = (kind = 'body') => {
    const W = E.d.width;
    const base = Math.max(12, Math.round(W / 1080 * 36));
    const brand = A.app.brand?.fonts || {};
    const conf = {
      heading: { text: 'Add a heading', size: base * 2.6, bold: true, font: brand.heading || 'Inter' },
      subheading: { text: 'Add a subheading', size: base * 1.6, bold: true, font: brand.subheading || brand.heading || 'Inter' },
      body: { text: 'Add a little bit of body text', size: base, font: brand.body || 'Inter' },
    }[kind];
    const el = M.newText({ ...conf, w: Math.min(W * 0.8, conf.size * conf.text.length * 0.62) });
    el.h = R.textHeight(el);
    E.add(el);
  };
  E.addShape = (shape, o = {}) => E.add(M.newShape(shape, { w: E.d.width * 0.25, h: E.d.width * 0.25 * (o.ratio || 1), fill: A.app.brand?.colors?.[0] || '#8c52ff', ...o }));
  E.addLine = (o = {}) => {
    const len = E.d.width * 0.3;
    const l = M.newLine({ p1: { x: 0, y: 0 }, p2: { x: len, y: 0 }, strokeWidth: Math.max(2, Math.round(E.d.width / 300)), ...o });
    M.syncLineBox(l);
    E.add(l);
  };
  E.addImageAsset = (asset, opts = {}) => {
    const el = M.newImage(asset, { x: 0, y: 0, w: asset.w, h: asset.h });
    E.fitSize(el, opts.frac || 0.6);
    E.add(el, opts);
    return el;
  };
  E.deleteSel = () => {
    const ids = new Set(E.selEls().filter((e) => !e.locked).map((e) => e.id));
    if (!ids.size) return;
    E.page().elements = E.els().filter((e) => !ids.has(e.id));
    E.d.comments = (E.d.comments || []).filter((c) => !ids.has(c.elId));
    E.sel = [];
    E.changed();
  };
  E.duplicate = () => {
    const els = E.selEls();
    if (!els.length) return;
    const gmap = {};
    const clones = els.map((e) => {
      const c = M.cloneElement(e, 20, 20);
      if (c.groupId) c.groupId = gmap[c.groupId] ||= U.uid('g_');
      return c;
    });
    E.page().elements.push(...clones);
    E.sel = clones.map((c) => c.id);
    E.changed();
  };
  E.copy = () => {
    const els = E.selEls();
    if (!els.length) return false;
    E.clip = U.clone(els);
    return true;
  };
  E.paste = () => {
    if (!E.clip?.length) return;
    const gmap = {};
    const clones = E.clip.map((e) => {
      const c = M.cloneElement(e, 24, 24);
      if (c.groupId) c.groupId = gmap[c.groupId] ||= U.uid('g_');
      return c;
    });
    E.clip = clones.map((c) => U.clone(c));
    E.page().elements.push(...clones);
    E.sel = clones.map((c) => c.id);
    E.changed();
  };
  E.copyStyle = () => {
    const el = E.selEls()[0];
    if (!el) return;
    const keys = ['font', 'size', 'color', 'bold', 'italic', 'underline', 'strike', 'upper', 'align', 'lh', 'spacing', 'effect', 'fill', 'stroke', 'strokeWidth', 'dash', 'radius', 'opacity', 'adj', 'duo', 'shadow'];
    E.styleClip = {};
    for (const k of keys) if (el[k] !== undefined) E.styleClip[k] = U.clone(el[k]);
    U.toast('Style copied');
  };
  E.pasteStyle = () => {
    if (!E.styleClip) return;
    for (const el of E.selEls()) {
      for (const k in E.styleClip) {
        if (['adj', 'duo'].includes(k) && el.type !== 'image') continue;
        if (['font', 'size', 'color', 'bold', 'italic', 'align', 'effect', 'lh', 'spacing', 'upper', 'underline', 'strike'].includes(k) && !(el.type === 'text' || (el.type === 'shape' && el.text))) continue;
        if (['fill', 'radius'].includes(k) && !['shape', 'icon'].includes(el.type)) continue;
        el[k] = U.clone(E.styleClip[k]);
      }
      if (el.type === 'text') el.h = R.textHeight(el);
    }
    E.changed();
  };
  E.selectAll = () => E.select(E.els().filter((e) => !e.hidden).map((e) => e.id));
  E.group = () => {
    const els = E.selEls();
    if (els.length < 2) return;
    const g = U.uid('g_');
    els.forEach((e) => (e.groupId = g));
    E.changed();
  };
  E.ungroup = () => {
    E.selEls().forEach((e) => delete e.groupId);
    E.enteredGroup = null;
    E.changed();
  };
  E.toggleLock = () => {
    const els = E.selEls();
    const lock = !els.every((e) => e.locked);
    els.forEach((e) => (e.locked = lock));
    E.changed();
  };
  E.nudge = (dx, dy) => {
    const els = E.selEls().filter((e) => !e.locked);
    if (!els.length) return;
    for (const el of els) {
      el.x += dx;
      el.y += dy;
      if (el.p1) { el.p1.x += dx; el.p1.y += dy; el.p2.x += dx; el.p2.y += dy; }
    }
    E.changed();
  };
  E.order = (how) => {
    const list = E.els();
    const ids = new Set(E.sel);
    const sel = list.filter((e) => ids.has(e.id)), rest = list.filter((e) => !ids.has(e.id));
    if (how === 'front') E.page().elements = [...rest, ...sel];
    else if (how === 'back') E.page().elements = [...sel, ...rest];
    else {
      const arr = [...list];
      const idxs = arr.map((e, i) => (ids.has(e.id) ? i : -1)).filter((i) => i >= 0);
      if (how === 'forward') for (let k = idxs.length - 1; k >= 0; k--) { const i = idxs[k]; if (i < arr.length - 1 && !ids.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
      if (how === 'backward') for (const i of idxs) if (i > 0 && !ids.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      E.page().elements = arr;
    }
    E.changed();
  };
  E.align = (how) => {
    const els = E.selEls().filter((e) => !e.locked);
    if (!els.length) return;
    const ref = els.length > 1 ? E.unionBox(els) : { x: 0, y: 0, w: E.d.width, h: E.d.height };
    for (const el of els) {
      const b = E.bbox(el);
      let dx = 0, dy = 0;
      if (how === 'left') dx = ref.x - b.x;
      if (how === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
      if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (how === 'top') dy = ref.y - b.y;
      if (how === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
      if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      el.x += dx; el.y += dy;
      if (el.p1) { el.p1.x += dx; el.p1.y += dy; el.p2.x += dx; el.p2.y += dy; }
    }
    E.changed();
  };
  E.distribute = (axis) => {
    const els = E.selEls().filter((e) => !e.locked);
    if (els.length < 3) return U.toast('Select 3 or more elements to distribute');
    const k = axis === 'h' ? 'x' : 'y', s = axis === 'h' ? 'w' : 'h';
    const sorted = [...els].sort((a, b) => E.bbox(a)[k] - E.bbox(b)[k]);
    const box = E.unionBox(els);
    const total = sorted.reduce((t, e) => t + E.bbox(e)[s], 0);
    const gap = (box[s] - total) / (sorted.length - 1);
    let pos = box[k];
    for (const el of sorted) {
      const b = E.bbox(el);
      const d = pos - b[k];
      el[k] += d;
      if (el.p1) { el.p1[k] += d; el.p2[k] += d; }
      pos += b[s] + gap;
    }
    E.changed();
  };
  E.setBackgroundFromImage = () => {
    const el = E.selEls()[0];
    if (!el || el.type !== 'image') return;
    E.page().bg = { ...(E.page().bg || {}), asset: el.asset, adj: el.adj };
    E.page().elements = E.els().filter((e) => e !== el);
    E.sel = [];
    E.changed();
  };
  E.flip = (axis) => {
    for (const el of E.selEls()) {
      if (axis === 'h') el.flipX = !el.flipX;
      else el.flipY = !el.flipY;
    }
    E.changed();
  };

  // Scale every page's contents to a new size (Resize / Magic Switch).
  E.resizeDesign = (d, W, H) => {
    const kx = W / d.width, ky = H / d.height, k = Math.min(kx, ky);
    const ox = (W - d.width * k) / 2, oy = (H - d.height * k) / 2;
    for (const p of d.pages)
      for (const el of p.elements) {
        el.x = el.x * k + ox;
        el.y = el.y * k + oy;
        el.w *= k;
        el.h *= k;
        if (el.size) el.size = U.round(el.size * k, 1);
        if (el.strokeWidth && el.type !== 'line') el.strokeWidth *= k;
        if (el.type === 'line') {
          el.strokeWidth *= k;
          el.p1 = { x: el.p1.x * k + ox, y: el.p1.y * k + oy };
          el.p2 = { x: el.p2.x * k + ox, y: el.p2.y * k + oy };
        }
      }
    d.width = Math.round(W);
    d.height = Math.round(H);
    return d;
  };

  // ---------- keyboard & clipboard ----------
  E.onKey = (e) => {
    if (A.app.view !== 'editor' || !E.d) return;
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    if (typing) return;
    if (document.querySelector('.modal-back') || A.Present?.active) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const stop = () => e.preventDefault();
    if (mod) {
      if (k === 'z') { stop(); e.shiftKey ? E.redo() : E.undo(); }
      else if (k === 'y') { stop(); E.redo(); }
      else if (k === 'd') { stop(); E.duplicate(); }
      else if (k === 'g') { stop(); e.shiftKey ? E.ungroup() : E.group(); }
      else if (k === 'a') { stop(); E.selectAll(); }
      else if (k === 's') { stop(); E.saveNow.flush(); U.toast('Saved', 'ok'); }
      else if (k === 'c') { if (E.copy()) stop(); }
      else if (k === 'x') { if (E.copy()) { stop(); E.deleteSel(); } }
      else if (k === 'b' || k === 'i' || k === 'u') {
        const els = E.selEls().filter((x) => x.type === 'text' || (x.type === 'shape' && x.text));
        if (els.length) { stop(); const key = { b: 'bold', i: 'italic', u: 'underline' }[k]; const v = !els[0][key]; els.forEach((x) => { x[key] = v; if (x.type === 'text') x.h = R.textHeight(x); }); E.changed(); }
      }
      else if (k === '=' || k === '+') { stop(); E.setZoom(E.zoom * 1.2); }
      else if (k === '-') { stop(); E.setZoom(E.zoom / 1.2); }
      else if (k === '0') { stop(); E.fit(); E.renderAll(); }
      else if (k === 'enter' && E.layout() === 'strip') { stop(); A.Present.start(); }
      return;
    }
    if (k === 'escape') {
      if (E.tool) { E.tool = null; A.EU.refreshTool(); }
      else if (E.enteredGroup) { E.enteredGroup = null; E.deselect(); }
      else E.deselect();
      return;
    }
    if (k === 'delete' || k === 'backspace') { stop(); return E.deleteSel(); }
    if (k.startsWith('arrow')) {
      if (!E.sel.length) {
        if (E.layout() === 'strip' && (k === 'arrowleft' || k === 'arrowup')) E.setPage(E.pi - 1);
        else if (E.layout() === 'strip') E.setPage(E.pi + 1);
        return stop();
      }
      stop();
      const s = e.shiftKey ? 10 : 1;
      return E.nudge(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0);
    }
    if (k === 'enter') {
      const el = E.selEls()[0];
      if (el && (el.type === 'text' || el.type === 'shape')) { stop(); E.editText(el); }
      return;
    }
    if (k === '/') { stop(); return A.EU.quickMenu(); }
    if (k === 't') { stop(); return E.addText('body'); }
    if (k === 'r') return E.addShape('rect');
    if (k === 'c') return E.addShape('ellipse');
    if (k === 'l') return E.addLine();
    if (k === 's' && E.isWB()) return E.add(M.newSticky());
    if (k === 'p' && e.altKey) return A.Present.start();
  };
  E.onCopyEvent = (e) => {
    if (A.app.view !== 'editor' || !E.d) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    if (E.copy()) {
      e.clipboardData.setData('text/plain', 'atelier-elements');
      e.preventDefault();
      if (e.type === 'cut') E.deleteSel();
    }
  };
  E.onPaste = async (e) => {
    if (A.app.view !== 'editor' || !E.d) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    const text = e.clipboardData?.getData('text/plain') || '';
    e.preventDefault();
    if (files.length) {
      for (const f of files) E.addImageAsset(await S.addAsset(f, { name: f.name || 'pasted image' }));
      return;
    }
    if ((text === 'atelier-elements' || !text) && E.clip) return E.paste();
    if (text) {
      if (E.styleClip && false) return;
      const el = M.newText({ text: text.slice(0, 5000), w: E.d.width * 0.6, size: Math.max(12, Math.round(E.d.width / 30)) });
      el.h = R.textHeight(el);
      E.add(el);
    }
  };
  E.onDrop = async (e) => {
    if (!E.d) return;
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        const a = await S.addAsset(f, { name: f.name });
        const el = E.addImageAsset(a, { center: true });
        // drop onto a frame fills it
        const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-id]');
        const target = t && E.byId(t.getAttribute('data-id'));
        if (target && target.type === 'shape' && target.frame) {
          target.asset = a.id;
          E.page().elements = E.els().filter((x) => x !== el);
          E.sel = [target.id];
          E.changed();
        }
      } else if (f.type.startsWith('audio/')) {
        const a = await S.addAsset(f, { name: f.name });
        E.d.audio = a.id;
        E.changed({ all: true });
        U.toast('Audio added to the design');
      }
    }
    const tplData = e.dataTransfer?.getData('application/x-atelier');
    if (tplData) A.EU.dropItem(JSON.parse(tplData), e);
  };
})(window.A);
