'use strict';
// App bootstrap: router, persisted state, theme, fonts, imports, reminders.
(function (A) {
  const U = A.U, M = A.M, S = A.S;
  A.VERSION = '1.0.0';
  const app = (A.app = { view: 'home', settings: {}, brand: {}, profile: { name: 'You' }, notifications: [], planner: [], userTemplates: [] });

  app.loadState = async () => {
    app.settings = await S.kv('settings', {});
    app.brand = await S.kv('brand', { colors: [], fonts: {}, logos: [], photos: [], icons: [], voice: '' });
    app.profile = await S.kv('profile', { name: 'You' });
    app.notifications = await S.kv('notifications', []);
    app.planner = await S.kv('planner', []);
    app.userTemplates = await S.kv('userTemplates', []);
    await app.loadFonts();
  };
  app.saveSettings = () => S.setKv('settings', app.settings);
  app.saveBrand = () => S.setKv('brand', app.brand);
  app.notify = async (text) => {
    app.notifications.push({ text, ts: Date.now(), read: false });
    app.notifications = app.notifications.slice(-50);
    await S.setKv('notifications', app.notifications);
  };
  app.addRecentColor = (c) => {
    const r = [c, ...(app.settings.recentColors || []).filter((x) => x !== c)].slice(0, 10);
    app.settings.recentColors = r;
    app.saveSettings();
  };
  app.applyTheme = () => {
    const t = app.settings.theme || 'system';
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  // ---------- fonts ----------
  // One FontFace per font asset: a reload decodes only new fonts and drops those whose asset is gone.
  // A bad font asset (an imported file is untrusted) is skipped, never allowed to stop startup.
  const faces = new Map(); // asset id -> { ff, name }, null for a font that failed
  app.loadFonts = async () => {
    const fonts = await S.listAssets('font');
    for (const [id, f] of faces) if (!fonts.some((a) => a.id === id)) { f && document.fonts.delete(f.ff); faces.delete(id); }
    M.customFonts = [];
    for (const a of fonts) {
      if (!faces.has(a.id)) {
        try {
          const name = String(a.tag || String(a.name || 'Font').replace(/\.[^.]+$/, ''));
          const ff = new FontFace(name, await a.blob.arrayBuffer());
          await ff.load();
          document.fonts.add(ff);
          faces.set(a.id, { ff, name });
        } catch (e) {
          faces.set(a.id, null);
          console.warn('Font failed to load', a.name, e);
        }
      }
      const f = faces.get(a.id);
      if (f) M.customFonts.push({ name: f.name, asset: a.id });
    }
  };

  // ---------- imports ----------
  const FONT_EXT = /\.(ttf|otf|woff2?)$/i, VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv)$/i;
  app.importFile = async (f, { toEditor = false } = {}) => {
    const inEditor = toEditor && app.view === 'editor' && A.E.d;
    try {
      if (/\.json$/i.test(f.name) || f.type === 'application/json') {
        const json = JSON.parse(await f.text());
        if (json.app === 'atelier-design') {
          const d = await S.importDesignFile(json);
          await app.loadFonts();
          U.toast('Imported “' + d.title + '”', 'ok');
          await app.notify('Imported design “' + d.title + '”');
          if (!inEditor) app.go('#/design/' + d.id);
          return d;
        }
        if (json.app === 'atelier') {
          if (await U.confirm('Restore this backup? Designs with the same id will be replaced.', 'Restore')) await app.restoreBackup(json);
          return;
        }
        throw new Error('This JSON file is not an Atelier design or backup');
      }
      if (FONT_EXT.test(f.name)) {
        const family = f.name.replace(FONT_EXT, '').replace(/[-_]+/g, ' ').trim();
        await S.addAsset(f, { name: f.name, kind: 'font', tag: family });
        await app.loadFonts();
        U.toast('Font “' + family + '” added', 'ok');
        return;
      }
      if (/\.(pdf|pptx?|key|docx?)$/i.test(f.name)) {
        U.toast('PDF and Office files can’t be converted into editable designs yet. Export pages as images and upload those instead.', 'error');
        return;
      }
      if (f.type.startsWith('image/') || /\.svg$/i.test(f.name)) {
        const blob = f.type ? f : new Blob([await f.arrayBuffer()], { type: 'image/svg+xml' });
        const a = await S.addAsset(blob, { name: f.name });
        if (inEditor) A.E.addImageAsset(a);
        else U.toast('Uploaded ' + f.name, 'ok');
        return a;
      }
      // a video file without a picture is a soundtrack
      const video = f.type.startsWith('video/') || (!f.type && VIDEO_EXT.test(f.name)) ? await A.V.importVideo(f) : null;
      if (video?.kind === 'video') {
        if (inEditor) await A.V.addToPage(video);
        else U.toast('Uploaded ' + f.name, 'ok');
        return video;
      }
      if (f.type.startsWith('audio/') || video) {
        const a = video || (await S.addAsset(f, { name: f.name }));
        if (inEditor) {
          A.V.setTrack(a.id);
          U.toast('Soundtrack added', 'ok');
        } else U.toast('Uploaded ' + f.name, 'ok');
        return a;
      }
      U.toast('Unsupported file: ' + f.name, 'error');
    } catch (e) {
      console.error(e);
      U.toast('Could not import ' + f.name + ': ' + e.message, 'error');
    }
  };

  // The open design is saved and closed first, so its in-memory copy can't overwrite the restored one; route() reopens it.
  app.restoreBackup = async (json) => {
    if (json.app !== 'atelier') throw new Error('Not an Atelier backup file');
    if (A.E.d) await A.E.close();
    try {
      await S.importBackup(json);
      await app.loadState();
      app.applyTheme();
      U.toast('Backup restored', 'ok');
    } finally {
      await app.route();
    }
  };

  app.saveUserTemplate = async (d) => {
    const name = await U.prompt('Template name', d.title);
    if (!name) return;
    // d.thumb is only as fresh as the last autosave
    const thumb = (await A.R.thumbnail(d)) || d.thumb;
    const tpl = { id: U.uid('ut_'), name, type: d.type, w: d.width, h: d.height, tags: 'my template', thumb, design: U.clone({ ...d, thumb: undefined, comments: [], starred: undefined, folderId: undefined, deletedAt: undefined }) };
    app.userTemplates = [tpl, ...app.userTemplates];
    await S.setKv('userTemplates', app.userTemplates);
    U.toast('Saved to your templates', 'ok');
  };

  // ---------- routing ----------
  app.go = (hash) => {
    if (location.hash === hash) app.route();
    else location.hash = hash;
  };
  let routing = Promise.resolve();
  app.route = () => {
    routing = routing.then(doRoute).catch((e) => {
      console.error(e);
      U.toast('Something went wrong: ' + e.message, 'error');
    });
    return routing;
  };
  async function doRoute() {
    U.closePop();
    // close() also drops each dialog's key listener and settles a pending prompt/confirm
    document.querySelectorAll('.modal-back').forEach((m) => (m.close ? m.close() : m.remove()));
    const hash = location.hash || '#/home';
    const [, page, arg] = hash.split('/');
    if (page !== 'design' && A.E.d) await A.E.close();
    if (page === 'design' && arg) {
      if (A.E.d && A.E.d.id === arg) return;
      if (A.E.d) await A.E.close();
      return A.E.open(arg);
    }
    const fn = { home: A.Home.home, projects: A.Home.projects, templates: A.Home.templates, brand: A.Home.brand, apps: A.Home.apps, ai: A.Home.ai, planner: A.Home.planner }[page] || A.Home.home;
    await fn();
  }

  // ---------- reminders for scheduled posts ----------
  async function checkPlanner() {
    const now = new Date();
    let changed = false;
    for (const it of app.planner || []) {
      if (it.notified || !it.date) continue;
      const due = new Date(it.date + 'T' + (it.time || '09:00'));
      if (due <= now) {
        it.notified = true;
        changed = true;
        const d = it.designId && (await S.get('designs', it.designId));
        const msg = 'Time to post' + (d ? ' “' + d.title + '”' : '') + (it.channel ? ' on ' + it.channel : '');
        await app.notify(msg);
        U.toast(msg, 'ok');
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Atelier', { body: msg });
        } catch (e) {}
      }
    }
    if (changed) await S.setKv('planner', app.planner);
  }

  // ---------- init ----------
  app.init = async () => {
    try {
      await app.loadState();
    } catch (e) {
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif"><h2>Storage unavailable</h2><p>Atelier needs local storage (IndexedDB). Private browsing modes may block it.</p></div>';
      return;
    }
    app.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', app.applyTheme);
    await S.purgeTrash();
    document.addEventListener('keydown', (e) => A.E.onKey(e));
    // a Space released while the window is away never sends its keyup
    document.addEventListener('keyup', (e) => A.E.onKeyUp(e));
    addEventListener('blur', () => A.E.onKeyUp());
    document.addEventListener('copy', (e) => A.E.onCopyEvent(e));
    document.addEventListener('cut', (e) => A.E.onCopyEvent(e));
    document.addEventListener('paste', (e) => A.E.onPaste(e));
    addEventListener('hashchange', app.route);
    addEventListener('resize', U.debounce(() => { if (app.view === 'editor' && A.E.d) A.E.drawOverlay(); }, 150));
    // E.save writes before it renders the thumbnail, so a save started while the page goes away still lands
    addEventListener('pagehide', () => A.E.d && A.E.saveNow.flush({ thumb: false }));
    document.addEventListener('visibilitychange', () => document.hidden && A.E.d && A.E.saveNow.flush());
    addEventListener('beforeunload', (e) => {
      if (!A.E.d || !/\b(pending|saving|error)\b/.test(A.EU.saveIcon?.className)) return;
      e.preventDefault();
      e.returnValue = '';
    });
    // drop files anywhere: the canvas handles its own drops, elsewhere the browser must not open the file
    addEventListener('dragover', (e) => e.preventDefault());
    addEventListener('drop', async (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (e.defaultPrevented || (!files.length && e.target.closest?.('input, textarea'))) return;
      e.preventDefault();
      for (const f of files) await app.importFile(f, { toEditor: true });
      if (app.view === 'home') app.route();
    });
    if (!(await S.kv('welcomed', false))) {
      await app.notify('Welcome to Atelier! Everything you make is stored privately on this device.');
      await S.setKv('welcomed', true);
    }
    if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    checkPlanner();
    setInterval(checkPlanner, 60000);
    app.route();
  };
  addEventListener('DOMContentLoaded', app.init);
})(window.A);
