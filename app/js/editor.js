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
  // History snapshots leave out autosave metadata and the title, so saving or renaming is never an undo step.
  const snap = () => JSON.stringify({ ...E.d, thumb: undefined, updatedAt: undefined, title: undefined });
  E.open = async (id) => {
    const d = await S.get('designs', id);
    if (!d || d.deletedAt) {
      U.toast('That design could not be found', 'error');
      return location.replace('#/home');
    }
    d.pages = d.pages?.length ? d.pages : [M.newPage()];
    d.comments = d.comments || [];
    d.guides = d.guides || [];
    E.d = d;
    E.pi = 0;
    E.sel = [];
    E.tool = null;
    E.editingId = E.editEl = E.textArea = E.textAreaStyle = E.enteredGroup = null;
    E.hist = [snap()];
    E.hi = 0;
    E.dirty = E.dirtySinceVersion = false;
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
    E.finishText();
    E.flushCommit();
    clearInterval(E.versionTimer);
    // an untouched design keeps its 'last edited' time (it is only saved for a missing card preview)
    if (E.dirty || !E.d.thumb) await E.save();
    await E.snapshot();
    A.Present?.stopPreview?.();
    E.d = null;
  };
  // Writes the design before rendering its card thumbnail, so an unload mid-save keeps the edits. Resolves true when saved.
  E.save = async ({ thumb = true } = {}) => {
    const d = E.d;
    if (!d) return false;
    E.dirty = false;
    A.EU.saveState('saving');
    try {
      await S.saveDesign(d);
    } catch (e) {
      console.error(e);
      E.dirty = true;
      A.EU.saveState('error');
      return false;
    }
    A.EU.saveState(E.dirty ? 'pending' : 'saved');
    if (thumb) {
      try {
        d.thumb = await R.thumbnail(d);
        if (E.d === d) await S.put('designs', d);
      } catch (e) {
        console.error(e);
      }
    }
    return true;
  };
  E.saveNow = U.debounce((o) => E.dirty && E.save(o), 900);
  E.scheduleSave = () => {
    E.dirty = E.dirtySinceVersion = true;
    A.EU.saveState('pending');
    E.saveNow();
  };
  // a failed save already shows the sticky warning (EU.saveState), unless it was closed
  const saveKey = () => E.save().then((ok) => (ok ? U.toast('Saved', 'ok') : !A.EU.saveErr?.isConnected && U.toast('Could not save – storage may be full', 'error')));
  E.snapshot = async (label = '') => {
    if (!E.d || (!E.dirtySinceVersion && !label)) return;
    E.dirtySinceVersion = false;
    await S.addVersion(E.d, label);
  };

  // ---------- history ----------
  let commitT = 0, burst = null;
  E.pushHistory = () => {
    clearTimeout(commitT);
    commitT = 0;
    // a pending burst is its own step, before the change that cut it short
    for (const s of [burst, snap()]) {
      if (!s || s === E.hist[E.hi]) continue;
      E.hist = E.hist.slice(0, E.hi + 1);
      E.hist.push(s);
      if (E.hist.length > 120) E.hist.shift();
      E.hi = E.hist.length - 1;
    }
    burst = null;
    A.EU.refreshUndo();
  };
  // A burst of changes (arrow-key nudges) becomes one undo step once it goes quiet.
  E.commitSoon = () => {
    clearTimeout(commitT);
    burst = snap();
    commitT = setTimeout(E.pushHistory, 400);
  };
  E.flushCommit = () => commitT && E.pushHistory();
  // Go from snapshot `from` to `to`, showing the page that changed with its changed elements selected.
  const restore = (from, to) => {
    const { thumb, updatedAt, title } = E.d, pi0 = E.pi;
    E.d = Object.assign(JSON.parse(to), { thumb, updatedAt, title });
    const prev = JSON.parse(from).pages, pages = E.d.pages;
    let i = pages.findIndex((p, k) => JSON.stringify(p) !== JSON.stringify(prev[k]));
    if (i < 0 && pages.length !== prev.length) i = pages.length - 1;
    if (i >= 0) {
      E.pi = i;
      const was = prev.find((p) => p.id === pages[i].id);
      const old = new Map(was?.elements.map((el) => [el.id, JSON.stringify(el)]));
      const changed = was ? pages[i].elements.filter((el) => old.get(el.id) !== JSON.stringify(el)).map((el) => el.id) : [];
      // a page-only change (layer order, background) keeps the selection
      E.sel = changed.length ? changed : E.sel.filter((id) => pages[i].elements.some((el) => el.id === id));
    } else {
      E.pi = Math.min(E.pi, pages.length - 1);
      E.sel = E.sel.filter((id) => E.byId(id));
    }
    E.buildPages();
    if (E.pi !== pi0) E.blocks[E.pi]?.el.scrollIntoView({ block: 'nearest' });
    A.EU.refreshAll();
    E.scheduleSave();
  };
  E.undo = () => {
    E.finishText();
    E.flushCommit();
    if (E.hi <= 0) return;
    E.hi--;
    restore(E.hist[E.hi + 1], E.hist[E.hi]);
  };
  E.redo = () => {
    E.finishText();
    E.flushCommit();
    if (E.hi >= E.hist.length - 1) return;
    E.hi++;
    restore(E.hist[E.hi - 1], E.hist[E.hi]);
  };

  // Call after mutating the document.
  E.changed = ({ commit = true, all = false, toolbar = true, structure = false } = {}) => {
    if (E.isWB()) growBoard();
    if (structure) E.buildPages();
    else if (all) E.renderAll();
    else E.renderPage(E.pi);
    E.drawOverlay();
    if (toolbar) {
      A.EU.refreshToolbar();
      // contextual panels show the new values, unless the change came from the panel being used or a field there
      // is being typed into (a field's 'change' on Tab or click-away fires once focus has already left it);
      // a shortcut pressed while a panel checkbox or button has focus is a canvas edit
      const ev = window.event, src = ev?.type !== 'keydown' && ev?.target, panel = A.EU.panelEl, ae = document.activeElement;
      if (!(typingIn(ae) && panel?.contains(ae)) && !(src instanceof Node && panel?.contains(src))) A.EU.refreshPanel?.();
    }
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
    // lines and drawings stay as easy to hit at any zoom (a finger needs more room)
    const parts = R.pageParts(E.d, page, { idp: 'p' + i + '_', t, skip: E.editingId ? new Set([E.editingId]) : null, hit: (coarse.matches ? 36 : 16) / z });
    b.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    b.svg.setAttribute('width', W * z);
    b.svg.setAttribute('height', H * z);
    b.svg.innerHTML = `<defs>${parts.defs}</defs>${parts.bg}${parts.els}`;
    b.frame.style.width = W * z + 'px';
    b.frame.style.height = H * z + 'px';
    b.el.classList.toggle('active', i === E.pi);
  };

  // ---------- zoom ----------
  const coarse = matchMedia('(pointer: coarse)');
  // Re-render at zoom z; `place` scrolls before the overlay is drawn, so the mini-menu is placed for the final view.
  const zoomTo = (z, place) => {
    E.zoom = z;
    for (const i in E.blocks) E.renderPage(+i);
    place?.();
    E.drawOverlay();
    A.EU.refreshZoom();
  };
  // `anchor` keeps a page point in place on screen: true = the viewport centre, or a client {x, y} (cursor, pinch midpoint).
  // The scroll an anchored zoom asked for is kept: the browser rounds it, and a gesture zooming every frame
  // would otherwise let the anchored point drift by that rounding on each step.
  let want = null;
  E.setZoom = (z, anchor = true) => {
    z = U.clamp(z, 0.05, 8);
    const wrap = E.scrollEl;
    let a = null;
    if (wrap && anchor) {
      const sr = wrap.getBoundingClientRect();
      const x = anchor.x ?? sr.left + wrap.clientWidth / 2, y = anchor.y ?? sr.top + wrap.clientHeight / 2;
      const held = want && performance.now() - want.t < 150 && Math.abs(wrap.scrollLeft - want.left) < 1 && Math.abs(wrap.scrollTop - want.top) < 1;
      const dx = held ? wrap.scrollLeft - want.left : 0, dy = held ? wrap.scrollTop - want.top : 0;
      // page padding, heads and gaps don't scale, so measure against the page block nearest to the anchor
      let best = Infinity;
      for (const k in E.blocks) {
        const r = E.blocks[k].svg.getBoundingClientRect(), left = r.left + dx, top = r.top + dy;
        const dist = Math.hypot(Math.max(left - x, 0, x - left - r.width), Math.max(top - y, 0, y - top - r.height));
        if (dist < best) { best = dist; a = { b: E.blocks[k], x, y, px: (x - left) / E.zoom, py: (y - top) / E.zoom }; }
      }
    }
    zoomTo(z, a && (() => {
      const r = a.b.svg.getBoundingClientRect();
      const left = wrap.scrollLeft + r.left + a.px * z - a.x, top = wrap.scrollTop + r.top + a.py * z - a.y;
      wrap.scrollLeft = left;
      wrap.scrollTop = top;
      want = { left, top, t: performance.now() };
    }));
  };
  E.fit = () => {
    const wrap = E.scrollEl;
    if (!wrap) return;
    const pad = innerWidth < 700 ? 24 : 80;
    const zw = (wrap.clientWidth - pad) / E.d.width;
    const zh = (wrap.clientHeight - pad - 40) / E.d.height;
    const z = U.clamp(Math.min(zw, E.layout() === 'strip' || E.isWB() ? zh : zw * 1, zh * (E.layout() === 'vertical' ? 1.0 : 1)), 0.05, 2);
    const b = E.blocks[E.pi];
    if (!b || !E.pagesEl?.contains(b.el)) { E.zoom = z; return A.EU.refreshZoom(); }
    // already showing pages: re-render and centre the current page
    zoomTo(z, () => {
      const r = b.el.getBoundingClientRect(), sr = wrap.getBoundingClientRect();
      wrap.scrollLeft += r.left + r.width / 2 - sr.left - wrap.clientWidth / 2;
      wrap.scrollTop += r.top + r.height / 2 - sr.top - wrap.clientHeight / 2;
    });
  };

  // ---------- pages ----------
  E.setPage = (i, scroll = true) => {
    if (i < 0 || i >= E.d.pages.length) return;
    const changed = i !== E.pi;
    if (changed) {
      commitField();
      E.finishText();
    }
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
    E.finishText();
    const p = page || M.newPage({ bg: { color: E.page()?.bg?.color && !E.page().bg.asset ? E.page().bg.color : '#ffffff' } });
    E.d.pages.splice(at, 0, p);
    E.pi = at;
    E.sel = [];
    E.changed({ structure: true });
    setTimeout(() => E.blocks[at]?.el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
  };
  E.duplicatePage = (i) => {
    E.finishText();
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
    E.finishText();
    const gone = E.d.pages[i].id;
    if (E.d.pages.length === 1) {
      E.d.pages[0] = M.newPage();
    } else E.d.pages.splice(i, 1);
    if (i < E.pi) E.pi--;
    E.pi = Math.min(E.pi, E.d.pages.length - 1);
    E.sel = [];
    E.d.comments = (E.d.comments || []).filter((c) => c.pageId !== gone);
    E.changed({ structure: true });
  };
  E.movePage = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= E.d.pages.length) return;
    E.finishText();
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
  // Store a connector's drawn ends in p1/p2 (they go stale while its shapes move); `detach` lets it move on its own.
  E.bakeEnds = (el, detach = false) => {
    if (el.type !== 'line' || !(el.c1 || el.c2)) return;
    Object.assign(el, U.clone(R.lineEnds(el, E.page())));
    if (detach) { delete el.c1; delete el.c2; }
    M.syncLineBox(el);
  };
  const groupMembers = (el) => (el.groupId ? E.els().filter((e) => e.groupId === el.groupId).map((e) => e.id) : [el.id]);

  // ---------- selection ----------
  // A value typed into a toolbar or panel field is committed (its 'change' fires) before the selection moves on.
  const commitField = (scope = '*') => {
    const a = document.activeElement;
    if (a && a !== E.textArea && a.matches('input, select, textarea') && a.closest(scope)) a.blur();
  };
  E.select = (ids, add = false) => {
    commitField();
    E.flushCommit();
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
      for (const c of [...b.overlay.children]) if (c !== E.textArea) c.remove();
      drawGuides(b, +k);
      drawRulers(b);
      drawCommentPins(b, +k);
    }
    keepTextArea();
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
      // text only has width handles, so a short line keeps them (shortened to clear the corner dots)
      const short = box.h * z < 40, small = box.w * z < 40 || (short && t !== 'text');
      for (const h of [...corners, ...(small ? [] : sides)]) {
        const hd = U.h('div.handle.' + h + (sides.includes(h) ? '.side' : ''), { 'data-h': h });
        if (short && sides.includes(h)) hd.style.height = Math.max(8, box.h * z - 16) + 'px';
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
    // keep it inside the visible canvas; with no room above (page head, top of the view) put it below the handles
    const wrap = E.scrollEl, sr = wrap.getBoundingClientRect(), fr = b.frame.getBoundingClientRect(), mr = m.getBoundingClientRect();
    const minTop = Math.max(fr.top, sr.top) + 4;
    if (mr.top < minTop) {
      const below = fr.top + (box.y + box.h) * z + 48;
      m.style.top = (below + mr.height <= sr.top + wrap.clientHeight - 4 ? below : minTop) - fr.top + 'px';
    }
    const dx = Math.max(sr.left + 4 - mr.left, Math.min(0, sr.left + wrap.clientWidth - 4 - mr.right));
    if (dx) m.style.left = (box.x + box.w / 2) * z + dx + 'px';
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
    // outline the element itself (rotated like the selection box); lines by their drawn ends
    const line = el.type === 'line', b = line ? E.bbox(el) : el, z = E.zoom;
    Object.assign(E.hoverBox.style, { display: 'block', left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px', transform: line ? 'none' : `rotate(${el.rot || 0}deg)` });
  };
  E.onPointerDown = (e, i) => {
    if (e.pointerType === 'touch' && trackTouch(e) > 1) return;
    if (e.button === 2) {
      const id = hitId(e, i);
      if (i !== E.pi) E.setPage(i, false);
      if (id && !E.sel.includes(id)) E.select(groupMembers(E.byId(id)));
      return;
    }
    if (e.button !== 0) return;
    if (e.target.closest('.handle,.rot-handle,.move-handle,.mini-menu,.comment-pin,.ruler,.user-guide')) return;
    // hit-test first: finishing a text edit re-renders the page and detaches e.target
    const id = hitId(e, i);
    if (i !== E.pi) E.setPage(i, false);
    if (E.editingId) E.finishText();
    if (E.tool === 'draw') return startDraw(e, i);
    if (E.tool === 'comment') {
      const p = E.toPage(e, i);
      E.tool = null;
      A.EU.refreshTool();
      return A.EU.addComment(id ? E.byId(id) : null, p);
    }
    const el = id && E.byId(id);
    if (E.tool === 'motion') {
      if (el && !el.locked && E.canEdit()) return recordMotion(e, el);
      E.tool = null;
      A.EU.refreshTool();
    }
    if (!el) {
      // empty space inside a selected group's box drags the group (no member's box covers it);
      // inside an ad-hoc multi-selection it deselects and starts a marquee as anywhere else
      const sel = E.selEls(), grp = sel.length > 1 && sel.every((x) => x.groupId && x.groupId === sel[0].groupId);
      const box = !e.shiftKey && grp && E.unionBox(sel), p = box && E.toPage(e, i);
      if (p && p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) return startMove(e, i);
      if (!e.shiftKey) E.deselect();
      A.EU.onPageClick?.();
      return startMarquee(e, i);
    }
    // stay inside an entered group only while the selection is still in it
    const inGroup = el.groupId && E.enteredGroup === el.groupId && E.selEls().some((x) => x.groupId === el.groupId);
    const ids = inGroup ? [el.id] : groupMembers(el);
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

  // A drag driven by the pointer that started it; other pointers and a design closed mid-drag are ignored.
  let active = null;
  function session(e0, onMove, onUp) {
    if (e0.pointerType === 'touch' && trackTouch(e0) > 1) return;
    const d = E.d, id = e0.pointerId, page = E.page(), objs = [...page.elements], saved = JSON.stringify(objs), sel0 = E.sel;
    const end = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      E.dragging = false;
      active = null;
    };
    const move = (ev) => ev.pointerId === id && E.d === d && onMove(ev);
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      end();
      if (onUp && E.d === d) onUp(ev);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    // cancelling (a second finger came down) puts the page back as it was, without an undo step
    active = {
      cancel: () => {
        end();
        JSON.parse(saved).forEach((s, k) => { const o = objs[k]; for (const key in o) delete o[key]; Object.assign(o, s); });
        page.elements = objs;
        E.renderPage(E.pi);
        E.select(sel0.filter((x) => E.byId(x)));
      },
    };
  }

  // Touch: a second finger cancels the running drag and pinch-zooms / pans the canvas (.page-frame has touch-action: none).
  const touches = new Map();
  function trackTouch(e) {
    const id = e.pointerId;
    if (touches.has(id)) return touches.size;
    // a primary touch starts a new gesture: anything still listed missed its pointerup
    if (e.isPrimary) for (const t of [...touches.values()]) t.off();
    const t = {
      x: e.clientX, y: e.clientY,
      off: () => {
        touches.delete(id);
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        removeEventListener('pointercancel', up, true);
      },
    };
    const move = (ev) => { if (ev.pointerId === id) { t.x = ev.clientX; t.y = ev.clientY; } };
    const up = (ev) => ev.pointerId === id && t.off();
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
    touches.set(id, t);
    if (touches.size === 2) startPinch();
    return touches.size;
  }
  function startPinch() {
    active?.cancel();
    const wrap = E.scrollEl;
    const mid = () => {
      const [p, q] = [...touches.values()];
      return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(p.x - q.x, p.y - q.y) || 1 };
    };
    const last = mid();
    E.dragging = true;
    const move = (ev) => {
      if (!touches.has(ev.pointerId) || touches.size !== 2 || !E.d) return;
      const m = mid();
      // zoom about the previous midpoint, then pan by how far the midpoint moved
      if (Math.abs(m.d / last.d - 1) > 0.02) { E.setZoom(E.zoom * (m.d / last.d), last); last.d = m.d; }
      wrap.scrollLeft += last.x - m.x;
      wrap.scrollTop += last.y - m.y;
      last.x = m.x; last.y = m.y;
    };
    const end = () => {
      if (touches.size > 1) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      E.dragging = false;
      if (E.d) E.drawOverlay();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }

  // Move with smart guides. Alt/Option-drag copies.
  function startMove(e, i) {
    if (E.page().locked) return;
    let els = E.selEls();
    if (els.some((x) => x.locked)) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false, copied = false;
    let orig = [];
    const box0 = E.unionBox(els);
    session(
      e,
      (ev) => {
        const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
        if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
        if (!started) {
          started = true;
          E.dragging = true;
          // connectors move from where they are drawn, not from stale stored ends
          els.forEach((x) => E.bakeEnds(x));
          if (ev.altKey && !copied) {
            copied = true;
            const clones = M.cloneElements(els, 0, 0);
            E.page().elements.push(...clones);
            E.sel = clones.map((c) => c.id);
            els = clones;
          }
          orig = els.map((el) => ({ el, x: el.x, y: el.y, p1: el.p1 && { ...el.p1 }, p2: el.p2 && { ...el.p2 } }));
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
        E.changed();
        if (copied) A.EU.onSelectionChange?.();
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
      e,
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
  // handles preventDefault their pointerdown, so a typed panel value is committed here, before the drag starts from it
  function startResize(e, h) {
    e.stopPropagation();
    e.preventDefault();
    commitField();
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
      // the opposite side stays put; text width handles also keep its top edge (the height follows the wrap)
      const vy = hy || (el.type === 'text' ? 1 : 0);
      const ax = cx + cos * (-hx * o.w / 2) - sin * (-vy * o.h / 2);
      const ay = cy + sin * (-hx * o.w / 2) + cos * (-vy * o.h / 2);
      const sx = e.clientX, sy = e.clientY;
      session(
        e,
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
            // side handles crop the image (a flipped picture is cropped on its mirrored side)
            const c = { ...o.crop };
            const pxPerX = o.w / c.w, pxPerY = o.h / c.h;
            const fx = el.flipX ? -hx : hx, fy = el.flipY ? -hy : hy;
            if (fx === 1) { c.w = U.clamp(nw / pxPerX, 0.02, 1 - c.x); nw = c.w * pxPerX; }
            if (fx === -1) { const right = c.x + c.w; c.w = U.clamp(nw / pxPerX, 0.02, right); c.x = right - c.w; nw = c.w * pxPerX; }
            if (fy === 1) { c.h = U.clamp(nh / pxPerY, 0.02, 1 - c.y); nh = c.h * pxPerY; }
            if (fy === -1) { const bottom = c.y + c.h; c.h = U.clamp(nh / pxPerY, 0.02, bottom); c.y = bottom - c.h; nh = c.h * pxPerY; }
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
          const ncx = ax + cos * (hx * nw / 2) - sin * (vy * nh / 2);
          const ncy = ay + sin * (hx * nw / 2) + cos * (vy * nh / 2);
          el.w = nw;
          el.h = nh;
          el.x = ncx - nw / 2;
          el.y = ncy - nh / 2;
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
        e,
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
    commitField();
    const el = E.selEls()[0];
    if (!el) return;
    const r = E.blocks[E.pi].svg.getBoundingClientRect();
    const c = { x: r.left + (el.x + el.w / 2) * E.zoom, y: r.top + (el.y + el.h / 2) * E.zoom };
    const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    const r0 = el.rot || 0;
    E.dragging = true;
    session(
      e,
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
  const inBox = (p, o) => {
    const t = (-(o.rot || 0) * Math.PI) / 180, dx = p.x - o.x - o.w / 2, dy = p.y - o.y - o.h / 2;
    return Math.abs(dx * Math.cos(t) - dy * Math.sin(t)) <= o.w / 2 && Math.abs(dx * Math.sin(t) + dy * Math.cos(t)) <= o.h / 2;
  };
  function startLineEnd(e, el, k) {
    e.stopPropagation();
    e.preventDefault();
    commitField();
    if (el.locked) return;
    E.dragging = true;
    const ck = k === 'p1' ? 'c1' : 'c2';
    session(
      e,
      (ev) => {
        const p = E.toPage(ev);
        // snap to the topmost visible shape under the pointer to form a connector
        const target = [...E.els()].reverse().find((o) => o.id !== el.id && o.type !== 'line' && !o.hidden && inBox(p, o));
        if (target) el[ck] = target.id;
        else delete el[ck];
        let q = { x: p.x, y: p.y };
        if (ev.shiftKey) {
          const other = R.lineEnds(el, E.page())[k === 'p1' ? 'p2' : 'p1'];
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
        e,
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
    const sync = () => {
      const pad = el.strokeWidth / 2;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x1 = Math.min(...xs) - pad, y1 = Math.min(...ys) - pad, x2 = Math.max(...xs) + pad, y2 = Math.max(...ys) + pad;
      el.x = x1; el.y = y1; el.w = Math.max(1, x2 - x1); el.h = Math.max(1, y2 - y1);
      el.pts = pts.map((p) => [U.round((p.x - x1) / el.w, 4), U.round((p.y - y1) / el.h, 4)]);
    };
    session(
      e,
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
    // added after the session starts, so cancelling the session drops the stroke
    E.page().elements.push(el);
  }
  function nearStroke(el, p) {
    return (el.pts || []).some(([x, y]) => Math.hypot(el.x + x * el.w - p.x, el.y + y * el.h - p.y) < Math.max(10, el.strokeWidth));
  }

  // ---------- motion path recording ("create an animation") ----------
  function recordMotion(e, el) {
    const sx = e.clientX, sy = e.clientY, t0 = performance.now();
    const ox = el.x, oy = el.y;
    // a line is drawn from its ends, so those move (detached) while recording and are put back after
    const line = el.type === 'line' && { p1: el.p1, p2: el.p2, c1: el.c1, c2: el.c2, ends: U.clone(R.lineEnds(el, E.page())) };
    const pts = [{ t: 0, dx: 0, dy: 0 }];
    E.dragging = true;
    session(
      e,
      (ev) => {
        const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
        pts.push({ t: U.round((performance.now() - t0) / 1000, 3), dx: U.round(dx, 1), dy: U.round(dy, 1) });
        el.x = ox + dx;
        el.y = oy + dy;
        if (line) {
          delete el.c1; delete el.c2;
          el.p1 = { x: line.ends.p1.x + dx, y: line.ends.p1.y + dy };
          el.p2 = { x: line.ends.p2.x + dx, y: line.ends.p2.y + dy };
        }
        E.renderPage(E.pi);
      },
      () => {
        el.x = ox;
        el.y = oy;
        if (line) {
          el.p1 = line.p1; el.p2 = line.p2;
          if (line.c1) el.c1 = line.c1;
          if (line.c2) el.c2 = line.c2;
        }
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
    if (!E.editEls().length) return;
    E.tool = 'motion';
    A.EU.refreshTool();
    U.toast('Drag the element along the path you want it to follow');
  };

  // ---------- text editing ----------
  const fitText = R.fitText;
  // a Word-style line break (\v) or page break (\f) starts a new line; other control characters are dropped
  const cleanText = (t) => t.replace(/\r\n?|[\v\f\u2028\u2029]/g, '\n').replace(/[\0-\x08\x0e-\x1f]/g, '');
  E.editText = (el) => {
    if (el.locked || !E.canEdit()) return;
    if (E.editingId) E.finishText();
    if (el.type === 'shape' && !el.text) {
      // contrast with the fill, or with the page when the shape has no solid fill
      const base = [el.asset ? '#888888' : el.fill, E.page().bg?.color].map((c) => String(c).replace(/^grad:/, '').split(':')[0]).find(U.isColor) || '#ffffff';
      Object.assign(el, { ...M.textDefaults, color: U.luminance(base) > 0.6 ? '#1a1a1a' : '#ffffff', align: 'center', size: Math.max(16, Math.round(Math.min(el.w, el.h) / 6)), text: '' });
    }
    E.editingId = el.id;
    E.editEl = el;
    E.sel = [el.id];
    E.renderPage(E.pi);
    E.drawOverlay();
    const b = E.blocks[E.pi];
    const shape = el.type === 'shape';
    const px = shape ? Math.min(el.w * 0.1, 24) : 0;
    const ta = U.h('textarea.text-edit', { spellcheck: 'true' });
    ta.value = el.text || '';
    const style = () => {
      const z = E.zoom;
      const lines = R.layoutText(el, el.w - px * 2);
      // list text starts after its bullet or number; shape text is centred vertically, even when it overflows
      const pw = el.list === 'bullet' || el.list === 'number' ? U.measure(el.list === 'number' ? '1.  ' : '•  ', lines.font, lines.ls) : 0;
      const top = shape ? (el.h - lines.height) / 2 : 0;
      Object.assign(ta.style, {
        left: (el.x + px + pw) * z + 'px',
        top: (el.y + top) * z + 'px',
        width: (el.w - px * 2 - pw) * z + 'px',
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
        transformOrigin: `${(el.w / 2 - px - pw) * z}px ${(el.h / 2 - top) * z}px`,
        zIndex: 3,
      });
    };
    style();
    ta.addEventListener('input', () => {
      const t = cleanText(ta.value);
      if (t !== ta.value) { const at = Math.max(0, ta.selectionEnd - (ta.value.length - t.length)); ta.value = t; ta.setSelectionRange(at, at); }
      el.text = t;
      if (el.type === 'text') fitText(el);
      E.drawOverlay();
      E.scheduleSave();
    });
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      const mod = ev.ctrlKey || ev.metaKey, k = ev.key?.toLowerCase();
      if (ev.key === 'Escape') E.finishText();
      if (mod && k === 's') {
        ev.preventDefault();
        saveKey();
      }
      if (mod && ['b', 'i', 'u'].includes(k)) {
        ev.preventDefault();
        const key = { b: 'bold', i: 'italic', u: 'underline' }[k];
        el[key] = !el[key];
        if (el.type === 'text') fitText(el);
        E.changed();
      }
    });
    ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    // the native menu (spelling, cut/copy/paste of text), not the element menu
    ta.addEventListener('contextmenu', (ev) => ev.stopPropagation());
    // moving to the toolbar, a panel, a popover or the zoom bar keeps editing (their redraw refocuses the text)
    ta.addEventListener('focusout', (ev) => {
      if (!ev.relatedTarget || ev.relatedTarget.closest('.ed-toolbar, .ed-panel, .ed-bottom, .popover')) return;
      setTimeout(() => E.textArea === ta && document.activeElement !== ta && E.finishText());
    });
    E.textArea = ta;
    E.textAreaStyle = style;
    b.overlay.appendChild(ta);
    ta.focus();
    if (el.text === 'Text' || el.text === 'Add a heading' || el.text === 'Add a subheading' || el.text === 'Add a little bit of body text' || el.text === 'Add an idea') ta.select();
    else ta.setSelectionRange(ta.value.length, ta.value.length);
    A.EU.refreshToolbar();
  };
  // Overlay redraws (toolbar, zoom, resize, undo) keep the live editor on its page, restyled and focused.
  function keepTextArea() {
    const ta = E.textArea;
    if (!ta) return;
    const i = E.d.pages.findIndex((p) => p.elements.includes(E.editEl)), b = E.blocks[i];
    if (!b) {
      // the edited element is gone (deleted, or the document was replaced): end the session and draw what was left out
      E.editingId = E.editEl = E.textArea = E.textAreaStyle = null;
      ta.remove();
      for (const k in E.blocks) E.renderPage(+k);
      return;
    }
    if (ta.parentNode !== b.overlay) b.overlay.appendChild(ta);
    E.textAreaStyle();
    const a = document.activeElement;
    if (a !== ta && (!a || a === document.body || (a.closest('.editor, .popover') && !a.matches('input, select, textarea')))) ta.focus({ preventScroll: true });
  }
  E.restyleText = () => E.textAreaStyle && E.textAreaStyle();
  E.finishText = () => {
    if (!E.editingId) return;
    commitField('.ed-toolbar, .ed-panel, .popover');
    const el = E.editEl, page = E.d.pages.find((p) => p.elements.includes(el));
    E.editingId = E.editEl = null;
    E.textArea?.remove();
    E.textArea = E.textAreaStyle = null;
    if (page && el.type === 'text' && !el.text.trim()) {
      page.elements = page.elements.filter((x) => x !== el);
      E.sel = E.sel.filter((id) => id !== el.id);
    } else if (page && el.type === 'text') fitText(el);
    if (page && page !== E.page()) E.renderPage(E.d.pages.indexOf(page));
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
  // Guard for every edit: false (with a hint) when the current page is locked.
  let lockHintT = 0;
  E.canEdit = () => {
    if (!E.page()?.locked) return true;
    if (Date.now() - lockHintT > 2500) U.toast('This page is locked – unlock it to edit');
    lockHintT = Date.now();
    return false;
  };
  // The selected elements an edit may change: none on a locked page and never a locked one (with a hint).
  E.editEls = () => {
    if (!E.canEdit()) return [];
    const els = E.selEls(), free = els.filter((e) => !e.locked);
    if (els.length && !free.length) {
      if (Date.now() - lockHintT > 2500) U.toast('Unlock the element to edit it');
      lockHintT = Date.now();
    }
    return free;
  };
  E.add = (els, { center = true, edit = false } = {}) => {
    if (!E.d || !E.canEdit()) return false;
    E.finishText();
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
    return true;
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
    return E.add(el) ? el : null;
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
    const els = E.selEls();
    if (!els.length || !E.canEdit()) return;
    const ids = new Set(els.filter((e) => !e.locked).map((e) => e.id));
    if (!ids.size) return U.toast('Unlock the element to delete it');
    E.page().elements = E.els().filter((e) => !ids.has(e.id));
    E.d.comments = (E.d.comments || []).filter((c) => !ids.has(c.elId));
    E.sel = [];
    E.changed();
  };
  E.duplicate = () => {
    if (!E.sel.length || !E.canEdit()) return;
    E.finishText();
    const els = E.selEls();
    if (!els.length) return;
    const clones = M.cloneElements(els, 20, 20, E.page());
    E.page().elements.push(...clones);
    E.sel = clones.map((c) => c.id);
    E.changed();
    A.EU.onSelectionChange?.();
  };
  // `native`: called from a copy/cut event, which puts the marker on the system clipboard itself.
  E.copy = (native = false) => {
    const els = E.selEls();
    if (!els.length) return false;
    E.clip = M.cloneElements(els, 0, 0, E.page());
    // until the user copies something else (or leaves the window), a paste here means these elements
    E.clipFresh = true;
    if (!native) navigator.clipboard?.writeText('atelier-elements').catch(() => {});
    return true;
  };
  addEventListener('blur', () => (E.clipFresh = false));
  E.paste = () => {
    if (!E.clip?.length || !E.canEdit()) return;
    E.finishText();
    const clones = M.cloneElements(E.clip, 24, 24);
    E.clip = clones.map((c) => U.clone(c));
    E.page().elements.push(...clones);
    E.sel = clones.map((c) => c.id);
    E.changed();
    A.EU.onSelectionChange?.();
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
    const els = E.editEls();
    if (!els.length) return;
    for (const el of els) {
      for (const k in E.styleClip) {
        if (['adj', 'duo'].includes(k) && el.type !== 'image') continue;
        if (['font', 'size', 'color', 'bold', 'italic', 'align', 'effect', 'lh', 'spacing', 'upper', 'underline', 'strike'].includes(k) && !(el.type === 'text' || (el.type === 'shape' && el.text))) continue;
        if (['fill', 'radius'].includes(k) && !['shape', 'icon'].includes(el.type)) continue;
        el[k] = U.clone(E.styleClip[k]);
      }
      if (el.type === 'text') fitText(el);
    }
    E.changed();
  };
  E.selectAll = () => E.select(E.els().filter((e) => !e.hidden).map((e) => e.id));
  E.group = () => {
    const els = E.selEls();
    if (els.length < 2 || E.editEls().length < els.length) return;
    const g = U.uid('g_');
    els.forEach((e) => (e.groupId = g));
    E.changed();
  };
  E.ungroup = () => {
    const els = E.editEls();
    if (!els.length) return;
    els.forEach((e) => delete e.groupId);
    E.enteredGroup = null;
    E.changed();
  };
  // 'Unlock' is shown when the page or any selected element is locked, so it unlocks those; otherwise it locks.
  E.toggleLock = () => {
    if (E.page().locked) {
      E.page().locked = false;
      return E.changed({ structure: true });
    }
    const els = E.selEls();
    const lock = !els.some((e) => e.locked);
    els.forEach((e) => (e.locked = lock));
    E.changed();
  };
  E.nudge = (dx, dy) => {
    const els = E.selEls().filter((e) => !e.locked);
    if (!els.length || !E.canEdit()) return;
    // a lone connector leaves its shapes, as when dragged
    if (els.length === 1) E.bakeEnds(els[0], true);
    for (const el of els) {
      el.x += dx;
      el.y += dy;
      if (el.p1) { el.p1.x += dx; el.p1.y += dy; el.p2.x += dx; el.p2.y += dy; }
    }
    E.changed({ commit: false });
    E.commitSoon();
  };
  E.order = (how) => {
    const ids = new Set(E.editEls().map((e) => e.id));
    if (!ids.size) return;
    const list = E.els();
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
    if (!els.length || !E.canEdit()) return;
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
    if (!E.canEdit()) return;
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
    if (!el || el.type !== 'image' || !E.editEls().includes(el)) return;
    E.page().bg ={ ...(E.page().bg || {}), asset: el.asset, adj: el.adj };
    E.page().elements = E.els().filter((e) => e !== el);
    E.sel = [];
    E.changed();
  };
  E.flip = (axis) => {
    const els = E.editEls();
    if (!els.length) return;
    for (const el of els) {
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
  // Fields that take typed text; sliders, checkboxes and buttons leave the shortcuts working.
  const typingIn = (el) => !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset', 'file'].includes(el.type)));
  E.onKey = (e) => {
    if (A.app.view !== 'editor' || !E.d) return;
    const ae = document.activeElement;
    const k = e.key?.toLowerCase() || '';
    const mod = e.ctrlKey || e.metaKey;
    // selects and sliders keep their own keys (arrows, type-ahead); the other shortcuts still work there
    const own = ae?.tagName === 'SELECT' ? !mod && !['delete', 'backspace', 'escape'].includes(k) : ae?.type === 'range' && k.startsWith('arrow');
    if (typingIn(ae) || own) return;
    if (document.querySelector('.modal-back') || A.Present?.active) return;
    const stop = () => e.preventDefault();
    // the text editor is open but lost focus (e.g. to a toolbar button): keys go back to the text
    if (E.editingId && !mod) {
      if (k === 'escape') E.finishText();
      else if (k !== 'tab' && !((k === 'enter' || k === ' ') && ae?.closest('button'))) E.textArea?.focus({ preventScroll: true });
      return;
    }
    if (mod) {
      if (k === 'z') { stop(); e.shiftKey ? E.redo() : E.undo(); }
      else if (k === 'y') { stop(); E.redo(); }
      else if (k === 'd') { stop(); E.duplicate(); }
      else if (k === 'g') { stop(); e.shiftKey ? E.ungroup() : E.group(); }
      else if (k === 'a') { stop(); E.selectAll(); }
      else if (k === 's') { stop(); saveKey(); }
      // Ctrl+C / Ctrl+X go on to the browser's copy/cut event (E.onCopyEvent), which marks the system clipboard;
      // copying here too covers browsers that fire no copy event without a text selection (Safari)
      else if (k === 'c') E.copy();
      else if (k === 'x' && E.copy()) { const ids = E.sel.join(); cutSeen = false; setTimeout(() => !cutSeen && E.sel.join() === ids && E.deleteSel()); }
      else if (k === 'b' || k === 'i' || k === 'u') {
        const els = E.selEls().filter((x) => !x.locked && (x.type === 'text' || (x.type === 'shape' && x.text)));
        if (els.length) {
          stop();
          if (!E.canEdit()) return;
          const key = { b: 'bold', i: 'italic', u: 'underline' }[k], v = !els[0][key];
          els.forEach((x) => { x[key] = v; if (x.type === 'text') fitText(x); });
          E.changed();
        }
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
  let cutSeen = false;
  E.onCopyEvent = (e) => {
    if (A.app.view !== 'editor' || !E.d) return;
    E.clipFresh = false;
    if (typingIn(document.activeElement) || document.querySelector('.modal-back') || !E.copy(true)) return;
    e.clipboardData.setData('text/plain', 'atelier-elements');
    e.preventDefault();
    if (e.type === 'cut') { cutSeen = true; E.deleteSel(); }
  };
  E.onPaste = async (e) => {
    if (A.app.view !== 'editor' || !E.d) return;
    if (typingIn(document.activeElement)) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    const text = e.clipboardData?.getData('text/plain') || '';
    e.preventDefault();
    if (E.clip && (E.clipFresh || text === 'atelier-elements' || (!text && !files.length))) return E.paste();
    if (files.length) {
      for (const f of files) E.addImageAsset(await S.addAsset(f, { name: f.name || 'pasted image' }));
      return;
    }
    // the marker without elements to go with it (another window, or after a reload) pastes nothing
    if (text && text !== 'atelier-elements') {
      if (E.styleClip && false) return;
      const el = M.newText({ text: cleanText(text).slice(0, 5000), w: E.d.width * 0.6, size: Math.max(12, Math.round(E.d.width / 30)) });
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
        if (!E.canEdit()) return;
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
      } else await A.app.importFile(f, { toEditor: true });
    }
    const tplData = e.dataTransfer?.getData('application/x-atelier');
    if (tplData) A.EU.dropItem(JSON.parse(tplData), e);
  };
})(window.A);
