// Wave 2 (video): video clips, the timeline playhead, the Video panel, soundtrack settings, present mode and exports.
// Test clips are recorded in the browser (canvas.captureStream + MediaRecorder): 2 s of red, green, blue, then yellow
// (0.5 s each) with a tone.
export default async function ({ page, step }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const ok = (cond, msg, data) => { if (!cond) throw new Error(msg + (data === undefined ? '' : ' ' + JSON.stringify(data))); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // the colour an RGB triple is closest to
  const COL = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0], black: [0, 0, 0], white: [255, 255, 255] };
  const color = (px) => Object.entries(COL).sort((a, b) => a[1].reduce((s, v, i) => s + (v - px[i]) ** 2, 0) - b[1].reduce((s, v, i) => s + (v - px[i]) ** 2, 0))[0][0];

  // records the test clip in page p and returns its bytes
  const record = (p = page) => p.evaluate(async () => {
    const w = 320, h = 180, secs = 2;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const stream = c.captureStream(30);
    const ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination(), gain = ac.createGain();
    gain.gain.value = 0.5;
    osc.connect(gain).connect(dst);
    osc.start();
    dst.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    const t0 = performance.now();
    rec.start(100);
    await new Promise((res) => {
      const f = () => {
        const t = (performance.now() - t0) / 1000;
        g.fillStyle = COLORS[Math.min(3, Math.floor(t / (secs / 4)))];
        g.fillRect(0, 0, w, h);
        if (t > secs + 0.05) return res();
        requestAnimationFrame(f);
      };
      f();
    });
    rec.stop();
    await done;
    osc.stop();
    ac.close();
    const blob = new Blob(chunks, { type: 'video/webm' });
    window.__clip = new File([blob], 'clip.webm', { type: 'video/webm' });
    const u = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    return u.split(',')[1];
  });
  const clipBytes = Buffer.from(await record(), 'base64');
  // a design whose pages are { duration, els: [element specs] }; 'clip' is a video element of the recorded clip
  const open = async (type, pages = [{}], p = page) => {
    await p.evaluate(async ([type, pages]) => {
      if (document.querySelector('.present')) A.Present.stop();
      if (!window.__asset) window.__asset = await A.V.importVideo(window.__clip);
      const a = window.__asset;
      const list = pages.map((s) => {
        const pg = A.M.newPage({ duration: s.duration || 5, ...(s.page || {}) });
        for (const e of s.els || []) pg.elements.push(e.type === 'clip' ? A.M.newVideo(a, { x: 0, y: 0, w: 960, h: 540, ...e, type: 'video' }) : e.type === 'text' ? A.M.newText(e) : A.M.newShape('rect', e));
        return pg;
      });
      await A.Home.newDesign({ type, pages: list });
    }, [type, pages]);
    await p.waitForFunction(() => A.E.d && document.querySelector('.page-svg'));
    await p.waitForTimeout(300);
  };
  const vid = (sel = '.page-block.active .page-svg video') => ev((sel) => { const v = document.querySelector(sel); return v && { t: v.currentTime, paused: v.paused, muted: v.muted, rs: v.readyState, vol: v.volume, rate: v.playbackRate }; }, sel);
  // the colour a <video> on the page shows once it has finished seeking
  const vidColor = async (sel = '.page-block.active .page-svg video') => {
    await page.waitForFunction((sel) => { const v = document.querySelector(sel); return v && !v.seeking && v.readyState >= 2; }, sel, { timeout: 5000 });
    return color(await ev((sel) => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.drawImage(document.querySelector(sel), 0, 0, 4, 4); return [...g.getImageData(2, 2, 1, 1).data].slice(0, 3); }, sel));
  };
  const box = (sel) => page.locator(sel).first().boundingBox();
  const centre = async (sel) => { const b = await box(sel); return [b.x + b.width / 2, b.y + b.height / 2]; };
  // x on the ruler of design time T (follows the page blocks, like the app)
  const rulerX = (T) => ev((T) => { const g = A.EU.tlGeo, r = g.lane.getBoundingClientRect(); const { i, local } = A.V.pageAt(A.E.d, T); const b = g.blocks[i]; return r.left + b.x + (local / g.durs[i]) * b.w; }, T);
  const rulerY = async () => { const b = await box('.tl-ruler'); return b.y + b.height / 2; };
  const hist = () => ev(() => A.E.hi);
  const blur = () => ev(() => document.activeElement?.blur?.());

  await step('video: a clip uploaded with the file picker fills a video page, gets a poster and sets the page length (one undo step)', async () => {
    await open('video');
    await page.click('.rail-btn[data-p="uploads"]');
    const h0 = await hist();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.ed-panel button:has-text("Upload files")')]);
    await fc.setFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: clipBytes });
    await page.waitForFunction(() => A.E.els().some((e) => e.type === 'video'), null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('.page-block.active .page-svg video')?.readyState >= 2, null, { timeout: 5000 });
    const s = await ev(async () => {
      const el = A.E.els()[0], a = await A.S.get('assets', el.asset), poster = await A.S.get('assets', el.poster);
      return { el: { x: el.x, y: el.y, w: el.w, h: el.h, crop: el.crop, trimIn: el.trimIn, trimOut: el.trimOut, dur: el.dur }, a: { kind: a.kind, w: a.w, h: a.h, duration: a.duration, poster: a.poster }, poster: poster && { kind: poster.kind, hidden: poster.hidden }, dur: A.E.page().duration, tab: document.querySelector('.ed-panel .p-tab.on')?.textContent, items: document.querySelectorAll('.ed-panel .vid-item').length, img: !!document.querySelector('.page-block.active .page-svg image[href^="blob:"]') };
    });
    ok(s.a.kind === 'video' && s.a.w === 320 && s.a.h === 180 && s.a.duration > 1.8 && s.a.duration < 2.3 && s.poster?.kind === 'image' && s.poster.hidden, 'video asset', s);
    ok(s.el.x === 0 && s.el.y === 0 && s.el.w === 1920 && s.el.h === 1080 && near(s.el.crop.h, 1, 1e-9) && s.el.trimIn === 0 && s.el.trimOut === s.a.duration, 'clip does not fill the page', s);
    ok(s.dur === Math.ceil(s.a.duration * 10) / 10 && s.img, 'page length / poster', s);
    ok(s.tab === 'Videos' && s.items >= 1, 'uploads panel does not list the clip', s);
    ok((await vidColor()) === 'red', 'canvas does not show the first frame');
    ok((await hist()) === h0 + 1, 'adding the clip was not one undo step', { h0, h: await hist() });
    await blur();
    await page.keyboard.press('Control+z');
    const u = await ev(() => ({ n: A.E.els().length, dur: A.E.page().duration }));
    ok(u.n === 0 && u.dur === 5, 'undo left the clip or the length', u);
    // the Videos tab adds the clip again by click
    await page.click('.ed-panel .vid-item');
    await page.waitForFunction(() => A.E.els().some((e) => e.type === 'video'));
  });

  await step('video: a clip dropped on a social page is placed like a photo and the page takes its length', async () => {
    await open('social', [{ duration: 5 }, { duration: 7 }]);
    await ev(() => A.E.setPage(0));
    const [x, y] = await centre('.page-block[data-pi="0"] .page-frame');
    await ev(async ([x, y]) => {
      const dt = new DataTransfer();
      dt.items.add(window.__clip);
      document.elementFromPoint(x, y).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }, [x, y]);
    await page.waitForFunction(() => A.E.d.pages[0].elements.some((e) => e.type === 'video'), null, { timeout: 10000 });
    const s = await ev(() => { const el = A.E.d.pages[0].elements[0]; return { w: el.w, h: el.h, durs: A.E.d.pages.map((p) => p.duration), sel: A.E.sel[0] === el.id }; });
    ok(s.w < 1080 && near(s.w / s.h, 16 / 9, 0.01) && s.sel, 'dropped clip size', s);
    ok(s.durs[0] <= 2.3 && s.durs[0] >= 1.9 && s.durs[1] === 7, 'page lengths', s);
  });

  await step('video: dragging on the timeline ruler previews that moment (animations and clip frame) across pages', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip' }, { type: 'text', text: 'Hi', x: 1000, y: 600, w: 400, h: 120, size: 80, anim: { in: 'fade', delay: 0.5 } }] }, { duration: 3 }]);
    const y = await rulerY();
    const x1 = await rulerX(0.75);
    await page.mouse.move(x1, y);
    await page.mouse.down();
    const a = await ev(() => ({ head: A.V.head, prev: A.E.previewT, pi: A.E.pi, label: document.querySelector('.tl-time').textContent }));
    ok(near(a.head, 0.75, 0.06) && near(a.prev, a.head, 1e-9) && a.pi === 0 && a.label === A_fmt(a.head), 'ruler press', a);
    ok((await vidColor()) === 'green', 'clip frame at 0.75 s');
    // the fade-in text is at its animation state for that moment
    const op = await ev(() => +document.querySelector(`.page-block.active .page-svg [data-id="${A.E.els()[1].id}"]`).getAttribute('opacity'));
    ok(op > 0.5 && op < 1, 'text not shown mid-fade', op);
    await page.mouse.move(await rulerX(1.25), y, { steps: 4 });
    ok((await vidColor()) === 'blue', 'clip frame at 1.25 s');
    // into the second page
    await page.mouse.move(await rulerX(3.2), y, { steps: 4 });
    const b = await ev(() => ({ head: A.V.head, pi: A.E.pi }));
    ok(b.pi === 1 && near(b.head, 3.2, 0.1), 'scrub into page 2', b);
    await page.mouse.move(await rulerX(1.75), y, { steps: 4 });
    await page.mouse.up();
    const c = await ev(() => ({ head: A.V.head, prev: A.E.previewT, pi: A.E.pi, focus: document.activeElement?.className }));
    ok(c.pi === 0 && near(c.head, 1.75, 0.1) && c.prev === null && c.focus === 'tl-ruler', 'after release', c);
    // released: animations are static, the clip still shows the playhead's frame
    ok((await vidColor()) === 'yellow', 'clip frame after release');
    const op2 = await ev(() => document.querySelector(`.page-block.active .page-svg [data-id="${A.E.els()[1].id}"]`).getAttribute('opacity'));
    ok(op2 === null, 'text left mid-animation after release', op2);
  });

  await step('video: arrow keys, Home/End and Page keys move the focused playhead; the selection is not nudged', async () => {
    await ev(() => { A.E.select([A.E.els()[1].id]); });
    const x0 = await ev(() => A.E.els()[1].x);
    await page.click('.tl-ruler', { position: { x: 3, y: 8 } });
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const a = await ev(() => A.V.head);
    ok(near(a, 0.1, 1e-6), 'three frame steps', a);
    await page.keyboard.press('Shift+ArrowRight');
    ok(near(await ev(() => A.V.head), 1.1, 1e-6), 'shift step');
    await page.keyboard.press('PageDown');
    const b = await ev(() => ({ head: A.V.head, pi: A.E.pi }));
    ok(b.head === 2 && b.pi === 1, 'PageDown to the next page', b);
    await page.keyboard.press('End');
    ok((await ev(() => A.V.head)) === 5, 'End');
    await page.keyboard.press('PageUp');
    ok((await ev(() => A.V.head)) === 2, 'PageUp');
    const x1 = await ev(() => A.E.d.pages[0].elements[1].x);
    ok(x1 === x0, 'arrow keys nudged the element', { x0, x1 });
  });

  await step('video: Play runs from the playhead with the clip playing and audible, across pages; Pause stops it there', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip' }] }, { duration: 1.5, els: [{ type: 'clip', x: 100, y: 100 }] }]);
    await page.mouse.click(await rulerX(0.6), await rulerY());
    await page.click('.tl-controls .play');
    await wait(500);
    const a = await ev(() => ({ on: A.Present.previewing, head: A.V.head, title: document.querySelector('.tl-controls .play').title }));
    const v = await vid();
    ok(a.on && a.head > 0.9 && a.head < 1.6 && a.title === 'Pause', 'not playing from the playhead', a);
    ok(!v.paused && !v.muted && v.t > 0.8, 'clip not playing with sound', v);
    await page.waitForFunction(() => A.E.pi === 1, null, { timeout: 3000 });
    await wait(300);
    const v2 = await vid();
    ok(!v2.paused && v2.t > 0.1, 'second page clip not playing', v2);
    await page.click('.tl-controls .play');
    const b = await ev(() => ({ on: A.Present.previewing, head: A.V.head, pi: A.E.pi }));
    await wait(200);
    const v3 = await vid();
    ok(!b.on && b.pi === 1 && b.head > 2.2 && v3.paused && v3.muted && near(v3.t, b.head - 2, 0.05), 'pause', { b, v3 });
    // Play at the end starts again from the beginning
    await page.click('.tl-ruler', { position: { x: 3, y: 8 } });
    await page.keyboard.press('End');
    await page.keyboard.press('Space');
    await wait(150);
    const c = await ev(() => ({ on: A.Present.previewing, head: A.V.head, pi: A.E.pi }));
    ok(c.on && c.head < 0.5 && c.pi === 0, 'play from the end did not restart', c);
    await page.keyboard.press('Space');
    ok(!(await ev(() => A.Present.previewing)), 'Space did not pause');
  });

  await step('video: Split at the playhead continues the clip in the second part, without replaying entrances (one undo step)', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip' }, { type: 'text', text: 'Title', x: 1000, y: 600, w: 400, h: 120, size: 80, anim: { in: 'rise', out: 'fade' } }] }]);
    await page.mouse.click(await rulerX(0.8), await rulerY());
    const t = await ev(() => document.querySelector('.tl-controls button[title^="Split page"]').title);
    ok(t === 'Split page at the playhead', 'split button title', t);
    const h0 = await hist();
    await page.click('.tl-controls button[title="Split page at the playhead"]');
    const s = await ev(() => ({ durs: A.E.d.pages.map((p) => p.duration), v: A.E.d.pages.map((p) => p.elements[0]).map((e) => ({ trimIn: e.trimIn, begin: e.begin, id: e.id })), txt: A.E.d.pages.map((p) => p.elements[1].anim), pi: A.E.pi, head: A.V.head }));
    const head = s.durs[0];
    ok(near(head, 0.8, 0.06) && near(s.durs[0] + s.durs[1], 2, 1e-6), 'durations', s);
    ok(s.v[0].trimIn === 0 && near(s.v[1].trimIn, head, 1e-3) && s.v[1].begin === 0 && s.v[0].id !== s.v[1].id, 'second clip does not continue', s);
    ok(s.txt[0].in === 'rise' && s.txt[0].out === 'none' && s.txt[1].in === 'none' && s.txt[1].out === 'fade', 'animations', s);
    ok(s.pi === 1 && near(s.head, head, 1e-6), 'playhead after split', s);
    ok((await vidColor()) === 'green', 'second part does not start where the cut is');
    ok((await hist()) === h0 + 1, 'split is not one undo step');
    await blur();
    await page.keyboard.press('Control+z');
    const u = await ev(() => ({ n: A.E.d.pages.length, dur: A.E.d.pages[0].duration, anim: A.E.d.pages[0].elements[1].anim }));
    ok(u.n === 1 && u.dur === 2 && u.anim.out === 'fade', 'undo', u);
  });

  await step('video: a selected clip has a mini player that plays, pauses and scrubs it (mouse and keyboard)', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip', x: 200, y: 100, w: 960, h: 540 }] }]);
    const id = await ev(() => A.E.els()[0].id);
    const b = await box(`.page-block.active .page-svg [data-id="${id}"]`);
    await page.mouse.click(b.x + 40, b.y + 40);
    await page.waitForSelector('.vid-ctl .vc-play');
    await page.click('.vid-ctl .vc-play');
    await wait(400);
    const a = await vid();
    ok(!a.paused && a.t > 0.2 && !a.muted, 'mini play', a);
    ok((await ev(() => document.querySelector('.vid-ctl .vc-play').title)) === 'Pause clip', 'button label');
    await page.click('.vid-ctl .vc-play');
    const p = await vid();
    ok(p.paused && (await ev(() => A.E.sel.length)) === 1, 'mini pause', p);
    // the scrubber by keyboard
    await page.focus('.vid-ctl .vc-range');
    await page.keyboard.press('Home');
    for (let i = 0; i < 125; i++) await page.keyboard.press('ArrowRight');
    const s = await vid();
    ok(near(s.t, 1.25, 0.02) && (await vidColor()) === 'blue', 'scrubber', s);
    ok((await ev((id) => A.E.els()[0].x)) === 200, 'the range keys moved the clip');
    // the mini player never starts a move
    const c = await centre('.vid-ctl .vc-range');
    await page.mouse.move(c[0], c[1]);
    await page.mouse.down();
    await page.mouse.move(c[0] - 60, c[1], { steps: 4 });
    await page.mouse.up();
    ok((await ev(() => A.E.els()[0].x)) === 200, 'dragging the scrubber moved the clip');
    // the time label
    ok(/\d:\d\d\.\d \/ 0:0[12]\.\d/.test(await ev(() => document.querySelector('.vid-ctl .vc-time').textContent)), 'time label');
  });

  await step('video: the Video panel trims with handles and a frame preview, by mouse, keys and fields (one undo step each)', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip' }] }]);
    const id = await ev(() => A.E.els()[0].id);
    await ev(() => A.V.fitPage(A.E.page()));
    const [cx, cy] = await centre(`.page-block.active .page-svg [data-id="${id}"]`);
    await page.mouse.dblclick(cx, cy);
    await page.waitForSelector('.ed-panel .trim-bar');
    const src0 = await page.getAttribute('.trim-frame', 'src');
    const bar = await box('.trim-bar');
    const hb = await box('.trim-h.in');
    const h0 = await hist();
    const dur = await ev(() => A.E.els()[0].dur);
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * (0.6 / dur), hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();
    const a = await ev(() => ({ el: A.E.els()[0], dur: A.E.page().duration }));
    ok(near(a.el.trimIn, 0.6, 0.05) && (await hist()) === h0 + 1, 'in-handle drag', { trimIn: a.el.trimIn, h0, h: await hist() });
    ok(near(a.dur, Math.ceil((a.el.trimOut - a.el.trimIn) * 10 - 1e-6) / 10, 1e-9), 'the page did not follow its clip', a.dur);
    // the frame preview shows the trimmed start
    const frameColor = () => ev(async () => { const i = document.querySelector('.trim-frame'); if (!i.src.startsWith('data:')) return [0, 0, 0]; await i.decode(); const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.drawImage(i, 0, 0, 4, 4); return [...g.getImageData(2, 2, 1, 1).data].slice(0, 3); });
    let fc = '';
    for (let k = 0; k < 30 && fc !== 'green'; k++) { fc = color(await frameColor()); if (fc !== 'green') await wait(100); }
    ok(fc === 'green' && src0 !== (await page.getAttribute('.trim-frame', 'src')), 'frame preview', fc);
    // keyboard on the end handle: a burst of presses is one step
    await page.focus('.trim-h.out');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await wait(500);
    const b = await ev(() => A.E.els()[0]);
    ok(near(b.trimOut, a.el.trimOut - 0.5, 1e-6) && (await hist()) === h0 + 2, 'out-handle keys', { out: b.trimOut, h: await hist() });
    ok((await ev(() => document.querySelector('.trim-h.out').getAttribute('aria-valuenow'))) == String(Math.round(b.trimOut * 100) / 100), 'aria value');
    // the Start field
    await page.fill('.trim-fields input >> nth=0', '0.25');
    await page.keyboard.press('Tab');
    const c = await ev(() => A.E.els()[0].trimIn);
    ok(c === 0.25 && (await hist()) === h0 + 3, 'start field', c);
    // the canvas shows the new first frame
    ok((await vidColor()) === 'red', 'canvas frame after trimming');
    await blur();
    await page.keyboard.press('Control+z');
    ok((await ev(() => A.E.els()[0].trimIn)) !== 0.25, 'undo');
  });

  await step('video: mute, volume, loop, speed and start time in the panel drive playback timing', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip' }] }]);
    await ev(() => { A.V.fitPage(A.E.page()); A.E.select([A.E.els()[0].id]); });
    await page.click('.ed-toolbar button[title^="Edit video"]');
    await page.waitForSelector('.ed-panel .trim-bar');
    const len0 = await ev(() => A.V.len(A.E.els()[0]));
    await page.click('.ed-panel .seg-btn:has-text("2×")');
    const a = await ev(() => ({ speed: A.E.els()[0].speed, dur: A.E.page().duration, len: A.V.len(A.E.els()[0]) }));
    ok(a.speed === 2 && near(a.len, len0 / 2, 1e-6) && a.dur === Math.ceil(a.len * 10 - 1e-6) / 10, 'speed 2×', a);
    await page.click('.ed-panel label.check:has-text("Mute") input');
    ok((await ev(() => A.E.els()[0].muted)) === true, 'mute');
    await page.click('.ed-panel label.check:has-text("Loop") input');
    ok((await ev(() => A.E.els()[0].loop)) === true, 'loop');
    // the volume slider by keyboard
    const vol = page.locator('.ed-panel .slider-row:has-text("Volume") input[type=range]');
    await vol.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
    ok(near(await ev(() => A.E.els()[0].volume), 0.6, 1e-6), 'volume');
    // start 0.5 s into the page (the number field)
    const st = page.locator('.ed-panel .slider-row:has-text("Starts at") input.num');
    await st.fill('0.5');
    await st.press('Tab');
    const s = await ev(() => { const el = A.E.els()[0]; return { begin: el.begin, at0: A.V.at(el, 0.3), at1: A.V.at(el, 1.0), at2: A.V.at(el, 0.5 + A.V.len(el) + 0.2) }; });
    ok(s.begin === 0.5 && s.at0.time === 0 && !s.at0.on && near(s.at1.time, 1.0, 1e-6) && s.at2.on, 'start offset and loop timing', s);
    // the toolbar reflects the mute state and toggles it back
    await page.click('.ed-toolbar button[title="Unmute"]');
    ok((await ev(() => A.E.els()[0].muted)) === false, 'toolbar unmute');
  });

  await step('video: side handles crop a clip, Crop and corner rounding work like photos', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip', x: 200, y: 100, w: 960, h: 540 }] }]);
    const id = await ev(() => A.E.els()[0].id);
    const b = await box(`.page-block.active .page-svg [data-id="${id}"]`);
    await page.mouse.click(b.x + 50, b.y + 50);
    const e = await box('.sel-box .handle.e');
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
    await page.mouse.down();
    await page.mouse.move(e.x + e.width / 2 - 100, e.y + e.height / 2, { steps: 5 });
    await page.mouse.up();
    const c = await ev(() => { const el = A.E.els()[0]; return { crop: el.crop, w: el.w, h: el.h, live: document.querySelector('.page-block.active .page-svg video').style.width }; });
    ok(c.crop.w < 0.85 && c.crop.x === 0 && c.h === 540 && parseFloat(c.live) > c.w + 50, 'side crop', c);
    await page.click('.ed-toolbar button[title="Crop"]');
    await page.waitForSelector('.ed-panel .chip:has-text("1:1")');
    await page.click('.ed-panel .chip:has-text("1:1")');
    const sq = await ev(() => { const el = A.E.els()[0]; return { w: el.w, h: el.h }; });
    ok(near(sq.w, sq.h, 0.5), 'square crop', sq);
    await page.click('.ed-toolbar button[title="Corner rounding"]');
    const r = page.locator('.popover input[type=range]');
    await r.focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    const rd = await ev((id) => ({ radius: A.E.els()[0].radius, clip: !!document.querySelector(`.page-block.active .page-svg [data-id="${id}"] [clip-path] foreignObject`) }), id);
    ok(rd.radius === 30 && rd.clip, 'rounded corners', rd);
  });

  await step('video: a locked page or clip refuses edits, but the clip can still be played', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip' }] }]);
    await ev(() => { A.E.select([A.E.els()[0].id]); A.EU.openPanel('video'); });
    await page.waitForSelector('.ed-panel .trim-bar');
    await ev(() => { A.E.els()[0].locked = true; A.E.changed(); });
    await page.click('.ed-panel .seg-btn:has-text("2×")');
    ok((await ev(() => A.E.els()[0].speed)) === 1, 'locked clip changed speed');
    await page.click('.vid-ctl .vc-play');
    await wait(300);
    ok(!(await vid()).paused, 'locked clip does not play');
    await page.click('.vid-ctl .vc-play');
    await ev(() => { A.E.els()[0].locked = false; A.E.page().locked = true; A.E.changed({ structure: true }); });
    await page.mouse.click(await rulerX(1), await rulerY());
    const n0 = await ev(() => A.E.d.pages.length);
    await page.click('.tl-controls button[title^="Split page"]');
    ok((await ev(() => A.E.d.pages.length)) === n0, 'locked page was split');
    await ev(() => { A.E.select([A.E.els()[0].id]); A.EU.openPanel('video'); });
    await page.waitForSelector('.ed-panel .trim-bar');
    await page.focus('.trim-h.in');
    await page.keyboard.press('ArrowRight');
    ok((await ev(() => A.E.els()[0].trimIn)) === 0, 'locked page trimmed');
  });

  await step('video: soundtrack start, volume and fades are set in the timeline and shape the mix', async () => {
    await open('video', [{ duration: 3 }]);
    await ev(async () => {
      // 4 s of a 200 Hz tone
      const sr = 8000, n = sr * 4, v = new DataView(new ArrayBuffer(44 + n * 2));
      const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((i / sr) * 200 * 2 * Math.PI) * 16000), true);
      await A.app.importFile(new File([v.buffer], 'beat.wav', { type: 'audio/wav' }), { toEditor: true });
    });
    await page.waitForSelector('.tl-audio-btn');
    await page.waitForFunction(() => document.querySelector('.tl-audio-name').textContent === 'beat');
    await page.click('.tl-audio-btn');
    await page.waitForSelector('.tl-audio-pop');
    const h0 = await hist();
    const field = (label) => page.locator(`.tl-audio-pop .slider-row:has-text("${label}") input.num`);
    for (const [label, v] of [['Start at', '1'], ['Volume', '50'], ['Fade in', '1'], ['Fade out', '0.5']]) {
      await field(label).fill(v);
      await field(label).press('Tab');
    }
    const o = await ev(() => A.E.d.audioOpts);
    ok(o.start === 1 && o.volume === 0.5 && o.fadeIn === 1 && o.fadeOut === 0.5 && o.loop !== false, 'soundtrack settings', o);
    ok((await hist()) === h0 + 4, 'one undo step per setting', { h0, h: await hist() });
    await page.keyboard.press('Escape');
    // the mix: silent at the start, half volume after the fade in, silent at the end
    const m = await ev(async () => {
      const b = await A.V.mix(A.E.d, A.E.d.pages);
      const d = b.getChannelData(0), peak = (t0, t1) => { let p = 0; for (let i = Math.floor(t0 * b.sampleRate); i < Math.floor(t1 * b.sampleRate); i++) p = Math.max(p, Math.abs(d[i])); return p; };
      return { len: b.duration, start: peak(0, 0.05), mid: peak(1.5, 2), end: peak(2.98, 3) };
    });
    ok(near(m.len, 3, 0.01) && m.start < 0.05 && near(m.mid, 0.5 * 16000 / 32768, 0.05) && m.end < 0.05, 'soundtrack mix', m);
    // the start offset: the live soundtrack starts 1 s into the track
    await page.click('.tl-controls .play');
    await page.waitForFunction(() => A.Present.track?.el.currentTime > 0, null, { timeout: 3000 });
    const t = await ev(() => ({ t: A.Present.track.el.currentTime, vol: A.Present.track.el.volume, head: A.V.head }));
    await page.click('.tl-controls .play');
    ok(t.t >= 1 && t.t < 1 + t.head + 0.4 && t.vol < 0.5, 'live soundtrack offset or fade', t);
  });

  await step('video: present mode plays clips in step, with their sound and the soundtrack', async () => {
    await open('video', [{ duration: 1, els: [{ type: 'clip' }] }, { duration: 2, els: [{ type: 'clip' }] }]);
    await ev(async () => {
      const n = 8000, v = new DataView(new ArrayBuffer(44 + n * 2));
      const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      const a = await A.S.addAsset(new Blob([v.buffer], { type: 'audio/wav' }), { name: 'tone.wav' });
      A.E.d.audio = a.id;
      A.E.changed({ all: true });
    });
    await ev(() => A.E.setPage(0));
    await page.click('.ed-top .top-btn:has-text("Present")');
    await page.waitForSelector('.present .pr-layer video');
    await wait(600);
    const a = await vid('.present .pr-layer:last-child video');
    ok(!a.paused && !a.muted && a.t > 0.3, 'clip not playing in present mode', a);
    await page.waitForFunction(() => document.querySelector('.pr-count')?.textContent === '2 / 2', null, { timeout: 3000 });
    await wait(400);
    const b = await vid('.present .pr-layer:last-child video');
    ok(!b.paused && b.t > 0.1 && b.t < 1, 'second slide clip not in step', b);
    await ev(() => A.Present.stop());
    await page.waitForSelector('.present', { state: 'detached' });
    await ev(() => document.fullscreenElement && document.exitFullscreen());
    ok((await ev(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length)) === 0, 'a clip kept playing after present mode');
  });

  await step('video: the video export has every clip frame at its time and the clip sound (WebM and MP4)', async () => {
    await open('video', [{ duration: 1, page: { bg: { color: '#000000' } } }, { duration: 2, els: [{ type: 'clip', x: 0, y: 0, w: 1920, h: 1080 }] }]);
    for (const format of ['webm', 'mp4']) {
      const r = await ev(async (format) => {
        const { blob, ext } = await A.X.video(A.E.d, A.E.d.pages, { scale: 0.2, format });
        const v = document.createElement('video');
        v.muted = true;
        v.src = URL.createObjectURL(blob);
        await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('decode failed')); });
        const c = document.createElement('canvas'); c.width = c.height = 4;
        const g = c.getContext('2d', { willReadFrequently: true });
        const at = async (t) => { v.currentTime = t; await new Promise((r) => (v.onseeked = r)); g.drawImage(v, 0, 0, 4, 4); return [...g.getImageData(2, 2, 1, 1).data].slice(0, 3); };
        const px = [];
        for (const t of [0.5, 1.25, 1.75, 2.25, 2.75]) px.push(await at(t));
        const ab = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(await blob.arrayBuffer());
        const d = ab.getChannelData(0), peak = (t0, t1) => { let p = 0; for (let i = Math.floor(t0 * ab.sampleRate); i < Math.floor(t1 * ab.sampleRate); i++) p = Math.max(p, Math.abs(d[i])); return p; };
        return { ext, type: blob.type, dur: v.duration, w: v.videoWidth, px, quiet: peak(0.1, 0.9), loud: peak(1.2, 2.8), adur: ab.duration };
      }, format);
      ok(r.ext === format && near(r.dur, 3, 0.1) && r.w === 384, format + ' file', r);
      ok(r.px.map(color).join() === 'black,red,green,blue,yellow', format + ' frames', r.px);
      ok(r.quiet < 0.02 && r.loud > 0.2 && near(r.adur, 3, 0.15), format + ' sound', r);
    }
  });

  await step('video: GIF, PNG and thumbnails show clip frames', async () => {
    const r = await ev(async () => {
      const canvas = document.createElement('canvas'), out = [];
      for (const t of [1.25, 1.75, 2.25, 2.75]) {
        await A.X.renderFrame(A.E.d, A.E.d.pages, t, canvas, 0.1, {}, '');
        out.push([...canvas.getContext('2d').getImageData(20, 20, 1, 1).data].slice(0, 3));
      }
      const gif = await A.X.gifFromDesign(A.E.d, A.E.d.pages, { maxW: 64 });
      const img = await A.U.loadImage(URL.createObjectURL(await A.X.pageBlob(A.E.d, A.E.d.pages[1], { scale: 0.1 })));
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      const th = await A.U.loadImage(await A.R.thumbnail(A.E.d, A.E.d.pages[1]));
      const c2 = document.createElement('canvas'); c2.width = th.width; c2.height = th.height; c2.getContext('2d').drawImage(th, 0, 0);
      return { out, gif: gif.size, png: [...c.getContext('2d').getImageData(20, 20, 1, 1).data].slice(0, 3), thumb: [...c2.getContext('2d').getImageData(20, 20, 1, 1).data].slice(0, 3) };
    });
    ok(r.out.map(color).join() === 'red,green,blue,yellow', 'GIF/video frames', r.out);
    ok(color(r.png) === 'red' && color(r.thumb) === 'red' && r.gif > 1000, 'still exports', r);
  });

  await step('video: design files and backups carry the clip, its poster and settings', async () => {
    await open('video', [{ duration: 2, els: [{ type: 'clip', trimIn: 0.6, speed: 1.5, muted: true, loop: true, begin: 0.2 }] }]);
    const r = await ev(async () => {
      const json = JSON.parse(await (await A.S.exportDesignFile(A.E.d)).text());
      const kinds = json.assets.map((a) => a.kind).sort().join();
      // a clean import: the assets are gone first
      for (const a of json.assets) await A.S.del('assets', a.id);
      const d = await A.S.importDesignFile(json);
      const a = await A.S.get('assets', d.pages[0].elements[0].asset);
      const back = JSON.parse(await (await A.S.exportBackup()).text());
      const va = back.assets.find((x) => x.id === a.id);
      return { kinds, id: d.id, el: d.pages[0].elements[0], a: { kind: a.kind, duration: a.duration, poster: a.poster, blob: a.blob instanceof Blob }, back: va && { kind: va.kind, duration: va.duration, poster: va.poster } };
    });
    ok(r.kinds === 'image,video', 'design file assets', r.kinds);
    ok(r.el.type === 'video' && r.el.trimIn === 0.6 && r.el.speed === 1.5 && r.el.muted && r.el.loop && r.el.begin === 0.2 && r.a.kind === 'video' && r.a.duration > 1.8 && r.a.blob && r.a.poster === r.el.poster, 'imported clip', r);
    ok(r.back?.kind === 'video' && r.back.duration === r.a.duration && r.back.poster === r.a.poster, 'backup asset', r.back);
    await ev((id) => A.app.go('#/design/' + id), r.id);
    await page.waitForFunction((id) => A.E.d?.id === id && document.querySelector('.page-block.active .page-svg video')?.readyState >= 2, r.id, { timeout: 8000 });
    ok((await vidColor()) === 'green', 'imported clip shows its trimmed first frame');
  });

  await step('video: at phone width the playhead scrubs by touch and a clip plays from its mini player', async () => {
    const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    try {
      await p.goto(page.url().split('#')[0] + '#/home');
      await p.waitForSelector('.hero');
      await record(p);
      await open('video', [{ duration: 2, els: [{ type: 'clip', x: 0, y: 0, w: 1920, h: 1080 }] }, { duration: 2 }], p);
      const r = await p.locator('.tl-ruler').boundingBox();
      ok(r && r.width > 40 && r.x + 10 < 390, 'ruler not reachable', r);
      const cdp = await ctx.newCDPSession(p);
      const tp = (x, y) => [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
      const xAt = (T) => p.evaluate((T) => { const g = A.EU.tlGeo, rr = g.lane.getBoundingClientRect(); const { i, local } = A.V.pageAt(A.E.d, T); return rr.left + g.blocks[i].x + (local / g.durs[i]) * g.blocks[i].w; }, T);
      const y = r.y + r.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(await xAt(0.2), y) });
      for (const T of [0.5, 0.9, 1.3]) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(await xAt(T), y) }); await p.waitForTimeout(30); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(200);
      const h = await p.evaluate(() => A.V.head);
      ok(near(h, 1.3, 0.12), 'touch scrub', h);
      const id = await p.evaluate(() => A.E.els()[0].id);
      const b = await p.locator(`.page-block.active .page-svg [data-id="${id}"]`).boundingBox();
      await p.tap('body', { position: { x: b.x + 30, y: b.y + 30 } });
      await p.waitForSelector('.vid-ctl .vc-play');
      const pb = await p.locator('.vid-ctl .vc-play').boundingBox();
      ok(pb.width >= 32 && pb.x >= 0 && pb.x + pb.width <= 390, 'mini player button', pb);
      await p.tap('.vid-ctl .vc-play');
      await p.waitForTimeout(300);
      ok(await p.evaluate(() => !document.querySelector('.page-block.active .page-svg video').paused), 'mini player did not play by touch');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page scrolls sideways');
      ok(!errs.length, 'page errors', errs);
    } finally {
      await ctx.close();
    }
  });
}
// the time label format of A.V.fmt
function A_fmt(s) { return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); }
