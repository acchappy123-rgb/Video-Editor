'use strict';
// Home screen and its pages: Home, Projects, Templates, Brand, Apps, Planner, AI, Settings.
(function (A) {
  const U = A.U, M = A.M, R = A.R, S = A.S, h = U.h;
  const H = (A.Home = {});

  const NAV = [
    ['home', 'Home', 'home'], ['projects', 'Projects', 'folder'], ['templates', 'Templates', 'template'], ['brand', 'Brand', 'brand'],
    ['apps', 'Apps', 'apps'], ['planner', 'Planner', 'calendar'], ['ai', 'AI', 'sparkle'],
  ];

  function shell(active, main) {
    const root = U.$('#app');
    root.innerHTML = '';
    A.app.view = 'home';
    const name = A.app.profile?.name || 'You';
    const side = h('nav.home-side',
      h('div.brandmark', h('span.logo', 'A'), h('span.logo-text', 'Atelier')),
      h('button.btn.create', { onclick: (e) => H.createMenu(e.currentTarget) }, U.ic('plus', 18), h('span', 'Create')),
      ...NAV.map(([id, label, icon]) => h('a.side-link' + (id === active ? '.on' : ''), { href: '#/' + id }, U.ic(icon, 22), h('span', label))),
      h('div.flex1'),
      h('button.side-link', { onclick: () => H.settings() }, U.ic('settings', 22), h('span', 'Settings')),
      h('button.side-link.me', { onclick: () => H.settings('profile') }, h('span.avatar', name[0].toUpperCase()), h('span', name))
    );
    const bell = h('button.icon-btn', { title: 'Notifications', onclick: (e) => notifications(e.currentTarget) }, U.ic('bell'));
    if ((A.app.notifications || []).some((n) => !n.read)) bell.classList.add('dot');
    const top = h('header.home-top',
      h('button.icon-btn.mobile-only', { title: 'Menu', onclick: () => document.body.classList.toggle('side-open') }, U.ic('menu')),
      h('div.flex1'),
      bell,
      h('button.icon-btn', { title: 'Help & shortcuts', onclick: () => H.shortcuts() }, U.ic('help')),
      h('button.avatar-btn', { title: 'Account', onclick: (e) => U.menu(e.currentTarget, [
        { header: (A.app.profile?.name || 'You') + ' · stored on this device' },
        { label: 'Settings', icon: 'settings', onClick: () => H.settings() },
        { label: 'Brand Kit', icon: 'brand', onClick: () => A.app.go('#/brand') },
        { label: 'Back up all data', icon: 'download', onClick: () => backup() },
        { label: 'Restore from backup', icon: 'upload', onClick: () => restore() },
        { label: 'About Atelier', icon: 'help', onClick: () => H.settings('about') },
      ], { align: 'right' }) }, h('span.avatar', name[0].toUpperCase()))
    );
    root.appendChild(h('div.home', side, h('div.home-main', top, h('div.home-content', main))));
    document.body.classList.remove('side-open');
    side.addEventListener('click', (e) => e.target.closest('a') && document.body.classList.remove('side-open'));
  }

  // ---------- create ----------
  H.newDesign = async ({ type, w, h: hh, title, pages } = {}) => {
    const d = M.newDesign({ type, w, h: hh, title });
    if (pages) d.pages = pages;
    const t = M.type(type);
    if (type === 'doc' && !pages) {
      const el = M.newText({ text: 'Untitled document', x: 72, y: 72, w: 672, size: 44, bold: true });
      el.h = R.textHeight(el);
      const p = M.newText({ text: 'Start writing here…', x: 72, y: 150, w: 672, size: 18, color: '#444' });
      p.h = R.textHeight(p);
      d.pages[0].elements.push(el, p);
    }
    if (type === 'whiteboard' && !pages) d.pages[0].bg = { color: '#f7f7f9' };
    if (type === 'sheet' && !pages) d.pages[0].elements.push(M.newTable(10, 5, { x: 40, y: 40, w: d.width - 80, h: 500, headerFill: '#0ba360' }));
    if (t.video && !pages) d.pages[0].bg = { color: '#111111' };
    await S.saveDesign(d);
    A.app.go('#/design/' + d.id);
    return d;
  };
  H.createMenu = (anchor) => {
    const items = [{ header: 'Create a design' }];
    for (const t of M.TYPES) {
      if (t.presets) items.push({ label: t.label + '…', icon: t.icon, onClick: () => presetPicker(t) });
      else items.push({ label: t.label, icon: t.icon, onClick: () => H.newDesign({ type: t.id }) });
    }
    items.push({ divider: true }, { label: 'Custom size', icon: 'custom', onClick: () => customSize() }, { label: 'Import file', icon: 'upload', onClick: () => importFiles() }, A.AI.ready() ? { label: 'Design with AI', icon: 'sparkle', onClick: () => A.app.go('#/ai') } : null);
    U.menu(anchor, items);
  };
  function presetPicker(t) {
    let m;
    m = U.modal({ title: t.label, body: h('div.preset-list', t.presets.map(([n, w, hh]) => h('button.preset', { onclick: () => { m.close(); H.newDesign({ type: t.id, w, h: hh, title: n }); } }, h('b', n), h('span.muted', `${w} × ${hh} px`)))) });
  }
  function customSize() {
    const w = h('input.input', { type: 'number', value: 1080, min: 1 }), hh = h('input.input', { type: 'number', value: 1080, min: 1 });
    const unit = h('select.input', ['px', 'in', 'cm', 'mm'].map((u) => h('option', { value: u }, u)));
    const k = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
    U.modal({
      title: 'Custom size',
      body: h('div.row.custom-size', h('label.field', h('span', 'Width'), w), h('label.field', h('span', 'Height'), hh), h('label.field', h('span', 'Units'), unit)),
      actions: [{ label: 'Cancel' }, { label: 'Create new design', primary: true, onClick: () => {
        const W = Math.round(+w.value * k[unit.value]), HH = Math.round(+hh.value * k[unit.value]);
        if (!(W >= 10 && HH >= 10 && W <= 20000 && HH <= 20000)) { U.toast('Size must be between 10 and 20000 px'); return false; }
        H.newDesign({ type: 'custom', w: W, h: HH, title: `Custom ${W}×${HH}` });
      } }],
    });
  }
  // Callers that redraw their own view pass reroute: false (re-routing resets e.g. the Projects tab).
  async function importFiles({ reroute = true } = {}) {
    const files = await U.pickFiles('.json,image/*,audio/*,.ttf,.otf,.woff,.woff2,.svg');
    for (const f of files) await A.app.importFile(f);
    if (reroute && A.app.view === 'home') A.app.route();
  }

  // ---------- design cards ----------
  function designCard(d, onChange) {
    const t = M.type(d.type);
    const img = h('div.card-thumb', d.thumb ? h('img', { src: d.thumb, alt: '', loading: 'lazy' }) : h('span.muted', 'No preview'));
    const star = h('button.icon-btn.sm.star' + (d.starred ? '.on' : ''), { title: d.starred ? 'Unstar' : 'Star', onclick: async (e) => { e.stopPropagation(); d.starred = !d.starred; await S.put('designs', d); onChange && onChange(); } }, U.ic(d.starred ? 'star2' : 'star', 16));
    const more = h('button.icon-btn.sm', { title: 'More', onclick: (e) => { e.stopPropagation(); cardMenu(e.currentTarget, d, onChange); } }, U.ic('more', 16));
    return h('div.card', { onclick: () => A.app.go('#/design/' + d.id), tabindex: 0, onkeydown: (e) => e.key === 'Enter' && e.target === e.currentTarget && A.app.go('#/design/' + d.id) },
      img, h('div.card-actions', star, more),
      h('div.card-info', h('b.card-title', d.title), h('span.muted.small', (t.id === 'custom' ? `${d.width}×${d.height}` : t.label) + ' · ' + U.timeAgo(d.updatedAt))));
  }
  async function cardMenu(anchor, d, onChange) {
    const folders = await S.listFolders();
    U.menu(anchor, [
      { label: 'Open', icon: 'fwd', onClick: () => A.app.go('#/design/' + d.id) },
      { label: 'Rename', icon: 'text', onClick: async () => { const v = await U.prompt('Rename design', d.title); if (v) { d.title = v; await S.put('designs', d); onChange && onChange(); } } },
      { label: 'Make a copy', icon: 'copy', onClick: async () => { const c = U.clone(d); c.id = U.uid('d_'); c.title += ' (copy)'; c.createdAt = Date.now(); await S.saveDesign(c); onChange && onChange(); } },
      { label: 'Download design file', icon: 'download', onClick: async () => U.download(await S.exportDesignFile(d), U.safeName(d.title) + '.atelier.json') },
      { label: 'Schedule post', icon: 'calendar', onClick: () => H.schedule(d) },
      folders.length ? { header: 'Move to folder' } : null,
      ...folders.map((f) => ({ label: (d.folderId === f.id ? '✓ ' : '') + f.name, icon: 'folder', onClick: async () => { d.folderId = d.folderId === f.id ? null : f.id; await S.put('designs', d); onChange && onChange(); } })),
      { label: 'New folder…', icon: 'plus', onClick: async () => { const n = await U.prompt('Folder name'); if (n) { const f = { id: U.uid('f_'), name: n, createdAt: Date.now() }; await S.put('folders', f); d.folderId = f.id; await S.put('designs', d); onChange && onChange(); } } },
      { divider: true },
      { label: 'Move to trash', icon: 'trash', danger: true, onClick: async () => { await S.trashDesign(d.id); U.toast('Moved to trash. Items stay in the trash for 30 days.'); onChange && onChange(); } },
    ]);
  }

  // ---------- Home ----------
  H.home = async () => {
    let designs = await S.listDesigns();
    const scope = { v: 'all' };
    const input = h('input.hero-input', { placeholder: 'What will you design today?', 'aria-label': 'Search' });
    const results = h('div.hero-results');
    const runSearch = () => {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = '';
      if (!q) return;
      if (scope.v === 'ai') {
        results.append(h('button.result', { onclick: () => aiCreate(input.value) }, U.ic('sparkle', 18), ' Design “' + input.value + '” with AI'));
        return;
      }
      const ds = scope.v !== 'templates' ? designs.filter((d) => d.title.toLowerCase().includes(q)).slice(0, 6) : [];
      const ts = scope.v !== 'designs' ? [...(A.app.userTemplates || []), ...A.TEMPLATES].filter((t) => (t.name + ' ' + (t.tags || '') + ' ' + t.type).toLowerCase().includes(q)).slice(0, 8) : [];
      ds.forEach((d) => results.append(h('button.result', { onclick: () => A.app.go('#/design/' + d.id) }, U.ic('file', 18), ' ' + d.title, h('span.muted.small', ' · your design'))));
      ts.forEach((t) => results.append(h('button.result', { onclick: () => useTemplate(t) }, U.ic('template', 18), ' ' + t.name, h('span.muted.small', ' · template'))));
      if (A.AI.ready()) results.append(h('button.result', { onclick: () => aiCreate(input.value) }, U.ic('sparkle', 18), ' Design “' + input.value + '” with AI'));
      if (!results.children.length) results.append(h('div.muted.result', 'No matches. Try another word.'));
    };
    input.addEventListener('input', runSearch);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') results.querySelector('.result')?.click(); });
    const scopes = h('div.hero-scopes', [['all', 'All'], ['designs', 'Your designs'], ['templates', 'Templates'], ['ai', 'AI']].map(([v, l]) => h('button.scope' + (v === 'all' ? '.on' : ''), { onclick: (e) => { scope.v = v; U.$$('.scope').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); runSearch(); input.focus(); } }, l)));
    const types = h('div.type-row',
      ...M.TYPES.map((t) => h('button.type-btn', { onclick: () => (t.presets ? presetPicker(t) : H.newDesign({ type: t.id })) }, h('span.type-ic', { style: { background: t.color } }, U.ic(t.icon, 24)), h('span', t.label))),
      h('button.type-btn', { onclick: () => customSize() }, h('span.type-ic', { style: { background: '#6b6b80' } }, U.ic('custom', 24)), h('span', 'Custom size')),
      h('button.type-btn', { onclick: () => importFiles() }, h('span.type-ic', { style: { background: '#3d3d4e' } }, U.ic('upload', 24)), h('span', 'Upload')),
      h('button.type-btn', { onclick: (e) => H.createMenu(e.currentTarget) }, h('span.type-ic', { style: { background: '#9a9ab0' } }, U.ic('more', 24)), h('span', 'More'))
    );
    const recent = h('div.card-grid');
    const renderRecent = async () => {
      const ds = (designs = await S.listDesigns());
      runSearch();
      recent.innerHTML = '';
      if (!ds.length) recent.append(h('div.empty', h('p', 'Your designs will show up here.'), h('button.btn.primary', { onclick: () => H.newDesign({ type: 'social', w: 1080, h: 1080, title: 'My first design' }) }, 'Start your first design')));
      ds.slice(0, 12).forEach((d) => recent.append(designCard(d, renderRecent)));
    };
    renderRecent();
    const tplRow = h('div.tpl-row', A.TEMPLATES.slice(0, 8).map((t) => h('button.tpl-card', { onclick: () => useTemplate(t) }, h('img', { src: A.templatePreview(t), alt: t.name, loading: 'lazy' }), h('span', t.name))));
    shell('home', h('div',
      h('section.hero', h('h1', 'What will you design today?'), h('div.hero-search', U.ic('search', 22), input), scopes, results),
      types,
      h('div.sec-head', h('h2', 'Start with a template'), h('a.link', { href: '#/templates' }, 'See all')),
      tplRow,
      h('div.sec-head', h('h2', 'Recent designs'), h('a.link', { href: '#/projects' }, 'See all')),
      recent
    ));
    setTimeout(() => innerWidth > 700 && input.focus(), 50);
  };
  async function useTemplate(t) {
    const d = t.design ? U.clone(t.design) : A.templateDesign(t);
    d.id = U.uid('d_');
    d.createdAt = Date.now();
    d.title = t.name;
    // a user template is a copy of a design: the new one starts unstarred and outside any folder
    d.starred = false;
    d.folderId = null;
    delete d.deletedAt;
    await S.saveDesign(d);
    A.app.go('#/design/' + d.id);
  }
  async function aiCreate(prompt, type = 'social', w = 1080, hh = 1080, pages = 1) {
    if (!A.AI.ready()) return H.settings('ai');
    U.toast('Designing with AI…');
    try {
      const r = await A.AI.design(prompt, w, hh, pages);
      if (!r.pages.length) throw new Error('No pages were generated. Try rewording.');
      await H.newDesign({ type, w, h: hh, title: r.title || prompt.slice(0, 40), pages: r.pages });
    } catch (e) {
      U.toast(e.message, 'error');
    }
  }

  // ---------- Projects ----------
  H.projects = async (tab = 'all') => {
    const main = h('div');
    const state = { tab, type: '', sort: 'edited', folder: null };
    const render = async () => {
      main.innerHTML = '';
      const folders = await S.listFolders();
      const tabs = h('div.p-tabs.wide', [['all', 'All'], ['folders', 'Folders'], ['starred', 'Starred'], ['uploads', 'Uploads'], ['shared', 'Shared with you'], ['trash', 'Trash']].map(([id, l]) => h('button.p-tab' + (state.tab === id ? '.on' : ''), { onclick: () => { state.tab = id; state.folder = null; render(); } }, l)));
      main.append(h('div.page-title', h('h1', 'Projects'), h('button.btn', { onclick: async () => { const n = await U.prompt('Folder name'); if (n) { await S.put('folders', { id: U.uid('f_'), name: n, createdAt: Date.now() }); state.tab = 'folders'; render(); } } }, U.ic('plus', 16), ' New folder')), tabs);
      if (state.tab === 'uploads') {
        const assets = await S.listAssets();
        await S.ensureAssetURLs(assets.filter((a) => a.kind === 'image').map((a) => a.id));
        main.append(h('div.row', h('button.btn.primary', { onclick: async () => { await importFiles({ reroute: false }); render(); } }, U.ic('upload', 16), ' Upload')));
        const grid = h('div.upload-grid');
        if (!assets.length) grid.append(h('p.muted', 'No uploads yet.'));
        assets.forEach((a) => grid.append(h('div.upload-card', a.kind === 'image' ? h('img', { src: S.assetURL(a.id), alt: a.name }) : h('div.file-ic', U.ic(a.kind === 'audio' ? 'music' : a.kind === 'font' ? 'text' : 'file', 32)), h('span.small', a.name), h('button.icon-btn.sm', { title: 'Delete', onclick: async () => { if (await U.confirm('Delete this upload? Designs using it will show a blank placeholder.', 'Delete', true)) { await S.del('assets', a.id); await dropFromBrand(a.id); render(); } } }, U.ic('trash', 14)))));
        main.append(grid);
        return;
      }
      if (state.tab === 'shared') {
        main.append(h('div.empty', h('p', 'Designs that other people send you appear here after you import them.'), h('p.muted', 'Atelier has no accounts or cloud – collaborators share .atelier.json design files.'), h('button.btn.primary', { onclick: async () => { await importFiles({ reroute: false }); state.tab = 'all'; render(); } }, 'Import a design file')));
        return;
      }
      if (state.tab === 'folders' && !state.folder) {
        const grid = h('div.folder-grid');
        if (!folders.length) grid.append(h('p.muted', 'No folders yet.'));
        const all = await S.listDesigns();
        folders.forEach((f) => grid.append(h('div.folder', { onclick: () => { state.folder = f; render(); } }, U.ic('folder', 36), h('b', f.name), h('span.muted.small', all.filter((d) => d.folderId === f.id).length + ' designs'), h('button.icon-btn.sm', { title: 'More', onclick: (e) => { e.stopPropagation(); U.menu(e.currentTarget, [
          { label: 'Rename', icon: 'text', onClick: async () => { const n = await U.prompt('Rename folder', f.name); if (n) { f.name = n; await S.put('folders', f); render(); } } },
          { label: 'Delete folder', icon: 'trash', danger: true, onClick: async () => { for (const d of all.filter((x) => x.folderId === f.id)) { d.folderId = null; await S.put('designs', d); } await S.del('folders', f.id); render(); } },
        ]); } }, U.ic('more', 14)))));
        main.append(grid);
        return;
      }
      const filters = h('div.filters',
        h('select.input.sm', { onchange: (e) => { state.type = e.target.value; render(); } }, h('option', { value: '' }, 'All types'), ...M.TYPES.map((t) => h('option', { value: t.id, selected: state.type === t.id ? true : null }, t.label)), h('option', { value: 'custom', selected: state.type === 'custom' ? true : null }, 'Custom')),
        h('select.input.sm', { onchange: (e) => { state.sort = e.target.value; render(); } }, [['edited', 'Last edited'], ['created', 'Date created'], ['name', 'Name']].map(([v, l]) => h('option', { value: v, selected: state.sort === v ? true : null }, l)))
      );
      if (state.folder) main.append(h('div.row', h('button.btn.sm', { onclick: () => { state.folder = null; render(); } }, U.ic('back', 14), ' Folders'), h('h3', state.folder.name)));
      main.append(filters);
      let ds = await S.listDesigns({ trash: state.tab === 'trash' });
      if (state.tab === 'starred') ds = ds.filter((d) => d.starred);
      if (state.folder) ds = ds.filter((d) => d.folderId === state.folder.id);
      if (state.type) ds = ds.filter((d) => d.type === state.type);
      if (state.sort === 'created') ds.sort((a, b) => b.createdAt - a.createdAt);
      if (state.sort === 'name') ds.sort((a, b) => a.title.localeCompare(b.title));
      const grid = h('div.card-grid');
      if (state.tab === 'trash') {
        main.append(h('p.muted', 'Designs in the trash are deleted for good after 30 days.'));
        if (ds.length) main.append(h('button.btn.sm.danger', { onclick: async () => { if (await U.confirm('Permanently delete everything in the trash?', 'Empty trash', true)) { for (const d of await S.listDesigns({ trash: true })) await S.deleteForever(d.id); render(); } } }, 'Empty trash'));
        ds.forEach((d) => grid.append(h('div.card.trash', h('div.card-thumb', d.thumb ? h('img', { src: d.thumb, alt: '' }) : null), h('div.card-info', h('b.card-title', d.title), h('span.muted.small', Math.max(0, 30 - Math.floor((Date.now() - d.deletedAt) / 86400000)) + ' days left')), h('div.row', h('button.btn.sm', { onclick: async () => { await S.restoreDesign(d.id); render(); } }, 'Restore'), h('button.btn.sm.danger', { onclick: async () => { if (await U.confirm('Delete forever? This cannot be undone.', 'Delete', true)) { await S.deleteForever(d.id); render(); } } }, 'Delete')))));
      } else ds.forEach((d) => grid.append(designCard(d, render)));
      if (!ds.length) grid.append(h('p.muted', state.tab === 'trash' ? 'The trash is empty.' : 'Nothing here yet.'));
      main.append(grid);
    };
    shell('projects', main);
    render();
  };

  // ---------- Templates ----------
  H.templates = () => {
    const state = { type: '', q: '' };
    const grid = h('div.tpl-grid.big');
    const render = () => {
      grid.innerHTML = '';
      const all = [...(A.app.userTemplates || []).map((t) => ({ ...t, mine: true })), ...A.TEMPLATES];
      all.filter((t) => (!state.type || t.type === state.type) && (!state.q || (t.name + ' ' + (t.tags || '')).toLowerCase().includes(state.q)))
        .forEach((t) => grid.append(h('div.tpl-card', { onclick: () => useTemplate(t) }, h('img', { src: t.thumb || A.templatePreview(t), alt: t.name, loading: 'lazy' }), h('span', t.name + (t.mine ? ' (yours)' : '')), h('span.muted.small', M.type(t.type).label + ' · ' + t.w + '×' + t.h), t.mine ? h('button.icon-btn.sm.tpl-del', { title: 'Delete template', onclick: async (e) => { e.stopPropagation(); A.app.userTemplates = A.app.userTemplates.filter((x) => x.id !== t.id); await S.setKv('userTemplates', A.app.userTemplates); render(); } }, U.ic('trash', 14)) : null)));
      if (!grid.children.length) grid.append(h('p.muted', 'No templates match.'));
    };
    const search = h('input.input', { placeholder: 'Search templates', type: 'search' });
    search.addEventListener('input', () => { state.q = search.value.toLowerCase(); render(); });
    const chips = h('div.chip-row', [['', 'All'], ...M.TYPES.map((t) => [t.id, t.label])].map(([id, l]) => h('button.chip' + (id === '' ? '.on' : ''), { onclick: (e) => { state.type = id; U.$$('.chip', chips).forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); render(); } }, l)));
    render();
    shell('templates', h('div', h('div.page-title', h('h1', 'Templates')), search, chips, grid));
  };

  // ---------- Brand ----------
  async function dropFromBrand(id) {
    const b = A.app.brand;
    for (const k of ['logos', 'photos', 'icons']) b[k] = (b[k] || []).filter((x) => x !== id);
    await A.app.saveBrand();
  }
  H.brand = async () => {
    const b = A.app.brand;
    const main = h('div');
    const save = async () => { await A.app.saveBrand(); render(); };
    const imgList = async (key, label) => {
      await S.ensureAssetURLs(b[key] || []);
      // ids of deleted uploads would show as broken tiles
      const ids = (b[key] || []).filter((id) => S.assetURL(id));
      return h('div.brand-sec', h('h3', label), h('div.brand-imgs', ...ids.map((id) => h('div.brand-img', h('img', { src: S.assetURL(id), alt: '' }), h('button.icon-btn.sm', { title: 'Remove', onclick: () => { b[key] = ids.filter((x) => x !== id); save(); } }, U.ic('x', 12)))), h('button.add-tile', { onclick: async () => { const files = await U.pickFiles('image/*'); for (const f of files) { const a = await S.addAsset(f, { name: f.name, tag: 'brand' }); b[key] = [...(b[key] || []), a.id]; } save(); } }, U.ic('plus', 24))));
    };
    const render = async () => {
      main.innerHTML = '';
      main.append(h('div.page-title', h('h1', 'Brand Kit'), h('span.muted', 'Your brand colours and fonts appear at the top of every picker.')));
      main.append(await imgList('logos', 'Logos'));
      const colorTiles = (b.colors || []).map((c, i) => h('div.brand-color', { style: { background: c }, title: c }, h('span', c), h('button.icon-btn.sm', { title: 'Remove', onclick: () => { b.colors.splice(i, 1); save(); } }, U.ic('x', 12))));
      const addColor = h('label.add-tile', { title: 'Add colour' }, U.ic('plus', 24), h('input.native-color.hidden', { type: 'color', onchange: (e) => { b.colors = [...(b.colors || []), e.target.value]; save(); } }));
      main.append(h('div.brand-sec', h('h3', 'Brand colours'), h('div.brand-colors', ...colorTiles, addColor)));
      const fontSel = (key, label) => {
        const sel = h('select.input', h('option', { value: '' }, '—'), ...[...M.customFonts.map((f) => f.name), ...M.FONTS.map((f) => f[0])].map((n) => h('option', { value: n, selected: b.fonts?.[key] === n ? true : null }, n)));
        sel.addEventListener('change', () => { b.fonts = { ...(b.fonts || {}), [key]: sel.value }; save(); });
        return h('label.field', h('span', label), sel, b.fonts?.[key] ? h('div.font-sample', { style: { fontFamily: M.fontStack(b.fonts[key]) } }, 'The quick brown fox') : null);
      };
      main.append(h('div.brand-sec', h('h3', 'Brand fonts'), h('div.brand-fonts', fontSel('heading', 'Heading'), fontSel('subheading', 'Subheading'), fontSel('body', 'Body')), h('button.btn.sm', { onclick: async () => { const files = await U.pickFiles('.ttf,.otf,.woff,.woff2'); for (const f of files) await A.app.importFile(f); render(); } }, U.ic('upload', 14), ' Upload a font')));
      main.append(await imgList('photos', 'Photos'));
      main.append(await imgList('icons', 'Icons & graphics'));
      const voice = h('textarea.input', { rows: 4, placeholder: 'Describe how your brand sounds, e.g. "Warm, clear and upbeat. Short sentences. No jargon."' });
      voice.value = b.voice || '';
      voice.addEventListener('change', () => { b.voice = voice.value; A.app.saveBrand(); U.toast('Brand voice saved', 'ok'); });
      main.append(h('div.brand-sec', h('h3', 'Brand voice'), h('p.muted.small', 'Used by AI writing tools.'), voice));
    };
    shell('brand', main);
    render();
  };

  // ---------- Apps ----------
  H.apps = () => {
    const apps = [
      ['Gradient maker', 'Smooth gradient images and backgrounds', 'sparkle'], ['Pattern maker', 'Seamless dots, stripes, waves…', 'grid'], ['Palette generator', 'Colour harmonies from one colour', 'brand'],
      ['Placeholder text', 'Sample copy for layouts', 'text'], ['Link card', 'Clickable buttons for websites', 'link'], ['Mini-app builder (AI)', 'Small interactive widgets from a prompt', 'code'],
      ['Background remover', 'On-device, in the photo editor', 'wand'], ['Magic eraser', 'Remove objects from photos', 'eraser'], ['Charts & tables', 'With simple spreadsheet formulas', 'chart'],
    ];
    shell('apps', h('div', h('div.page-title', h('h1', 'Apps'), h('span.muted', 'Built-in tools. Open any design and find them under Apps in the editor.')),
      h('div.app-cards', apps.map(([n, d, i]) => h('div.app-card', h('span.app-ic.big', U.ic(i, 26)), h('b', n), h('span.muted.small', d)))),
      h('p.muted', 'Atelier is open source – new apps can be added in app/js/panels.js.')));
  };

  // ---------- AI ----------
  H.ai = () => {
    const prompt = h('textarea.input.big', { rows: 4, placeholder: 'Describe what you want, e.g. “An Instagram post announcing our bakery’s grand opening on Saturday”' });
    const type = h('select.input', [['social', 1080, 1080, 'Square post'], ['social', 1080, 1920, 'Story'], ['presentation', 1920, 1080, 'Presentation (5 pages)'], ['print', 794, 1123, 'A4 flyer'], ['social', 1280, 720, 'Video thumbnail'], ['website', 1366, 768, 'Website (2 pages)']].map(([t, w, hh, l], i) => h('option', { value: i }, l)));
    const opts = [['social', 1080, 1080, 1], ['social', 1080, 1920, 1], ['presentation', 1920, 1080, 5], ['print', 794, 1123, 1], ['social', 1280, 720, 1], ['website', 1366, 768, 2]];
    const btn = h('button.btn.primary', { onclick: async () => {
      if (!prompt.value.trim()) return U.toast('Describe your design first');
      btn.disabled = true;
      btn.textContent = 'Designing…';
      const [t, w, hh, p] = opts[+type.value];
      await aiCreate(prompt.value, t, w, hh, p);
      btn.disabled = false;
      btn.textContent = 'Generate design';
    } }, 'Generate design');
    shell('ai', h('div.ai-home',
      h('section.hero.small', h('h1', U.ic('sparkle', 28), ' Create with AI'), h('p', 'Generate first drafts, write copy, translate designs and create graphics.')),
      A.AI.ready() ? null : h('div.notice', 'AI is optional and off by default. To use it, add your own Anthropic API key in ', h('button.link', { onclick: () => H.settings('ai') }, 'Settings → AI'), '. The key is stored only on this device.'),
      h('div.ai-box', prompt, h('div.row', type, btn)),
      h('div.app-cards', [['Write & rewrite', 'In the editor: AI → Write for me', 'text'], ['Generate graphics', 'Vector illustrations from a prompt', 'image'], ['Translate', 'Whole designs, any language', 'globe'], ['Design assistant', 'Chat to edit the current page', 'comment'], ['Mini-apps', 'Interactive widgets', 'code']].map(([n, d, i]) => h('div.app-card', h('span.app-ic.big', U.ic(i, 26)), h('b', n), h('span.muted.small', d))))
    ));
  };

  // ---------- Planner (content calendar) ----------
  let plannerMonth = null; // the month on screen, kept when a post is saved or deleted
  H.planner = async (month) => {
    const now = new Date();
    const cur = (plannerMonth = month || new Date(now.getFullYear(), now.getMonth(), 1));
    const items = A.app.planner || [];
    const designs = await S.listDesigns();
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const grid = h('div.cal-grid', ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div.cal-dow', d)));
    for (let i = 0; i < 42; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = U.ymd(day);
      const dayItems = items.filter((it) => it.date === key);
      grid.append(h('div.cal-day' + (day.getMonth() !== cur.getMonth() ? '.other' : '') + (key === U.ymd(now) ? '.today' : ''), { onclick: (e) => { if (e.target.closest('.cal-item')) return; H.schedule(null, key); } },
        h('span.cal-num', String(day.getDate())),
        ...dayItems.map((it) => {
          const d = designs.find((x) => x.id === it.designId);
          return h('div.cal-item' + (it.done ? '.done' : ''), { title: it.caption, onclick: () => editItem(it) }, (it.time || '') + ' ' + (d ? d.title : it.caption || 'Post'));
        })));
    }
    shell('planner', h('div',
      h('div.page-title', h('h1', 'Content planner'), h('div.row',
        h('button.icon-btn', { title: 'Previous month', onclick: () => H.planner(new Date(cur.getFullYear(), cur.getMonth() - 1, 1)) }, U.ic('back')),
        h('b', cur.toLocaleString(undefined, { month: 'long', year: 'numeric' })),
        h('button.icon-btn', { title: 'Next month', onclick: () => H.planner(new Date(cur.getFullYear(), cur.getMonth() + 1, 1)) }, U.ic('fwd')),
        h('button.btn.primary', { onclick: () => H.schedule() }, U.ic('plus', 16), ' Schedule'))),
      h('p.muted', 'Plan your posts. Atelier reminds you when a post is due while the app is open; you then download and post it yourself.'),
      grid));
  };
  function editItem(it) {
    H.schedule(null, null, it);
  }
  H.schedule = async (design, date, existing) => {
    const designs = await S.listDesigns();
    const it = existing || { id: U.uid('s_'), designId: design?.id || designs[0]?.id || '', date: date || U.ymd(), time: '09:00', caption: '', channel: '' };
    const dsel = h('select.input', h('option', { value: '' }, '— none —'), ...designs.map((d) => h('option', { value: d.id, selected: d.id === it.designId ? true : null }, d.title)));
    const di = h('input.input', { type: 'date', value: it.date });
    const ti = h('input.input', { type: 'time', value: it.time });
    const ch = h('input.input', { placeholder: 'Where will you post it? (optional)', value: it.channel });
    const cap = h('textarea.input', { rows: 3, placeholder: 'Caption' });
    cap.value = it.caption;
    U.modal({
      title: existing ? 'Scheduled post' : 'Schedule a post',
      body: h('div', h('label.field', h('span', 'Design'), dsel), h('div.row', h('label.field', h('span', 'Date'), di), h('label.field', h('span', 'Time'), ti)), h('label.field', h('span', 'Channel'), ch), h('label.field', h('span', 'Caption'), cap)),
      actions: [
        existing ? { label: 'Delete', danger: true, onClick: async () => { A.app.planner = A.app.planner.filter((x) => x.id !== it.id); await S.setKv('planner', A.app.planner); if (location.hash.startsWith('#/planner')) H.planner(plannerMonth); } } : null,
        { label: 'Cancel' },
        { label: 'Save', primary: true, onClick: async () => {
          // a post already reminded about is only reminded again if it moves to another time
          const notified = !!it.notified && it.date === di.value && it.time === ti.value;
          Object.assign(it, { designId: dsel.value, date: di.value, time: ti.value, caption: cap.value, channel: ch.value, notified });
          A.app.planner = [...(A.app.planner || []).filter((x) => x.id !== it.id), it];
          await S.setKv('planner', A.app.planner);
          U.toast('Scheduled', 'ok');
          if (location.hash.startsWith('#/planner')) H.planner(plannerMonth);
        } },
      ].filter(Boolean),
    });
  };

  // ---------- notifications ----------
  function notifications(anchor) {
    const list = A.app.notifications || [];
    U.popover(anchor, h('div.notif',
      h('h4', 'Notifications'),
      list.length ? list.slice().reverse().slice(0, 20).map((n) => h('div.notif-item' + (n.read ? '' : '.unread'), h('div', n.text), h('span.muted.small', U.timeAgo(n.ts)))) : h('p.muted', 'You’re all caught up.'),
      list.length ? h('button.link', { onclick: async () => { A.app.notifications = []; await S.setKv('notifications', []); U.closePop(); A.app.route(); } }, 'Clear all') : null
    ), { align: 'right' });
    list.forEach((n) => (n.read = true));
    S.setKv('notifications', list);
    anchor.classList.remove('dot');
  }

  // ---------- help ----------
  H.shortcuts = () => {
    const rows = [
      ['T', 'Add text box'], ['R', 'Add rectangle'], ['C', 'Add circle'], ['L', 'Add line'], ['S', 'Sticky note (whiteboards)'], ['/', 'Quick actions menu'],
      ['Ctrl/⌘ + D', 'Duplicate'], ['Ctrl/⌘ + G', 'Group'], ['Shift + Ctrl/⌘ + G', 'Ungroup'], ['Ctrl/⌘ + C / X / V', 'Copy / cut / paste'], ['Ctrl/⌘ + A', 'Select all'],
      ['Ctrl/⌘ + Z / Y', 'Undo / redo'], ['Ctrl/⌘ + B / I / U', 'Bold / italic / underline'], ['Alt/Option + drag', 'Copy while dragging'], ['Shift + drag corner', 'Keep / free proportions'], ['Shift + rotate', 'Snap rotation to 15°'],
      ['Arrow keys', 'Nudge 1px'], ['Shift + arrows', 'Nudge 10px'], ['Ctrl/⌘ + drag', 'Move without snapping'], ['Enter', 'Edit selected text'], ['Delete', 'Delete selection'], ['Esc', 'Deselect / exit tool'],
      ['Ctrl/⌘ + + / − / 0', 'Zoom in / out / fit'], ['Ctrl/⌘ + Enter', 'Present (presentations)'], ['In present mode: ← → Space', 'Change page'], ['P / F', 'Presenter view / full screen'],
      ['Ctrl/⌘ + ] / [', 'Bring forward / send backward'], ['Shift + Ctrl/⌘ + ] / [', 'Bring to front / send to back'], ['Shift + H / V', 'Flip horizontal / vertical'],
      ['Shift + Ctrl/⌘ + L', 'Lock / unlock'], ['Shift + Ctrl/⌘ + H', 'Hide / show'], ['Ctrl/⌘ + Alt/Option + C / V', 'Copy / paste style'],
      ['Alt/Option + A / H / D', 'Align left / centre / right'], ['Alt/Option + W / V / S', 'Align top / middle / bottom'], ['Shift + click', 'Add to selection, set the key object'],
      ['Tab / Shift + Tab', 'Select the next / previous element'], ['Enter on a group', 'Select inside the group'], ['Esc or Shift + Enter in a group', 'Back to the whole group'],
    ];
    U.modal({ title: 'Keyboard shortcuts', wide: true, body: h('div.shortcuts', rows.map(([k, d]) => h('div.sc-row', h('kbd', k), h('span', d)))) });
  };

  // ---------- settings ----------
  H.settings = (tab = 'general') => {
    const s = A.app.settings;
    let m;
    const body = h('div.settings');
    const render = () => {
      body.innerHTML = '';
      const tabs = h('div.p-tabs', [['general', 'General'], ['profile', 'Profile'], ['ai', 'AI'], ['data', 'Data'], ['about', 'About']].map(([id, l]) => h('button.p-tab' + (tab === id ? '.on' : ''), { onclick: () => { tab = id; render(); } }, l)));
      body.append(tabs);
      if (tab === 'general') {
        const theme = h('select.input', [['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: (s.theme || 'system') === v ? true : null }, l)));
        theme.addEventListener('change', () => { s.theme = theme.value; A.app.saveSettings(); A.app.applyTheme(); });
        body.append(h('label.field', h('span', 'Theme'), theme), h('p.muted.small', 'Everything is free and unlocked. There are no paid plans, no ads and no tracking.'));
      }
      if (tab === 'profile') {
        const name = h('input.input', { value: A.app.profile?.name || '', placeholder: 'Your name (shown on comments)' });
        name.addEventListener('change', async () => {
          const n = name.value.trim() || 'You';
          A.app.profile = { ...(A.app.profile || {}), name: n };
          await S.setKv('profile', A.app.profile);
          // update the sidebar and avatar in place: re-routing would reset the page behind the dialog
          U.$('.side-link.me')?.replaceChildren(h('span.avatar', n[0].toUpperCase()), h('span', n));
          const av = U.$('.avatar-btn .avatar');
          if (av) av.textContent = n[0].toUpperCase();
          U.toast('Saved', 'ok');
        });
        body.append(h('label.field', h('span', 'Display name'), name), h('p.muted.small', 'Your profile lives only on this device. Atelier has no accounts.'));
      }
      if (tab === 'ai') {
        const en = h('input', { type: 'checkbox', checked: s.aiEnabled !== false });
        en.addEventListener('change', () => { s.aiEnabled = en.checked; A.app.saveSettings(); });
        const key = h('input.input', { type: 'password', value: s.apiKey || '', placeholder: 'sk-ant-…', autocomplete: 'off' });
        key.addEventListener('change', () => { s.apiKey = key.value.trim(); A.app.saveSettings(); U.toast(s.apiKey ? 'API key saved on this device' : 'API key removed', 'ok'); });
        const model = h('select.input', A.AI.MODELS.map(([v, l]) => h('option', { value: v, selected: (s.model || 'claude-opus-5-5') === v ? true : null }, l)));
        model.addEventListener('change', () => { s.model = model.value; A.app.saveSettings(); });
        const effort = h('select.input', [['', 'Default'], ['low', 'Low (faster, cheaper)'], ['medium', 'Medium'], ['high', 'High (best quality)']].map(([v, l]) => h('option', { value: v, selected: (s.effort || '') === v ? true : null }, l)));
        effort.addEventListener('change', () => { s.effort = effort.value; A.app.saveSettings(); });
        body.append(
          h('p', 'AI features are optional. They call the Anthropic API directly from this app using your own API key, and you pay Anthropic for what you use.'),
          h('label.check', en, ' Enable AI features'),
          h('label.field', h('span', 'Anthropic API key'), key),
          h('p.muted.small', 'Your key is stored only on this device (in the app’s local storage) and is sent only to api.anthropic.com. It is never included in exported files or backups.'),
          h('label.field', h('span', 'Model'), model),
          h('label.field', h('span', 'Effort'), effort),
          h('button.btn.sm', { onclick: async (e) => { e.target.disabled = true; try { const t = await A.AI.ask('Reply with the single word: ready', 'Be brief.', { maxTokens: 50, effort: 'low' }); U.toast('Connected: ' + t.trim(), 'ok'); } catch (err) { U.toast(err.message, 'error'); } e.target.disabled = false; } }, 'Test connection')
        );
      }
      if (tab === 'data') {
        body.append(
          h('p', 'All designs, uploads and settings are stored locally in this app. Back up regularly, especially before clearing browser data.'),
          h('div.row', h('button.btn', { onclick: backup }, U.ic('download', 16), ' Back up everything'), h('button.btn', { onclick: restore }, U.ic('upload', 16), ' Restore backup')),
          h('button.btn.danger', { onclick: async () => { if (await U.confirm('Delete ALL designs, uploads and settings on this device? This cannot be undone.', 'Delete everything', true)) { await S.clearAll(); localStorage.clear(); location.hash = '#/home'; location.reload(); } } }, 'Delete all data')
        );
      }
      if (tab === 'about') {
        body.append(
          h('h3', 'Atelier ' + A.VERSION),
          h('p', 'A free, open-source design studio for posters, social posts, presentations, documents, whiteboards, videos and websites.'),
          h('p.muted.small', 'Privacy: Atelier works offline. It has no accounts, analytics or telemetry, and it never uploads your designs. Network requests happen only if you enable AI features with your own key.'),
          h('p.muted.small', 'Released under the MIT License.')
        );
      }
    };
    render();
    m = U.modal({ title: 'Settings', body, wide: true });
  };
  async function backup() {
    U.toast('Preparing backup…');
    U.download(await S.exportBackup(), 'atelier-backup-' + U.ymd() + '.json');
  }
  async function restore() {
    const [f] = await U.pickFiles('.json', false);
    if (!f) return;
    try {
      await A.app.restoreBackup(JSON.parse(await f.text()));
    } catch (e) {
      U.toast(e.message, 'error');
    }
  }
})(window.A);
