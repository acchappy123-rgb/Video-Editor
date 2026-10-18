'use strict';
// Video clips: import (size, length, poster frame), clip timing on a page, the timeline playhead, the playing <video>
// elements of the editor and present mode, frames for exports and thumbnails, and the soundtrack + clip sound mix.
(function (A) {
  const U = A.U, S = A.S, M = A.M;
  const V = (A.V = { head: 0 });
  const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);

  // ---------- loading ----------
  const BAD = 'This video can’t be played in this browser – try an MP4 (H.264) or WebM file';
  const load = (url) =>
    new Promise((res, rej) => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.onloadeddata = () => res(v);
      v.onerror = () => rej(new Error(BAD));
      v.src = url;
    });
  // Resolves once the frame at t can be drawn (a broken file that never reports the seek gives up after 3 s). A late
  // 'seeked' of an earlier seek arrives while this one is still seeking, and doesn't count.
  const seek = (v, t) =>
    new Promise((res) => {
      if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2 && !v.seeking) return res();
      let tm;
      const done = (e) => {
        if (e && v.seeking) return;
        v.removeEventListener('seeked', done);
        clearTimeout(tm);
        res();
      };
      v.addEventListener('seeked', done);
      tm = setTimeout(done, 3000);
      v.currentTime = t;
    });
  // Size, length and a poster (the first frame). A recorded WebM has no length until it has been seeked to its end.
  V.probe = async (blob) => {
    const url = URL.createObjectURL(blob);
    let v;
    try {
      v = await load(url);
      if (!(v.duration > 0 && Number.isFinite(v.duration))) await seek(v, 1e101);
      const duration = U.round(v.duration, 3);
      if (!(duration > 0 && Number.isFinite(duration))) throw new Error(BAD);
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return { w: 0, h: 0, duration };
      await seek(v, 0);
      const k = Math.min(1, 1280 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return { w, h, duration, poster: await U.canvasToBlob(c, 'image/jpeg', 0.85), pw: c.width, ph: c.height };
    } finally {
      if (v) { v.removeAttribute('src'); v.load(); }
      URL.revokeObjectURL(url);
    }
  };
  // A video file becomes a 'video' asset with its poster as a hidden image asset; a file with no picture is audio.
  V.importVideo = async (file) => {
    const p = await V.probe(file);
    if (!p.w) return S.addAsset(file, { name: file.name, kind: 'audio' });
    const poster = await S.addAsset(p.poster, { name: file.name + ' (poster)', hidden: true, w: p.pw, h: p.ph });
    const a = await S.addAsset(file, { name: file.name, kind: 'video', w: p.w, h: p.h, duration: p.duration, poster: poster.id });
    await S.ensureAssetURLs([a.id, poster.id]);
    return a;
  };

  // ---------- clip timing ----------
  // In page seconds a clip plays from `begin` for (trimOut - trimIn) / speed, holding its first frame before and its
  // last frame after (a looping clip plays until the page ends).
  V.span = (el) => {
    const dur = num(el.dur, 0) > 0 ? +el.dur : Infinity;
    const inT = U.clamp(num(el.trimIn, 0), 0, Number.isFinite(dur) ? Math.max(0, dur - 0.05) : 1e6);
    const outT = U.clamp(num(el.trimOut, dur), inT + 0.05, Number.isFinite(dur) ? dur : 1e6);
    return { inT, outT, speed: U.clamp(num(el.speed, 1), 0.1, 16), begin: Math.max(0, num(el.begin, 0)) };
  };
  V.len = (el) => { const s = V.span(el); return (s.outT - s.inT) / s.speed; };
  V.end = (el) => V.span(el).begin + V.len(el);
  // The source time a clip shows at page time t (null: its first frame), and whether it is playing then.
  V.at = (el, t) => {
    const s = V.span(el), L = s.outT - s.inT;
    if (t == null || t < s.begin) return { time: s.inT, on: false };
    const p = (t - s.begin) * s.speed;
    if (el.loop) return { time: s.inT + (p % L), on: true };
    if (p >= L) return { time: Math.max(s.inT, s.outT - 1e-3), on: false };
    return { time: s.inT + p, on: true };
  };
  V.clips = (page) => page.elements.filter((e) => e.type === 'video' && e.asset);
  // A page lasts as long as its longest clip (rounded up to 0.1 s).
  V.fitted = (page) => {
    const end = Math.max(0, ...V.clips(page).map(V.end));
    return end > 0 ? U.clamp(Math.ceil(end * 10 - 1e-6) / 10, 0.5, 600) : null;
  };
  V.fitPage = (page) => { const f = V.fitted(page); if (f) page.duration = f; };
  // Fill a w × h box (upright) with the clip, cropping its overflow evenly.
  V.cover = (el, w, h) => {
    const ar = (el.nw || 16) / (el.nh || 9), br = w / h;
    Object.assign(el, { x: 0, y: 0, w, h, rot: 0, crop: ar > br ? { x: (1 - br / ar) / 2, y: 0, w: br / ar, h: 1 } : { x: 0, y: (1 - ar / br) / 2, w: 1, h: ar / br } });
    return el;
  };
  // Adds a clip to the current page: on a video design the page's first clip fills it, behind what is already there.
  // The page then lasts as long as its longest clip (one undo step with the add).
  V.addToPage = async (asset) => {
    const E = A.E;
    if (!E.d || !E.canEdit()) return null;
    await S.ensureAssetURLs([asset.id, asset.poster]);
    if (!E.d) return null;
    const page = E.page(), el = M.newVideo(asset, { w: asset.w || 640, h: asset.h || 360 });
    const fill = !!M.type(E.d.type).video && !V.clips(page).length;
    if (fill) V.cover(el, E.d.width, E.d.height);
    else E.fitSize(el, 0.6);
    const dur = page.duration;
    page.elements.push(el);
    V.fitPage(page);
    page.elements.pop();
    if (!E.add(el, { center: !fill, at: fill ? 0 : null })) { page.duration = dur; return null; }
    A.EU.refreshTimeline?.();
    return el;
  };

  // ---------- the timeline playhead (design time, all pages one after another) ----------
  V.starts = (d) => { let acc = 0; return d.pages.map((p) => (acc += p.duration || 5) - (p.duration || 5)); };
  V.total = (d) => d.pages.reduce((s, p) => s + (p.duration || 5), 0);
  // The page showing at design time T (a time on a boundary is the next page's start; the end is the last page's end).
  V.pageAt = (d, T) => {
    const st = V.starts(d);
    let i = st.length - 1;
    while (i > 0 && T < st[i] - 1e-9) i--;
    return { i, local: U.clamp(T - st[i], 0, d.pages[i].duration || 5) };
  };
  // Page time of the playhead on page i, or null when it is on another page (a page's end is the next one's start).
  V.local = (i) => {
    const d = A.E.d, s = V.starts(d)[i], dur = d.pages[i]?.duration || 5, end = s + dur + (i === d.pages.length - 1 ? 1e-6 : -1e-6);
    return s != null && V.head >= s - 1e-6 && V.head <= end ? U.clamp(V.head - s, 0, dur) : null;
  };
  // Keeps the playhead on the current page (a page picked elsewhere puts it at that page's start).
  V.followPage = () => {
    const E = A.E;
    if (!E.d) return;
    if (V.headDoc !== E.d.id) { V.headDoc = E.d.id; V.head = 0; }
    V.head = U.clamp(V.head, 0, V.total(E.d));
    if (V.local(E.pi) == null) V.head = V.starts(E.d)[E.pi];
  };
  // Moves the playhead to T, showing its page at that moment (anim: element animations too, while scrubbing).
  V.seekTo = (T, { anim = true } = {}) => {
    const E = A.E;
    if (!E.d) return;
    V.stopInline();
    T = U.clamp(T, 0, V.total(E.d));
    const { i, local } = V.pageAt(E.d, T);
    V.head = T;
    E.previewT = anim ? local : null;
    if (i !== E.pi) E.setPage(i, false);
    E.renderPage(E.pi);
    A.EU.drawHead?.();
  };
  V.fmt = (s) => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); };

  // ---------- playing clips (editor canvas, present mode) ----------
  // One <video> per scope/page/element, moved into the clip's slot after every render so it keeps playing.
  const pool = new Map();
  let pruneT = 0;
  const release = (k, v) => { v.pause(); v.removeAttribute('src'); v.load(); pool.delete(k); };
  const schedulePrune = () => {
    if (!pruneT) pruneT = setTimeout(() => { pruneT = 0; pool.forEach((v, k) => !v.isConnected && release(k, v)); }, 2000);
  };
  V.release = (scope) => pool.forEach((v, k) => k.startsWith(scope + '/') && release(k, v));
  V.live = (scope, page, el) => pool.get(scope + '/' + page.id + '/' + el.id);
  const place = (v, el) => {
    const c = el.crop || { x: 0, y: 0, w: 1, h: 1 }, W = el.w / c.w, H = el.h / c.h;
    const st = `position:absolute;left:${-c.x * W}px;top:${-c.y * H}px;width:${W}px;height:${H}px;max-width:none;object-fit:fill;pointer-events:none`;
    if (v._st !== st) v.style.cssText = v._st = st;
  };
  // playing: clips play along with page time t (only correcting drift); otherwise they show the frame at t.
  const sync = (v, el, t, playing, audible) => {
    if (v._inline) return;
    const { time, on } = V.at(el, t), rate = V.span(el).speed;
    v.muted = !audible || !!el.muted;
    v.volume = U.clamp(num(el.volume, 1), 0, 1);
    if (v.playbackRate !== rate) v.playbackRate = v.defaultPlaybackRate = rate;
    if (playing && on) {
      if (v.readyState >= 1 && Math.abs(v.currentTime - time) > 0.3 * Math.max(1, rate)) v.currentTime = time;
      if (v.paused) v.play().catch(() => {});
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - time) > 0.004) v.currentTime = time;
    }
  };
  V.mount = (root, page, t, { scope = 'e', playing = false, audible = playing } = {}) => {
    for (const slot of root.querySelectorAll('foreignObject[data-vslot]')) {
      const id = slot.getAttribute('data-vslot'), el = page.elements.find((x) => x.id === id), box = slot.firstElementChild;
      if (!el || !box) continue;
      const key = scope + '/' + page.id + '/' + id, url = S.assetURL(el.asset), poster = S.assetURL(el.poster);
      let v = pool.get(key);
      if (!v) {
        v = document.createElement('video');
        v.playsInline = true;
        v.preload = 'auto';
        v.muted = true;
        // a faster clip sounds higher, as it does in a video export
        v.preservesPitch = false;
        pool.set(key, v);
      }
      if (url && v._src !== url) v.src = v._src = url;
      if (poster && v._poster !== poster) v.poster = v._poster = poster;
      place(v, el);
      if (v.parentNode !== box) box.appendChild(v);
      sync(v, el, t, playing, audible);
    }
    schedulePrune();
  };
  // The clip's own play button and scrubber take over its <video> until the timeline, a preview or another selection
  // takes it back to the playhead's frame.
  let inline = null, watchRaf = 0;
  V.stopInline = () => {
    pool.forEach((v) => { if (v._inline) { v._inline = false; v.pause(); } });
    inline = null;
  };
  const takeOver = (v, el, page) => {
    if (inline?.v !== v) V.stopInline();
    v._inline = true;
    v.muted = !!el.muted;
    v.volume = U.clamp(num(el.volume, 1), 0, 1);
    v.playbackRate = v.defaultPlaybackRate = V.span(el).speed;
    inline = { v, id: el.id, page };
    cancelAnimationFrame(watchRaf);
    watchRaf = requestAnimationFrame(watch);
  };
  // the trimmed end stops (or loops) the clip
  function watch() {
    if (!inline) return;
    const E = A.E, { v, id, page } = inline, el = E.d && E.byId(id, page);
    if (!el || E.page() !== page || E.sel.length !== 1 || E.sel[0] !== id || !v.isConnected || !v._inline) {
      V.stopInline();
      const i = E.d ? E.d.pages.indexOf(page) : -1;
      if (i >= 0) E.renderPage(i);
      return;
    }
    const s = V.span(el);
    if (!v.paused && v.currentTime >= s.outT - 0.02) {
      if (el.loop) v.currentTime = s.inT;
      else { v.pause(); v.currentTime = s.outT - 1e-3; }
    }
    watchRaf = requestAnimationFrame(watch);
  }

  // Mini player on a selected clip: play/pause, a scrubber over the trimmed part and the time.
  V.controls = (box, el) => {
    const E = A.E, page = E.page(), z = E.zoom;
    if (el.w * z < 60 || el.h * z < 40) return;
    const s = V.span(el), get = () => V.live('e', page, el);
    const ic = (on) => U.icon(on ? 'pause' : 'play', 14);
    const btn = U.h('button.vc-play', { title: 'Play clip', 'aria-label': 'Play clip', html: ic(false) });
    const range = U.h('input.vc-range', { type: 'range', min: U.round(s.inT, 3), max: U.round(s.outT, 3), step: 0.01, value: U.round(s.inT, 3), 'aria-label': 'Clip position' });
    const time = U.h('span.vc-time');
    const ctl = U.h('div.vid-ctl', btn, el.w * z >= 150 ? range : null, el.w * z >= 220 ? time : null);
    // the controls never start a move or a marquee on the page
    ctl.addEventListener('pointerdown', (e) => e.stopPropagation());
    ctl.addEventListener('dblclick', (e) => e.stopPropagation());
    let last = null;
    const show = () => {
      const v = get(), on = !!v && !v.paused;
      if (on !== last) { btn.innerHTML = ic(on); btn.title = on ? 'Pause clip' : 'Play clip'; btn.setAttribute('aria-label', btn.title); last = on; }
      if (v && document.activeElement !== range) range.value = v.currentTime;
      time.textContent = V.fmt(Math.max(0, (v ? v.currentTime : s.inT) - s.inT) / s.speed) + ' / ' + V.fmt(V.len(el));
    };
    btn.onclick = () => {
      const v = get();
      if (!v) return;
      if (!v.paused) { v.pause(); return show(); }
      A.Present.stopPreview();
      takeOver(v, el, page);
      if (v.currentTime >= s.outT - 0.05 || v.currentTime < s.inT) v.currentTime = s.inT;
      v.play().catch(() => {});
      show();
    };
    range.addEventListener('input', () => {
      const v = get();
      if (!v) return;
      A.Present.stopPreview();
      takeOver(v, el, page);
      v.pause();
      v.currentTime = +range.value;
      show();
    });
    const tick = () => {
      if (!ctl.isConnected) return;
      show();
      requestAnimationFrame(tick);
    };
    box.appendChild(ctl);
    show();
    requestAnimationFrame(tick);
  };

  // ---------- frames for exports and thumbnails ----------
  // A decoding <video> per clip and use (consecutive frames of an export seek forward in one decoder); each serves one
  // grab at a time and is dropped once idle.
  const decs = new Map();
  let decT = 0;
  const decoder = (asset, use) => {
    const key = asset + '|' + use;
    let d = decs.get(key);
    if (!d) {
      d = { q: (async () => {
        const a = await S.get('assets', asset);
        if (!a) return null;
        d.url = URL.createObjectURL(a.blob);
        try { return await load(d.url); } catch (e) { return null; }
      })() };
      decs.set(key, d);
    }
    d.used = Date.now();
    clearTimeout(decT);
    decT = setTimeout(() => decs.forEach((x, k) => {
      if (Date.now() - x.used < 4000) return;
      decs.delete(k);
      x.q.then((v) => { if (v) { v.removeAttribute('src'); v.load(); } if (x.url) URL.revokeObjectURL(x.url); });
    }), 5000);
    return d;
  };
  const cache = new Map();
  // The frame at source time `time` as a w × h JPEG data URL ('' when the clip can't be decoded).
  V.grab = (asset, time, w, h, key = asset) => {
    const k = asset + '|' + time.toFixed(3) + '|' + w + 'x' + h;
    if (cache.has(k)) { const u = cache.get(k); cache.delete(k); cache.set(k, u); return Promise.resolve(u); }
    const d = decoder(asset, key);
    const job = d.q.then(async (v) => {
      if (!v) return null;
      await seek(v, U.clamp(time + 5e-4, 0, Number.isFinite(v.duration) ? v.duration : 1e6));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(v, 0, 0, w, h);
      const u = c.toDataURL('image/jpeg', 0.9);
      cache.set(k, u);
      if (cache.size > 60) cache.delete(cache.keys().next().value);
      return v;
    });
    d.q = job.catch(() => null);
    return job.then(() => cache.get(k) || '', () => '');
  };
  // n frames across a clip's source side by side, `h` px high (the trim bar's filmstrip); cached per clip.
  const strips = new Map();
  V.strip = (asset, dur, ar, n = 8, h = 40) => {
    const k = asset + '|' + n + '|' + h;
    if (!strips.has(k)) strips.set(k, (async () => {
      const w = Math.max(2, Math.round(h * ar)), c = document.createElement('canvas');
      c.width = w * n;
      c.height = h;
      const g = c.getContext('2d');
      for (let i = 0; i < n; i++) {
        const u = await V.grab(asset, ((i + 0.5) / n) * dur, w, h, 'strip');
        if (u) g.drawImage(await U.loadImage(u), i * w, 0, w, h);
      }
      return c.toDataURL('image/jpeg', 0.8);
    })().catch(() => ''));
    return strips.get(k);
  };
  // frame(el) for R.pageSVG: each clip on the page at page time t (null: its first frame), its whole source frame
  // grabbed at the size it is drawn at `scale` (at most its own). Null when the page has no clips.
  V.frames = async (page, t, scale = 1) => {
    const list = V.clips(page).filter((e) => !e.hidden);
    if (!list.length) return null;
    const out = {};
    for (const el of list) {
      const c = el.crop || { x: 0, y: 0, w: 1, h: 1 }, nw = el.nw || 640, nh = el.nh || 360;
      const f = Math.min(1, (scale || 1) * Math.max(el.w / c.w / nw, el.h / c.h / nh));
      out[el.id] = await V.grab(el.asset, V.at(el, t).time, Math.max(2, Math.round(nw * f)), Math.max(2, Math.round(nh * f)), 'x' + el.id);
    }
    return (el) => out[el.id] || '';
  };
  // The frame a playing <video> shows now (present-mode recording).
  V.snap = (v, w, h) => {
    if (!v || v.readyState < 2) return '';
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(v, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.85);
  };

  // ---------- sound ----------
  // Soundtrack settings: start (seconds into the track), volume 0-1, fadeIn/fadeOut (s), loop.
  V.trackOpts = (d) => {
    const o = d.audioOpts || {};
    return { start: Math.max(0, num(o.start, 0)), volume: U.clamp(num(o.volume, 1), 0, 1), fadeIn: Math.max(0, num(o.fadeIn, 0)), fadeOut: Math.max(0, num(o.fadeOut, 0)), loop: o.loop !== false };
  };
  // Soundtrack volume at design time T of a `total`-second design (fades in from the start and out to the end).
  V.trackGain = (o, T, total) => {
    let g = o.volume;
    if (o.fadeIn > 0 && T < o.fadeIn) g *= Math.max(0, T / o.fadeIn);
    if (o.fadeOut > 0 && total != null && T > total - o.fadeOut) g *= U.clamp((total - T) / o.fadeOut, 0, 1);
    return g;
  };
  // The soundtrack playing live (editor preview, present mode). set(T, playing) keeps it at design time T: with follow
  // it is moved when it drifts, without it only its volume follows (a presenter lingering on a slide); a null total
  // has no end to fade out to.
  // Sets the open design's soundtrack (null removes it, with its settings): one undo step. A new track plays from its
  // beginning, at the volume and fades already chosen.
  V.setTrack = (id) => {
    const d = A.E.d;
    if (!d) return;
    if (id) d.audio = id;
    else delete d.audio;
    if (!id) delete d.audioOpts;
    else if (d.audioOpts) d.audioOpts.start = 0;
    A.E.changed({ all: true });
  };
  V.trackURL = async (d) => {
    await S.ensureAssetURLs([d.audio]);
    return S.assetURL(d.audio);
  };
  V.track = (d) => {
    if (!d.audio) return null;
    // it loops by hand, back to its start point rather than to the top of the track; a soundtrack added in this
    // session gets its object URL first
    const a = new Audio(), o = V.trackOpts(d);
    let started = false, stopped = false;
    if (S.assetURL(d.audio)) a.src = S.assetURL(d.audio);
    else V.trackURL(d).then((u) => !stopped && u && (a.src = u)).catch(() => {});
    return {
      el: a,
      set(T, playing, { follow = true, total = V.total(d) } = {}) {
        if (!a.src) return;
        a.volume = U.clamp(V.trackGain(o, T, total), 0, 1);
        const len = a.duration;
        let pos = o.start + T;
        if (Number.isFinite(len) && len > o.start) pos = o.loop ? o.start + (T % (len - o.start)) : pos;
        const past = Number.isFinite(len) && !o.loop && pos >= len;
        if ((follow || !started) && a.readyState >= 1 && !past && Math.abs(a.currentTime - pos) > 0.3) a.currentTime = pos;
        else if (!follow && o.loop && Number.isFinite(len) && (a.ended || a.currentTime >= len - 0.05)) a.currentTime = o.start;
        if (!started && a.readyState < 1) a.addEventListener('loadedmetadata', () => (a.currentTime = pos), { once: true });
        if (playing && !past && a.paused) a.play().catch(() => {});
        if ((!playing || past) && !a.paused) a.pause();
        started = true;
      },
      stop() { stopped = true; a.pause(); },
    };
  };
  // Soundtrack and clip sound of `pages` played one after another, mixed to stereo (null when there is nothing to hear).
  V.mix = async (d, pages, rate = 48000) => {
    const loud = (el) => !el.hidden && !el.muted && num(el.volume, 1) > 0;
    if (!d.audio && !pages.some((p) => V.clips(p).some(loud))) return null;
    const total = pages.reduce((s, p) => s + (p.duration || 5), 0);
    const ac = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * rate)), rate);
    const bufs = new Map();
    const decode = (id) => {
      if (!bufs.has(id)) bufs.set(id, S.get('assets', id).then(async (a) => (a ? ac.decodeAudioData(await a.blob.arrayBuffer()) : null)).catch(() => null));
      return bufs.get(id);
    };
    let any = false;
    if (d.audio) {
      const b = await decode(d.audio), o = V.trackOpts(d);
      if (b && o.start < b.duration && o.volume > 0) {
        const src = ac.createBufferSource(), g = ac.createGain();
        src.buffer = b;
        if (o.loop) { src.loop = true; src.loopStart = o.start; src.loopEnd = b.duration; }
        // the volume envelope, sampled 50 times a second (fades may overlap on a short design)
        const n = Math.max(2, Math.ceil(total * 50));
        g.gain.setValueCurveAtTime(Float32Array.from({ length: n }, (_, i) => V.trackGain(o, (i / (n - 1)) * total, total)), 0, total);
        src.connect(g).connect(ac.destination);
        src.start(0, o.start);
        any = true;
      }
    }
    let T = 0;
    for (const p of pages) {
      const pd = p.duration || 5;
      for (const el of V.clips(p)) {
        const vol = U.clamp(num(el.volume, 1), 0, 1), s = V.span(el);
        if (!loud(el) || s.begin >= pd) continue;
        const b = await decode(el.asset);
        if (!b || s.inT >= b.duration) continue;
        const src = ac.createBufferSource(), g = ac.createGain();
        src.buffer = b;
        src.playbackRate.value = s.speed;
        const at = T + s.begin, out = Math.min(b.duration, s.outT);
        // the page cuts the clip off (a short ramp, no click)
        const until = el.loop ? T + pd : Math.min(T + pd, at + (out - s.inT) / s.speed);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(vol, at + 0.01);
        g.gain.setValueAtTime(vol, Math.max(at + 0.01, until - 0.01));
        g.gain.linearRampToValueAtTime(0, until);
        src.connect(g).connect(ac.destination);
        if (el.loop) { src.loop = true; src.loopStart = s.inT; src.loopEnd = out; }
        src.start(at, s.inT);
        src.stop(until);
        any = true;
      }
      T += pd;
    }
    return any ? ac.startRendering() : null;
  };
})(window.A);
