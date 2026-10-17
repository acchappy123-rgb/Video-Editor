'use strict';
// Local persistence in IndexedDB. Nothing ever leaves the device.
(function (A) {
  const S = (A.S = {});
  const DB_NAME = 'atelier';
  const STORES = ['designs', 'assets', 'folders', 'versions', 'kv'];
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = async (store, mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const os = t.objectStore(store);
      let out;
      const r = fn(os);
      if (r && 'onsuccess' in r) r.onsuccess = () => (out = r.result);
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
  };
  S.get = (store, id) => tx(store, 'readonly', (os) => os.get(id));
  S.put = (store, val) => tx(store, 'readwrite', (os) => os.put(val));
  S.del = (store, id) => tx(store, 'readwrite', (os) => os.delete(id));
  S.all = (store) => tx(store, 'readonly', (os) => os.getAll());
  S.clearAll = async () => {
    for (const s of STORES) await tx(s, 'readwrite', (os) => os.clear());
  };

  // ---------- key/value ----------
  S.kv = async (key, fallback) => {
    const r = await S.get('kv', key);
    return r ? r.value : fallback;
  };
  S.setKv = (key, value) => S.put('kv', { key, value });

  // ---------- designs ----------
  S.listDesigns = async ({ trash = false } = {}) => {
    const all = await S.all('designs');
    return all.filter((d) => !!d.deletedAt === trash).sort((a, b) => b.updatedAt - a.updatedAt);
  };
  S.saveDesign = (d) => {
    d.updatedAt = Date.now();
    return S.put('designs', d);
  };
  S.trashDesign = async (id) => {
    const d = await S.get('designs', id);
    if (d) {
      d.deletedAt = Date.now();
      await S.put('designs', d);
    }
  };
  S.restoreDesign = async (id) => {
    const d = await S.get('designs', id);
    if (d) {
      delete d.deletedAt;
      await S.put('designs', d);
    }
  };
  S.deleteForever = async (id) => {
    await S.del('designs', id);
    const vs = await S.all('versions');
    for (const v of vs) if (v.designId === id) await S.del('versions', v.id);
  };
  // Trash keeps items for 30 days.
  S.purgeTrash = async () => {
    const limit = Date.now() - 30 * 86400000;
    for (const d of await S.listDesigns({ trash: true })) if (d.deletedAt < limit) await S.deleteForever(d.id);
  };

  // ---------- versions ----------
  S.addVersion = async (design, label = '') => {
    const v = { id: A.U.uid('v_'), designId: design.id, ts: Date.now(), label, data: JSON.stringify(design) };
    await S.put('versions', v);
    const list = (await S.listVersions(design.id)).slice(40);
    for (const old of list) await S.del('versions', old.id);
    return v;
  };
  S.listVersions = async (designId) =>
    (await S.all('versions')).filter((v) => v.designId === designId).sort((a, b) => b.ts - a.ts);

  // ---------- assets (uploads, fonts, audio) ----------
  const urlCache = new Map();
  const dataCache = new Map();
  S.addAsset = async (blob, meta = {}) => {
    const a = { id: A.U.uid('a_'), blob, type: blob.type, name: meta.name || 'upload', kind: meta.kind || kindOf(blob.type), w: meta.w, h: meta.h, createdAt: Date.now(), hidden: !!meta.hidden, tag: meta.tag || '' };
    if (a.kind === 'image' && !a.w) {
      try {
        const url = URL.createObjectURL(blob);
        const img = await A.U.loadImage(url);
        a.w = img.naturalWidth || 800;
        a.h = img.naturalHeight || 600;
        urlCache.set(a.id, url);
      } catch (e) {
        a.w = 800;
        a.h = 600;
      }
    }
    await S.put('assets', a);
    return a;
  };
  const kindOf = (t) => (t.startsWith('image/') ? 'image' : t.startsWith('audio/') ? 'audio' : t.startsWith('video/') ? 'video' : t.includes('font') ? 'font' : 'file');
  S.assetURL = (id) => urlCache.get(id) || '';
  S.ensureAssetURLs = async (ids) => {
    for (const id of ids) {
      if (!id || urlCache.has(id)) continue;
      const a = await S.get('assets', id);
      if (a) urlCache.set(id, URL.createObjectURL(a.blob));
    }
  };
  S.assetDataURL = async (id) => {
    if (dataCache.has(id)) return dataCache.get(id);
    const a = await S.get('assets', id);
    if (!a) return '';
    const d = await A.U.blobToDataURL(a.blob);
    dataCache.set(id, d);
    return d;
  };
  S.listAssets = async (kind) =>
    (await S.all('assets')).filter((a) => (!kind || a.kind === kind) && !a.hidden).sort((a, b) => b.createdAt - a.createdAt);

  // ---------- folders ----------
  S.listFolders = async () => (await S.all('folders')).sort((a, b) => a.name.localeCompare(b.name));

  // ---------- full backup ----------
  S.exportBackup = async () => {
    const out = { app: 'atelier', version: 1, exportedAt: Date.now(), designs: await S.all('designs'), folders: await S.all('folders'), kv: (await S.all('kv')).filter((k) => k.key !== 'settings'), assets: [] };
    for (const a of await S.all('assets')) out.assets.push({ ...a, blob: await A.U.blobToDataURL(a.blob) });
    return new Blob([JSON.stringify(out)], { type: 'application/json' });
  };
  S.importBackup = async (json) => {
    if (json.app !== 'atelier') throw new Error('Not an Atelier backup file');
    for (const a of json.assets || []) await S.put('assets', { ...a, blob: A.U.dataURLToBlob(a.blob) });
    for (const d of json.designs || []) await S.put('designs', d);
    for (const f of json.folders || []) await S.put('folders', f);
    for (const k of json.kv || []) await S.put('kv', k);
  };

  // Assets referenced by a design (for packaging single design files).
  S.designAssetIds = (design) => {
    const ids = new Set();
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const k in o) {
        if ((k === 'asset' || k === 'audio') && typeof o[k] === 'string') ids.add(o[k]);
        else walk(o[k]);
      }
    };
    walk(design);
    return [...ids];
  };
  S.exportDesignFile = async (design) => {
    const assets = [];
    for (const id of S.designAssetIds(design)) {
      const a = await S.get('assets', id);
      if (a) assets.push({ ...a, blob: await A.U.blobToDataURL(a.blob) });
    }
    return new Blob([JSON.stringify({ app: 'atelier-design', version: 1, design, assets })], { type: 'application/json' });
  };
  S.importDesignFile = async (json) => {
    if (json.app !== 'atelier-design') throw new Error('Not an Atelier design file');
    for (const a of json.assets || []) await S.put('assets', { ...a, blob: A.U.dataURLToBlob(a.blob) });
    const d = json.design;
    d.id = A.U.uid('d_');
    d.createdAt = Date.now();
    delete d.deletedAt;
    await S.saveDesign(d);
    return d;
  };
})(window.A);
