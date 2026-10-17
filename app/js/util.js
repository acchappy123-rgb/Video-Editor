'use strict';
// Shared helpers: DOM building, dialogs, menus, toasts, file helpers, UI icons.
window.A = window.A || {};
(function (A) {
  const U = (A.U = {});

  U.uid = (p = '') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  U.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.debounce = (fn, ms) => {
    let t;
    const d = (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
    d.flush = (...a) => {
      clearTimeout(t);
      fn(...a);
    };
    return d;
  };

  // h('div.cls#id', {attrs/on*}, children...)
  U.h = function (sel, attrs, ...kids) {
    const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, n) => {
      if (t === '.') el.classList.add(n);
      else el.id = n;
    });
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      kids.unshift(attrs);
      attrs = null;
    }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  };
  U.ic = (name, size = 20) => {
    const s = document.createElement('span');
    s.className = 'ic';
    s.innerHTML = U.icon(name, size);
    return s;
  };

  U.timeAgo = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
    return new Date(ts).toLocaleDateString();
  };

  // ---------- files ----------
  U.download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = U.h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  U.blobToDataURL = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  U.dataURLToBlob = (d) => {
    const [head, body] = d.split(',');
    const mime = head.match(/:(.*?)[;,]/)[1];
    const bin = head.includes('base64') ? atob(body) : decodeURIComponent(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };
  U.loadImage = (src) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Image failed to load'));
      img.src = src;
    });
  U.pickFiles = (accept, multiple = true) =>
    new Promise((res) => {
      const inp = U.h('input', { type: 'file', accept, multiple });
      inp.onchange = () => res([...inp.files]);
      inp.click();
    });
  U.canvasToBlob = (c, type = 'image/png', q = 0.92) => new Promise((res) => c.toBlob(res, type, q));
  U.safeName = (s) => (s || 'design').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'design';

  // ---------- text measuring ----------
  const mc = document.createElement('canvas').getContext('2d');
  U.measure = (text, font, spacingPx = 0) => {
    mc.font = font;
    return mc.measureText(text).width + spacingPx * [...text].length;
  };

  // ---------- color ----------
  U.hexToRgb = (hex) => {
    hex = (hex || '#000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.hsl = (h, s, l) => {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return U.rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  };
  U.isColor = (c) => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
  U.luminance = (hex) => {
    const [r, g, b] = U.hexToRgb(hex).map((v) => v / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  // ---------- toasts ----------
  U.toast = (msg, kind = '') => {
    let wrap = U.$('#toasts');
    if (!wrap) document.body.appendChild((wrap = U.h('div#toasts')));
    const t = U.h('div.toast.' + (kind || 'info'), msg);
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  };

  // ---------- modal ----------
  U.modal = ({ title, body, actions = [], wide = false, onClose, cls = '' }) => {
    const back = U.h('div.modal-back');
    const close = () => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      onClose && onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const box = U.h(
      'div.modal' + (wide ? '.wide' : '') + (cls ? '.' + cls : ''),
      { role: 'dialog', 'aria-label': title || 'Dialog' },
      U.h('div.modal-head', U.h('h2', title || ''), U.h('button.icon-btn', { title: 'Close', onclick: close }, U.ic('x'))),
      U.h('div.modal-body', body),
      actions.length
        ? U.h(
            'div.modal-foot',
            actions.map((a) =>
              U.h(
                'button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''),
                {
                  onclick: async () => {
                    const r = await a.onClick?.();
                    if (r !== false) close();
                  },
                },
                a.label
              )
            )
          )
        : null
    );
    back.appendChild(box);
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    setTimeout(() => box.querySelector('input,textarea,select')?.focus(), 30);
    return { close, box };
  };
  U.prompt = (title, value = '', placeholder = '') =>
    new Promise((res) => {
      const inp = U.h('input.input', { value, placeholder });
      let done = false;
      const m = U.modal({
        title,
        body: inp,
        actions: [
          { label: 'Cancel' },
          {
            label: 'OK',
            primary: true,
            onClick: () => {
              done = true;
              res(inp.value);
            },
          },
        ],
        onClose: () => !done && res(null),
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          done = true;
          res(inp.value);
          m.close();
        }
      });
    });
  U.confirm = (msg, okLabel = 'OK', danger = false) =>
    new Promise((res) => {
      let done = false;
      U.modal({
        title: 'Please confirm',
        body: U.h('p', msg),
        actions: [
          { label: 'Cancel' },
          {
            label: okLabel,
            primary: !danger,
            danger,
            onClick: () => {
              done = true;
              res(true);
            },
          },
        ],
        onClose: () => !done && res(false),
      });
    });

  // ---------- popovers & menus ----------
  let openPop = null;
  U.closePop = () => {
    if (openPop) {
      openPop.remove();
      openPop = null;
    }
  };
  U.popover = (anchor, content, { align = 'left', cls = '' } = {}) => {
    U.closePop();
    const pop = U.h('div.popover' + (cls ? '.' + cls : ''), content);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const pr = pop.getBoundingClientRect();
    let x = align === 'right' ? r.right - pr.width : r.left;
    let y = r.bottom + 6;
    if (y + pr.height > innerHeight - 8) y = Math.max(8, r.top - pr.height - 6);
    if (y + pr.height > innerHeight - 8) y = Math.max(8, innerHeight - pr.height - 8);
    x = U.clamp(x, 8, Math.max(8, innerWidth - pr.width - 8));
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    openPop = pop;
    setTimeout(() => {
      const off = (e) => {
        if (!pop.isConnected) return document.removeEventListener('mousedown', off, true);
        if (!pop.contains(e.target) && !(anchor.contains && anchor.contains(e.target))) {
          U.closePop();
          document.removeEventListener('mousedown', off, true);
        }
      };
      document.addEventListener('mousedown', off, true);
    });
    return pop;
  };
  U.menu = (anchor, items, opts) => {
    const list = U.h('div.menu');
    for (const it of items) {
      if (!it) continue;
      if (it.divider) {
        list.appendChild(U.h('div.menu-div'));
        continue;
      }
      if (it.header) {
        list.appendChild(U.h('div.menu-head', it.header));
        continue;
      }
      list.appendChild(
        U.h(
          'button.menu-item' + (it.disabled ? '.disabled' : '') + (it.danger ? '.danger' : ''),
          {
            onclick: () => {
              if (it.disabled) return;
              U.closePop();
              it.onClick && it.onClick();
            },
          },
          it.icon ? U.ic(it.icon, 18) : U.h('span.ic'),
          U.h('span.menu-label', it.label),
          it.shortcut ? U.h('kbd', it.shortcut) : null
        )
      );
    }
    return U.popover(anchor, list, opts);
  };

  // ---------- UI icons (24x24 stroke icons, hand-drawn for this project) ----------
  const P = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    template: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
    brand: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
    apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17h6M17 14v6',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.5',
    settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    cloud: 'M7 18a5 5 0 0 1-.6-10 6 6 0 0 1 11.4 1.5A4.3 4.3 0 0 1 17.5 18z',
    cloudok: 'M7 18a5 5 0 0 1-.6-10 6 6 0 0 1 11.4 1.5A4.3 4.3 0 0 1 17.5 18zM9.5 13l2 2 3.5-3.5',
    share: 'M16 6l-4-4-4 4M12 2v13M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
    play: 'M7 4l13 8-13 8z',
    pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
    comment: 'M4 5h16v11H9l-5 4z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    back: 'M15 5l-7 7 7 7',
    fwd: 'M9 5l7 7-7 7',
    up: 'M5 15l7-7 7 7',
    down: 'M5 9l7 7 7-7',
    menu: 'M4 6h16M4 12h16M4 18h16',
    shapes: 'M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM14 14h7v7h-7zM17 3l4 7h-8z M3 21l4-7 4 7z',
    text: 'M5 6V4h14v2M12 4v16M9 20h6',
    upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
    draw: 'M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16zM14 7l3 3',
    design: 'M4 4h16v16H4zM4 10h16M10 10v10',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    eyeoff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.7-1.5',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    addpage: 'M6 3h9l4 4v14H6zM12 10v7M8.5 13.5h7',
    x: 'M6 6l12 12M18 6L6 18',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
    italic: 'M10 4h8M6 20h8M14 4l-4 16',
    underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
    strike: 'M5 12h14M16 7a4 3 0 0 0-4-2c-2.5 0-4 1.3-4 3s1.5 2.4 4 3M8 17a4 3 0 0 0 4 2c2.5 0 4-1.3 4-3',
    case: 'M3 18l4-12 4 12M4.3 14h5.4M14 12a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM20 12v6',
    alignl: 'M4 6h16M4 10h10M4 14h16M4 18h10',
    alignc: 'M4 6h16M7 10h10M4 14h16M7 18h10',
    alignr: 'M4 6h16M10 10h10M4 14h16M10 18h10',
    alignj: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    spacing: 'M4 4h16M4 20h16M12 7v10M9 9l3-3 3 3M9 15l3 3 3-3',
    effects: 'M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9',
    animate: 'M3 12h4M5 7h5M5 17h5M14 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
    position: 'M4 4h7v7H4zM13 13h7v7h-7zM15 4h5v5M4 15v5h5',
    transp: 'M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z',
    flip: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
    crop: 'M6 2v16h16M2 6h16v16',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
    image: 'M4 5h16v14H4zM8.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM20 15l-5-5L5 19',
    video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3z',
    music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
    star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    print: 'M6 9V3h12v6M6 17H4v-7h16v7h-2M7 14h10v7H7z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    group: 'M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4v4M14 17.5h-4v-4',
    tofront: 'M8 8h12v12H8zM4 4h10v2M4 4v10h2',
    forward: 'M12 19V5M6 11l6-6 6 6',
    backward: 'M12 5v14M6 13l6 6 6-6',
    zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6',
    zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
    timer: 'M12 8v5l3 2M12 4a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 2h6',
    vote: 'M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 20H7',
    resize: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
    file: 'M6 3h9l4 4v14H6zM14 3v5h5',
    doc: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
    whiteboard: 'M3 4h18v12H3zM8 20l4-4 4 4M7 9l3 3 3-3 4 4',
    present: 'M3 4h18v12H3zM12 16v4M8 20h8',
    social: 'M4 4h16v16H4zM8 9a1 1 0 1 0 0 .01M20 15l-5-5L4 20',
    printer: 'M6 9V3h12v6M6 17H4v-7h16v7h-2M7 14h10v7H7z',
    web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    sheet: 'M4 4h16v16H4zM4 9h16M4 14h16M10 4v16',
    custom: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    check: 'M5 12l5 5 9-10',
    pen: 'M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z',
    marker: 'M15 4l5 5-9 9H6v-5zM4 21h8',
    highlighter: 'M9 11l6-6 4 4-6 6zM9 11l-4 4v4h4l4-4M4 21h16',
    eraser: 'M8 20l-4-4L15 5l5 5-9 10zM8 20h12M10 10l5 5',
    line: 'M5 19L19 5',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    split: 'M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4',
    transition: 'M4 12h16M14 6l6 6-6 6M4 6v12',
    grid: 'M4 4h16v16H4zM4 12h16M12 4v16',
    frame: 'M7 3v18M17 3v18M3 7h18M3 17h18',
    table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14',
    fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    star2: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
    magic: 'M5 19L15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M18 14v2M10 4H8',
    wand: 'M4 20L16 8M15 3v2M19 7h2M17.5 4.5l1.5-1.5M20 11v1M11 4h1',
    restore: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  };
  U.icon = (name, size = 20) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${name === 'star2' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || P.file}"/></svg>`;
})(window.A);
