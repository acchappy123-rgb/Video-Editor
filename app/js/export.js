'use strict';
// Export formats implemented without third-party libraries:
// PNG, JPG, SVG, PDF (raster pages, optional bleed + crop marks), GIF, MP4/WebM video,
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
    const raster = (p, t, idp) => R.pageCanvas(design, p, scale, { svg: R.pageSVG(design, p, { t, asset: (id) => map[id] || '', fontCSS, idp }), matte: '#ffffff' });
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

  // ---------- video (MediaRecorder; MP4 where supported, else WebM) ----------
  X.video = async (design, pages, { scale = 1, onProgress } = {}) => {
    const map = await assetMap(design), fontCSS = await R.fontCSSFor(design);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(design.width * scale);
    canvas.height = Math.round(design.height * scale);
    await X.renderFrame(design, pages, 0, canvas, scale, map, fontCSS);
    const stream = canvas.captureStream(30);
    let audioEl, actx;
    if (design.audio) {
      try {
        audioEl = new Audio(map[design.audio] || (await A.S.assetDataURL(design.audio)));
        actx = new AudioContext();
        const src = actx.createMediaElementSource(audioEl);
        const dest = actx.createMediaStreamDestination();
        src.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch (e) {
        console.warn('audio track skipped', e);
      }
    }
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('Video recording is not supported here');
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    const total = X.totalDuration(pages);
    rec.start(250);
    audioEl && audioEl.play().catch(() => {});
    const t0 = performance.now();
    for (;;) {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) break;
      await X.renderFrame(design, pages, t, canvas, scale, map, fontCSS);
      onProgress && onProgress(t / total);
      await new Promise((r) => requestAnimationFrame(r));
    }
    rec.stop();
    audioEl && audioEl.pause();
    await done;
    actx && actx.close();
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
  };

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
