'use strict';
// Photo tools that run fully on-device (no cloud service needed).
(function (A) {
  const U = A.U;
  const I = (A.I = {});

  const toCanvas = async (blob, maxSide = 2400) => {
    const url = URL.createObjectURL(blob);
    try {
      const img = await U.loadImage(url);
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  I.toCanvas = toCanvas;

  // Background remover: flood-fills from the borders through pixels similar to the
  // border colours, then feathers the edge. Works best on plain/studio backgrounds.
  I.removeBackground = async (blob, tolerance = 38) => {
    const c = await toCanvas(blob, 1600);
    const g = c.getContext('2d');
    const { width: w, height: h } = c;
    const im = g.getImageData(0, 0, w, h), d = im.data;
    const seeds = [];
    const step = Math.max(1, Math.floor(Math.min(w, h) / 60));
    for (let x = 0; x < w; x += step) seeds.push([x, 0], [x, h - 1]);
    for (let y = 0; y < h; y += step) seeds.push([0, y], [w - 1, y]);
    // reference colours: cluster border samples
    const refs = [];
    for (const [x, y] of seeds) {
      const i = (y * w + x) * 4;
      const c0 = [d[i], d[i + 1], d[i + 2]];
      if (!refs.some((r) => Math.hypot(r[0] - c0[0], r[1] - c0[1], r[2] - c0[2]) < tolerance)) refs.push(c0);
      if (refs.length > 12) break;
    }
    const mask = new Uint8Array(w * h);
    const stack = [];
    const near = (i) => {
      const p = i * 4;
      for (const r of refs) if (Math.abs(d[p] - r[0]) + Math.abs(d[p + 1] - r[1]) + Math.abs(d[p + 2] - r[2]) < tolerance * 1.7) return true;
      return false;
    };
    for (const [x, y] of seeds) {
      const i = y * w + x;
      if (!mask[i] && near(i)) {
        mask[i] = 1;
        stack.push(i);
      }
    }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      const nb = [x > 0 && i - 1, x < w - 1 && i + 1, y > 0 && i - w, y < h - 1 && i + w];
      for (const j of nb)
        if (j !== false && !mask[j] && near(j)) {
          mask[j] = 1;
          stack.push(j);
        }
    }
    // feather: soften alpha near the boundary
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i]) {
          d[i * 4 + 3] = 0;
          continue;
        }
        let bg = 0, tot = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            tot++;
            bg += mask[yy * w + xx];
          }
        if (bg) d[i * 4 + 3] = Math.round(255 * (1 - (bg / tot) * 0.6));
      }
    g.putImageData(im, 0, 0);
    return U.canvasToBlob(c, 'image/png');
  };

  I.upscale = async (blob, factor = 2) => {
    const src = await toCanvas(blob, 4000);
    const c = document.createElement('canvas');
    c.width = Math.min(8000, src.width * factor);
    c.height = Math.min(8000, src.height * factor);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    // light sharpen
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data, w = c.width, o = new Uint8ClampedArray(d);
    for (let y = 1; y < c.height - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) o[i + k] = d[i + k] * 1.6 - (d[i - 4 + k] + d[i + 4 + k] + d[i - w * 4 + k] + d[i + w * 4 + k]) * 0.15;
      }
    g.putImageData(new ImageData(o, w, c.height), 0, 0);
    return U.canvasToBlob(c, 'image/png');
  };

  // Expand: grows the canvas and fills new space with mirrored, blurred edges.
  I.expand = async (blob, amount = 0.25) => {
    const src = await toCanvas(blob, 2000);
    const px = Math.round(src.width * amount), py = Math.round(src.height * amount);
    const c = document.createElement('canvas');
    c.width = src.width + px * 2;
    c.height = src.height + py * 2;
    const g = c.getContext('2d');
    g.filter = 'blur(24px)';
    g.drawImage(src, 0, 0, c.width, c.height);
    g.filter = 'blur(10px)';
    const mirror = (sx, sy, sw, sh, dx, dy, dw, dh, fx, fy) => {
      g.save();
      g.translate(dx + (fx ? dw : 0), dy + (fy ? dh : 0));
      g.scale(fx ? -1 : 1, fy ? -1 : 1);
      g.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
      g.restore();
    };
    mirror(0, 0, Math.min(px, src.width), src.height, 0, py, px, src.height, true, false);
    mirror(src.width - Math.min(px, src.width), 0, Math.min(px, src.width), src.height, px + src.width, py, px, src.height, true, false);
    mirror(0, 0, src.width, Math.min(py, src.height), px, 0, src.width, py, false, true);
    mirror(0, src.height - Math.min(py, src.height), src.width, Math.min(py, src.height), px, py + src.height, src.width, py, false, true);
    g.filter = 'none';
    g.drawImage(src, px, py);
    return U.canvasToBlob(c, 'image/png');
  };

  // Magic eraser: paint over an object; the masked area is filled by diffusing
  // colours from its surroundings.
  I.inpaint = (canvas, mask) => {
    const w = canvas.width, h = canvas.height;
    const g = canvas.getContext('2d');
    const im = g.getImageData(0, 0, w, h), d = im.data;
    const idx = [];
    for (let i = 0; i < w * h; i++) if (mask[i]) idx.push(i);
    if (!idx.length) return;
    // initialise with average border colour
    for (let pass = 0; pass < 220; pass++) {
      for (const i of idx) {
        const x = i % w, y = (i / w) | 0;
        let r = 0, gg = 0, b = 0, n = 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0) continue;
          if (pass === 0 && mask[j]) continue;
          r += d[j * 4]; gg += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
        }
        if (n) {
          d[i * 4] = r / n; d[i * 4 + 1] = gg / n; d[i * 4 + 2] = b / n; d[i * 4 + 3] = 255;
        }
      }
    }
    g.putImageData(im, 0, 0);
  };

  I.eraserModal = async (blob) =>
    new Promise(async (resolve) => {
      const c = await toCanvas(blob, 900);
      const mask = new Uint8Array(c.width * c.height);
      const view = U.h('canvas.eraser-canvas');
      view.width = c.width;
      view.height = c.height;
      const vg = view.getContext('2d');
      const redraw = () => {
        vg.drawImage(c, 0, 0);
      };
      redraw();
      let size = 28, down = false, mode = 'fill';
      const paint = (e) => {
        const r = view.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * c.width, y = ((e.clientY - r.top) / r.height) * c.height;
        vg.fillStyle = 'rgba(255,0,140,0.45)';
        vg.beginPath();
        vg.arc(x, y, size / 2, 0, Math.PI * 2);
        vg.fill();
        const rr = size / 2;
        for (let yy = Math.max(0, Math.floor(y - rr)); yy < Math.min(c.height, y + rr); yy++)
          for (let xx = Math.max(0, Math.floor(x - rr)); xx < Math.min(c.width, x + rr); xx++)
            if ((xx - x) ** 2 + (yy - y) ** 2 <= rr * rr) mask[yy * c.width + xx] = 1;
      };
      view.addEventListener('pointerdown', (e) => { down = true; view.setPointerCapture(e.pointerId); paint(e); });
      view.addEventListener('pointermove', (e) => down && paint(e));
      view.addEventListener('pointerup', () => (down = false));
      const sizeIn = U.h('input', { type: 'range', min: 6, max: 120, value: size, oninput: (e) => (size = +e.target.value) });
      const modeSel = U.h('select.input', { onchange: (e) => (mode = e.target.value) }, U.h('option', { value: 'fill' }, 'Erase & fill from surroundings'), U.h('option', { value: 'clear' }, 'Erase to transparent'));
      let ok = false;
      U.modal({
        title: 'Magic eraser',
        wide: true,
        body: U.h('div.eraser', U.h('p.muted', 'Brush over the object you want to remove.'), U.h('div.row', U.h('label', 'Brush ', sizeIn), modeSel, U.h('button.btn', { onclick: () => { mask.fill(0); redraw(); } }, 'Reset')), U.h('div.eraser-wrap', view)),
        actions: [
          { label: 'Cancel' },
          {
            label: 'Apply',
            primary: true,
            onClick: async () => {
              ok = true;
              if (mode === 'fill') I.inpaint(c, mask);
              else {
                const g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height);
                for (let i = 0; i < mask.length; i++) if (mask[i]) im.data[i * 4 + 3] = 0;
                g.putImageData(im, 0, 0);
              }
              resolve(await U.canvasToBlob(c, 'image/png'));
            },
          },
        ],
        onClose: () => !ok && resolve(null),
      });
    });

  // Generated images for the Apps panel.
  I.gradientBlob = async (a, b, angle = 135, w = 1200, h = 1200, kind = 'linear') => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    let gr;
    if (kind === 'radial') gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 1.4);
    else {
      const r = ((angle - 90) * Math.PI) / 180;
      gr = g.createLinearGradient(w / 2 - (Math.cos(r) * w) / 2, h / 2 - (Math.sin(r) * h) / 2, w / 2 + (Math.cos(r) * w) / 2, h / 2 + (Math.sin(r) * h) / 2);
    }
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    return U.canvasToBlob(c, 'image/png');
  };
  I.patternBlob = async (kind, fg, bg, scale = 40, w = 1200, h = 1200) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.strokeStyle = fg;
    g.lineWidth = scale / 6;
    for (let y = 0; y < h + scale; y += scale)
      for (let x = 0; x < w + scale; x += scale) {
        const odd = Math.round(y / scale) % 2;
        if (kind === 'dots') { g.beginPath(); g.arc(x + (odd ? scale / 2 : 0), y, scale / 6, 0, Math.PI * 2); g.fill(); }
        if (kind === 'grid') { g.strokeRect(x, y, scale, scale); }
        if (kind === 'stripes') { if (Math.round(x / scale) % 2) g.fillRect(x, 0, scale / 2, h); }
        if (kind === 'checks') { if ((Math.round(x / scale) + Math.round(y / scale)) % 2) g.fillRect(x, y, scale, scale); }
        if (kind === 'zigzag') { g.beginPath(); g.moveTo(x, y); g.lineTo(x + scale / 2, y + scale / 2); g.lineTo(x + scale, y); g.stroke(); }
        if (kind === 'waves') { g.beginPath(); g.arc(x + scale / 2, y, scale / 2, 0, Math.PI); g.stroke(); }
        if (kind === 'triangles') { g.beginPath(); g.moveTo(x, y + scale); g.lineTo(x + scale / 2, y); g.lineTo(x + scale, y + scale); g.closePath(); if ((Math.round(x / scale) + Math.round(y / scale)) % 2) g.fill(); }
      }
    return U.canvasToBlob(c, 'image/png');
  };
})(window.A);
