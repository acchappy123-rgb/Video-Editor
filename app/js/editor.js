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
    E.editingId = E.editEl = E.textArea = E.textAreaStyle = E.enteredGroup = E.cropping = null;
    E.keyId = null;
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
    E.setSpace(false);
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
  // the zoom that shows the whole page
  E.fitZoom = () => {
    const wrap = E.scrollEl, pad = innerWidth < 700 ? 24 : 80;
    return U.clamp(Math.min((wrap.clientWidth - pad) / E.d.width, (wrap.clientHeight - pad - 40) / E.d.height), 0.05, 2);
  };
  E.fit = () => {
    const wrap = E.scrollEl;
    if (!wrap) return;
    const z = E.fitZoom();
    const b = E.blocks[E.pi];
    if (!b || !E.pagesEl?.contains(b.el)) { E.zoom = z; return A.EU.refreshZoom(); }
    // already showing pages: re-render and centre the current page
    zoomTo(z, () => {
      const r = b.el.getBoundingClientRect(), sr = wrap.getBoundingClientRect();
      wrap.scrollLeft += r.left + r.width / 2 - sr.left - wrap.clientWidth / 2;
      wrap.scrollTop += r.top + r.height / 2 - sr.top - wrap.clientHeight / 2;
    });
  };
  // Zoom so `box` (page units, on page i) fills the view with a margin, centred.
  E.zoomToBox = (box, i = E.pi) => {
    const wrap = E.scrollEl, b = E.blocks[i];
    if (!wrap || !b) return;
    const pad = innerWidth < 700 ? 24 : 64;
    const z = U.clamp(Math.min((wrap.clientWidth - pad * 2) / Math.max(box.w, 1), (wrap.clientHeight - pad * 2) / Math.max(box.h, 1)), 0.05, 8);
    zoomTo(z, () => {
      const r = b.svg.getBoundingClientRect(), sr = wrap.getBoundingClientRect();
      wrap.scrollLeft += r.left + (box.x + box.w / 2) * z - sr.left - wrap.clientWidth / 2;
      wrap.scrollTop += r.top + (box.y + box.h / 2) * z - sr.top - wrap.clientHeight / 2;
    });
  };
  E.zoomToSel = () => {
    const els = E.selEls();
    if (!els.length) return U.toast('Select something to zoom to it');
    E.zoomToBox(E.unionBox(els));
  };
  // The page's width fills the view (less the canvas padding), keeping the view's centre in place.
  E.fillWidth = () => {
    const wrap = E.scrollEl;
    if (!wrap || !E.blocks[E.pi]) return;
    const cs = getComputedStyle(E.pagesEl), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    // a vertical scrollbar that appears at the new zoom narrows the view, so measure once more
    for (let k = 0; k < 2; k++) E.setZoom((wrap.clientWidth - padX) / E.d.width);
    wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
  };

  // ---------- pages ----------
  E.setPage = (i, scroll = true) => {
    if (i < 0 || i >= E.d.pages.length) return;
    const changed = i !== E.pi, from = E.pi;
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
      if (scroll) showPage(i, from, true);
    }
    E.drawOverlay();
    A.EU.refreshToolbar();
    A.EU.refreshTimeline?.();
    A.EU.refreshPageInfo?.();
  };
  // Scroll a page that isn't wholly in view to where page `from` is on screen, so switching pages keeps the same
  // part of the page in view; with `from` out of view it scrolls as little as needed.
  function showPage(i, from, smooth) {
    const wrap = E.scrollEl, b = E.blocks[i], a = E.blocks[from];
    if (!wrap || !b) return;
    const top = wrap.getBoundingClientRect().top, bottom = top + wrap.clientHeight, br = b.el.getBoundingClientRect(), ar = a?.frame.getBoundingClientRect();
    const behavior = smooth ? 'smooth' : 'auto';
    if (i === from || !ar || ar.bottom < top || ar.top > bottom || (br.top >= top && br.bottom <= bottom)) return b.el.scrollIntoView({ block: 'nearest', behavior });
    wrap.scrollTo({ top: wrap.scrollTop + b.frame.getBoundingClientRect().top - ar.top, behavior });
  }
  E.addPage = (at = E.d.pages.length, page) => {
    E.finishText();
    const p = page || M.newPage({ bg: { color: E.page()?.bg?.color && !E.page().bg.asset ? E.page().bg.color : '#ffffff' } });
    E.d.pages.splice(at, 0, p);
    E.pi = at;
    E.sel = [];
    E.changed({ structure: true });
    // a strip shows the new page in the place of the last one (pages there share one view)
    if (E.layout() !== 'strip') setTimeout(() => E.blocks[at]?.el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
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
  // `key`: the key object (E.keyUnit) after the change; a new selection has none, an addition keeps it
  E.select = (ids, add = false, key) => {
    commitField();
    E.flushCommit();
    E.sel = add ? [...new Set([...E.sel, ...ids])] : ids;
    E.keyId = key !== undefined ? key : add ? E.keyId : null;
    // selecting anything else ends a crop
    if (E.cropping && E.sel.join() !== (E.cropping.id || '')) E.endCrop();
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
    // the Position panel's fields follow drags, nudges and undo
    A.EU.syncPosition?.();
    const b = E.blocks[E.pi];
    if (!b) return;
    E.hoverBox = U.h('div.hover-box');
    b.overlay.appendChild(E.hoverBox);
    if (E.cropping && drawCrop(b)) return;
    const els = E.selEls();
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
    // several elements being rotated show the box they started in, turned with them
    const turn = !single && E.dragging && E.rotFrame;
    const box = single ? { x: single.x, y: single.y, w: single.w, h: single.h } : turn ? turn.box : E.unionBox(els);
    const rot = single ? single.rot || 0 : turn ? turn.deg : 0;
    const sb = U.h('div.sel-box' + (isGroup ? '.group' : '') + (locked ? '.locked' : ''), {
      style: { left: box.x * z + 'px', top: box.y * z + 'px', width: box.w * z + 'px', height: box.h * z + 'px', transform: `rotate(${rot}deg)` },
    });
    if (!single) for (const e of els) { const bb = E.bbox(e); b.overlay.appendChild(U.h('div.sel-member', { style: { left: bb.x * z + 'px', top: bb.y * z + 'px', width: bb.w * z + 'px', height: bb.h * z + 'px' } })); }
    const key = !single && E.keyUnit();
    if (key) { const kb = key.box; b.overlay.appendChild(U.h('div.sel-key', { style: { left: kb.x * z - 3 + 'px', top: kb.y * z - 3 + 'px', width: kb.w * z + 6 + 'px', height: kb.h * z + 6 + 'px' } })); }
    if (!locked && E.editingId == null) {
      const t = single?.type;
      const corners = ['nw', 'ne', 'sw', 'se'];
      let sides = ['n', 's', 'e', 'w'];
      if (t === 'text') sides = single.curve ? [] : ['e', 'w'];
      else if (t === 'emoji') sides = [];
      // text only has width handles, so a short line keeps them (shortened to clear the corner dots)
      const short = box.h * z < 40, small = box.w * z < 40 || (short && t !== 'text');
      for (const h of [...corners, ...(small ? [] : sides)]) {
        const hd = U.h('div.handle.' + h + (sides.includes(h) ? '.side' : ''), { 'data-h': h });
        if (short && sides.includes(h)) hd.style.height = Math.max(8, box.h * z - 16) + 'px';
        hd.addEventListener('pointerdown', (e) => startResize(e, h));
        sb.appendChild(hd);
      }
      const rh = U.h('div.rot-handle', { title: 'Rotate' }, U.ic('restore', 14));
      rh.addEventListener('pointerdown', startRotate);
      const mh = U.h('div.move-handle', { title: 'Move' }, U.ic('fullscreen', 14));
      mh.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        startMove(e, E.pi);
      });
      sb.appendChild(U.h('div.rot-wrap', rh, mh));
    }
    b.overlay.appendChild(sb);
    miniMenu(b, E.unionBox(els), locked);
  };
  function miniMenu(b, box, locked) {
    if (E.editingId || E.dragging) return;
    const els = E.selEls();
    const btn = (icon, title, fn, txt) => U.h('button.mini-btn', { title, onpointerdown: (e) => e.stopPropagation(), onclick: fn }, txt ? U.h('span.mini-txt', txt) : U.ic(icon, 16));
    const m = U.h(
      'div.mini-menu',
      els.length === 1 && els[0].sticky ? btn('vote', 'Vote', () => { els[0].votes = (els[0].votes || 0) + 1; E.changed(); }) : null,
      els.length > 1 && !els.every((e) => e.groupId && e.groupId === els[0].groupId) ? btn('group', 'Group (Ctrl+G)', () => E.group(), 'Group') : null,
      els.length > 1 && els.every((e) => e.groupId && e.groupId === els[0].groupId) ? btn('group', 'Ungroup (Ctrl+Shift+G)', () => E.ungroup(), 'Ungroup') : null,
      btn('comment', 'Comment', () => A.EU.addComment(els[0])),
      btn(locked ? 'lock' : 'unlock', locked ? 'Unlock' : 'Lock', () => E.toggleLock()),
      btn('copy', 'Duplicate (Ctrl+D)', () => E.duplicate()),
      btn('trash', 'Delete', () => E.deleteSel()),
      btn('more', 'More', (e) => E.onContext(e, E.pi, true))
    );
    floatMenu(b, m, box);
  }
  // A floating menu centred above `box`, kept inside the visible canvas; with no room above (page head, top of the
  // view) it goes below the handles.
  function floatMenu(b, m, box) {
    const z = E.zoom;
    Object.assign(m.style, { left: (box.x + box.w / 2) * z + 'px', top: Math.max(-44, box.y * z - 50) + 'px' });
    b.overlay.appendChild(m);
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
    if (E.dragging || E.spaceDown || i !== E.pi || !E.hoverBox) return;
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
      E.endCrop();
      if (id && !E.sel.includes(id)) E.select(groupMembers(E.byId(id)));
      return;
    }
    if (e.button !== 0) return;
    if (e.target.closest('.handle,.rot-handle,.move-handle,.mini-menu,.comment-pin,.ruler,.user-guide,.crop-layer')) return;
    // hit-test first: finishing a text edit or a crop re-renders the page and detaches e.target
    const id = hitId(e, i);
    if (i !== E.pi) E.setPage(i, false);
    if (E.editingId || E.cropping) E.finishText();
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
      const clear = () => { if (!e.shiftKey) E.deselect(); A.EU.onPageClick?.(); };
      // a finger pans a zoomed-in page and a tap deselects; held still, it draws a selection box instead
      if (e.pointerType === 'touch' && E.touchPans()) {
        panFinger = e.pointerId;
        return E.startPan(e, {
          onTap: clear,
          onHold: () => { clear(); holdRing(e, i); startMarquee(e, i); },
          onPan: () => { if (!panTip) U.toast('Tip: press and hold, or turn on Select, to drag a selection box'); panTip = true; },
        });
      }
      clear();
      return startMarquee(e, i);
    }
    // stay inside an entered group only while the selection is still in it
    const inGroup = el.groupId && E.enteredGroup === el.groupId && E.selEls().some((x) => x.groupId === el.groupId);
    const ids = inGroup ? [el.id] : groupMembers(el);
    // the element Shift-clicked into the selection becomes its key object
    if (e.shiftKey) {
      const has = ids.every((x) => E.sel.includes(x));
      if (has) E.select(E.sel.filter((x) => !ids.includes(x)), false, ids.includes(E.keyId) ? null : E.keyId);
      else E.select(ids, true, el.id);
      return;
    }
    if (!ids.every((x) => E.sel.includes(x))) {
      E.enteredGroup = null;
      E.select(ids);
    }
    startMove(e, i);
  };
  E.onDblClick = (e, i) => {
    if (E.spaceDown) return;
    if (e.target.closest('.crop-bar')) return;
    // a double-click on the photo being cropped finishes the crop
    if (E.cropping) return e.target.closest('.crop-layer') && E.endCrop();
    const id = hitId(e, i);
    const el = id && E.byId(id);
    if (E.page().locked) return;
    // on the page's background photo it adjusts that photo (not while drawing)
    if (!el) return !id && !E.tool && E.page().bg?.asset && E.blocks[i]?.svg.contains(e.target) && E.startCrop('bg');
    if (el.locked) return;
    if (el.groupId && E.enteredGroup !== el.groupId) {
      E.enteredGroup = el.groupId;
      E.select([el.id]);
    }
    // a photo or a filled frame is cropped; an empty frame asks for a photo
    if (el.type === 'image' || E.isPhotoFrame(el)) {
      if (!E.tool) E.startCrop(el);
    } else if (el.type === 'shape' && el.frame) A.EU.openPanel('uploads', 'frame');
    else if (el.type === 'text' || el.type === 'shape') E.editText(el);
    else if (el.type === 'table') A.EU.openPanel('table');
    else if (el.type === 'chart') A.EU.openPanel('chart');
  };
  E.onContext = (e, i, fromButton) => {
    e.preventDefault();
    // a finger held on an empty zoomed-in page draws a selection box, not the long-press menu
    if (!fromButton && touches.has(panFinger)) return;
    A.EU.contextMenu(fromButton ? e.currentTarget : { x: e.clientX, y: e.clientY });
  };

  // A drag driven by the pointer that started it; other pointers and a design closed mid-drag are ignored.
  // Returns a handle whose end() drops the drag without onUp (undefined for a second finger).
  let active = null;
  function session(e0, onMove, onUp, onCancel) {
    if (e0.pointerType === 'touch' && trackTouch(e0) > 1) return;
    const d = E.d, id = e0.pointerId, page = E.page(), objs = [...page.elements], saved = JSON.stringify(objs), sel0 = E.sel;
    const end = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      E.dragging = false;
      E.rotFrame = active = null;
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
      end,
      cancel: () => {
        end();
        JSON.parse(saved).forEach((s, k) => { const o = objs[k]; for (const key in o) delete o[key]; Object.assign(o, s); });
        page.elements = objs;
        E.renderPage(E.pi);
        E.select(sel0.filter((x) => E.byId(x)));
        onCancel?.();
      },
    };
    return active;
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

  // ---------- panning ----------
  // Scrolls by fractions of a pixel without the browser's rounding adding up; a scroll from elsewhere (a zoom) is taken over.
  const scroller = () => {
    const wrap = E.scrollEl, pos = { l: wrap.scrollLeft, t: wrap.scrollTop };
    return (dx, dy) => {
      if (Math.abs(wrap.scrollLeft - pos.l) > 1) pos.l = wrap.scrollLeft;
      if (Math.abs(wrap.scrollTop - pos.t) > 1) pos.t = wrap.scrollTop;
      pos.l = U.clamp(pos.l + dx, 0, wrap.scrollWidth - wrap.clientWidth);
      pos.t = U.clamp(pos.t + dy, 0, wrap.scrollHeight - wrap.clientHeight);
      wrap.scrollLeft = pos.l;
      wrap.scrollTop = pos.t;
    };
  };
  let glide = 0;
  E.stopGlide = () => cancelAnimationFrame(glide);
  // Drag the canvas: Space or middle-button drag, or a finger on an empty page. A flicked finger glides on;
  // a press that doesn't move calls onTap, and one held still calls onHold, which takes the gesture over.
  E.startPan = (e, { onTap, onHold, onPan } = {}) => {
    E.stopGlide();
    const touch = e.pointerType === 'touch', by = scroller();
    let last = { x: e.clientX, y: e.clientY, t: e.timeStamp }, v = { x: 0, y: 0 }, moved = false, s = null;
    const done = () => { clearTimeout(hold); document.body.classList.remove('panning'); };
    const hold = onHold && setTimeout(() => { if (!moved && s && active === s) { s.end(); done(); onHold(); } }, 450);
    document.body.classList.add('panning');
    s = session(e, (ev) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < (touch ? 8 : 3)) return;
      if (!moved) { moved = true; E.dragging = true; clearTimeout(hold); onPan?.(); }
      const dt = Math.max(1, ev.timeStamp - last.t), dx = last.x - ev.clientX, dy = last.y - ev.clientY;
      v = { x: v.x * 0.3 + (dx / dt) * 0.7, y: v.y * 0.3 + (dy / dt) * 0.7 };
      by(dx, dy);
      last = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
    }, (ev) => {
      done();
      // a middle-button release would paste the X11 selection onto the canvas (Linux)
      if (e.button === 1) ev.preventDefault();
      const lifted = ev.type === 'pointerup';
      if (!moved) return lifted && onTap?.(ev);
      E.drawOverlay();
      // a finger lifted mid-flick keeps the canvas moving, slowing down
      if (!touch || !lifted || ev.timeStamp - last.t > 80 || Math.hypot(v.x, v.y) < 0.3) return;
      const d = E.d, glideBy = scroller();
      let t0 = performance.now();
      const step = (t) => {
        const dt = Math.min(40, t - t0), k = Math.pow(0.996, dt);
        t0 = t;
        v = { x: v.x * k, y: v.y * k };
        if (E.d !== d || !E.scrollEl?.isConnected || Math.hypot(v.x, v.y) < 0.03) return;
        glideBy(v.x * dt, v.y * dt);
        glide = requestAnimationFrame(step);
      };
      glide = requestAnimationFrame(step);
    }, done);
    if (!s) done();
  };
  // A finger pans a page zoomed in past fit instead of drawing a selection box (unless Select mode is on).
  E.touchPans = () => !E.selectMode && E.zoom > E.fitZoom() * 1.01;
  let panTip = false, panFinger = null;
  // Capture-phase pointerdown anywhere on the canvas: Space or the middle button pans (over elements and handles too),
  // and a double tap on empty canvas zooms to fit.
  let lastTap = null;
  E.onCanvasDown = (e) => {
    E.stopGlide();
    if (!E.d) return;
    if (e.button === 1 || (e.button === 0 && E.spaceDown && e.pointerType !== 'touch')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return E.startPan(e);
    }
    if (e.pointerType !== 'touch' || !e.isPrimary || E.tool) return (lastTap = null);
    const empty = !e.target.closest('[data-id], .handle, .rot-handle, .move-handle, .mini-menu, .comment-pin, .ruler, .user-guide, .page-head, button, input, textarea');
    const id = e.pointerId, x = e.clientX, y = e.clientY, t = e.timeStamp;
    let multi = false;
    const other = (ev) => ev.pointerId !== id && (multi = true);
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      removeEventListener('pointerdown', other, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      const tap = empty && !multi && ev.type === 'pointerup' && ev.timeStamp - t < 300 && Math.hypot(ev.clientX - x, ev.clientY - y) < 10;
      if (tap && lastTap && t - lastTap.t < 350 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) {
        lastTap = null;
        if (E.d) E.fit();
      } else lastTap = tap ? { x, y, t: ev.timeStamp } : null;
    };
    addEventListener('pointerdown', other, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  };
  // Hold Space to pan with the mouse (a hand cursor shows while it is held).
  E.setSpace = (on) => {
    E.spaceDown = on;
    document.body.classList.toggle('tool-pan', on);
    if (on && E.hoverBox) E.hoverBox.style.display = 'none';
  };
  E.onKeyUp = (e) => {
    if (!E.spaceDown || (e && e.code !== 'Space' && e.key !== ' ')) return;
    e?.preventDefault();
    E.setSpace(false);
  };

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
        const snap = !ev.ctrlKey && !ev.metaKey ? smartSnap({ x: box0.x + dx, y: box0.y + dy, w: box0.w, h: box0.h }, snapSkip(E.sel), { spacing: true }) : noSnap();
        mx += snap.dx;
        my += snap.dy;
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
        showGuides(snap, { x: box0.x + mx, y: box0.y + my, w: box0.w, h: box0.h });
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

  // Snapping (to page edges and centre, other elements, guides and equal spacing) is an app setting; Ctrl/Cmd skips it for one drag.
  E.snapOn = () => A.app.settings.snap !== false;
  E.toggleSnap = () => {
    A.app.settings.snap = !E.snapOn();
    A.app.saveSettings();
    A.EU.refreshBottom?.();
    U.toast(E.snapOn() ? 'Snapping on' : 'Snapping off');
  };
  const noSnap = () => ({ x: null, y: null, dx: 0, dy: 0, guides: [], gaps: [] });
  // what a drag doesn't snap to: the elements it moves and the connectors that follow them
  const snapSkip = (ids) => new Set([...ids, ...E.els().filter((x) => ids.includes(x.c1) || ids.includes(x.c2)).map((x) => x.id)]);
  // Snap a moving box to page edges/centre, other elements and user guides. `edges` lists the box edges that move, per
  // axis, as { v: page position, k: how far the edge moves per unit of change, dim } (default: a moved box's sides and
  // centre); `spacing` also matches the gaps between neighbours. Gives the best match per axis ({ d, v, k, dim, b }).
  function smartSnap(box, exclude, { edges, spacing = false } = {}) {
    const res = noSnap();
    if (!E.snapOn()) return res;
    const th = 6 / E.zoom;
    const W = E.d.width, H = E.d.height;
    const xs = [{ v: 0 }, { v: W / 2, c: 1 }, { v: W }], ys = [{ v: 0 }, { v: H / 2, c: 1 }, { v: H }];
    for (const g of E.d.guides || []) (g.axis === 'x' ? xs : ys).push({ v: g.pos });
    const others = [];
    for (const el of E.els()) {
      if (exclude.has(el.id) || el.hidden) continue;
      const b = E.bbox(el);
      others.push(b);
      xs.push({ v: b.x, b }, { v: b.x + b.w / 2, b }, { v: b.x + b.w, b });
      ys.push({ v: b.y, b }, { v: b.y + b.h / 2, b }, { v: b.y + b.h, b });
    }
    const side = (p, s) => [box[p], box[p] + box[s] / 2, box[p] + box[s]].map((v) => ({ v, k: 1 }));
    edges = edges || { x: side('x', 'w'), y: side('y', 'h') };
    const best = (cands, es) => {
      let r = null;
      for (const c of cands)
        for (const e of es) {
          const d = c.v - e.v;
          if (Math.abs(d) <= th && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, v: c.v, b: c.b, k: e.k, dim: e.dim };
        }
      return r;
    };
    for (const a of ['x', 'y']) {
      let m = best(a === 'x' ? xs : ys, edges[a] || []);
      const g = spacing && spaced(a, box, others, th);
      if (g && (!m || Math.abs(g.d) < Math.abs(m.d))) m = g;
      if (!m) continue;
      res[a] = m;
      res['d' + a] = m.d;
      if (m.gaps) res.gaps.push(...m.gaps);
      else res.guides.push({ axis: a, v: m.v, b: m.b });
    }
    return res;
  }
  // Equal spacing along axis `a`: the moving box's gap to its nearest neighbour in the same row (or column) matches a
  // gap between two other neighbours there, or the box sits midway between its two neighbours.
  function spaced(a, box, others, th) {
    const [p, s, q, t] = a === 'x' ? ['x', 'w', 'y', 'h'] : ['y', 'h', 'x', 'w'];
    const end = (b) => b[p] + b[s];
    const row = others.filter((b) => b[q] < box[q] + box[t] && b[q] + b[t] > box[q]);
    // the element starting first after b ends (an element spanning the row, like a background, has none)
    const after = (b, from = end(b)) => row.reduce((n, o) => (o[p] >= from && (!n || o[p] < n[p]) ? o : n), null);
    let prev = null;
    for (const b of row) if (end(b) <= box[p] + th && (!prev || end(b) > end(prev))) prev = b;
    const next = after(box, end(box) - th);
    const cands = [];
    for (const m of row) {
      const n = after(m), g = n && n[p] - end(m);
      // a gap the box is in doesn't count
      if (!n || g < 0.5 || (end(m) < end(box) && n[p] > box[p])) continue;
      if (prev) cands.push({ v: end(prev) + g, gaps: [[m, n], [prev, null]] });
      if (next) cands.push({ v: next[p] - g - box[s], gaps: [[m, n], [null, next]] });
    }
    if (prev && next && next[p] - end(prev) > box[s]) cands.push({ v: (end(prev) + next[p] - box[s]) / 2, gaps: [[prev, null], [null, next]] });
    let r = null;
    for (const c of cands) {
      const d = c.v - box[p];
      if (Math.abs(d) <= th && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, k: 1, gaps: c.gaps.map(([m, n]) => ({ axis: a, a: m, b: n })) };
    }
    return r;
  }
  // Draws a snap's guides and equal-gap badges for the moved box.
  function showGuides({ guides, gaps = [] }, box) {
    const b = E.blocks[E.pi];
    const z = E.zoom;
    for (const g of gaps) {
      // null stands for the moved box
      const [p, s, q, t] = g.axis === 'x' ? ['x', 'w', 'y', 'h'] : ['y', 'h', 'x', 'w'];
      const m = g.a || box, n = g.b || box, from = m[p] + m[s], to = n[p];
      const lo = Math.max(m[q], n[q]), hi = Math.min(m[q] + m[t], n[q] + n[t]), mid = lo < hi ? (lo + hi) / 2 : (m[q] + m[t] / 2 + n[q] + n[t] / 2) / 2;
      const at = (u, v) => (g.axis === 'x' ? { left: u * z + 'px', top: v * z + 'px' } : { left: v * z + 'px', top: u * z + 'px' });
      b.overlay.appendChild(U.h('div.gap-line.' + g.axis, { style: { ...at(from, mid), [g.axis === 'x' ? 'width' : 'height']: (to - from) * z + 'px' } }));
      b.overlay.appendChild(U.h('div.gap-label.eq', { style: at((from + to) / 2, mid) }, String(Math.round(to - from))));
    }
    for (const g of guides) {
      b.overlay.appendChild(U.h('div.snap-guide.' + g.axis, { style: g.axis === 'x' ? { left: g.v * z + 'px' } : { top: g.v * z + 'px' } }));
      // an equal-spacing badge already shows the gap across this guide
      if (g.b && !gaps.some((q) => q.axis !== g.axis)) {
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

  // shows where a held finger starts its selection box
  function holdRing(e, i) {
    const p = E.toPage(e, i), z = E.zoom;
    const ring = U.h('div.hold-ring', { style: { left: p.x * z + 'px', top: p.y * z + 'px' } });
    E.blocks[i].overlay.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
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
  // Resizes snap the sides that move (Ctrl/Cmd: not this time) and Alt/Option resizes from the centre.
  // Several elements scale as one box: corners keep its proportions unless Shift is held, sides stretch it.
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
    const sx = e.clientX, sy = e.clientY;
    // the snaps for the moving sides: with proportions kept, the nearer one wins and the other side follows
    const snapSides = (ev, box, edges, exclude, keep) => {
      if (ev.ctrlKey || ev.metaKey) return [];
      const sn = smartSnap(box, exclude, { edges });
      let ms = [['x', sn.x], ['y', sn.y]].filter(([, m]) => m);
      if (keep && ms.length > 1) ms = [Math.abs(sn.x.d) <= Math.abs(sn.y.d) ? ms[0] : ms[1]];
      return ms.map(([axis, m]) => ({ ...m, axis }));
    };
    E.dragging = true;
    if (single) {
      const el = single;
      const o = U.clone(el);
      const th = ((el.rot || 0) * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      // at a right angle the sides lie along the page axes and can snap; curved text sizes itself
      const square = Math.abs(Math.sin(2 * th)) < 1e-9 && !(el.type === 'text' && el.curve);
      const onPage = (ux, uy) => (Math.abs(ux) > 0.5 ? ['x', Math.round(ux)] : ['y', Math.round(uy)]);
      session(
        e,
        (ev) => {
          const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
          const lx = cos * dx + sin * dy, ly = -sin * dx + cos * dy;
          // the opposite side stays put (Alt/Option: the centre); text width handles also keep its top edge (the height follows the wrap)
          const alt = ev.altKey, f = alt ? 2 : 1;
          const mx = alt ? 0 : hx, my = alt && hy ? 0 : hy || (el.type === 'text' ? 1 : 0);
          const ax = cx - cos * (mx * o.w / 2) + sin * (my * o.h / 2);
          const ay = cy - sin * (mx * o.w / 2) - cos * (my * o.h / 2);
          const centre = (w, hh) => ({ x: ax + cos * (mx * w / 2) - sin * (my * hh / 2), y: ay + sin * (mx * w / 2) + cos * (my * hh / 2) });
          let nw = hx ? Math.max(8, o.w + f * hx * lx) : o.w;
          let nh = hy ? Math.max(8, o.h + f * hy * ly) : o.h;
          const prop = corner && (PROPORTIONAL.has(el.type) || ev.shiftKey || el.sticky) && !(ev.shiftKey && PROPORTIONAL.has(el.type));
          if (prop) {
            const k = Math.max(nw / o.w, nh / o.h);
            nw = o.w * k;
            nh = o.h * k;
          }
          let snaps = [];
          if (square) {
            const c = centre(nw, nh), edges = { x: [], y: [] };
            const side = (dim, hd, n, [a, s]) => {
              edges[a].push({ v: c[a] + hd * s * n / 2, k: hd * s / f, dim });
              if (alt) edges[a].push({ v: c[a] - hd * s * n / 2, k: -hd * s / 2, dim });
            };
            if (hx) side('w', hx, nw, onPage(cos, sin));
            // a text box's height follows its text
            if (hy && el.type !== 'text') side('h', hy, nh, onPage(-sin, cos));
            snaps = snapSides(ev, E.bbox({ ...el, x: c.x - nw / 2, y: c.y - nh / 2, w: nw, h: nh }), edges, snapSkip([el.id]), prop);
            for (const m of snaps) {
              if (m.dim === 'w') nw = Math.max(8, nw + m.d / m.k);
              else nh = Math.max(8, nh + m.d / m.k);
            }
            if (prop && snaps.length) {
              const k = snaps[0].dim === 'w' ? nw / o.w : nh / o.h;
              nw = o.w * k;
              nh = o.h * k;
            }
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
          const nc = centre(nw, nh);
          el.w = nw;
          el.h = nh;
          el.x = nc.x - nw / 2;
          el.y = nc.y - nh / 2;
          E.renderPage(E.pi);
          E.drawOverlay();
          const bb = E.bbox(el);
          showGuides({ guides: snaps }, bb);
          sizeLabel(bb, `w ${Math.round(el.w)}  h ${Math.round(el.h)}`);
        },
        () => E.changed()
      );
    } else {
      const box = E.unionBox(els);
      // a side the selection has no extent along (lines in a row) doesn't scale
      const fx = (w) => (box.w >= 1 ? w / box.w : 1), fy = (hh) => (box.h >= 1 ? hh / box.h : 1);
      let orig = null;
      session(
        e,
        (ev) => {
          // connectors scale from where they are drawn
          if (!orig) {
            els.forEach((x) => E.bakeEnds(x));
            orig = els.map((x) => U.clone(x));
          }
          const dx = (ev.clientX - sx) / E.zoom, dy = (ev.clientY - sy) / E.zoom;
          const alt = ev.altKey, f = alt ? 2 : 1;
          const ax = alt ? box.x + box.w / 2 : hx === 1 ? box.x : box.x + box.w, ay = alt ? box.y + box.h / 2 : hy === 1 ? box.y : box.y + box.h;
          let kx = hx ? fx(Math.max(1, box.w + f * hx * dx)) : 1, ky = hy ? fy(Math.max(1, box.h + f * hy * dy)) : 1;
          const keep = corner && !ev.shiftKey;
          if (keep) kx = ky = Math.max(box.w >= 1 ? kx : 0, box.h >= 1 ? ky : 0) || 1;
          const edges = { x: [], y: [] };
          const side = (a, dim, hd, n, an) => {
            if (!hd) return;
            if (alt) edges[a].push({ v: an + n / 2, k: 0.5, dim }, { v: an - n / 2, k: -0.5, dim });
            else edges[a].push({ v: an + hd * n, k: hd, dim });
          };
          const nw = box.w * kx, nh = box.h * ky;
          side('x', 'w', box.w >= 1 && hx, nw, ax);
          side('y', 'h', box.h >= 1 && hy, nh, ay);
          const nb = { x: alt ? ax - nw / 2 : hx === -1 ? ax - nw : box.x, y: alt ? ay - nh / 2 : hy === -1 ? ay - nh : box.y, w: nw, h: nh };
          const snaps = snapSides(ev, nb, edges, snapSkip(E.sel), keep);
          for (const m of snaps) {
            if (m.dim === 'w') kx = fx(nw + m.d / m.k);
            else ky = fy(nh + m.d / m.k);
          }
          if (keep && snaps.length) kx = ky = snaps[0].dim === 'w' ? kx : ky;
          E.scaleEls(els, orig, ax, ay, Math.max(0.05, kx), Math.max(0.05, ky));
          E.renderPage(E.pi);
          E.drawOverlay();
          const ub = E.unionBox(els);
          showGuides({ guides: snaps }, ub);
          sizeLabel(ub, `w ${Math.round(ub.w)}  h ${Math.round(ub.h)}`);
        },
        () => E.changed()
      );
    }
  }
  function sizeLabel(bb, text, below = 40) {
    const b = E.blocks[E.pi], z = E.zoom;
    b.overlay.appendChild(U.h('div.size-label', { style: { left: (bb.x + bb.w / 2) * z + 'px', top: (bb.y + bb.h) * z + below + 'px' } }, text));
  }
  // Scale elements from `orig` (their copies) about page point (ax, ay). Unequal factors stretch them: text keeps its
  // font size and rewraps, photos, emoji and curved text keep their shape, and strokes keep their weight.
  E.scaleEls = (els, orig, ax, ay, kx, ky) => {
    const uni = Math.abs(kx - ky) < 1e-9;
    els.forEach((el, i) => {
      const o = orig[i];
      if (o.p1) {
        el.p1 = { x: ax + (o.p1.x - ax) * kx, y: ay + (o.p1.y - ay) * ky };
        el.p2 = { x: ax + (o.p2.x - ax) * kx, y: ay + (o.p2.y - ay) * ky };
        return M.syncLineBox(el);
      }
      const keep = uni || o.type === 'image' || o.type === 'emoji' || (o.type === 'text' && o.curve);
      // a turned element stretches along its own sides (exactly so at right angles)
      const t = ((o.rot || 0) * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t)), k = uni ? kx : Math.min(kx, ky);
      el.w = Math.max(1, o.w * (keep ? k : Math.hypot(kx * c, ky * s)));
      el.h = Math.max(1, o.h * (keep ? k : Math.hypot(kx * s, ky * c)));
      if (keep && o.size) el.size = U.round(o.size * k, 1);
      if (uni && o.strokeWidth) el.strokeWidth = o.strokeWidth * k;
      const wrap = !keep && o.type === 'text';
      if (wrap) el.h = R.textHeight(el);
      // rewrapped text keeps its (scaled) top-left corner; everything else its centre
      if (wrap && !o.rot) {
        el.x = ax + (o.x - ax) * kx;
        el.y = ay + (o.y - ay) * ky;
      } else {
        el.x = ax + (o.x + o.w / 2 - ax) * kx - el.w / 2;
        el.y = ay + (o.y + o.h / 2 - ay) * ky - el.h / 2;
      }
    });
  };
  // Turn elements from `orig` (their copies) by `deg` about page point (px, py); a line turns by its ends.
  E.rotateEls = (els, orig, px, py, deg) => {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const turn = (p) => ({ x: px + (p.x - px) * c - (p.y - py) * s, y: py + (p.x - px) * s + (p.y - py) * c });
    els.forEach((el, i) => {
      const o = orig[i];
      if (o.p1) {
        el.p1 = turn(o.p1);
        el.p2 = turn(o.p2);
        return M.syncLineBox(el);
      }
      const m = turn({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
      el.x = m.x - o.w / 2;
      el.y = m.y - o.h / 2;
      el.rot = U.round(((((o.rot || 0) + deg) % 360) + 540) % 360 - 180, 1);
    });
  };
  // Move elements, their line ends included.
  E.moveEls = (els, dx, dy) => {
    for (const el of els) {
      el.x += dx;
      el.y += dy;
      if (el.p1) { el.p1.x += dx; el.p1.y += dy; el.p2.x += dx; el.p2.y += dy; }
    }
  };
  // Several elements turn together about the centre of their box; their common angle (if they share one) is what snaps.
  function startRotate(e) {
    e.stopPropagation();
    e.preventDefault();
    commitField();
    const els = E.selEls();
    if (!els.length) return;
    const single = els.length === 1 ? els[0] : null;
    const box = single || E.unionBox(els), px = box.x + box.w / 2, py = box.y + box.h / 2;
    const r = E.blocks[E.pi].svg.getBoundingClientRect();
    const c = { x: r.left + px * E.zoom, y: r.top + py * E.zoom };
    const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    const rots = els.filter((x) => x.type !== 'line').map((x) => x.rot || 0);
    const r0 = rots.length && rots.every((v) => v === rots[0]) ? rots[0] : 0;
    let orig = null;
    E.dragging = true;
    session(
      e,
      (ev) => {
        const a = Math.atan2(ev.clientY - c.y, ev.clientX - c.x);
        let deg = r0 + ((a - a0) * 180) / Math.PI;
        deg = ((deg % 360) + 540) % 360 - 180;
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        else for (const s of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) if (Math.abs(deg - s) < 3) deg = s;
        if (single) single.rot = U.round(deg, 1);
        else {
          // connectors turn from where they are drawn
          if (!orig) {
            els.forEach((x) => E.bakeEnds(x));
            orig = els.map((x) => U.clone(x));
          }
          E.rotateEls(els, orig, px, py, deg - r0);
          E.rotFrame = { box, deg: deg - r0 };
        }
        E.renderPage(E.pi);
        E.drawOverlay();
        sizeLabel(single || box, Math.round(deg) + '°', 60);
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
    // a photo frame is never a text box
    if (el.locked || el.frame || el.asset || !E.canEdit()) return;
    E.finishText();
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
    E.endCrop();
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

  // ---------- crop mode (photos, photo frames and the page's background photo) ----------
  // E.cropping = { kind: 'image' | 'frame' | 'bg', id, pi, keys, orig, ratio }. The photo changes live and the whole
  // session is one undo step when it ends (Done, Enter, a click elsewhere); Esc puts it back as it was.
  const CROP_KEYS = { image: ['x', 'y', 'w', 'h', 'crop'], frame: ['fit'], bg: ['fit'] };
  const CROP_RATIOS = [['Free', null], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16]];
  E.isPhotoFrame = (el) => el?.type === 'shape' && !!el.asset;
  const hasSize = (t) => t?.nw > 0 && t?.nh > 0;
  const cropTarget = (c = E.cropping) => {
    const page = c && E.d?.pages[c.pi];
    if (!page) return null;
    return c.kind === 'bg' ? page.bg : page.elements.find((x) => x.id === c.id);
  };
  // Older frames and backgrounds lack the photo's natural size: it is looked up (an invisible fix, not an undo step).
  E.naturalSize = async (t) => {
    if (hasSize(t)) return true;
    const d = E.d, id = t?.asset, a = id && (await S.get('assets', id));
    if (!a?.w || E.d !== d || t.asset !== id) return false;
    const same = snap() === E.hist[E.hi];
    Object.assign(t, { nw: a.w, nh: a.h });
    if (same) E.hist[E.hi] = snap();
    return true;
  };
  // a new photo in a frame starts centred
  E.fillFrame = (el, a) => {
    Object.assign(el, { asset: a.id, frame: true, nw: a.w, nh: a.h });
    delete el.fit;
  };
  // el: a photo or filled frame on this page, or 'bg' for the page's background photo
  E.startCrop = (el) => {
    const bg = el === 'bg', t = bg ? E.page()?.bg : el;
    if (!t?.asset || !(bg || el.type === 'image' || E.isPhotoFrame(el)) || (!bg && !E.els().includes(el)) || !E.canEdit()) return false;
    if (!bg && el.locked) {
      U.toast('Unlock the element to edit it');
      return false;
    }
    const kind = bg ? 'bg' : el.type === 'image' ? 'image' : 'frame';
    if (kind !== 'image' && !hasSize(t)) {
      const sel = E.sel.join();
      E.naturalSize(t).then((ok) => ok && E.sel.join() === sel && E.startCrop(el));
      return false;
    }
    E.finishText();
    E.flushCommit();
    if (!bg && el.groupId) E.enteredGroup = el.groupId;
    E.sel = bg ? [] : [el.id];
    A.EU.onSelectionChange?.();
    // with the side panel showing, the Crop panel's sliders come along (a phone keeps its canvas)
    if (!bg && A.EU.panelOpen && innerWidth > 760 && A.EU.panel !== 'crop') A.EU.openPanel('crop');
    const keys = CROP_KEYS[kind];
    E.cropping = { kind, id: bg ? null : el.id, pi: E.pi, keys, orig: U.clone(Object.fromEntries(keys.map((k) => [k, t[k]]))), ratio: null };
    E.drawOverlay();
    A.EU.refreshToolbar();
    return true;
  };
  E.endCrop = (keep = true) => {
    const c = E.cropping;
    if (!c) return;
    E.cropping = null;
    const t = cropTarget(c);
    if (t && !keep) {
      for (const k of c.keys) {
        if (k in c.orig) t[k] = U.clone(c.orig[k]);
        else delete t[k];
      }
    }
    // one undo step for the session, none when nothing changed
    if (snap() !== E.hist[E.hi]) return E.changed();
    E.renderPage(c.pi);
    E.drawOverlay();
    A.EU.refreshToolbar();
    A.EU.refreshPanel();
  };
  // The session's box (page units, with the element's rotation and flips) and the whole photo in it (`img`, in the
  // box's own unflipped units); a cropped photo's window is the box itself.
  function cropGeom(c = E.cropping) {
    const t = cropTarget(c);
    if (c.kind === 'bg') return { t, box: { x: 0, y: 0, w: E.d.width, h: E.d.height, rot: 0, fx: 1, fy: 1 }, img: R.fitBox(E.d.width, E.d.height, t.nw, t.nh, t.fit) };
    const box = { x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot || 0, fx: t.flipX ? -1 : 1, fy: t.flipY ? -1 : 1 };
    if (c.kind === 'frame') return { t, box, img: R.fitBox(t.w, t.h, t.nw, t.nh, t.fit) };
    const cr = t.crop || { x: 0, y: 0, w: 1, h: 1 };
    return { t, box, img: { x: (-cr.x * t.w) / cr.w, y: (-cr.y * t.h) / cr.h, w: t.w / cr.w, h: t.h / cr.h } };
  }
  // a page-unit vector in a box's own units, and back
  const toBox = (box, dx, dy) => {
    const a = (-box.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: (dx * c - dy * s) * box.fx, y: (dx * s + dy * c) * box.fy };
  };
  const fromBox = (box, lx, ly) => {
    const a = (box.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = lx * box.fx, y = ly * box.fy;
    return { x: x * c - y * s, y: x * s + y * c };
  };
  // a frame's (or the background's) photo box g becomes its fit: covering the w×h box, zoomed at most 10×
  const setFit = (t, w, h, g) => {
    const s = U.clamp(g.w / (Math.max(w / t.nw, h / t.nh) * t.nw), 1, 10);
    const b = R.fitBox(w, h, t.nw, t.nh, { s, cx: (w / 2 - g.x) / g.w, cy: (h / 2 - g.y) / g.h });
    t.fit = { s: U.round(s, 4), cx: U.round((w / 2 - b.x) / b.w, 4), cy: U.round((h / 2 - b.y) / b.h, 4) };
  };
  // a photo cropped to window r, the whole photo at g (both in the units of its box o before the change)
  const setWindow = (t, o, g, r) => {
    const d = fromBox({ rot: o.rot || 0, fx: o.flipX ? -1 : 1, fy: o.flipY ? -1 : 1 }, r.x + r.w / 2 - o.w / 2, r.y + r.h / 2 - o.h / 2);
    t.crop = { x: (r.x - g.x) / g.w, y: (r.y - g.y) / g.h, w: r.w / g.w, h: r.h / g.h };
    Object.assign(t, { w: r.w, h: r.h, x: o.x + o.w / 2 + d.x - r.w / 2, y: o.y + o.h / 2 + d.y - r.h / 2 });
  };
  // move the photo by d (box units) behind the frame or the crop window
  const panPhoto = (c, t, o, box, g, d) =>
    c.kind === 'image'
      ? setWindow(t, o, { ...g, x: U.clamp(g.x + d.x, o.w - g.w, 0), y: U.clamp(g.y + d.y, o.h - g.h, 0) }, { x: 0, y: 0, w: o.w, h: o.h })
      : setFit(t, box.w, box.h, { ...g, x: g.x + d.x, y: g.y + d.y });
  // the crop window after its handle h moved by d, inside the photo g; `ratio` keeps its shape from the opposite corner
  function cropEdges(o, g, h, d, ratio) {
    const mw = Math.max(0.02 * g.w, 10 / E.zoom), mh = Math.max(0.02 * g.h, 10 / E.zoom);
    let x1 = 0, y1 = 0, x2 = o.w, y2 = o.h;
    if (h.includes('w')) x1 = U.clamp(d.x, g.x, x2 - mw);
    if (h.includes('e')) x2 = U.clamp(o.w + d.x, x1 + mw, g.x + g.w);
    if (h.includes('n')) y1 = U.clamp(d.y, g.y, y2 - mh);
    if (h.includes('s')) y2 = U.clamp(o.h + d.y, y1 + mh, g.y + g.h);
    if (ratio && h.length === 2) {
      const sx = h.includes('w') ? -1 : 1, sy = h.includes('n') ? -1 : 1, ax = sx < 0 ? x2 : x1, ay = sy < 0 ? y2 : y1;
      let w = x2 - x1, hh = y2 - y1;
      if (w / hh > ratio) hh = w / ratio;
      else w = hh * ratio;
      const k = Math.min(1, (sx > 0 ? g.x + g.w - ax : ax - g.x) / w, (sy > 0 ? g.y + g.h - ay : ay - g.y) / hh);
      w *= k;
      hh *= k;
      x1 = sx > 0 ? ax : ax - w;
      y1 = sy > 0 ? ay : ay - hh;
      x2 = x1 + w;
      y2 = y1 + hh;
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  // a frame's photo box after its corner h moved by d: it scales about the opposite corner
  function cornerZoom(g, h, d) {
    const sx = h.includes('w') ? -1 : 1, sy = h.includes('n') ? -1 : 1, ax = sx > 0 ? g.x : g.x + g.w, ay = sy > 0 ? g.y : g.y + g.h;
    const w = Math.max(1, g.w + sx * d.x, ((g.h + sy * d.y) * g.w) / g.h), hh = (w * g.h) / g.w;
    return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - hh, w, h: hh };
  }
  const syncPanel = U.debounce(() => E.d && A.EU.refreshPanel(), 150);
  // redraw after a live change; `keepBar` leaves the floating bar alone (its zoom slider is being dragged)
  const cropDraw = (keepBar) => {
    E.renderPage(E.pi);
    const old = keepBar && E.blocks[E.pi]?.overlay.querySelector('.crop-layer');
    if (old) old.replaceWith(cropLayer());
    else E.drawOverlay();
  };
  E.cropNudge = (dx, dy) => {
    const c = E.cropping;
    if (!c) return;
    const { t, box, img } = cropGeom(c);
    panPhoto(c, t, { ...t }, box, img, toBox(box, dx, dy));
    cropDraw();
    syncPanel();
  };
  // zoom the photo by k about `at` (box units; the middle of the box by default)
  E.cropZoom = (k, at, keepBar) => {
    const c = E.cropping;
    if (!c) return;
    const { t, box, img: g } = cropGeom(c), o = { ...t }, p = at || { x: box.w / 2, y: box.h / 2 };
    if (c.kind === 'image') {
      // the crop window stays: the photo grows behind it until the window is 2% of it, and shrinks until it fills it
      k = U.clamp(k, Math.max(o.w / g.w, o.h / g.h), Math.min(o.w / g.w, o.h / g.h) / 0.02);
      const w = g.w * k, h = g.h * k;
      setWindow(t, o, { x: U.clamp(p.x - (p.x - g.x) * k, o.w - w, 0), y: U.clamp(p.y - (p.y - g.y) * k, o.h - h, 0), w, h }, { x: 0, y: 0, w: o.w, h: o.h });
    } else setFit(t, box.w, box.h, { x: p.x - (p.x - g.x) * k, y: p.y - (p.y - g.y) * k, w: g.w * k, h: g.h * k });
    cropDraw(keepBar);
    syncPanel();
  };
  // the largest window of ratio r (width / height) in the photo, about as big as the current one and around its centre
  E.cropRatio = (r) => {
    const c = E.cropping;
    if (c?.kind !== 'image') return;
    c.ratio = r;
    if (r) {
      const { t, img: g } = cropGeom(c), o = { ...t };
      let w = Math.min(g.w, g.h * r), h = w / r;
      const k = Math.min(1, Math.max(o.w, o.h) / Math.max(w, h));
      w *= k;
      h *= k;
      setWindow(t, o, g, { x: U.clamp(o.w / 2 - w / 2, g.x, g.x + g.w - w), y: U.clamp(o.h / 2 - h / 2, g.y, g.y + g.h - h), w, h });
    }
    cropDraw();
    syncPanel();
  };
  // the whole photo again: a cropped one at its own shape, as wide as before and around the same centre
  E.cropReset = () => {
    const c = E.cropping, t = cropTarget(c);
    if (!t) return;
    if (c.kind === 'image') {
      const o = { ...t }, { img: g } = cropGeom(c), h = hasSize(o) ? (o.w * o.nh) / o.nw : (o.w * g.h) / g.w, r = { x: 0, y: (o.h - h) / 2, w: o.w, h };
      setWindow(t, o, r, r);
    } else delete t.fit;
    c.ratio = null;
    cropDraw();
    syncPanel();
  };
  function cropDrag(e, h) {
    const c = E.cropping, { t, box, img: g } = cropGeom(c), o = { ...t }, sx = e.clientX, sy = e.clientY;
    let moved = false;
    session(
      e,
      (ev) => {
        if (E.cropping !== c || (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3)) return;
        moved = E.dragging = true;
        const d = toBox(box, (ev.clientX - sx) / E.zoom, (ev.clientY - sy) / E.zoom);
        if (h === 'pan') panPhoto(c, t, o, box, g, d);
        else if (c.kind === 'image') setWindow(t, o, g, cropEdges(o, g, h, d, c.ratio || (ev.shiftKey && h.length === 2 && o.w / o.h)));
        else setFit(t, box.w, box.h, cornerZoom(g, h, d));
        cropDraw();
      },
      () => {
        if (!moved || E.cropping !== c) return;
        E.drawOverlay();
        A.EU.refreshPanel();
      }
    );
  }
  function cropWheel(e) {
    const c = E.cropping;
    if (e.ctrlKey || e.metaKey || !c) return;
    e.preventDefault();
    const { box } = cropGeom(c), p = E.toPage(e, c.pi), l = toBox(box, p.x - box.x - box.w / 2, p.y - box.y - box.h / 2);
    E.cropZoom(U.clamp(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.002)), 0.5, 2), { x: l.x + box.w / 2, y: l.y + box.h / 2 });
  }
  // The photo faded beyond its frame (past the page edges too), outlines, handles and the area that drags it, drawn
  // in the box's own (rotated, flipped) space in screen pixels.
  function cropLayer() {
    const c = E.cropping, { t, box, img: g } = cropGeom(c), z = E.zoom, W = box.w * z, H = box.h * z, url = S.assetURL(t.asset);
    const q = (v) => U.round(v, 2), rect = (o) => `x="${q(o.x * z)}" y="${q(o.y * z)}" width="${q(o.w * z)}" height="${q(o.h * z)}"`;
    const win = c.kind === 'frame' ? R.shapePath(t.shape, W, H, (t.radius || 0) * z) : `M0 0H${q(W)}V${q(H)}H0Z`;
    const hit = coarse.matches ? 22 : 11, cursor = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' };
    // corners are dots, sides bars (h: across, v: up and down), each in a larger invisible target
    const handle = (k, x, y, side) =>
      `<g data-h="${k}" style="cursor:${cursor[k]}-resize"><circle cx="${q(x)}" cy="${q(y)}" r="${hit}" fill="transparent"/>` +
      (side ? `<rect class="crop-dot" x="${q(x - (side === 'h' ? 11 : 3.5))}" y="${q(y - (side === 'h' ? 3.5 : 11))}" width="${side === 'h' ? 22 : 7}" height="${side === 'h' ? 7 : 22}" rx="3"/>` : `<circle class="crop-dot" cx="${q(x)}" cy="${q(y)}" r="7"/>`) +
      '</g>';
    let handles = '', grid = '';
    if (c.kind === 'image') {
      for (const [k, x, y] of [['nw', 0, 0], ['ne', W, 0], ['sw', 0, H], ['se', W, H]]) handles += handle(k, x, y);
      if (!c.ratio && W > 40 && H > 40) for (const [k, x, y, s] of [['n', W / 2, 0, 'h'], ['s', W / 2, H, 'h'], ['w', 0, H / 2, 'v'], ['e', W, H / 2, 'v']]) handles += handle(k, x, y, s);
      grid = [1, 2].map((i) => `<path class="crop-grid" d="M${q((W * i) / 3)} 0V${q(H)}M0 ${q((H * i) / 3)}H${q(W)}"/>`).join('');
    } else for (const [k, x, y] of [['nw', g.x, g.y], ['ne', g.x + g.w, g.y], ['sw', g.x, g.y + g.h], ['se', g.x + g.w, g.y + g.h]]) handles += handle(k, x * z, y * z);
    const el = U.h('div.crop-layer', {
      style: { left: box.x * z + 'px', top: box.y * z + 'px', width: W + 'px', height: H + 'px', transform: `rotate(${box.rot}deg) scale(${box.fx}, ${box.fy})` },
      html:
        `<svg width="${q(W)}" height="${q(H)}" overflow="visible"><defs><clipPath id="crop-out"><path clip-rule="evenodd" d="M-99999 -99999H99999V99999H-99999Z${win}"/></clipPath></defs>` +
        `<image class="crop-ghost" href="${U.esc(url)}" ${rect(g)} preserveAspectRatio="none" clip-path="url(#crop-out)"/><rect class="crop-pan" ${rect(g)}/>` +
        `<rect class="crop-edge" ${rect(g)}/>${grid}<path class="crop-win" d="${win}"/>${handles}</svg>`,
    });
    el.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('[data-h]')?.getAttribute('data-h') || (e.target.closest('.crop-pan') && 'pan');
      if (e.button !== 0 || !h) return;
      e.stopPropagation();
      cropDrag(e, h);
    });
    el.addEventListener('wheel', cropWheel, { passive: false });
    return el;
  }
  // Aspect ratios (photos) or a zoom slider (frames, background), Reset and Done, above the frame.
  function cropBar(b) {
    const c = E.cropping, t = cropTarget(c);
    const btn = (icon, title, fn, txt, on) => U.h('button.mini-btn' + (on ? '.on' : ''), { title, onclick: fn }, txt ? U.h('span.mini-txt', txt) : U.ic(icon, 16));
    let kids;
    if (c.kind === 'image') kids = CROP_RATIOS.map(([l, r]) => btn(null, r ? 'Crop to ' + l : 'Free crop', () => E.cropRatio(r), l, c.ratio === r));
    else {
      const v = Math.round((t.fit?.s || 1) * 100);
      const zr = U.h('input.crop-zoom', { type: 'range', min: 100, max: Math.max(400, v), step: 1, value: v, title: 'Zoom', 'aria-label': 'Zoom' });
      zr.addEventListener('input', () => E.cropZoom(+zr.value / 100 / (cropTarget()?.fit?.s || 1), null, true));
      kids = [U.ic('zoomin', 16), zr];
    }
    const m = U.h('div.mini-menu.crop-bar', kids, U.h('span.crop-sep'), btn('restore', 'Reset', () => E.cropReset()), btn('check', 'Done (Enter)', () => E.endCrop()));
    m.addEventListener('pointerdown', (e) => e.stopPropagation());
    floatMenu(b, m, c.kind === 'bg' ? { x: 0, y: 0, w: E.d.width, h: E.d.height } : E.bbox(t));
  }
  // false when the session cannot go on (the photo is gone or locked, or another page is showing): it just ends
  function drawCrop(b) {
    const c = E.cropping, t = cropTarget(c);
    if (c.pi !== E.pi || !t?.asset || t.locked || E.page().locked || (c.kind !== 'image' && !hasSize(t)) || (c.kind === 'frame' && !E.isPhotoFrame(t))) {
      E.cropping = null;
      return false;
    }
    b.overlay.appendChild(cropLayer());
    if (!E.dragging) cropBar(b);
    return true;
  }

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
  E.selectAll = () => {
    E.enteredGroup = null;
    E.select(E.els().filter((e) => !e.hidden).map((e) => e.id));
  };
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
    E.moveEls(els, dx, dy);
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
  // ---------- arrange: align, distribute, tidy up ----------
  // The selection as the units that move together: a whole selected group (unless it is the group entered), else each element.
  E.units = (els = E.selEls()) => {
    const map = new Map();
    for (const el of els) {
      const whole = el.groupId && el.groupId !== E.enteredGroup && groupMembers(el).every((id) => E.sel.includes(id));
      const k = whole ? 'g:' + el.groupId : el.id;
      map.set(k, [...(map.get(k) || []), el]);
    }
    return [...map.values()].map((els) => ({ els, box: E.unionBox(els), locked: els.some((x) => x.locked) }));
  };
  // The key object: the unit last Shift-clicked into a selection of two or more; it stays put when aligned to.
  E.keyUnit = (us) => {
    if (!E.keyId || !E.sel.includes(E.keyId)) return null;
    us = us || E.units();
    return (us.length > 1 && us.find((u) => u.els.some((x) => x.id === E.keyId))) || null;
  };
  // What several elements align to: 'selection', 'key' or 'page' (the Position panel's 'Align to').
  E.alignTo = 'selection';
  // connectors move from where they are drawn; a lone one leaves its shapes, as when nudged
  const moveUnit = (u, dx, dy, detach = false) => {
    if (!dx && !dy) return;
    u.els.forEach((el) => E.bakeEnds(el, detach));
    E.moveEls(u.els, dx, dy);
    u.box ={ ...u.box, x: u.box.x + dx, y: u.box.y + dy };
  };
  // to: 'page', 'selection' (the box around it), 'key' (the key object), or 'auto': the page for one element or group,
  // else E.alignTo. Locked elements stay put (and still count in the selection's box).
  E.align = (how, { to = 'auto' } = {}) => {
    if (!E.editEls().length) return;
    const us = E.units(), key = E.keyUnit(us);
    if (to === 'auto') to = us.length < 2 ? 'page' : E.alignTo;
    if (to === 'key' && !key) to = 'selection';
    const ref = to === 'page' ? { x: 0, y: 0, w: E.d.width, h: E.d.height } : to === 'key' ? key.box : E.unionBox(E.selEls());
    const lone = us.length === 1 && us[0].els.length === 1 && us[0].els[0].type === 'line';
    for (const u of us) {
      if (u.locked || (to === 'key' && u === key)) continue;
      const b = u.box;
      const dx = how === 'left' ? ref.x - b.x : how === 'center' ? ref.x + ref.w / 2 - (b.x + b.w / 2) : how === 'right' ? ref.x + ref.w - (b.x + b.w) : 0;
      const dy = how === 'top' ? ref.y - b.y : how === 'middle' ? ref.y + ref.h / 2 - (b.y + b.h / 2) : how === 'bottom' ? ref.y + ref.h - (b.y + b.h) : 0;
      moveUnit(u, dx, dy, lone);
    }
    E.changed();
  };
  const freeUnits = (what) => {
    if (!E.editEls().length) return null;
    const us = E.units().filter((u) => !u.locked);
    if (us.length > 1) return us;
    U.toast('Select 2 or more unlocked elements to ' + what);
    return null;
  };
  // Space the elements (or groups) along 'h' or 'v': evenly between the outer two, or `gap` apart starting from the first.
  E.distribute = (axis, gap) => {
    const us = freeUnits('space them');
    if (!us) return;
    const k = axis === 'h' ? 'x' : 'y', s = axis === 'h' ? 'w' : 'h';
    us.sort((a, b) => a.box[k] - b.box[k] || a.box[s] - b.box[s]);
    const end = Math.max(...us.map((u) => u.box[k] + u.box[s]));
    const g = Number.isFinite(gap) ? gap : (end - us[0].box[k] - us.reduce((t, u) => t + u.box[s], 0)) / (us.length - 1);
    let pos = us[0].box[k];
    for (const u of us) {
      const d = pos - u.box[k];
      pos += u.box[s] + g;
      moveUnit(u, k === 'x' ? d : 0, k === 'y' ? d : 0);
    }
    E.changed();
  };
  // Tidy up: rows of roughly level elements, each read left to right, become an evenly spaced grid (or a row or a
  // column) from the selection's top-left corner, `gap` apart or at the average spacing they have now.
  E.tidy = (gap) => {
    const us = freeUnits('tidy them up');
    if (!us) return;
    const cy = (u) => u.box.y + u.box.h / 2;
    const rows = [];
    for (const u of [...us].sort((a, b) => cy(a) - cy(b))) {
      const r = rows[rows.length - 1];
      if (r && Math.abs(cy(u) - r.cy) < Math.max(r.h, u.box.h) / 2) {
        r.cy = (r.cy * r.us.length + cy(u)) / (r.us.length + 1);
        r.h = (r.h * r.us.length + u.box.h) / (r.us.length + 1);
        r.us.push(u);
      } else rows.push({ us: [u], cy: cy(u), h: u.box.h });
    }
    rows.forEach((r) => r.us.sort((a, b) => a.box.x - b.box.x));
    // overlapping neighbours don't count towards the spacing
    const mean = (a) => ((a = a.filter((v) => v >= 0)).length ? a.reduce((t, v) => t + v, 0) / a.length : null);
    const gx = mean(rows.flatMap((r) => r.us.slice(1).map((u, i) => u.box.x - (r.us[i].box.x + r.us[i].box.w))));
    const gy = mean(rows.slice(1).map((r, i) => Math.min(...r.us.map((u) => u.box.y)) - Math.max(...rows[i].us.map((u) => u.box.y + u.box.h))));
    const dflt = Math.round(Math.min(E.d.width, E.d.height) / 40);
    const sx = Number.isFinite(gap) ? gap : Math.round(gx ?? gy ?? dflt), sy = Number.isFinite(gap) ? gap : Math.round(gy ?? gx ?? dflt);
    const colW = Array.from({ length: Math.max(...rows.map((r) => r.us.length)) }, (_, j) => Math.max(...rows.map((r) => r.us[j]?.box.w || 0)));
    const o = E.unionBox(us.flatMap((u) => u.els));
    let y = o.y;
    for (const r of rows) {
      let x = o.x;
      r.us.forEach((u, j) => { moveUnit(u, x - u.box.x, y - u.box.y); x += colW[j] + sx; });
      y += Math.max(...r.us.map((u) => u.box.h)) + sy;
    }
    E.changed();
  };
  E.setBackgroundFromImage = () => {
    const el = E.selEls()[0];
    if (!el || el.type !== 'image' || !E.editEls().includes(el)) return;
    const bg = { ...(E.page().bg || {}), asset: el.asset, adj: el.adj, nw: el.nw, nh: el.nh };
    delete bg.fit;
    E.page().bg = bg;
    E.page().elements = E.els().filter((e) => e !== el);
    E.sel = [];
    E.changed();
  };
  // a line has no flip (its ends say which way it goes)
  E.flip = (axis) => {
    const els = E.editEls().filter((el) => el.type !== 'line');
    if (!els.length) return;
    for (const el of els) {
      if (axis === 'h') el.flipX = !el.flipX;
      else el.flipY = !el.flipY;
    }
    E.changed();
  };
  // Hide the selection, or show it when all of it is hidden; with nothing selected, show the page's hidden elements.
  E.toggleHidden = () => {
    if (!E.sel.length) {
      const hid = E.els().filter((x) => x.hidden && !x.locked);
      if (!hid.length || !E.canEdit()) return;
      hid.forEach((x) => delete x.hidden);
      E.sel = hid.map((x) => x.id);
      E.changed();
      return A.EU.onSelectionChange?.();
    }
    const els = E.editEls();
    if (!els.length) return;
    const hide = els.some((x) => !x.hidden);
    els.forEach((x) => (hide ? (x.hidden = true) : delete x.hidden));
    E.changed();
    if (hide) U.toast('Hidden – press Ctrl+Shift+H to show it again');
  };

  // ---------- keyboard selection: Tab through elements, enter and leave groups ----------
  const inGroup = () => E.enteredGroup && E.selEls().some((x) => x.groupId === E.enteredGroup);
  E.enterGroup = (g) => {
    const first = E.els().find((x) => x.groupId === g && !x.hidden) || E.els().find((x) => x.groupId === g);
    if (!first) return;
    E.enteredGroup = g;
    E.select([first.id]);
  };
  E.exitGroup = () => {
    const ids = E.els().filter((x) => x.groupId === E.enteredGroup).map((x) => x.id);
    E.enteredGroup = null;
    E.select(ids);
  };
  // The next (dir 1) or previous (-1) visible element in layer order: a group is one stop, and inside an entered group
  // its members are. False when there is nothing to select.
  E.cycle = (dir) => {
    const inside = inGroup() && E.selEls().every((x) => x.groupId === E.enteredGroup);
    const stops = [];
    for (const el of E.els()) {
      if (inside && el.groupId !== E.enteredGroup) continue;
      const ids = inside ? [el.id] : groupMembers(el);
      if (ids[0] === el.id && ids.some((id) => !E.byId(id).hidden)) stops.push(ids);
    }
    if (!stops.length) return false;
    const on = stops.map((ids, i) => (ids.some((id) => E.sel.includes(id)) ? i : -1)).filter((i) => i >= 0);
    const i = !on.length ? (dir > 0 ? 0 : stops.length - 1) : (on[dir > 0 ? on.length - 1 : 0] + dir + stops.length) % stops.length;
    if (!inside) E.enteredGroup = null;
    // a menu or picker opened for the last selection would edit the next one
    U.closePop();
    E.select(stops[i]);
    reveal();
    return true;
  };
  // scroll the selection into view when it is outside the canvas (the overlay is drawn again for the new view)
  function reveal() {
    const b = E.blocks[E.pi], box = E.unionBox(E.selEls()), wrap = E.scrollEl;
    if (!b || !box || !wrap) return;
    const r = b.svg.getBoundingClientRect(), s = wrap.getBoundingClientRect(), z = E.zoom, pad = 40;
    const by = (a, len, lo, view) => (a < lo + pad ? a - lo - pad : a + len > lo + view - pad ? Math.min(a + len - lo - view + pad, a - lo - pad) : 0);
    const dx = by(r.left + box.x * z, box.w * z, s.left, wrap.clientWidth), dy = by(r.top + box.y * z, box.h * z, s.top, wrap.clientHeight);
    if (!dx && !dy) return;
    wrap.scrollLeft += dx;
    wrap.scrollTop += dy;
    E.drawOverlay();
  }

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
  // The key pressed with Shift or Alt/Option, which change e.key ('}' for Shift+], 'å' for Option+A): the plain letter
  // when e.key still is one (other keyboard layouts), else what e.code names.
  const BRACKET = { '[': '[', '{': '[', BracketLeft: '[', ']': ']', '}': ']', BracketRight: ']' };
  const keyOf = (e, k) => (/^[a-z]$/.test(k) ? k : BRACKET[k] || BRACKET[e.code] || (/^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : k));
  const ALIGN_KEYS = { a: 'left', h: 'center', d: 'right', w: 'top', v: 'middle', s: 'bottom' };
  // Layer order, copy/paste style, lock, hide, align and flip. True when the key was one of these.
  function powerKey(e, k, mod, stop) {
    if (E.editingId) return false;
    const c = keyOf(e, k), any = E.sel.length > 0;
    // a running crop is kept first, as its own undo step
    const go = () => { stop(); E.endCrop(); };
    if (mod && !e.altKey && (c === ']' || c === '[')) {
      go();
      if (any) E.order(c === ']' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward');
    } else if (mod && e.altKey && !e.shiftKey && (c === 'c' || c === 'v')) {
      go();
      if (c === 'c') E.copyStyle();
      else E.pasteStyle();
    } else if (mod && e.shiftKey && !e.altKey && c === 'l') {
      go();
      if (any || E.page().locked) E.toggleLock();
    } else if (mod && e.shiftKey && !e.altKey && c === 'h') {
      go();
      E.toggleHidden();
    } else if (!mod && e.altKey && !e.shiftKey && ALIGN_KEYS[c] && any) {
      go();
      E.align(ALIGN_KEYS[c]);
    } else if (!mod && !e.altKey && e.shiftKey && (c === 'h' || c === 'v') && any) {
      go();
      E.flip(c);
    } else return false;
    return true;
  }
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
    // crop mode: Enter finishes, Esc cancels, arrows move the photo and + / − zoom it (Delete deletes nothing)
    if (E.cropping && !mod && (['enter', 'escape', 'delete', 'backspace', '+', '=', '-'].includes(k) || k.startsWith('arrow'))) {
      if (k === 'enter' && ae?.closest('button')) return;
      stop();
      const s = e.shiftKey ? 10 : 1;
      if (k === 'enter') E.endCrop();
      else if (k === 'escape') E.endCrop(false);
      else if (k.startsWith('arrow')) E.cropNudge(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0);
      else if (k !== 'delete' && k !== 'backspace') E.cropZoom(k === '-' ? 1 / 1.1 : 1.1);
      return;
    }
    // the text editor is open but lost focus (e.g. to a toolbar button): keys go back to the text
    if (E.editingId && !mod) {
      if (k === 'escape') E.finishText();
      else if (k !== 'tab' && !((k === 'enter' || k === ' ') && ae?.closest('button'))) E.textArea?.focus({ preventScroll: true });
      return;
    }
    // hold Space to pan; a focused control away from the canvas still takes its Space
    if ((e.code === 'Space' || k === ' ') && !mod && !e.altKey) {
      if (ae?.matches('button, input, summary, a[href], [tabindex]') && !E.scrollEl?.matches(':hover') && !E.spaceDown) return;
      stop();
      if (!E.spaceDown) E.setSpace(true);
      return;
    }
    if (powerKey(e, k, mod, stop)) return;
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
    // Shift+0 / 1 / 2: 100%, fit the page, zoom to the selection (by key position, whatever the layout types)
    const zk = e.shiftKey && !e.altKey && /^(Digit|Numpad)[012]$/.test(e.code) && +e.code.slice(-1);
    if (zk !== false) {
      stop();
      return zk === 0 ? E.setZoom(1) : zk === 1 ? E.fit() : E.zoomToSel();
    }
    // Tab steps through the elements while nothing else has focus; the toolbar and panels keep their Tab order
    if (k === 'tab') {
      if (!e.altKey && (!ae || ae === document.body) && E.cycle(e.shiftKey ? -1 : 1)) stop();
      return;
    }
    // Esc in an entered group goes back to the whole group, then deselects
    if (k === 'escape') {
      if (E.tool) { E.tool = null; A.EU.refreshTool(); }
      else if (inGroup()) E.exitGroup();
      else { E.enteredGroup = null; E.deselect(); }
      return;
    }
    if (k === 'delete' || k === 'backspace') { stop(); return E.deleteSel(); }
    if (k.startsWith('arrow')) {
      if (!E.sel.length) {
        const s = e.shiftKey ? 400 : 60;
        if (E.layout() === 'strip' && (k === 'arrowleft' || k === 'arrowup')) E.setPage(E.pi - 1);
        else if (E.layout() === 'strip') E.setPage(E.pi + 1);
        // pages under each other: the arrows scroll the canvas
        else E.scrollEl?.scrollBy(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0);
        return stop();
      }
      stop();
      const s = e.shiftKey ? 10 : 1;
      return E.nudge(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0);
    }
    // Enter on a whole group selects its first member (Shift+Enter goes back), else edits the selected text or crops the photo
    if (k === 'enter') {
      const els = E.selEls(), el = els[0];
      if (!el) return;
      if (e.shiftKey && inGroup()) { stop(); return E.exitGroup(); }
      if (els.length > 1 && el.groupId && E.units(els).length === 1 && !ae?.closest?.('button, a[href], summary')) { stop(); return E.enterGroup(el.groupId); }
      if (el.type === 'image' || E.isPhotoFrame(el)) { stop(); E.startCrop(el); }
      else if (el.type === 'shape' && el.frame) { stop(); A.EU.openPanel('uploads', 'frame'); }
      else if (el.type === 'text' || el.type === 'shape') { stop(); E.editText(el); }
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
  // the photo frame under a drop point (on any page), when it may take a photo
  const frameAt = (x, y) => {
    const t = document.elementFromPoint(x, y)?.closest?.('.page-svg [data-id]'), pi = +t?.closest('.page-block')?.dataset.pi;
    const page = t && E.d.pages[pi], el = page?.elements.find((o) => o.id === t.getAttribute('data-id'));
    return el?.type === 'shape' && (el.frame || el.asset) && !el.locked && !page.locked ? { el, pi } : null;
  };
  // A photo dropped onto a frame fills it, in one undo step; anywhere else it is added to the page.
  E.dropPhoto = (a, at) => {
    if (!at || !E.d.pages[at.pi]?.elements.includes(at.el)) return E.addImageAsset(a, { center: true });
    if (at.pi !== E.pi) E.setPage(at.pi, false);
    E.finishText();
    E.fillFrame(at.el, a);
    if (at.el.groupId) E.enteredGroup = at.el.groupId;
    E.sel = [at.el.id];
    E.changed();
    A.EU.onSelectionChange?.();
  };
  E.onDrop = async (e) => {
    if (!E.d) return;
    e.preventDefault();
    // the drag data is gone after the first await; the frame is found before anything is added over it
    const files = [...(e.dataTransfer?.files || [])], item = e.dataTransfer?.getData('application/x-atelier');
    let frame = frameAt(e.clientX, e.clientY);
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        if (!frame && !E.canEdit()) return;
        // of several photos, the first fills the frame
        E.dropPhoto(await S.addAsset(f, { name: f.name }), frame);
        frame = null;
      } else if (f.type.startsWith('audio/')) {
        const a = await S.addAsset(f, { name: f.name });
        E.d.audio = a.id;
        E.changed({ all: true });
        U.toast('Audio added to the design');
      } else await A.app.importFile(f, { toEditor: true });
    }
    if (!item) return;
    const it = JSON.parse(item);
    if (it.kind !== 'image') return A.EU.dropItem(it, e);
    // an upload dragged from the Uploads panel
    const a = await S.get('assets', it.asset);
    if (!a || (!frame && !E.canEdit())) return;
    await S.ensureAssetURLs([a.id]);
    E.dropPhoto(a, frame);
  };
})(window.A);
