'use strict';
// Present mode (fullscreen, transitions, presenter view, autoplay, recording) and
// the in-editor animation preview.
(function (A) {
  const U = A.U, R = A.R, S = A.S, E = A.E, h = U.h;
  const PR = (A.Present = { active: false, previewing: false });

  // ---------- in-editor preview ----------
  // Plays design time `from` to `to` (seconds, pages one after another), moving the playhead, with video clips and the
  // soundtrack. With no arguments: the current page from its start.
  PR.preview = ({ from, to } = {}) => {
    PR.stopPreview();
    if (!E.d) return;
    const d = E.d, V = A.V, st = V.starts(d)[E.pi];
    from = U.clamp(from ?? st, 0, V.total(d));
    to = Math.min(to ?? st + (E.page().duration || 5), V.total(d));
    V.stopInline();
    PR.previewing = true;
    // the page the preview shows; the user showing another page (or design) ends it
    let i = V.pageAt(d, from).i;
    if (from >= to - 1e-6 && i > 0 && Math.abs(V.starts(d)[i] - from) < 1e-6) i--;
    PR.page = d.pages[i];
    if (i !== E.pi) { E.previewT = 0; E.setPage(i, false); }
    A.EU.refreshTimeline();
    const track = (PR.track = V.track(d));
    const t0 = performance.now();
    const loop = () => {
      if (!PR.previewing) return;
      if (E.d !== d || E.page() !== PR.page) return PR.stopPreview();
      const T = Math.min(to, from + (performance.now() - t0) / 1000);
      // the last moment stays on the page that ends there
      let { i: j, local } = V.pageAt(d, T);
      if (T >= to && j > 0 && j !== E.pi && Math.abs(V.starts(d)[j] - T) < 1e-6) { j--; local = d.pages[j].duration || 5; }
      V.head = T;
      E.previewT = local;
      if (j !== E.pi) { PR.page = d.pages[j]; E.setPage(j); }
      // a page without animations only keeps its clips in step
      else if (animated(PR.page)) E.renderPage(E.pi);
      else V.mount(E.blocks[E.pi].svg, PR.page, local, { playing: true });
      track?.set(T, true);
      A.EU.drawHead?.();
      if (T >= to) return PR.stopPreview();
      PR.raf = requestAnimationFrame(loop);
    };
    loop();
  };
  PR.stopPreview = () => {
    if (!PR.previewing) return;
    PR.previewing = false;
    cancelAnimationFrame(PR.raf);
    PR.track?.stop();
    PR.track = null;
    E.previewT = null;
    if (E.d) {
      // redraw the previewed page wherever it is now, and the current one (a strip layout rebuilt it mid-preview)
      const i = E.d.pages.indexOf(PR.page);
      if (i >= 0 && i !== E.pi) E.renderPage(i);
      E.renderPage(E.pi);
      A.EU.refreshTimeline();
    }
    PR.page = null;
  };

  // ---------- present ----------
  PR.start = async (opts = {}) => {
    if (!E.d) return;
    PR.stopPreview();
    E.finishText();
    const d = E.d;
    const pages = d.pages.filter((p) => !p.hidden);
    if (!pages.length) return U.toast('All pages are hidden');
    let idx = Math.max(0, pages.indexOf(E.page()));
    if (opts.fromStart) idx = 0;
    let autoplay = opts.autoplay ?? d.type === 'video';
    let presenter = !!opts.presenter;
    // t0 is the slide's animation clock, tAuto its autoplay countdown (toggling autoplay restarts only the countdown)
    let t0 = performance.now(), tAuto = t0;
    let raf, stopped = false;
    PR.active = true;
    const stage = h('div.pr-stage');
    const notes = h('div.pr-notes');
    const next = h('div.pr-next');
    const clock = h('div.pr-clock');
    const side = h('div.pr-side', h('div.pr-label', 'Next'), next, h('div.pr-label', 'Notes'), notes, clock);
    const counter = h('span.pr-count');
    const autoBtn = h('button.pr-btn', { title: 'Autoplay', onclick: () => { autoplay = !autoplay; tAuto = performance.now(); autoBtn.classList.toggle('on', autoplay); } }, U.ic('play', 18), h('span.pr-txt', ' Autoplay'));
    autoBtn.classList.toggle('on', autoplay);
    const recBtn = h('button.pr-btn', { title: 'Record yourself presenting', onclick: () => (rec ? stopRec() : startRec()) }, U.ic('mic', 18), h('span.pr-txt', ' Record'));
    const bar = h('div.pr-bar',
      h('button.pr-btn', { title: 'Previous (←)', onclick: () => go(idx - 1) }, U.ic('back', 18)),
      counter,
      h('button.pr-btn', { title: 'Next (→)', onclick: () => go(idx + 1) }, U.ic('fwd', 18)),
      autoBtn,
      h('button.pr-btn.pr-pv', { title: 'Presenter view (P)', onclick: () => { presenter = !presenter; root.classList.toggle('presenter', presenter); } }, U.ic('present', 18), h('span.pr-txt', ' Presenter view')),
      recBtn,
      h('button.pr-btn', { title: 'Full screen (F)', onclick: () => toggleFS() }, U.ic('fullscreen', 18)),
      h('button.pr-btn', { title: 'Exit (Esc)', onclick: () => stop() }, U.ic('x', 18))
    );
    const root = h('div.present' + (presenter ? '.presenter' : ''), h('div.pr-main', stage), side, bar);
    document.body.appendChild(root);
    const started = Date.now();
    let audio = null;
    // a soundtrack uploaded in this session has no object URL yet
    if (d.audio) S.ensureAssetURLs([d.audio]).catch(() => {}).then(() => {
      if (stopped) return;
      try { audio = A.V.track(d); } catch (e) {}
    });
    // the soundtrack follows the design's clock while it autoplays; a presenter moving on by hand doesn't jump it
    const starts = A.V.starts({ pages }), total = A.V.total({ pages });
    // an editor that is already full screen hands it over to the presentation and gets it back on exit
    const toggleFS = () => (document.fullscreenElement === root ? document.exitFullscreen() : root.requestFullscreen?.())?.catch(() => {});
    if (opts.fullscreen !== false && !presenter) toggleFS();

    let layer = null;
    // a slide moved on by hand stays up as long as the presenter likes, so its exit animations don't play;
    // with autoplay they end when the countdown moves on (turning it on mid-slide restarts only the countdown)
    const exitAt = (page) => (autoplay ? (tAuto - t0) / 1000 + (page.duration || 5) : null);
    const svgFor = (page, t, idp, links = true) => R.pageSVG(d, page, { t, idp, links, width: d.width, dur: exitAt(page), live: true });
    // video clips play in step with the slide's clock, with their sound
    const clips = (root, page, t) => A.V.mount(root, page, t, { scope: 'p', playing: true });
    const mount = (dir) => {
      const page = pages[idx];
      const nl = h('div.pr-layer', { html: svgFor(page, 0, 'pr' + idx + '_') });
      clips(nl, page, 0);
      const tr = page.transition && page.transition !== 'none' && layer ? page.transition : null;
      if (tr) nl.classList.add('tr-' + tr, dir < 0 ? 'rev' : 'fwd');
      const old = layer;
      stage.appendChild(nl);
      layer = nl;
      if (old) setTimeout(() => old.remove(), tr ? 650 : 0);
      t0 = tAuto = performance.now();
      counter.textContent = `${idx + 1} / ${pages.length}`;
      notes.textContent = page.notes || 'No notes for this page.';
      next.innerHTML = pages[idx + 1] ? R.pageSVG(d, pages[idx + 1], { width: 320, idp: 'prn_' }) : '<div class="pr-end">End of presentation</div>';
    };
    const go = (i) => {
      if (i < 0) return;
      if (i >= pages.length) {
        if (autoplay && d.type === 'video') return stop();
        return;
      }
      const dir = i - idx;
      idx = i;
      mount(dir);
    };
    // a touch on hidden controls only brings them back; touch swipes go forward and back
    let reveal = false, sx = 0, sy = 0;
    stage.addEventListener('click', (e) => {
      if (reveal) return;
      const a = e.target.closest('a');
      if (a) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^#(\d+)$/);
        // '#N' is the design's page N, hidden pages included; another '#' link would drive the app's router
        if (href.startsWith('#')) e.preventDefault();
        if (m) { const j = pages.indexOf(d.pages[+m[1] - 1]); if (j >= 0) go(j); }
        return;
      }
      go(idx + 1);
    });
    stage.addEventListener('pointerup', (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (e.pointerType !== 'mouse' && Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy)) go(idx + (dx < 0 ? 1 : -1));
    });
    // animated slides are re-rendered every frame, which would replace the node under a press and lose its click
    let held = false;
    stage.addEventListener('pointerdown', () => (held = true));
    const release = () => (held = false);
    addEventListener('pointerup', release, true);
    addEventListener('pointercancel', release, true);
    const loop = () => {
      // scheduled first, so a stop() during this frame cancels it
      raf = requestAnimationFrame(loop);
      const now = performance.now(), page = pages[idx], t = (now - t0) / 1000;
      if (layer && animated(page) && !held) layer.innerHTML = svgFor(page, t, 'pr' + idx + '_');
      if (layer) clips(layer, page, t);
      audio?.set(autoplay ? starts[idx] + t : (Date.now() - started) / 1000, true, { follow: autoplay, total: autoplay ? total : null });
      clock.textContent = '⏱ ' + fmtTime((Date.now() - started) / 1000);
      if (autoplay && (now - tAuto) / 1000 >= (page.duration || 5)) go(idx + 1 < pages.length ? idx + 1 : (d.type === 'video' ? pages.length : 0));
    };
    const onKey = (e) => {
      // leave browser and system shortcuts (Ctrl/Cmd+P, Cmd+F…) alone
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); go(idx + 1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(idx - 1); }
      else if (e.key === 'Escape') { if (!document.fullscreenElement) stop(); }
      else if (e.key.toLowerCase() === 'f') toggleFS();
      else if (e.key.toLowerCase() === 'p') { presenter = !presenter; root.classList.toggle('presenter', presenter); }
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(pages.length - 1);
    };
    document.addEventListener('keydown', onKey, true);
    let idleT;
    const onMove = () => { root.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => root.classList.add('idle'), 2500); };
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerdown', (e) => {
      reveal = e.pointerType !== 'mouse' && root.classList.contains('idle');
      sx = e.clientX;
      sy = e.clientY;
      onMove();
    }, true);
    onMove();
    mount(1);
    loop();

    // ---------- recording (camera bubble + microphone) ----------
    let rec = null;
    async function startRec() {
      let media;
      try {
        media = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320 }, audio: true });
      } catch (e) {
        try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e2) { return U.toast('Microphone/camera permission is needed to record', 'error'); }
      }
      const cam = h('video.pr-cam', { autoplay: true, muted: true, playsinline: true });
      cam.srcObject = media;
      cam.muted = true;
      if (media.getVideoTracks().length) root.appendChild(cam);
      const map = {};
      for (const id of S.designAssetIds(d)) map[id] = await S.assetDataURL(id);
      const fontCSS = await R.fontCSSFor(d);
      const scale = Math.min(1, 1280 / d.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(d.width * scale);
      canvas.height = Math.round(d.height * scale);
      const g = canvas.getContext('2d');
      const stream = canvas.captureStream(24);
      media.getAudioTracks().forEach((t) => stream.addTrack(t));
      const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm'];
      const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      const chunks = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      let running = true;
      const draw = async () => {
        while (running) {
          const t = (performance.now() - t0) / 1000;
          // a clip is drawn at the frame its <video> shows
          const frame = (el) => { const c = el.crop || { w: 1, h: 1 }; return A.V.snap(A.V.live('p', pages[idx], el), Math.max(2, Math.round(Math.min(el.nw || 640, (el.w / c.w) * scale))), Math.max(2, Math.round(Math.min(el.nh || 360, (el.h / c.h) * scale)))); };
          const svg = R.pageSVG(d, pages[idx], { t, asset: (id) => map[id] || '', fontCSS, idp: 'rc', dur: exitAt(pages[idx]), frame });
          try { await R.pageCanvas(d, pages[idx], scale, { svg, canvas, matte: '#fff' }); } catch (e) {}
          if (cam.videoWidth) {
            const s = canvas.height * 0.26, x = canvas.width - s - 20, y = canvas.height - s - 20;
            g.save(); g.beginPath(); g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); g.clip();
            const vs = Math.min(cam.videoWidth, cam.videoHeight);
            g.drawImage(cam, (cam.videoWidth - vs) / 2, (cam.videoHeight - vs) / 2, vs, vs, x, y, s, s);
            g.restore();
          }
          await new Promise((r) => setTimeout(r, 30));
        }
      };
      mr.start(500);
      draw();
      rec = { mr, media, cam, chunks, stopDraw: () => (running = false), mime };
      recBtn.classList.add('rec');
      recBtn.lastChild.textContent = ' Stop recording';
      U.toast('Recording… press Stop recording when finished');
    }
    async function stopRec() {
      if (!rec) return;
      const r = rec;
      rec = null;
      r.stopDraw();
      const done = new Promise((res) => (r.mr.onstop = res));
      r.mr.stop();
      await done;
      r.media.getTracks().forEach((t) => t.stop());
      r.cam.remove();
      recBtn.classList.remove('rec');
      recBtn.lastChild.textContent = ' Record';
      const type = (r.mime || 'video/webm').split(';')[0];
      U.download(new Blob(r.chunks, { type }), U.safeName(d.title) + '-recording.' + (type === 'video/mp4' ? 'mp4' : 'webm'));
      U.toast('Recording saved', 'ok');
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (rec) stopRec();
      cancelAnimationFrame(raf);
      clearTimeout(idleT);
      document.removeEventListener('keydown', onKey, true);
      removeEventListener('pointerup', release, true);
      removeEventListener('pointercancel', release, true);
      audio?.stop();
      A.V.release('p');
      // leaving full screen before the root goes hands it back to an editor that was full screen (removal exits fully)
      if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {}).then(() => root.remove());
      else root.remove();
      PR.active = false;
      const real = d.pages.indexOf(pages[idx]);
      if (real >= 0 && E.d === d) E.setPage(real);
    }
    PR.stop = stop;
  };
  const animated = (page) =>
    (page.anim && page.anim !== 'none') ||
    page.elements.some((e) => e.anim && ((e.anim.in && e.anim.in !== 'none') || (e.anim.emph && e.anim.emph !== 'none') || (e.anim.out && e.anim.out !== 'none') || e.anim.motion));
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
})(window.A);
