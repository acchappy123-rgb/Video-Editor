'use strict';
// Renders the design model to SVG. The same renderer drives the editor canvas,
// thumbnails, present mode, video frames and every export format.
(function (A) {
  const U = A.U, M = A.M;
  const R = (A.R = {});
  const esc = U.esc;
  const n = (v) => Math.round(v * 100) / 100;

  // ---------- shapes ----------
  const poly = (pts) => 'M' + pts.map((p) => n(p[0]) + ' ' + n(p[1])).join('L') + 'Z';
  const regular = (k, w, h, rot = -Math.PI / 2, inner = 0) => {
    const pts = [];
    const steps = inner ? k * 2 : k;
    for (let i = 0; i < steps; i++) {
      const a = rot + (i * 2 * Math.PI) / steps;
      const rr = inner && i % 2 ? inner : 1;
      pts.push([w / 2 + (Math.cos(a) * w * rr) / 2, h / 2 + (Math.sin(a) * h * rr) / 2]);
    }
    return poly(pts);
  };
  const rrect = (w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!r) return `M0 0H${n(w)}V${n(h)}H0Z`;
    return `M${n(r)} 0H${n(w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}V${n(h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(h)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(h - r)}V${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0Z`;
  };
  R.shapePath = (kind, w, h, r = 0) => {
    switch (kind) {
      case 'rect': return rrect(w, h, r);
      case 'rounded': return rrect(w, h, Math.max(r, Math.min(w, h) * 0.18));
      case 'ellipse': return `M0 ${n(h / 2)}A${n(w / 2)} ${n(h / 2)} 0 1 1 ${n(w)} ${n(h / 2)}A${n(w / 2)} ${n(h / 2)} 0 1 1 0 ${n(h / 2)}Z`;
      case 'triangle': return poly([[w / 2, 0], [w, h], [0, h]]);
      case 'rtriangle': return poly([[0, 0], [w, h], [0, h]]);
      case 'diamond': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
      case 'pentagon': return regular(5, w, h);
      case 'hexagon': return regular(6, w, h, 0);
      case 'octagon': return regular(8, w, h, Math.PI / 8);
      case 'star': return regular(5, w, h, -Math.PI / 2, 0.45);
      case 'star8': return regular(12, w, h, -Math.PI / 2, 0.72);
      case 'arrowR': return poly([[0, h * 0.3], [w * 0.6, h * 0.3], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.7], [0, h * 0.7]]);
      case 'arrowL': return poly([[w, h * 0.3], [w * 0.4, h * 0.3], [w * 0.4, 0], [0, h / 2], [w * 0.4, h], [w * 0.4, h * 0.7], [w, h * 0.7]]);
      case 'chevron': return poly([[0, 0], [w * 0.7, 0], [w, h / 2], [w * 0.7, h], [0, h], [w * 0.3, h / 2]]);
      case 'plus': return poly([[w * 0.35, 0], [w * 0.65, 0], [w * 0.65, h * 0.35], [w, h * 0.35], [w, h * 0.65], [w * 0.65, h * 0.65], [w * 0.65, h], [w * 0.35, h], [w * 0.35, h * 0.65], [0, h * 0.65], [0, h * 0.35], [w * 0.35, h * 0.35]]);
      case 'parallelogram': return poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]);
      case 'trapezoid': return poly([[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]]);
      case 'speech': {
        const bh = h * 0.78, rr = Math.min(w, bh) * 0.15;
        return `M${n(rr)} 0H${n(w - rr)}Q${n(w)} 0 ${n(w)} ${n(rr)}V${n(bh - rr)}Q${n(w)} ${n(bh)} ${n(w - rr)} ${n(bh)}H${n(w * 0.42)}L${n(w * 0.2)} ${n(h)}L${n(w * 0.26)} ${n(bh)}H${n(rr)}Q0 ${n(bh)} 0 ${n(bh - rr)}V${n(rr)}Q0 0 ${n(rr)} 0Z`;
      }
      case 'cloud':
        return `M${n(w * 0.25)} ${n(h * 0.85)}C${n(w * 0.05)} ${n(h * 0.85)} 0 ${n(h * 0.6)} ${n(w * 0.12)} ${n(h * 0.5)}C${n(w * 0.05)} ${n(h * 0.25)} ${n(w * 0.3)} ${n(h * 0.12)} ${n(w * 0.42)} ${n(h * 0.25)}C${n(w * 0.5)} ${n(h * 0.02)} ${n(w * 0.8)} ${n(h * 0.05)} ${n(w * 0.8)} ${n(h * 0.32)}C${n(w * 1.02)} ${n(h * 0.35)} ${n(w * 1.02)} ${n(h * 0.85)} ${n(w * 0.78)} ${n(h * 0.85)}Z`;
      case 'ring': {
        const t = Math.min(w, h) * 0.18;
        return R.shapePath('ellipse', w, h) + `M${n(t)} ${n(h / 2)}A${n(w / 2 - t)} ${n(h / 2 - t)} 0 1 0 ${n(w - t)} ${n(h / 2)}A${n(w / 2 - t)} ${n(h / 2 - t)} 0 1 0 ${n(t)} ${n(h / 2)}Z`;
      }
      case 'moon': return `M${n(w * 0.6)} 0A${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(w)} ${n(h * 0.75)}A${n(w * 0.42)} ${n(h * 0.42)} 0 1 1 ${n(w * 0.6)} 0Z`;
      case 'blob':
        return `M${n(w * 0.5)} 0C${n(w * 0.85)} 0 ${n(w)} ${n(h * 0.25)} ${n(w * 0.95)} ${n(h * 0.55)}C${n(w * 0.9)} ${n(h * 0.85)} ${n(w * 0.65)} ${n(h)} ${n(w * 0.4)} ${n(h * 0.95)}C${n(w * 0.1)} ${n(h * 0.9)} 0 ${n(h * 0.65)} ${n(w * 0.05)} ${n(h * 0.4)}C${n(w * 0.1)} ${n(h * 0.12)} ${n(w * 0.25)} 0 ${n(w * 0.5)} 0Z`;
      case 'arch': return `M0 ${n(h)}V${n(w / 2)}A${n(w / 2)} ${n(w / 2)} 0 0 1 ${n(w)} ${n(w / 2)}V${n(h)}Z`;
      case 'heart':
        return `M${n(w / 2)} ${n(h * 0.95)}C${n(w * 0.1)} ${n(h * 0.65)} 0 ${n(h * 0.42)} 0 ${n(h * 0.28)}C0 ${n(h * 0.1)} ${n(w * 0.15)} 0 ${n(w * 0.28)} 0C${n(w * 0.4)} 0 ${n(w * 0.48)} ${n(h * 0.08)} ${n(w / 2)} ${n(h * 0.18)}C${n(w * 0.52)} ${n(h * 0.08)} ${n(w * 0.6)} 0 ${n(w * 0.72)} 0C${n(w * 0.85)} 0 ${n(w)} ${n(h * 0.1)} ${n(w)} ${n(h * 0.28)}C${n(w)} ${n(h * 0.42)} ${n(w * 0.9)} ${n(h * 0.65)} ${n(w / 2)} ${n(h * 0.95)}Z`;
      default: return rrect(w, h, r);
    }
  };

  // ---------- paints (solid or gradient "grad:#a:#b:angle:linear|radial") ----------
  R.paint = (fill, ctx, key) => {
    if (!fill || fill === 'transparent' || fill === 'none') return 'none';
    if (typeof fill === 'string' && fill.startsWith('grad:')) {
      const [, a, b, ang = '90', kind = 'linear'] = fill.split(':');
      const id = ctx.idp + 'g' + key;
      if (kind === 'radial') ctx.defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></radialGradient>`);
      else {
        const r = ((+ang - 90) * Math.PI) / 180;
        const x = Math.cos(r) / 2, y = Math.sin(r) / 2;
        ctx.defs.push(`<linearGradient id="${id}" x1="${n(0.5 - x)}" y1="${n(0.5 - y)}" x2="${n(0.5 + x)}" y2="${n(0.5 + y)}"><stop offset="0" stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></linearGradient>`);
      }
      return `url(#${id})`;
    }
    return esc(fill);
  };
  R.cssPaint = (fill) => {
    if (typeof fill === 'string' && fill.startsWith('grad:')) {
      const [, a, b, ang = '90', kind] = fill.split(':');
      return kind === 'radial' ? `radial-gradient(${a},${b})` : `linear-gradient(${ang}deg,${a},${b})`;
    }
    return fill || 'transparent';
  };

  // ---------- text layout ----------
  R.fontCSS = (el, size = el.size) => `${el.italic ? 'italic ' : ''}${el.bold ? '700' : '400'} ${size}px ${M.fontStack(el.font)}`;
  R.layoutText = (el, maxW) => {
    const font = R.fontCSS(el);
    const ls = ((el.spacing || 0) / 1000) * el.size;
    let txt = String(el.text ?? '');
    if (el.upper) txt = txt.toUpperCase();
    const lines = [];
    let num = 0;
    for (const p of txt.split('\n')) {
      let prefix = '';
      if (el.list === 'bullet' && p.trim()) prefix = '•  ';
      if (el.list === 'number' && p.trim()) prefix = ++num + '.  ';
      const pw = prefix ? U.measure(prefix, font, ls) : 0;
      const avail = Math.max(el.size * 0.6, maxW - pw);
      let first = true, cur = '';
      const push = (s) => {
        lines.push({ t: s, prefix: first ? prefix : '', indent: pw });
        first = false;
      };
      for (const w of p.split(/(\s+)/)) {
        if (!w) continue;
        const test = cur + w;
        if (U.measure(test.trimEnd(), font, ls) <= avail || !cur.trim()) {
          if (!cur.trim() && w.trim() && U.measure(w, font, ls) > avail) {
            let chunk = cur;
            for (const ch of w) {
              if (chunk && U.measure(chunk + ch, font, ls) > avail) {
                push(chunk);
                chunk = ch;
              } else chunk += ch;
            }
            cur = chunk;
            continue;
          }
          cur = test;
        } else {
          push(cur.trimEnd());
          cur = w.trimStart();
        }
      }
      push(cur.trimEnd());
    }
    for (const l of lines) l.w = U.measure(l.prefix + l.t, font, ls) + (l.prefix ? 0 : l.indent);
    const lineH = el.size * (el.lh || 1.3);
    return { lines, lineH, height: lines.length * lineH, font, ls };
  };
  R.textHeight = (el) => R.layoutText(el, el.w).height;

  const textAttrs = (el) =>
    `font-family="${esc(M.fontStack(el.font))}" font-size="${n(el.size)}" font-weight="${el.bold ? 700 : 400}" font-style="${el.italic ? 'italic' : 'normal'}"` +
    (el.spacing ? ` letter-spacing="${n(((el.spacing || 0) / 1000) * el.size)}"` : '') +
    (el.underline || el.strike ? ` text-decoration="${[el.underline && 'underline', el.strike && 'line-through'].filter(Boolean).join(' ')}"` : '') +
    ` style="white-space:pre"`;

  // Returns an SVG fragment for the text of el inside box {x,y,w,h,valign}.
  R.textSVG = (el, ctx, box, chars = null) => {
    if (el.curve) return curvedText(el, ctx, chars);
    const L = R.layoutText(el, box.w);
    let lines = L.lines;
    if (chars != null) {
      let left = chars;
      lines = lines.map((l) => {
        const full = l.prefix + l.t;
        const take = Math.max(0, Math.min(full.length, left));
        left -= full.length;
        return { ...l, prefix: '', t: full.slice(0, take), indent: l.prefix ? 0 : l.indent };
      });
    }
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
    const ax = anchor === 'middle' ? box.x + box.w / 2 : anchor === 'end' ? box.x + box.w : box.x;
    const y0 = box.y + (box.valign ? (box.h - L.height) / 2 : 0);
    const pos = (l, i) => ({ x: anchor === 'start' && !l.prefix ? ax + l.indent : ax, y: y0 + i * L.lineH + (L.lineH - el.size) / 2 + el.size * 0.82 });
    const body = lines.map((l, i) => {
      const p = pos(l, i);
      return `<tspan x="${n(p.x)}" y="${n(p.y)}">${esc(l.prefix + l.t) || ' '}</tspan>`;
    }).join('');
    const common = textAttrs(el) + ` text-anchor="${anchor}"`;
    const color = el.color || '#000';
    const eff = el.effect || {};
    const T = (fill, extra = '') => `<text ${common} fill="${R.paint(fill, ctx, el.id + 't')}" ${extra}>${body}</text>`;
    const s = el.size;
    const off = ((eff.offset ?? 50) / 100) * s * 0.18;
    const dirR = (((eff.direction ?? 45) - 90) * Math.PI) / 180;
    const ox = n(Math.cos(dirR + Math.PI / 2) * off), oy = n(Math.sin(dirR + Math.PI / 2) * off);
    const fid = ctx.idp + 'f' + el.id;
    switch (eff.type) {
      case 'shadow':
        ctx.defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${ox}" dy="${oy}" stdDeviation="${n(((eff.blur ?? 20) / 100) * s * 0.25)}" flood-color="${esc(eff.color || '#000000')}" flood-opacity="${n(1 - (eff.transparency ?? 60) / 100)}"/></filter>`);
        return T(color, `filter="url(#${fid})"`);
      case 'lift':
        ctx.defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${n(s * 0.06)}" stdDeviation="${n(s * 0.12)}" flood-color="#000" flood-opacity="${n(((eff.intensity ?? 50) / 100) * 0.7)}"/></filter>`);
        return T(color, `filter="url(#${fid})"`);
      case 'hollow':
        return T('none', `stroke="${esc(color)}" stroke-width="${n(((eff.thickness ?? 50) / 100) * s * 0.08 + 0.5)}" stroke-linejoin="round"`);
      case 'splice':
        return T(eff.color || '#ffbd59', `transform="translate(${ox} ${oy})"`) + T('none', `stroke="${esc(color)}" stroke-width="${n(((eff.thickness ?? 50) / 100) * s * 0.06 + 0.5)}" stroke-linejoin="round"`);
      case 'echo': {
        const c = eff.color || color;
        return T(c, `opacity="0.25" transform="translate(${n(ox * 2)} ${n(oy * 2)})"`) + T(c, `opacity="0.5" transform="translate(${ox} ${oy})"`) + T(color);
      }
      case 'glitch': {
        const g = ((eff.offset ?? 40) / 100) * s * 0.12;
        const pal = eff.color === 'blue' ? ['#00e1ff', '#ff2e63'] : ['#00ffff', '#ff00ff'];
        return T(pal[0], `transform="translate(${n(-g)} 0)"`) + T(pal[1], `transform="translate(${n(g)} 0)"`) + T(color);
      }
      case 'neon': {
        const k = (eff.intensity ?? 50) / 100;
        ctx.defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="${n(s * 0.04 + s * 0.12 * k)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
        const [r, g, b] = U.hexToRgb(U.isColor(color) ? color : '#ff66c4');
        const light = U.rgbToHex(r + (255 - r) * 0.55, g + (255 - g) * 0.55, b + (255 - b) * 0.55);
        return `<g filter="url(#${fid})">${T(color)}</g>` + T(light);
      }
      case 'background': {
        const pad = s * 0.25 * ((eff.spread ?? 50) / 50);
        const rad = ((eff.roundness ?? 30) / 100) * L.lineH * 0.5;
        const rects = lines.map((l, i) => {
          if (!(l.prefix + l.t).trim()) return '';
          const p = pos(l, i);
          const lw = U.measure(l.prefix + l.t, L.font, L.ls);
          const x = anchor === 'middle' ? p.x - lw / 2 : anchor === 'end' ? p.x - lw : p.x;
          return `<rect x="${n(x - pad)}" y="${n(y0 + i * L.lineH)}" width="${n(lw + pad * 2)}" height="${n(L.lineH + 0.5)}" rx="${n(rad)}" fill="${esc(eff.color || '#ffde59')}" opacity="${n(1 - (eff.transparency ?? 0) / 100)}"/>`;
        }).join('');
        return rects + T(color);
      }
      default:
        return T(color);
    }
  };

  // Curved text: geometry also used by the editor to size the box.
  R.curveGeom = (el) => {
    const txt = (el.upper ? String(el.text).toUpperCase() : String(el.text)).replace(/\n/g, ' ');
    const L = Math.max(10, U.measure(txt, R.fontCSS(el), ((el.spacing || 0) / 1000) * el.size));
    const th = Math.max(0.05, (Math.abs(el.curve) / 100) * 2 * Math.PI * 0.98);
    const r = L / th, s = el.size;
    const h = r + 0.85 * s - r * Math.cos(th / 2) + 0.3 * s;
    const w = (th <= Math.PI ? 2 * r * Math.sin(th / 2) : 2 * r) + s;
    return { txt, r, th, w, h };
  };
  function curvedText(el, ctx, chars) {
    const g = R.curveGeom(el);
    const s = el.size, cx = el.w / 2, r = g.r;
    const pid = ctx.idp + 'cp' + el.id;
    let d;
    if (el.curve > 0) {
      const cy = r + 0.85 * s;
      d = `M${n(cx)} ${n(cy + r)}A${n(r)} ${n(r)} 0 1 1 ${n(cx)} ${n(cy - r)}A${n(r)} ${n(r)} 0 1 1 ${n(cx)} ${n(cy + r)}`;
    } else {
      const cy = 0.85 * s - r * Math.cos(g.th / 2);
      d = `M${n(cx)} ${n(cy - r)}A${n(r)} ${n(r)} 0 1 0 ${n(cx)} ${n(cy + r)}A${n(r)} ${n(r)} 0 1 0 ${n(cx)} ${n(cy - r)}`;
    }
    ctx.defs.push(`<path id="${pid}" d="${d}"/>`);
    const t = chars != null ? g.txt.slice(0, chars) : g.txt;
    return `<text ${textAttrs(el)} text-anchor="middle" fill="${R.paint(el.color, ctx, el.id + 't')}"><textPath href="#${pid}" xlink:href="#${pid}" startOffset="50%">${esc(t)}</textPath></text>`;
  }

  // ---------- image adjustments as an SVG filter ----------
  R.hasAdj = (adj = {}, duo) => !!duo || Object.keys(adj).some((k) => adj[k]);
  R.imageFilter = (adj = {}, fid, duo, blurScale = 1) => {
    const a = (k) => (adj[k] || 0) / 100;
    if (!R.hasAdj(adj, duo)) return '';
    let f = `<filter id="${fid}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">`;
    if (adj.blur) f += `<feGaussianBlur stdDeviation="${n(adj.blur * blurScale)}" edgeMode="duplicate"/>`;
    const slope = 1 + a('contrast') + a('clarity') * 0.2;
    const icpt = -0.5 * slope + 0.5 + a('brightness') * 0.35;
    const wm = a('warmth') * 0.12, tn = a('tint') * 0.1;
    f += `<feComponentTransfer><feFuncR type="linear" slope="${n(slope * (1 + wm))}" intercept="${n(icpt + wm * 0.1)}"/><feFuncG type="linear" slope="${n(slope * (1 - tn))}" intercept="${n(icpt)}"/><feFuncB type="linear" slope="${n(slope * (1 - wm))}" intercept="${n(icpt - wm * 0.1)}"/></feComponentTransfer>`;
    if (adj.shadows || adj.highlights || adj.whites || adj.blacks) {
      const exp = n(Math.max(0.3, 1 - a('shadows') * 0.45 + a('highlights') * 0.25));
      const amp = n(1 + a('whites') * 0.25 + a('highlights') * 0.1);
      const off = n(a('blacks') * 0.12);
      const fn = (c) => `<feFunc${c} type="gamma" amplitude="${amp}" exponent="${exp}" offset="${off}"/>`;
      f += `<feComponentTransfer>${fn('R')}${fn('G')}${fn('B')}</feComponentTransfer>`;
    }
    const sat = Math.max(0, 1 + a('saturation') + a('vibrance') * 0.5);
    if (sat !== 1 || duo) f += `<feColorMatrix type="saturate" values="${duo ? 0 : n(sat)}"/>`;
    if (adj.sepia) {
      const s = a('sepia'), i = 1 - s;
      const m = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
      const v = [m[0] * s + i, m[1] * s, m[2] * s, 0, 0, m[3] * s, m[4] * s + i, m[5] * s, 0, 0, m[6] * s, m[7] * s, m[8] * s + i, 0, 0, 0, 0, 0, 1, 0];
      f += `<feColorMatrix type="matrix" values="${v.map(n).join(' ')}"/>`;
    }
    if (duo) {
      const c1 = U.hexToRgb(duo[0]).map((v) => n(v / 255)), c2 = U.hexToRgb(duo[1]).map((v) => n(v / 255));
      f += `<feComponentTransfer><feFuncR type="table" tableValues="${c1[0]} ${c2[0]}"/><feFuncG type="table" tableValues="${c1[1]} ${c2[1]}"/><feFuncB type="table" tableValues="${c1[2]} ${c2[2]}"/></feComponentTransfer>`;
    }
    return f + '</filter>';
  };
  R.adjCSS = (adj = {}) => {
    const a = (k) => (adj[k] || 0) / 100;
    return `brightness(${1 + a('brightness') * 0.6}) contrast(${1 + a('contrast')}) saturate(${Math.max(0, 1 + a('saturation'))}) sepia(${a('sepia')}) blur(${(adj.blur || 0) * 0.3}px)`;
  };

  // ---------- tables & simple formulas ----------
  function arith(src) {
    let i = 0;
    const s = src.replace(/\s+/g, '');
    const num = () => {
      if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') throw 0; i++; return v; }
      if (s[i] === '-') { i++; return -num(); }
      const m = s.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/i);
      if (!m) throw 0;
      i += m[0].length;
      return +m[0];
    };
    const term = () => { let v = num(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const b = num(); v = o === '*' ? v * b : v / b; } return v; };
    const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const b = term(); v = o === '+' ? v + b : v - b; } return v; };
    const v = expr();
    if (i !== s.length) throw 0;
    return v;
  }
  R.colName = (c) => String.fromCharCode(65 + c);
  R.evalCell = (cells, r, c, depth = 0) => {
    const raw = cells[r]?.[c];
    if (raw == null) return '';
    const s = String(raw);
    if (!s.startsWith('=')) return s;
    if (depth > 30) return '#REF';
    try {
      const ref = (x) => {
        const m = x.match(/^([A-Z])(\d+)$/);
        const v = parseFloat(R.evalCell(cells, +m[2] - 1, m[1].charCodeAt(0) - 65, depth + 1));
        return isNaN(v) ? 0 : v;
      };
      const range = (a, b) => {
        const [c1, r1] = [a.charCodeAt(0) - 65, +a.slice(1) - 1], [c2, r2] = [b.charCodeAt(0) - 65, +b.slice(1) - 1];
        const out = [];
        for (let rr = Math.min(r1, r2); rr <= Math.max(r1, r2); rr++)
          for (let cc = Math.min(c1, c2); cc <= Math.max(c1, c2); cc++) {
            const v = parseFloat(R.evalCell(cells, rr, cc, depth + 1));
            if (!isNaN(v)) out.push(v);
          }
        return out;
      };
      let ex = s.slice(1).toUpperCase();
      ex = ex.replace(/(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\(([A-Z]\d+):([A-Z]\d+)\)/g, (_, fn, a, b) => {
        const xs = range(a, b);
        const v = fn === 'SUM' ? xs.reduce((p, q) => p + q, 0) : fn === 'COUNT' ? xs.length : !xs.length ? 0 : fn === 'MIN' ? Math.min(...xs) : fn === 'MAX' ? Math.max(...xs) : xs.reduce((p, q) => p + q, 0) / xs.length;
        return '(' + v + ')';
      });
      ex = ex.replace(/[A-Z]\d+/g, (m) => '(' + ref(m) + ')');
      const v = arith(ex);
      return Number.isFinite(v) ? String(U.round(v, 4)) : '#DIV/0';
    } catch (e) {
      return '#ERR';
    }
  };

  // ---------- connectors ----------
  const boxEdge = (b, toward) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const dx = toward.x - cx, dy = toward.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const sx = b.w / 2 / Math.abs(dx || 1e-9), sy = b.h / 2 / Math.abs(dy || 1e-9);
    const k = Math.min(sx, sy);
    return { x: cx + dx * k, y: cy + dy * k };
  };
  R.lineEnds = (el, page) => {
    let p1 = el.p1, p2 = el.p2;
    const find = (id) => page && id && page.elements.find((e) => e.id === id);
    const b1 = find(el.c1), b2 = find(el.c2);
    const ctr = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    if (b1) p1 = boxEdge(b1, b2 ? ctr(b2) : p2);
    if (b2) p2 = boxEdge(b2, b1 ? ctr(b1) : p1);
    return { p1, p2 };
  };

  // ---------- animation ----------
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const backOut = (p) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
  const bounce = (p) => {
    const a = 7.5625, b = 2.75;
    if (p < 1 / b) return a * p * p;
    if (p < 2 / b) return a * (p -= 1.5 / b) * p + 0.75;
    if (p < 2.5 / b) return a * (p -= 2.25 / b) * p + 0.9375;
    return a * (p -= 2.625 / b) * p + 0.984375;
  };
  const DIRS = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };
  R.anim = (el, t, dur, idx, page) => {
    const st = { dx: 0, dy: 0, s: 1, sx: 1, r: 0, o: 1, chars: null };
    if (t == null) return st;
    const a = el.anim || {};
    const kind = a.in && a.in !== 'none' ? a.in : page && page.anim && page.anim !== 'none' ? page.anim : null;
    const sp = a.speed || 1;
    const D = 0.7 / sp;
    const delay = a.delay ?? idx * 0.12;
    const [vx, vy] = DIRS[a.dir || 'up'];
    if (kind) {
      const len = String(el.text || '').length;
      const DD = kind === 'typewriter' ? Math.max(0.4, len * 0.05) / sp : kind === 'drift' ? D * 2 : D;
      const p = U.clamp((t - delay) / DD, 0, 1), e = easeOut(p);
      switch (kind) {
        case 'fade': st.o = e; break;
        case 'rise': st.o = e; st.dx = vx * (1 - e) * 60; st.dy = vy * (1 - e) * 60; break;
        case 'pan': st.o = e; if (vx) st.dx = vx * (1 - e) * 160; else st.dx = -(1 - e) * 160; break;
        case 'drift': st.o = e; st.dx = vx * (1 - e) * 30; st.dy = vy * (1 - e) * 30; break;
        case 'pop': st.o = Math.min(1, p * 4); st.s = Math.max(0.01, backOut(p)); break;
        case 'zoom': st.o = e; st.s = 0.3 + 0.7 * e; break;
        case 'tumble': st.o = e; st.r = (1 - e) * -120; st.s = 0.4 + 0.6 * e; break;
        case 'bounce': st.o = Math.min(1, p * 3); st.dy = -(1 - bounce(p)) * 120; break;
        case 'wipe': st.sx = Math.max(0.001, e); break;
        case 'typewriter': st.chars = Math.floor(p * len); if (el.type !== 'text' && !el.text) st.o = e; break;
      }
    }
    const em = a.emph;
    if (em && em !== 'none') {
      const tt = Math.max(0, t - delay) * sp;
      if (em === 'pulse') st.s *= 1 + 0.06 * Math.sin(tt * Math.PI * 2);
      if (em === 'wiggle') st.r += 5 * Math.sin(tt * Math.PI * 4);
      if (em === 'flicker') st.o *= Math.sin(tt * 18) > -0.3 ? 1 : 0.35;
      if (em === 'float') st.dy += 10 * Math.sin(tt * Math.PI);
      if (em === 'spin') st.r += (tt * 90) % 360;
    }
    if (a.out && a.out !== 'none' && dur) {
      const p = U.clamp((t - (dur - D)) / D, 0, 1), e = p * p;
      if (a.out === 'fade') st.o *= 1 - e;
      if (a.out === 'sink') { st.o *= 1 - e; st.dy += e * 60; }
      if (a.out === 'shrink') { st.o *= 1 - e; st.s *= Math.max(0.01, 1 - e); }
      if (a.out === 'pan') { st.o *= 1 - e; st.dx += e * 200; }
    }
    if (a.motion && a.motion.length > 1) {
      const pts = a.motion, last = pts[pts.length - 1].t;
      const tt = U.clamp((t - (a.delay || 0)) * sp, 0, last);
      let i = 1;
      while (i < pts.length - 1 && pts[i].t < tt) i++;
      const p0 = pts[i - 1], p1 = pts[i];
      const k = p1.t === p0.t ? 1 : (tt - p0.t) / (p1.t - p0.t);
      st.dx += p0.dx + (p1.dx - p0.dx) * k;
      st.dy += p0.dy + (p1.dy - p0.dy) * k;
    }
    return st;
  };

  // ---------- elements ----------
  const dashArray = (dash, w) => (dash === 'dashed' ? `${n(w * 3)} ${n(w * 2)}` : dash === 'dotted' ? `0.01 ${n(w * 2)}` : '');
  function marker(ctx, id, kind, color) {
    const shape =
      kind === 'arrow' ? `<path d="M1 1L9 5L1 9" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` :
      kind === 'triangle' ? `<path d="M0 0L10 5L0 10Z" fill="${color}"/>` :
      kind === 'circle' ? `<circle cx="5" cy="5" r="4" fill="${color}"/>` :
      kind === 'square' ? `<rect x="1" y="1" width="8" height="8" fill="${color}"/>` :
      kind === 'bar' ? `<rect x="4" y="0" width="2" height="10" fill="${color}"/>` : '';
    ctx.defs.push(`<marker id="${id}" viewBox="0 0 10 10" refX="${kind === 'triangle' ? 7 : kind === 'arrow' ? 8 : 5}" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse" markerUnits="strokeWidth">${shape}</marker>`);
    return `url(#${id})`;
  }

  function lineSVG(el, ctx, st) {
    const { p1, p2 } = R.lineEnds(el, ctx.page);
    const d = el.elbow ? `M${n(p1.x)} ${n(p1.y)}H${n((p1.x + p2.x) / 2)}V${n(p2.y)}H${n(p2.x)}` : el.curved ? `M${n(p1.x)} ${n(p1.y)}Q${n((p1.x + p2.x) / 2)} ${n(Math.min(p1.y, p2.y) - Math.abs(p2.x - p1.x) * 0.3)} ${n(p2.x)} ${n(p2.y)}` : `M${n(p1.x)} ${n(p1.y)}L${n(p2.x)} ${n(p2.y)}`;
    const color = esc(el.stroke || '#000');
    const ms = el.start && el.start !== 'none' ? ` marker-start="${marker(ctx, ctx.idp + 'ms' + el.id, el.start, color)}"` : '';
    const me = el.end && el.end !== 'none' ? ` marker-end="${marker(ctx, ctx.idp + 'me' + el.id, el.end, color)}"` : '';
    const da = dashArray(el.dash, el.strokeWidth);
    const tr = st.dx || st.dy ? ` transform="translate(${n(st.dx)} ${n(st.dy)})"` : '';
    return `<g data-id="${el.id}" opacity="${n((el.opacity ?? 1) * st.o)}"${tr}><path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(16, el.strokeWidth + 12)}"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${n(el.strokeWidth)}" stroke-linecap="${el.dash === 'dotted' ? 'round' : 'butt'}" stroke-linejoin="round"${da ? ` stroke-dasharray="${da}"` : ''}${ms}${me}/></g>`;
  }

  function imageInner(el, ctx) {
    const url = ctx.asset(el.asset);
    const c = el.crop || { x: 0, y: 0, w: 1, h: 1 };
    const nw = el.nw || 1000, nh = el.nh || 1000;
    const fid = ctx.idp + 'if' + el.id;
    const f = R.imageFilter(el.adj, fid, el.duo, nw / 1000);
    if (f) ctx.defs.push(f);
    let inner = `<svg width="${n(el.w)}" height="${n(el.h)}" viewBox="${n(c.x * nw)} ${n(c.y * nh)} ${n(c.w * nw)} ${n(c.h * nh)}" preserveAspectRatio="none"><image href="${esc(url)}" xlink:href="${esc(url)}" width="${nw}" height="${nh}" preserveAspectRatio="none"${f ? ` filter="url(#${fid})"` : ''}/></svg>`;
    if (!url) inner = `<rect width="${n(el.w)}" height="${n(el.h)}" fill="#e5e5ea"/>`;
    inner += vignette(el, ctx, el.w, el.h);
    if (el.radius) {
      const cid = ctx.idp + 'ic' + el.id;
      ctx.defs.push(`<clipPath id="${cid}"><path d="${rrect(el.w, el.h, el.radius)}"/></clipPath>`);
      inner = `<g clip-path="url(#${cid})">${inner}</g>`;
    }
    return inner;
  }
  function vignette(el, ctx, w, h) {
    const v = el.adj && el.adj.vignette;
    if (!v) return '';
    const gid = ctx.idp + 'vg' + el.id;
    ctx.defs.push(`<radialGradient id="${gid}" r="0.75"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${n(v / 100)}"/></radialGradient>`);
    return `<rect width="${n(w)}" height="${n(h)}" fill="url(#${gid})"/>`;
  }

  function shapeInner(el, ctx, st) {
    const d = R.shapePath(el.shape, el.w, el.h, el.radius || 0);
    let out = '';
    if (el.asset) {
      // Frame: image clipped to the shape.
      const cid = ctx.idp + 'fc' + el.id, fid = ctx.idp + 'ff' + el.id;
      ctx.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`);
      const f = R.imageFilter(el.adj, fid, el.duo);
      if (f) ctx.defs.push(f);
      const url = ctx.asset(el.asset);
      out += `<g clip-path="url(#${cid})"><rect width="${n(el.w)}" height="${n(el.h)}" fill="#ddd"/>${url ? `<image href="${esc(url)}" xlink:href="${esc(url)}" width="${n(el.w)}" height="${n(el.h)}" preserveAspectRatio="xMidYMid slice"${f ? ` filter="url(#${fid})"` : ''}/>` : ''}${vignette(el, ctx, el.w, el.h)}</g>`;
      if (el.strokeWidth) out += `<path d="${d}" fill="none" stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth)}"/>`;
    } else {
      const da = dashArray(el.dash, el.strokeWidth);
      out += `<path d="${d}" fill="${R.paint(el.fill, ctx, el.id)}" fill-rule="evenodd"${el.strokeWidth ? ` stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth)}"${da ? ` stroke-dasharray="${da}" stroke-linecap="round"` : ''}` : ''}/>`;
    }
    if (el.text && el.text.trim()) {
      const px = Math.min(el.w * 0.1, 24), py = Math.min(el.h * 0.1, 24);
      out += R.textSVG(el, ctx, { x: px, y: py, w: el.w - px * 2, h: el.h - py * 2, valign: true }, st.chars);
    }
    if (el.sticky && el.votes) {
      out += `<g transform="translate(${n(el.w - 56)} ${n(el.h - 40)})"><rect width="48" height="30" rx="15" fill="#ffffff" opacity="0.85"/><text x="24" y="21" font-size="16" font-family="${esc(M.fontStack('Inter'))}" text-anchor="middle" fill="#333">👍 ${el.votes}</text></g>`;
    }
    return out;
  }

  function chartInner(el, ctx) {
    const { w, h } = el;
    const data = el.data || [];
    const cols = el.colors || ['#8c52ff'];
    const fs = Math.max(10, Math.min(w, h) / 18);
    const ff = esc(M.fontStack(el.font || 'Inter'));
    const tc = esc(el.textColor || '#333');
    const max = Math.max(1, ...data.map((d) => +d.value || 0));
    let out = '';
    if (el.chart === 'pie' || el.chart === 'donut') {
      const total = data.reduce((s, d) => s + Math.max(0, +d.value || 0), 0) || 1;
      const legendW = w > h * 1.2 ? w * 0.35 : 0;
      const r = Math.min(w - legendW, h) / 2 - 4, cx = (w - legendW) / 2, cy = h / 2;
      let a0 = -Math.PI / 2;
      data.forEach((d, i) => {
        const frac = Math.max(0, +d.value || 0) / total;
        const a1 = a0 + frac * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        out += frac >= 0.9999 ? `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${esc(cols[i % cols.length])}"/>` : `<path d="M${n(cx)} ${n(cy)}L${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${large} 1 ${n(x1)} ${n(y1)}Z" fill="${esc(cols[i % cols.length])}" stroke="#fff" stroke-width="2"/>`;
        a0 = a1;
      });
      if (el.chart === 'donut') out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.55)}" fill="${esc(el.holeColor || '#ffffff')}"/>`;
      if (legendW)
        data.forEach((d, i) => {
          const y = h / 2 - (data.length * fs * 1.6) / 2 + i * fs * 1.6;
          out += `<rect x="${n(w - legendW + 10)}" y="${n(y)}" width="${n(fs)}" height="${n(fs)}" rx="3" fill="${esc(cols[i % cols.length])}"/><text x="${n(w - legendW + 16 + fs)}" y="${n(y + fs * 0.85)}" font-size="${n(fs)}" font-family="${ff}" fill="${tc}">${esc(d.label)} (${esc(d.value)})</text>`;
        });
      return out;
    }
    const pl = fs * 2.6, pb = fs * 2, pt = fs, pr = fs;
    const cw = w - pl - pr, ch = h - pt - pb;
    for (let i = 0; i <= 4; i++) {
      const y = pt + ch - (ch * i) / 4;
      out += `<line x1="${n(pl)}" x2="${n(w - pr)}" y1="${n(y)}" y2="${n(y)}" stroke="${tc}" stroke-opacity="0.15"/><text x="${n(pl - 6)}" y="${n(y + fs * 0.35)}" font-size="${n(fs * 0.85)}" text-anchor="end" font-family="${ff}" fill="${tc}">${U.round((max * i) / 4, 1)}</text>`;
    }
    const step = cw / Math.max(1, data.length);
    if (el.chart === 'line' || el.chart === 'area') {
      const pts = data.map((d, i) => [pl + step * (i + 0.5), pt + ch - ((+d.value || 0) / max) * ch]);
      if (el.chart === 'area' && pts.length) out += `<path d="M${n(pts[0][0])} ${n(pt + ch)}${pts.map((p) => `L${n(p[0])} ${n(p[1])}`).join('')}L${n(pts[pts.length - 1][0])} ${n(pt + ch)}Z" fill="${esc(cols[0])}" opacity="0.25"/>`;
      out += `<polyline points="${pts.map((p) => n(p[0]) + ',' + n(p[1])).join(' ')}" fill="none" stroke="${esc(cols[0])}" stroke-width="${n(fs * 0.3)}" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((p) => (out += `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(fs * 0.35)}" fill="#fff" stroke="${esc(cols[0])}" stroke-width="${n(fs * 0.2)}"/>`));
    } else {
      data.forEach((d, i) => {
        const bh = ((+d.value || 0) / max) * ch, bw = step * 0.62;
        out += `<rect x="${n(pl + step * i + (step - bw) / 2)}" y="${n(pt + ch - bh)}" width="${n(bw)}" height="${n(Math.max(0, bh))}" rx="${n(Math.min(6, bw / 4))}" fill="${esc(cols[i % cols.length])}"/>`;
        out += `<text x="${n(pl + step * (i + 0.5))}" y="${n(pt + ch - bh - fs * 0.35)}" font-size="${n(fs * 0.85)}" text-anchor="middle" font-family="${ff}" fill="${tc}">${esc(d.value)}</text>`;
      });
    }
    data.forEach((d, i) => (out += `<text x="${n(pl + step * (i + 0.5))}" y="${n(h - pb * 0.35)}" font-size="${n(fs)}" text-anchor="middle" font-family="${ff}" fill="${tc}">${esc(d.label)}</text>`));
    return out;
  }

  function tableInner(el, ctx) {
    const rows = el.cells.length, cols = el.cells[0]?.length || 1;
    const cw = el.w / cols, rh = el.h / rows;
    const ff = esc(M.fontStack(el.font || 'Inter'));
    const fs = Math.min(el.size || 18, rh * 0.6);
    let out = '';
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const head = r === 0 && el.headerFill;
        out += `<rect x="${n(c * cw)}" y="${n(r * rh)}" width="${n(cw)}" height="${n(rh)}" fill="${esc(head ? el.headerFill : r % 2 && el.stripe ? el.stripe : el.fill || '#fff')}" stroke="${esc(el.stroke || '#ccc')}" stroke-width="1"/>`;
        let v = R.evalCell(el.cells, r, c);
        const maxCh = Math.max(1, Math.floor(cw / (fs * 0.55)));
        if (v.length > maxCh) v = v.slice(0, maxCh - 1) + '…';
        const numeric = v !== '' && !isNaN(+v);
        out += `<text x="${n(numeric ? c * cw + cw - 8 : c * cw + 8)}" y="${n(r * rh + rh / 2 + fs * 0.35)}" font-size="${n(fs)}" font-family="${ff}" font-weight="${head ? 700 : 400}" text-anchor="${numeric ? 'end' : 'start'}" fill="${esc(head ? el.headerColor : el.color)}" style="white-space:pre">${esc(v)}</text>`;
      }
    return out;
  }

  function drawInner(el) {
    const pts = el.pts || [];
    if (pts.length < 2) return '';
    const P = (i) => [pts[i][0] * el.w, pts[i][1] * el.h];
    let d = `M${n(P(0)[0])} ${n(P(0)[1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = P(i), b = P(i + 1);
      d += `Q${n(a[0])} ${n(a[1])} ${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}`;
    }
    const L = P(pts.length - 1);
    d += `L${n(L[0])} ${n(L[1])}`;
    const hl = el.pen === 'highlighter';
    return `<path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(14, el.strokeWidth + 10)}"/><path d="${d}" fill="none" stroke="${esc(el.stroke)}" stroke-width="${n(el.strokeWidth)}" stroke-linecap="${hl ? 'square' : 'round'}" stroke-linejoin="round" opacity="${hl ? 0.45 : 1}"/>`;
  }

  R.elementSVG = (el, ctx, idx = 0) => {
    if (el.hidden) return '';
    const st = R.anim(el, ctx.t, ctx.dur, idx, ctx.page);
    if (el.type === 'line') return lineSVG(el, ctx, st);
    let inner = '';
    switch (el.type) {
      case 'text': inner = R.textSVG(el, ctx, { x: 0, y: 0, w: el.w, h: el.h }, st.chars); break;
      case 'shape': inner = shapeInner(el, ctx, st); break;
      case 'image': inner = imageInner(el, ctx); break;
      case 'chart': inner = chartInner(el, ctx); break;
      case 'table': inner = tableInner(el, ctx); break;
      case 'draw': inner = drawInner(el); break;
      case 'icon': inner = `<g transform="scale(${n(el.w / 24)} ${n(el.h / 24)})"><path d="${M.ICONS[el.icon] || ''}" fill="${R.paint(el.fill, ctx, el.id)}"/></g>`; break;
      case 'emoji': inner = `<text x="${n(el.w / 2)}" y="${n(el.h * 0.86)}" font-size="${n(el.h * 0.92)}" text-anchor="middle" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${esc(el.text)}</text>`; break;
    }
    if (el.type !== 'text' && el.type !== 'draw') inner = `<rect width="${n(el.w)}" height="${n(el.h)}" fill="transparent"/>` + inner;
    if (el.flipX || el.flipY) inner = `<g transform="translate(${el.flipX ? n(el.w) : 0} ${el.flipY ? n(el.h) : 0}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})">${inner}</g>`;
    let filt = '';
    if (el.shadow) {
      const fid = ctx.idp + 'sh' + el.id;
      const sz = Math.min(el.w, el.h);
      ctx.defs.push(`<filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${n(sz * 0.03)}" stdDeviation="${n(sz * 0.04)}" flood-opacity="0.28"/></filter>`);
      filt = ` filter="url(#${fid})"`;
    }
    const cx = el.w / 2, cy = el.h / 2;
    let tr = `translate(${n(el.x + st.dx)} ${n(el.y + st.dy)})`;
    if (el.rot || st.r) tr += ` rotate(${n((el.rot || 0) + st.r)} ${n(cx)} ${n(cy)})`;
    if (st.s !== 1 || st.sx !== 1) tr += ` translate(${n(cx)} ${n(cy)}) scale(${n(st.s * st.sx)} ${n(st.s)}) translate(${n(-cx)} ${n(-cy)})`;
    const op = (el.opacity ?? 1) * st.o;
    const link = ctx.links && el.link && /^(https?:|mailto:|tel:|#)/i.test(el.link.trim()) ? el.link.trim() : '';
    const g = `<g data-id="${el.id}" transform="${tr}"${op < 1 ? ` opacity="${n(op)}"` : ''}${filt}>${inner}</g>`;
    return link ? `<a href="${esc(link)}" target="_blank">${g}</a>` : g;
  };

  R.backgroundSVG = (design, page, ctx) => {
    const W = design.width, H = design.height, bg = page.bg || {};
    if (ctx.transparent) return '';
    let out = `<rect width="${W}" height="${H}" fill="${R.paint(bg.color || '#ffffff', ctx, 'bg' + page.id)}"/>`;
    if (bg.asset) {
      const fid = ctx.idp + 'bgf' + page.id;
      const f = R.imageFilter(bg.adj, fid);
      if (f) ctx.defs.push(f);
      out += `<image href="${esc(ctx.asset(bg.asset))}" xlink:href="${esc(ctx.asset(bg.asset))}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"${f ? ` filter="url(#${fid})"` : ''}/>`;
      if (bg.overlay) out += `<rect width="${W}" height="${H}" fill="${esc(bg.overlay)}" opacity="${n(bg.overlayOpacity ?? 0.35)}"/>`;
    }
    return out;
  };

  let seq = 0;
  // opts: { t, asset, idp, transparent, links, fontCSS, width, height, skip:Set }
  R.pageParts = (design, page, opts = {}) => {
    const ctx = { asset: opts.asset || ((id) => A.S.assetURL(id)), idp: opts.idp || 'r' + (seq++).toString(36) + '_', t: opts.t, dur: page.duration || 5, page, defs: [], transparent: opts.transparent, links: opts.links };
    const bg = R.backgroundSVG(design, page, ctx);
    const els = page.elements.map((el, i) => (opts.skip && opts.skip.has(el.id) ? '' : R.elementSVG(el, ctx, i))).join('');
    return { defs: ctx.defs.join(''), bg, els };
  };
  R.pageSVG = (design, page, opts = {}) => {
    const p = R.pageParts(design, page, opts);
    const W = design.width, H = design.height;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${opts.width || W}" height="${opts.height || Math.round(((opts.width || W) / W) * H)}" viewBox="0 0 ${W} ${H}">${opts.fontCSS ? `<style>${opts.fontCSS}</style>` : ''}<defs>${p.defs}</defs>${p.bg}${p.els}</svg>`;
  };

  // Self-contained SVG (assets inlined as data URLs, custom fonts embedded).
  R.fontCSSFor = async (design) => {
    const used = new Set();
    for (const p of design.pages) for (const e of p.elements) if (e.font) used.add(e.font);
    let css = '';
    for (const f of M.customFonts) if (used.has(f.name)) css += `@font-face{font-family:"${f.name}";src:url(${await A.S.assetDataURL(f.asset)});}`;
    return css;
  };
  R.standaloneSVG = async (design, page, opts = {}) => {
    const ids = A.S.designAssetIds({ pages: [page] });
    const map = {};
    for (const id of ids) map[id] = await A.S.assetDataURL(id);
    return R.pageSVG(design, page, { ...opts, asset: (id) => map[id] || '', fontCSS: await R.fontCSSFor(design) });
  };
  // Rasterise a page to a canvas.
  R.pageCanvas = async (design, page, scale = 1, opts = {}) => {
    const svg = opts.svg || (await R.standaloneSVG(design, page, opts));
    const W = Math.max(1, Math.round(design.width * scale)), H = Math.max(1, Math.round(design.height * scale));
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await U.loadImage(url);
      const c = opts.canvas || document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      if (opts.matte) {
        g.fillStyle = opts.matte;
        g.fillRect(0, 0, W, H);
      }
      g.drawImage(img, 0, 0, W, H);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  R.thumbnail = async (design, page = design.pages[0], maxW = 360) => {
    try {
      const scale = Math.min(1, maxW / design.width, (maxW * 1.4) / design.height);
      const c = await R.pageCanvas(design, page, scale);
      return c.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      return '';
    }
  };
  // Quick inline preview (uses object URLs) for template cards etc.
  R.previewURL = (design, page = design.pages[0]) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(R.pageSVG(design, page, { width: 320 }));
})(window.A);
