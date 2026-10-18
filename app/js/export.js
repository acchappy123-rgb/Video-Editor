'use strict';
// Export formats implemented without third-party libraries:
// PNG, JPG, SVG, PDF (raster pages, optional bleed + crop marks), GIF, MP4/WebM video (WebCodecs + own muxers),
// PowerPoint (.pptx, one picture per slide), ZIP bundles and a standalone website (HTML).
(function (A) {
  const U = A.U, R = A.R;
  const X = (A.X = {});
  const enc = new TextEncoder();

  // ---------- ZIP (store, no compression) ----------
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  X.zip = async (files) => {
    // files: [{name, data: Uint8Array|Blob|string}]
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      let data = f.data;
      if (typeof data === 'string') data = enc.encode(data);
      else if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
      const name = enc.encode(f.name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  };

  // ---------- raster ----------
  X.pageBlob = async (design, page, { format = 'png', scale = 1, transparent = false, quality = 0.92 } = {}) => {
    const c = await R.pageCanvas(design, page, scale, { transparent, matte: format === 'jpg' ? '#ffffff' : null });
    return U.canvasToBlob(c, format === 'jpg' ? 'image/jpeg' : 'image/png', quality);
  };

  // ---------- PDF ----------
  // Copy of canvas c with a b-px band around it that repeats its outermost pixels (edges and corners).
  const bleedCanvas = (c, b) => {
    const w = c.width, h = c.height, o = document.createElement('canvas');
    o.width = w + 2 * b;
    o.height = h + 2 * b;
    const g = o.getContext('2d');
    g.imageSmoothingEnabled = false;
    // [source start, source size, target start, target size] for: before the page, the page, after it
    const xs = [[0, 1, 0, b], [0, w, b, w], [w - 1, 1, b + w, b]], ys = [[0, 1, 0, b], [0, h, b, h], [h - 1, 1, b + h, b]];
    for (const [sx, sw, dx, dw] of xs) for (const [sy, sh, dy, dh] of ys) g.drawImage(c, sx, sy, sw, sh, dx, dy, dw, dh);
    return o;
  };
  X.pdf = async (design, pages, { scale = 2, quality = 0.92, bleed = false, marks = false, onProgress } = {}) => {
    const pt = 0.75; // 96 px per inch -> 72 pt per inch
    const B = bleed ? 9 : 0; // 1/8 inch bleed in pt
    const MK = marks ? 18 : 0;
    const chunks = [];
    let len = 0;
    const offsets = [];
    const push = (x) => {
      const b = typeof x === 'string' ? enc.encode(x) : x;
      chunks.push(b);
      len += b.length;
    };
    const obj = (i, body) => {
      offsets[i] = len;
      push(`${i} 0 obj\n`);
      body();
      push('\nendobj\n');
    };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const N = pages.length;
    const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    const W = design.width * pt, H = design.height * pt;
    const PW = W + 2 * (B + MK), PH = H + 2 * (B + MK);
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${N} >>`));
    for (let i = 0; i < N; i++) {
      onProgress && onProgress(i / N);
      const c0 = await R.pageCanvas(design, pages[i], scale, { matte: '#ffffff' });
      // Bleed: the page's edge pixels are extended outwards, so the trimmed artwork stays 1:1.
      const kx = W / c0.width, ky = H / c0.height; // pt per px
      const bp = Math.ceil(B / Math.min(kx, ky)), c = bp ? bleedCanvas(c0, bp) : c0;
      const jpg = new Uint8Array(await (await U.canvasToBlob(c, 'image/jpeg', quality)).arrayBuffer());
      const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
      const ix = MK + B - bp * kx, iy = MK + B - bp * ky, iw = c.width * kx, ih = c.height * ky;
      let content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im${i} Do Q\n`;
      if (marks) {
        const t0x = MK + B, t0y = MK + B, t1x = t0x + W, t1y = t0y + H;
        content += '0 0 0 RG 0.5 w\n';
        const seg = (x1, y1, x2, y2) => (content += `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`);
        for (const x of [t0x, t1x]) { seg(x, 0, x, MK - 3); seg(x, PH - MK + 3, x, PH); }
        for (const y of [t0y, t1y]) { seg(0, y, MK - 3, y); seg(PW - MK + 3, y, PW, y); }
      }
      const bleedBox = B ? ` /BleedBox [${MK.toFixed(2)} ${MK.toFixed(2)} ${(PW - MK).toFixed(2)} ${(PH - MK).toFixed(2)}]` : '';
      obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}]${bleedBox} /TrimBox [${(MK + B).toFixed(2)} ${(MK + B).toFixed(2)} ${(MK + B + W).toFixed(2)} ${(MK + B + H).toFixed(2)}] /Resources << /XObject << /Im${i} ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
      obj(cid, () => push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`));
      obj(iid, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
        push(jpg);
        push('\nendstream');
      });
    }
    const total = 3 + N * 3;
    const xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  };

  // ---------- GIF (216-colour web palette + LZW) ----------
  function gifLZW(indices, out) {
    const min = 8, clear = 256, eoi = 257;
    let size = 9, next = 258, table = new Map();
    let cur = 0, bits = 0;
    const bytes = [];
    const emit = (code) => {
      cur |= code << bits;
      bits += size;
      while (bits >= 8) {
        bytes.push(cur & 255);
        cur >>>= 8;
        bits -= 8;
      }
    };
    emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = prefix * 256 + k;
      const hit = table.get(key);
      if (hit !== undefined) {
        prefix = hit;
        continue;
      }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        next = 258;
        size = 9;
        table = new Map();
      } else {
        if (next >= 1 << size) size++;
        table.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) bytes.push(cur & 255);
    out.push(min);
    for (let i = 0; i < bytes.length; i += 255) {
      const n = Math.min(255, bytes.length - i);
      out.push(n);
      for (let j = 0; j < n; j++) out.push(bytes[i + j]);
    }
    out.push(0);
  }
  // Streaming encoder: each frame is quantised and compressed as it is added, so frames need not be kept.
  X.gifEncoder = (w, h, delayCs = 10) => {
    const parts = [];
    let out = [];
    const str = (s) => { for (const c of s) out.push(c.charCodeAt(0)); };
    const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
    const flush = () => { parts.push(new Uint8Array(out)); out = []; };
    str('GIF89a'); u16(w); u16(h); out.push(0xf7, 0, 0);
    for (let i = 0; i < 256; i++) {
      if (i < 216) out.push(Math.floor(i / 36) * 51, (Math.floor(i / 6) % 6) * 51, (i % 6) * 51);
      else out.push(0, 0, 0);
    }
    out.push(0x21, 0xff, 0x0b); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0);
    flush();
    // ordered dithering keeps gradients smooth with only 216 colours
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    return {
      add(f) {
        out.push(0x21, 0xf9, 4, 0x04); u16(delayCs); out.push(0, 0);
        out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0);
        const px = f.data, idx = new Uint8Array(w * h);
        for (let y = 0, p = 0; y < h; y++)
          for (let x = 0; x < w; x++, p++) {
            const d = (bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 51;
            const q = (v) => Math.max(0, Math.min(5, Math.round((v + d) / 51)));
            idx[p] = q(px[p * 4]) * 36 + q(px[p * 4 + 1]) * 6 + q(px[p * 4 + 2]);
          }
        gifLZW(idx, out);
        flush();
      },
      finish: () => new Blob([...parts, new Uint8Array([0x3b])], { type: 'image/gif' }),
    };
  };
  X.gif = (frames, w, h, delayCs = 10) => {
    // frames: ImageData[]
    const g = X.gifEncoder(w, h, delayCs);
    for (const f of frames) g.add(f);
    return g.finish();
  };

  // ---------- animation frames ----------
  X.totalDuration = (pages) => U.round(pages.reduce((s, p) => s + (p.duration || 5), 0));
  X.frameAt = (pages, t) => {
    let acc = 0;
    for (let i = 0; i < pages.length; i++) {
      const d = pages[i].duration || 5;
      if (t < acc + d || i === pages.length - 1) return { index: i, local: Math.min(t - acc, d) };
      acc += d;
    }
    return { index: 0, local: 0 };
  };
  async function assetMap(design) {
    const map = {};
    for (const id of A.S.designAssetIds(design)) map[id] = await A.S.assetDataURL(id);
    return map;
  }
  X.renderFrame = async (design, pages, t, canvas, scale, map, fontCSS) => {
    const { index, local } = X.frameAt(pages, t);
    const page = pages[index], next = pages[index + 1];
    // video clips are drawn at the frame they show at t
    const raster = async (p, t, idp) => R.pageCanvas(design, p, scale, { svg: R.pageSVG(design, p, { t, asset: (id) => map[id] || '', fontCSS, idp, frame: await A.V.frames(p, t, scale) }), matte: '#ffffff' });
    const c1 = await raster(page, local, 'v');
    // dissolve transition into the next page
    const d = page.duration || 5, td = 0.6;
    const k = next && next.transition && next.transition !== 'none' && local > d - td ? (local - (d - td)) / td : 0;
    const c2 = k && (await raster(next, 0, 'w'));
    // compose synchronously: a recorded canvas must never be captured half-drawn
    if (canvas.width !== c1.width) canvas.width = c1.width;
    if (canvas.height !== c1.height) canvas.height = c1.height;
    const g = canvas.getContext('2d');
    g.drawImage(c1, 0, 0);
    if (c2) {
      g.globalAlpha = k;
      g.drawImage(c2, 0, 0);
      g.globalAlpha = 1;
    }
  };
  X.gifFromDesign = async (design, pages, { maxW = 640, fps = 10, maxFrames = 600, onProgress } = {}) => {
    const scale = Math.min(1, maxW / design.width);
    const w = Math.round(design.width * scale), h = Math.round(design.height * scale);
    const map = await assetMap(design), fontCSS = await R.fontCSSFor(design);
    // a long design keeps every page: the frame rate drops so that it fits in maxFrames
    const total = X.totalDuration(pages);
    const delay = Math.max(Math.round(100 / fps), Math.ceil((total * 100) / maxFrames)); // centiseconds
    const count = Math.max(1, Math.round((total * 100) / delay));
    const gif = X.gifEncoder(w, h, delay);
    const canvas = document.createElement('canvas');
    for (let i = 0; i < count; i++) {
      await X.renderFrame(design, pages, (i * delay) / 100, canvas, scale, map, fontCSS);
      gif.add(canvas.getContext('2d').getImageData(0, 0, w, h));
      onProgress && onProgress(i / count);
    }
    return gif.finish();
  };

  // ---------- video ----------
  // With WebCodecs every frame is rendered and encoded in turn (exact timing, however long a frame takes to draw) and
  // muxed with the mixed sound: MP4 with H.264 where the browser encodes it, else WebM (VP9 or VP8, Opus sound).
  // Without WebCodecs, MediaRecorder records the frames as they are drawn, in real time.
  // opts: { scale, fps, format: 'mp4' | 'webm' (default: MP4 when H.264 can be made), onProgress }
  X.offlineVideo = () => typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
  X.video = async (design, pages, opts = {}) => {
    const sound = await A.V.mix(design, pages).catch((e) => (console.warn('sound skipped', e), null));
    const plan = X.offlineVideo() && (await videoPlan(design, opts, sound));
    return plan ? encodeVideo(design, pages, opts, plan, sound) : recordVideo(design, pages, opts, sound);
  };
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const supported = async (Enc, cfg) => { try { return (await Enc.isConfigSupported(cfg)).supported; } catch (e) { return false; } };
  // The codecs to encode with: H.264 (+ AAC or Opus) in MP4, else VP9/VP8 + Opus in WebM (or MP4 when asked for).
  async function videoPlan(design, { scale = 1, fps = 30, format } = {}, sound) {
    const w = even(design.width * scale), h = even(design.height * scale);
    // the lowest H.264 level (4.0 to 6.0) whose frame size and macroblock rate fit; VP9 4.1, 5.1 or 6.1 by picture size
    const mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
    const level = [[8192, 245760, '28'], [8704, 522240, '2a'], [22080, 589824, '32'], [36864, 983040, '33'], [36864, 2073600, '34']].find(([f, r]) => mbs <= f && mbs * fps <= r)?.[2] || '3c';
    const vp9 = w * h <= 2228224 ? '41' : w * h <= 8912896 ? '51' : '61';
    const bitrate = Math.round(U.clamp(w * h * fps * 0.12, 5e5, 2.5e7));
    const avc = format !== 'webm' ? ['avc1.6400' + level, 'avc1.4d00' + level, 'avc1.4200' + level] : [];
    for (const codec of [...avc, `vp09.00.${vp9}.08`, 'vp8']) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps, ...(codec.startsWith('avc1') ? { avc: { format: 'avc' } } : {}) };
      if (!(await supported(VideoEncoder, cfg))) continue;
      const box = codec.startsWith('avc1') || (format === 'mp4' && codec.startsWith('vp09')) ? 'mp4' : 'webm';
      if (box === 'mp4' && codec === 'vp8') continue;
      let audio = null;
      if (sound) {
        if (typeof AudioEncoder !== 'function') return null;
        for (const ac of box === 'mp4' ? ['mp4a.40.2', 'opus'] : ['opus']) {
          const acfg = { codec: ac, sampleRate: sound.sampleRate, numberOfChannels: 2, bitrate: 160000 };
          if (await supported(AudioEncoder, acfg)) { audio = acfg; break; }
        }
        if (!audio) return null;
      }
      return { video: cfg, audio, box, fps, w, h };
    }
    return null;
  }
  async function encodeVideo(design, pages, { scale = 1, onProgress } = {}, plan, sound) {
    const map = await assetMap(design), fontCSS = await R.fontCSSFor(design);
    const { fps, w, h } = plan, total = X.totalDuration(pages), n = Math.max(1, Math.round(total * fps));
    const canvas = document.createElement('canvas'), fit = document.createElement('canvas');
    fit.width = w;
    fit.height = h;
    const v = [], a = [];
    let vcfg = null, acfg = null, err = null;
    const take = (list) => (c, m) => {
      const b = new Uint8Array(c.byteLength);
      c.copyTo(b);
      list.push({ t: c.timestamp, d: c.duration, key: c.type === 'key', b });
      if (m?.decoderConfig) list === v ? (vcfg = m.decoderConfig) : (acfg = m.decoderConfig);
    };
    const venc = new VideoEncoder({ output: take(v), error: (e) => (err = e) });
    venc.configure(plan.video);
    try {
      for (let i = 0; i < n; i++) {
        if (err) throw err;
        await X.renderFrame(design, pages, i / fps, canvas, scale, map, fontCSS);
        // the encoder takes even sizes; a page rounded to an odd size is stretched by a pixel
        let src = canvas;
        if (canvas.width !== w || canvas.height !== h) { fit.getContext('2d').drawImage(canvas, 0, 0, w, h); src = fit; }
        const f = new VideoFrame(src, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps), alpha: 'discard' });
        venc.encode(f, { keyFrame: i % (fps * 2) === 0 });
        f.close();
        while (venc.encodeQueueSize > 4 && !err) await new Promise((r) => setTimeout(r, 4));
        onProgress?.((i / n) * (sound ? 0.92 : 1));
      }
      await venc.flush();
    } finally {
      if (venc.state !== 'closed') venc.close();
    }
    if (err) throw err;
    if (sound) {
      const aenc = new AudioEncoder({ output: take(a), error: (e) => (err = e) });
      aenc.configure(plan.audio);
      const N = sound.length, rate = sound.sampleRate, L = sound.getChannelData(0), Rt = sound.getChannelData(Math.min(1, sound.numberOfChannels - 1));
      for (let o = 0; o < N && !err; o += 4800) {
        const len = Math.min(4800, N - o), data = new Float32Array(len * 2);
        data.set(L.subarray(o, o + len), 0);
        data.set(Rt.subarray(o, o + len), len);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round((o / rate) * 1e6), data });
        aenc.encode(ad);
        ad.close();
        while (aenc.encodeQueueSize > 8 && !err) await new Promise((r) => setTimeout(r, 2));
      }
      await aenc.flush();
      aenc.close();
      if (err) throw err;
    }
    onProgress?.(1);
    // a chunk without a duration lasts until the next one
    for (const list of [v, a]) list.forEach((c, i) => (c.d ||= (list[i + 1] ? list[i + 1].t - c.t : list[i - 1]?.d || 1e6 / fps)));
    const tracks = { v, vcfg: { ...plan.video, ...vcfg }, a: sound ? a : null, acfg: sound && { ...plan.audio, ...acfg }, w, h, fps, total };
    return plan.box === 'mp4' ? { blob: mp4(tracks), ext: 'mp4' } : { blob: webm(tracks), ext: 'webm' };
  }
  // OpusHead: given by the encoder, or the standard one (stereo, 312 samples of pre-skip)
  const opusHead = (cfg) => {
    if (cfg?.description) return new Uint8Array(ArrayBuffer.isView(cfg.description) ? cfg.description.buffer.slice(cfg.description.byteOffset, cfg.description.byteOffset + cfg.description.byteLength) : cfg.description);
    const b = new Uint8Array(19), dv = new DataView(b.buffer);
    b.set(enc.encode('OpusHead'));
    b[8] = 1;
    b[9] = cfg?.numberOfChannels || 2;
    dv.setUint16(10, 312, true);
    dv.setUint32(12, cfg?.sampleRate || 48000, true);
    return b;
  };
  const bytesOf = (d) => (d ? new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d) : new Uint8Array(0));
  const cat = (parts) => {
    let len = 0;
    for (const p of parts) len += p.length;
    const o = new Uint8Array(len);
    let k = 0;
    for (const p of parts) { o.set(p, k); k += p.length; }
    return o;
  };

  // ---------- WebM (Matroska subset): header, tracks, a cluster per keyframe, cues ----------
  const vint = (n) => {
    let L = 1;
    while (n >= 2 ** (7 * L) - 1) L++;
    const b = new Uint8Array(L);
    for (let i = 0; i < L; i++) b[L - 1 - i] = Math.floor(n / 256 ** i) & 255;
    b[0] |= 1 << (8 - L);
    return b;
  };
  const idBytes = (id) => { const b = []; for (let x = id; x > 0; x = Math.floor(x / 256)) b.unshift(x & 255); return new Uint8Array(b); };
  const ebml = (id, ...kids) => { const body = cat(kids.flat()); return cat([idBytes(id), vint(body.length), body]); };
  const euint = (id, v, size = 0) => { const b = []; do { b.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0 || b.length < size); return ebml(id, new Uint8Array(b)); };
  const efloat = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return ebml(id, b); };
  const estr = (id, s) => ebml(id, enc.encode(s));
  function webm({ v, vcfg, a, acfg, w, h, fps, total }) {
    const head = ebml(0x1a45dfa3, euint(0x4286, 1), euint(0x42f7, 1), euint(0x42f2, 4), euint(0x42f3, 8), estr(0x4282, 'webm'), euint(0x4287, 4), euint(0x4285, 2));
    const info = ebml(0x1549a966, euint(0x2ad7b1, 1e6), estr(0x4d80, 'Atelier'), estr(0x5741, 'Atelier'), efloat(0x4489, total * 1000));
    const trackList = [ebml(0xae, euint(0xd7, 1), euint(0x73c5, 1), euint(0x83, 1), euint(0x9c, 0), estr(0x86, vcfg.codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8'), euint(0x23e383, Math.round(1e9 / fps)), ebml(0xe0, euint(0xb0, w), euint(0xba, h)))];
    if (a) {
      const oh = opusHead(acfg), pre = new DataView(oh.buffer).getUint16(10, true);
      trackList.push(ebml(0xae, euint(0xd7, 2), euint(0x73c5, 2), euint(0x83, 2), euint(0x9c, 0), estr(0x86, 'A_OPUS'), ebml(0x63a2, oh), euint(0x56aa, Math.round((pre / 48000) * 1e9)), euint(0x56bb, 80000000), ebml(0xe1, efloat(0xb5, acfg.sampleRate || 48000), euint(0x9f, acfg.numberOfChannels || 2))));
    }
    const tracks = ebml(0x1654ae6b, trackList);
    // blocks in time order; a video keyframe starts a cluster (they are at most 2 s apart)
    const ms = (us) => Math.round(us / 1000);
    const blocks = [...v.map((c) => ({ ...c, tr: 1 })), ...(a || []).map((c) => ({ ...c, tr: 2, key: true }))].sort((x, y) => x.t - y.t || x.tr - y.tr);
    const clusters = [];
    let cur = null;
    for (const b of blocks) {
      if (!cur || (b.tr === 1 && b.key) || ms(b.t) - cur.t > 30000) clusters.push((cur = { t: Math.max(0, ms(b.t)), parts: [] }));
      const hd = new Uint8Array(4), rel = ms(b.t) - cur.t;
      hd[0] = 0x80 | b.tr;
      new DataView(hd.buffer).setInt16(1, rel);
      hd[3] = b.key ? 0x80 : 0;
      cur.parts.push(ebml(0xa3, hd, b.b));
    }
    const cl = clusters.map((c) => ebml(0x1f43b675, euint(0xe7, c.t), c.parts));
    // SeekHead positions are 8-byte numbers, so its size is known before the positions are
    const seekHead = (pos) => ebml(0x114d9b74, [[0x1549a966, pos.info], [0x1654ae6b, pos.tracks], [0x1c53bb6b, pos.cues]].map(([id, p]) => ebml(0x4dbb, ebml(0x53ab, idBytes(id)), euint(0x53ac, p, 8))));
    const sh = seekHead({ info: 0, tracks: 0, cues: 0 }).length;
    let pos = sh + info.length + tracks.length;
    const cues = ebml(0x1c53bb6b, cl.map((c, i) => { const p = pos; pos += c.length; return ebml(0xbb, euint(0xb3, clusters[i].t), ebml(0xb7, euint(0xf7, 1), euint(0xf1, p))); }));
    const seg = cat([seekHead({ info: sh, tracks: sh + info.length, cues: pos }), info, tracks, ...cl, cues]);
    return new Blob([head, idBytes(0x18538067), vint(seg.length), seg], { type: 'video/webm' });
  }

  // ---------- MP4 (ISO BMFF): ftyp, mdat, moov with one chunk per track ----------
  const box = (type, ...kids) => { const body = cat(kids.flat()), b = new Uint8Array(8); new DataView(b.buffer).setUint32(0, body.length + 8); b.set(enc.encode(type), 4); return cat([b, body]); };
  const full = (type, ver, flags, ...kids) => box(type, new Uint8Array([ver, flags >> 16, (flags >> 8) & 255, flags & 255]), ...kids);
  const be = (bits, ...vals) => { const b = new Uint8Array((vals.length * bits) / 8), dv = new DataView(b.buffer); vals.forEach((x, i) => (bits === 8 ? dv.setUint8(i, x) : bits === 16 ? dv.setUint16(i * 2, x) : dv.setUint32(i * 4, x))); return b; };
  const be32 = (list) => { const b = new Uint8Array(list.length * 4), dv = new DataView(b.buffer); list.forEach((x, i) => dv.setUint32(i * 4, x)); return b; };
  const MATRIX = be(32, 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);
  // colour primaries, transfer and matrix codes (ISO 23091-2) of a WebCodecs colour space; 2 is 'unspecified'
  const cicp = (c = {}) => [{ bt709: 1, bt470bg: 5, smpte170m: 6 }[c.primaries] || 2, { bt709: 1, smpte170m: 6, 'iec61966-2-1': 13 }[c.transfer] || 2, { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6 }[c.matrix] ?? 2];
  // an ISO 14496-1 descriptor
  const desc = (tag, ...kids) => { const body = cat(kids.flat()); return cat([new Uint8Array([tag, 0x80, 0x80, 0x80, body.length]), body]); };
  function mp4({ v, vcfg, a, acfg, w, h, fps, total }) {
    const ftyp = box('ftyp', enc.encode('isom'), be(32, 512), enc.encode('isomiso2avc1mp41'));
    const vData = cat(v.map((c) => c.b)), aData = a ? cat(a.map((c) => c.b)) : new Uint8Array(0);
    const mdatStart = ftyp.length + 8;
    const mdat = cat([be(32, vData.length + aData.length + 8), enc.encode('mdat'), vData, aData]);
    const dur = Math.round(total * 1000);
    const vsd = vcfg.codec.startsWith('avc1')
      ? box('avc1', new Uint8Array(6), be(16, 1), new Uint8Array(16), be(16, w, h), be(32, 0x480000, 0x480000, 0), be(16, 1), new Uint8Array(32), be(16, 0x18, 0xffff), box('avcC', bytesOf(vcfg.description)))
      : box('vp09', new Uint8Array(6), be(16, 1), new Uint8Array(16), be(16, w, h), be(32, 0x480000, 0x480000, 0), be(16, 1), new Uint8Array(32), be(16, 0x18, 0xffff), full('vpcC', 1, 0, be(8, 0, +vcfg.codec.split('.')[2] || 41, 0x82 | (vcfg.colorSpace?.fullRange ? 1 : 0), ...cicp(vcfg.colorSpace)), be(16, 0)));
    const trak = (id, kind, timescale, samples, sd, offset, extra) => {
      const deltas = [];
      for (const s of samples) { const d = Math.max(1, Math.round((s.d || 0) * timescale / 1e6)); const last = deltas[deltas.length - 1]; if (last && last[1] === d) last[0]++; else deltas.push([1, d]); }
      const mediaDur = deltas.reduce((t, [k, d]) => t + k * d, 0);
      const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
      const stbl = box('stbl',
        full('stsd', 0, 0, be(32, 1), sd),
        full('stts', 0, 0, be(32, deltas.length), deltas.map(([k, d]) => be(32, k, d))),
        kind === 'vide' && keys.length < samples.length ? full('stss', 0, 0, be(32, keys.length), be32(keys)) : [],
        full('stsc', 0, 0, be(32, 1), be(32, 1, samples.length, 1)),
        full('stsz', 0, 0, be(32, 0, samples.length), be32(samples.map((s) => s.b.length))),
        full('stco', 0, 0, be(32, 1, offset)));
      return box('trak',
        full('tkhd', 0, 3, be(32, 0, 0, id, 0, dur), new Uint8Array(8), be(16, 0, 0, kind === 'soun' ? 0x100 : 0, 0), MATRIX, be(32, kind === 'vide' ? w * 65536 : 0, kind === 'vide' ? h * 65536 : 0)),
        box('mdia',
          full('mdhd', 0, 0, be(32, 0, 0, timescale, mediaDur), be(16, 0x55c4, 0)),
          full('hdlr', 0, 0, be(32, 0), enc.encode(kind), new Uint8Array(12), enc.encode(kind === 'vide' ? 'VideoHandler\0' : 'SoundHandler\0')),
          box('minf', extra, box('dinf', full('dref', 0, 0, be(32, 1), full('url ', 0, 1))), stbl)));
    };
    const traks = [trak(1, 'vide', 90000, v, vsd, mdatStart, full('vmhd', 0, 1, new Uint8Array(8)))];
    if (a) {
      const rate = acfg.sampleRate || 48000, ch = acfg.numberOfChannels || 2;
      const entry = (type, ...kids) => box(type, new Uint8Array(6), be(16, 1), new Uint8Array(8), be(16, ch, 16, 0, 0), be(32, rate * 65536), ...kids);
      let asd;
      if (acfg.codec === 'opus') {
        const oh = opusHead(acfg), dv = new DataView(oh.buffer);
        asd = entry('Opus', box('dOps', be(8, 0, ch), be(16, dv.getUint16(10, true)), be(32, rate), be(16, 0), be(8, 0)));
      } else {
        const asc = bytesOf(acfg.description);
        asd = entry('mp4a', full('esds', 0, 0, desc(3, be(16, 2), be(8, 0), desc(4, be(8, 0x40, 0x15), new Uint8Array(3), be(32, 0, 0), desc(5, asc)), desc(6, be(8, 2)))));
      }
      traks.push(trak(2, 'soun', rate, a, asd, mdatStart + vData.length, full('smhd', 0, 0, new Uint8Array(4))));
    }
    const moov = box('moov', full('mvhd', 0, 0, be(32, 0, 0, 1000, dur, 0x10000), be(16, 0x100, 0), new Uint8Array(8), MATRIX, new Uint8Array(24), be(32, a ? 3 : 2)), traks);
    return new Blob([ftyp, mdat, moov], { type: 'video/mp4' });
  }

  // Real-time recording: frames are drawn as fast as they can be and recorded as they appear, with the sound played
  // along from the mix.
  async function recordVideo(design, pages, { scale = 1, format, onProgress } = {}, sound) {
    const map = await assetMap(design), fontCSS = await R.fontCSSFor(design);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(design.width * scale);
    canvas.height = Math.round(design.height * scale);
    await X.renderFrame(design, pages, 0, canvas, scale, map, fontCSS);
    const stream = canvas.captureStream(30);
    let actx, src;
    if (sound) {
      try {
        actx = new AudioContext();
        src = actx.createBufferSource();
        src.buffer = sound;
        const dest = actx.createMediaStreamDestination();
        src.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch (e) {
        console.warn('audio track skipped', e);
      }
    }
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].filter((t) => !format || t.includes(format));
    const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('Video recording is not supported here');
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    const total = X.totalDuration(pages);
    rec.start(250);
    src?.start();
    const t0 = performance.now();
    for (;;) {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) break;
      await X.renderFrame(design, pages, t, canvas, scale, map, fontCSS);
      onProgress && onProgress(t / total);
      await new Promise((r) => requestAnimationFrame(r));
    }
    rec.stop();
    await done;
    actx && actx.close();
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
  }

  // ---------- PowerPoint (one full-bleed picture per slide) ----------
  X.pptx = async (design, pages, { scale = 2, onProgress } = {}) => {
    const EMU = 9525; // per px at 96 dpi
    // The slide size must stay within ST_SlideSizeCoordinate: scale uniformly, then widen the
    // side that is still too small (extreme aspect ratios) and centre the picture on it.
    const LO = 914400, HI = 51206400, w = design.width * EMU, h = design.height * EMU;
    const k = Math.min(Math.max(1, LO / Math.min(w, h)), HI / Math.max(w, h));
    const pw = Math.round(w * k), ph = Math.round(h * k);
    const cx = U.clamp(pw, LO, HI), cy = U.clamp(ph, LO, HI);
    const files = [];
    const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const rels = (list) => head + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`;
    const N = pages.length;
    files.push({
      name: '[Content_Types].xml',
      data: head + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${pages.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`,
    });
    files.push({ name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) });
    files.push({
      name: 'ppt/presentation.xml',
      data: head + `<p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${pages.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    });
    files.push({ name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...pages.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]) });
    const emptyTree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>';
    files.push({
      name: 'ppt/slideMasters/slideMaster1.xml',
      data: head + `<p:sldMaster ${ns}>${emptyTree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
    });
    files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) });
    files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: head + `<p:sldLayout ${ns} type="blank">${emptyTree}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` });
    files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) });
    const clr = (n, v) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
    const font = '<a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/>';
    const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    files.push({
      name: 'ppt/theme/theme1.xml',
      data: head + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Atelier"><a:themeElements><a:clrScheme name="Atelier"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>${clr('dk2', '1F1F1F')}${clr('lt2', 'EEEEEE')}${clr('accent1', '8C52FF')}${clr('accent2', '00BF63')}${clr('accent3', 'FF914D')}${clr('accent4', '38B6FF')}${clr('accent5', 'FF66C4')}${clr('accent6', 'FFDE59')}${clr('hlink', '0563C1')}${clr('folHlink', '954F72')}</a:clrScheme><a:fontScheme name="Atelier"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme><a:fmtScheme name="Atelier"><a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
    });
    for (let i = 0; i < N; i++) {
      onProgress && onProgress(i / N);
      const png = await X.pageBlob(design, pages[i], { format: 'png', scale });
      files.push({ name: `ppt/media/image${i + 1}.png`, data: png });
      files.push({
        name: `ppt/slides/slide${i + 1}.xml`,
        data: head + `<p:sld ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((cx - pw) / 2)}" y="${Math.round((cy - ph) / 2)}"/><a:ext cx="${pw}" cy="${ph}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
      });
      files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/image${i + 1}.png`]]) });
    }
    const z = await X.zip(files);
    return new Blob([z], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  };

  // ---------- Website (single self-contained HTML file) ----------
  X.website = async (design, pages) => {
    const sections = [];
    // ids are design page numbers, the targets of '#3'-style page links
    for (const p of pages) {
      const n = design.pages.findIndex((q) => q.id === p.id) + 1;
      sections.push(`<section${n ? ` id="${n}"` : ''}>${await R.standaloneSVG(design, p, { links: true })}</section>`);
    }
    const title = U.esc(design.title);
    return new Blob([`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0;background:#fff}section{display:block}section svg{display:block;width:100%;height:auto}</style></head><body>${sections.join('\n')}</body></html>`], { type: 'text/html' });
  };

  // ---------- print ----------
  X.print = async (design, pages) => {
    const imgs = [];
    for (const p of pages) imgs.push((await R.pageCanvas(design, p, 2, { matte: '#fff' })).toDataURL('image/jpeg', 0.95));
    const win = window.open('', '_blank');
    if (!win) return U.toast('Allow pop-ups to print', 'error');
    win.document.write(`<!doctype html><title>${U.esc(design.title)}</title><style>@page{size:${design.width / 96}in ${design.height / 96}in;margin:0}body{margin:0}img{display:block;width:100%;page-break-after:always}</style>${imgs.map((s) => `<img src="${s}">`).join('')}`);
    win.document.close();
    const ready = () => [...win.document.images].every((i) => i.complete);
    const t0 = Date.now();
    const wait = () => (ready() || Date.now() - t0 > 8000 ? (win.focus(), win.print()) : setTimeout(wait, 150));
    setTimeout(wait, 100);
  };
})(window.A);
