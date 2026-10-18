'use strict';
// Document model: design types, fonts, element factories and libraries.
(function (A) {
  const U = A.U;
  const M = (A.M = {});

  M.TYPES = [
    { id: 'doc', label: 'Docs', icon: 'doc', color: '#13a3b5', w: 816, h: 1056, layout: 'vertical' },
    { id: 'whiteboard', label: 'Whiteboards', icon: 'whiteboard', color: '#20a46b', w: 2400, h: 1500, layout: 'vertical', whiteboard: true },
    { id: 'presentation', label: 'Presentations', icon: 'present', color: '#ff8a00', w: 1920, h: 1080, layout: 'strip' },
    {
      id: 'social', label: 'Social media', icon: 'social', color: '#ff3d77', w: 1080, h: 1080, layout: 'vertical',
      presets: [
        ['Square post', 1080, 1080], ['Portrait post', 1080, 1350], ['Story', 1080, 1920], ['Wide post', 1200, 630], ['Video thumbnail', 1280, 720], ['Banner', 1500, 500],
      ],
    },
    { id: 'video', label: 'Videos', icon: 'video', color: '#8b3dff', w: 1920, h: 1080, layout: 'strip', video: true, presets: [['Landscape video', 1920, 1080], ['Vertical video', 1080, 1920], ['Square video', 1080, 1080]] },
    {
      id: 'print', label: 'Print', icon: 'printer', color: '#2f6fff', w: 794, h: 1123, layout: 'vertical',
      presets: [['A4 flyer', 794, 1123], ['Letter flyer', 816, 1056], ['Poster 18×24 in', 1728, 2304], ['Business card', 336, 192], ['Invitation 5×7 in', 480, 672], ['Postcard', 576, 384]],
    },
    { id: 'website', label: 'Websites', icon: 'web', color: '#00a3ff', w: 1366, h: 768, layout: 'vertical' },
    { id: 'sheet', label: 'Sheets', icon: 'sheet', color: '#0ba360', w: 1200, h: 800, layout: 'vertical' },
  ];
  M.type = (id) => M.TYPES.find((t) => t.id === id) || { id: 'custom', label: 'Custom', w: 1080, h: 1080, layout: 'vertical' };

  // System font stacks so designs render offline on every OS.
  M.FONTS = [
    ['Inter', 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'],
    ['Arial', 'Arial, Helvetica, sans-serif'],
    ['Helvetica', 'Helvetica, Arial, sans-serif'],
    ['Verdana', 'Verdana, Geneva, sans-serif'],
    ['Trebuchet', '"Trebuchet MS", Tahoma, sans-serif'],
    ['Tahoma', 'Tahoma, Verdana, sans-serif'],
    ['Georgia', 'Georgia, "Times New Roman", serif'],
    ['Times', '"Times New Roman", Times, serif'],
    ['Palatino', '"Palatino Linotype", Palatino, "Book Antiqua", serif'],
    ['Garamond', 'Garamond, "EB Garamond", Georgia, serif'],
    ['Courier', '"Courier New", Courier, monospace'],
    ['Mono', 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace'],
    ['Impact', 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif'],
    ['Rounded', '"Arial Rounded MT Bold", "Nunito", "Varela Round", system-ui, sans-serif'],
    ['Comic', '"Comic Sans MS", "Comic Neue", cursive'],
    ['Brush', '"Brush Script MT", "Segoe Script", cursive'],
    ['System', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
    ['Serif', 'serif'],
    ['Sans', 'sans-serif'],
  ];
  M.customFonts = []; // [{name, asset}]
  M.fontStack = (name) => {
    const f = M.FONTS.find((x) => x[0] === name);
    if (f) return f[1];
    if (M.customFonts.some((c) => c.name === name)) return `"${name}", sans-serif`;
    return name ? `"${name}", sans-serif` : M.FONTS[0][1];
  };

  M.PALETTE = ['#000000', '#545454', '#737373', '#a6a6a6', '#d9d9d9', '#ffffff', '#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff', '#5e17eb', '#0097b2', '#0cc0df', '#5ce1e6', '#38b6ff', '#5170ff', '#004aad', '#00bf63', '#7ed957', '#c1ff72', '#ffde59', '#ffbd59', '#ff914d'];

  M.STYLE_PALETTES = [
    ['Sunset', ['#ff6b6b', '#feca57', '#ff9ff3', '#2d3436', '#ffffff']],
    ['Ocean', ['#0a3d62', '#3c6382', '#60a3bc', '#82ccdd', '#f8f9fa']],
    ['Forest', ['#1e3d2f', '#2d6a4f', '#52b788', '#d8f3dc', '#fefae0']],
    ['Mono', ['#111111', '#444444', '#888888', '#dddddd', '#ffffff']],
    ['Candy', ['#ff477e', '#ff7096', '#ff99ac', '#fbb1bd', '#fff0f3']],
    ['Retro', ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51']],
    ['Royal', ['#240046', '#5a189a', '#9d4edd', '#e0aaff', '#ffffff']],
    ['Earth', ['#582f0e', '#7f4f24', '#936639', '#c2c5aa', '#f5ebe0']],
  ];
  M.FONT_PAIRS = [
    ['Georgia', 'Inter', 'Classic editorial'],
    ['Impact', 'Arial', 'Bold & loud'],
    ['Palatino', 'Verdana', 'Elegant'],
    ['Mono', 'Inter', 'Tech'],
    ['Rounded', 'Trebuchet', 'Friendly'],
    ['Brush', 'Georgia', 'Handmade'],
    ['Garamond', 'Helvetica', 'Timeless'],
    ['Comic', 'Comic', 'Playful'],
  ];

  // ---------- element factories ----------
  const base = (type, o = {}) => ({ id: U.uid('e_'), type, x: 100, y: 100, w: 200, h: 200, rot: 0, opacity: 1, ...o });
  M.textDefaults = { text: 'Text', font: 'Inter', size: 32, color: '#1a1a1a', bold: false, italic: false, underline: false, strike: false, upper: false, align: 'left', lh: 1.3, spacing: 0, list: 'none' };
  M.newText = (o = {}) => base('text', { ...M.textDefaults, w: 400, h: 60, ...o });
  M.newShape = (shape = 'rect', o = {}) => base('shape', { shape, fill: '#8c52ff', stroke: '#1a1a1a', strokeWidth: 0, dash: 'solid', radius: 0, ...o });
  M.newLine = (o = {}) => base('line', { p1: { x: 100, y: 200 }, p2: { x: 400, y: 200 }, stroke: '#1a1a1a', strokeWidth: 6, dash: 'solid', start: 'none', end: 'none', elbow: false, ...o });
  M.newImage = (asset, o = {}) => base('image', { asset: asset.id, nw: asset.w, nh: asset.h, crop: { x: 0, y: 0, w: 1, h: 1 }, adj: {}, radius: 0, ...o });
  // A clip: trimIn/trimOut are seconds of the source, begin is when it starts on its page, speed its playback rate.
  M.newVideo = (asset, o = {}) => base('video', { asset: asset.id, poster: asset.poster, nw: asset.w || 640, nh: asset.h || 360, dur: asset.duration || 0, crop: { x: 0, y: 0, w: 1, h: 1 }, radius: 0, trimIn: 0, trimOut: asset.duration || 0, begin: 0, speed: 1, volume: 1, muted: false, loop: false, ...o });
  M.newSticky = (o = {}) => M.newShape('rect', { w: 240, h: 240, fill: '#ffe066', radius: 6, shadow: true, ...M.textDefaults, text: 'Add an idea', size: 28, align: 'center', votes: 0, sticky: true, ...o });
  M.newChart = (chart = 'bar', o = {}) =>
    base('chart', { chart, w: 520, h: 360, data: [{ label: 'Q1', value: 12 }, { label: 'Q2', value: 19 }, { label: 'Q3', value: 9 }, { label: 'Q4', value: 24 }], colors: ['#8c52ff', '#00bf63', '#ff914d', '#38b6ff', '#ff66c4', '#ffde59'], font: 'Inter', textColor: '#333333', ...o });
  M.newTable = (rows = 4, cols = 3, o = {}) => {
    const cells = [];
    for (let r = 0; r < rows; r++) cells.push(Array.from({ length: cols }, (_, c) => (r === 0 ? 'Header ' + (c + 1) : '')));
    return base('table', { w: cols * 160, h: rows * 50, cells, font: 'Inter', size: 18, color: '#222222', headerFill: '#8c52ff', headerColor: '#ffffff', fill: '#ffffff', stroke: '#d0d0d0', ...o });
  };
  M.newDraw = (o = {}) => base('draw', { pts: [], stroke: '#1a1a1a', strokeWidth: 6, pen: 'pen', ...o });
  M.newIcon = (icon, o = {}) => base('icon', { icon, fill: '#1a1a1a', w: 160, h: 160, ...o });

  M.SHAPES = [
    ['rect', 'Square'], ['rounded', 'Rounded square'], ['ellipse', 'Circle'], ['triangle', 'Triangle'], ['rtriangle', 'Right triangle'], ['diamond', 'Diamond'],
    ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['star', 'Star'], ['star8', 'Burst'], ['heart', 'Heart'],
    ['arrowR', 'Arrow right'], ['arrowL', 'Arrow left'], ['chevron', 'Chevron'], ['plus', 'Cross'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'],
    ['speech', 'Speech bubble'], ['cloud', 'Cloud'], ['ring', 'Ring'], ['moon', 'Crescent'], ['blob', 'Blob'], ['arch', 'Arch'],
  ];

  // Simple filled vector graphics (24x24 viewBox).
  M.ICONS = {
    heart: 'M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4 7 4c2.2 0 3.6 1.3 5 3 1.4-1.7 2.8-3 5-3 4 0 6.2 4.2 4.6 7.8C19.5 16.4 12 21 12 21z',
    star: 'M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z',
    check: 'M9.5 16.2L5.3 12l-1.8 1.8 6 6L21 8.3l-1.8-1.8z',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3zM4.2 2.8l2.1 2.1-1.4 1.4-2.1-2.1zM17.7 18.3l2.1 2.1-1.4 1.4-2.1-2.1zM2.8 19.8l2.1-2.1 1.4 1.4-2.1 2.1zM18.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
    moon: 'M14.5 2A10 10 0 1 0 22 14.5 8 8 0 0 1 14.5 2z',
    cloud: 'M18 10a6 6 0 0 0-11.7-1.5A4.5 4.5 0 0 0 6.5 19H18a4.5 4.5 0 0 0 0-9z',
    drop: 'M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13z',
    leaf: 'M20 3C9 3 4 9 4 15c0 2 .6 3.8 1.6 5.2L4 22l1.4 1.4 1.8-1.7A8 8 0 0 0 11 23c8 0 9-12 9-20zM8 18c2-4 5-7 9-9-3 3-6 6-9 9z',
    flower: 'M12 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM5 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm14 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    pin: 'M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
    home: 'M12 3L2 12h3v9h5v-6h4v6h5v-9h3z',
    mail: 'M2 5h20v14H2zm2 2v.5l8 5 8-5V7l-8 5z',
    phone: 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z',
    user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z',
    camera: 'M9 3L7 6H3v14h18V6h-4l-2-3zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
    music: 'M9 3v12.3A3.5 3.5 0 1 0 11 18V7h8v6.3a3.5 3.5 0 1 0 2 3.2V3z',
    play: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM10 8l6 4-6 4z',
    bell: 'M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1z',
    gift: 'M3 9h18v4H3zM5 13h14v9H5zM11 9h2v13h-2zM12 9C9 9 7 4 9.5 4 11 4 12 9 12 9zm0 0c3 0 5-5 2.5-5C13 4 12 9 12 9z',
    crown: 'M2 7l5 4 5-7 5 7 5-4-2 12H4zM4 20h16v2H4z',
    rocket: 'M12 2c4 2 6 6 6 11l-3 3H9l-3-3c0-5 2-9 6-11zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 18l-3 4 1-5zm8 0l3 4-1-5zM10 18h4l-2 4z',
    chat: 'M3 4h18v12H8l-5 4z',
    quote: 'M4 11c0-4 2-6 6-7v3c-2 .7-3 2-3 4h3v7H4zm10 0c0-4 2-6 6-7v3c-2 .7-3 2-3 4h3v7h-6z',
    arrow: 'M4 11h12l-5-5 1.4-1.4L20 12l-7.6 7.4L11 18l5-5H4z',
    sparkle: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z',
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15 15 0 0 0-1.4-3.8A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8 8 0 0 1 0-4h3.4a16 16 0 0 0 0 4zm.8 2h3a15 15 0 0 0 1.4 3.8A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.4-3.8A15 15 0 0 0 8.1 8zM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4zm.2 5.8a15 15 0 0 0 1.4-3.8h3a8 8 0 0 1-4.4 3.8zm1.8-5.8a16 16 0 0 0 0-4h3.4a8 8 0 0 1 0 4z',
    cart: 'M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM1 2h4l2.7 11.6A2 2 0 0 0 9.6 15H19v-2H9.6l-.4-2H20l2-7H6.2L5.6 2z',
    coffee: 'M3 8h14v6a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6zm14 1h1.5a3 3 0 0 1 0 6H17v-2h1.5a1 1 0 0 0 0-2H17zM6 2h2v4H6zm4 0h2v4h-2z',
    paw: 'M12 11c-3 0-6 4-6 7 0 2 2 3 6 3s6-1 6-3c0-3-3-7-6-7zM5 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm14 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  };
  M.STICKERS = '😀 😍 🥳 😎 🤩 🤔 😂 🙌 👍 👏 🔥 ✨ 🎉 🎈 🎁 ❤️ 💜 💙 💚 💛 ⭐ 🌟 ⚡ 🌈 ☀️ 🌙 ☁️ 🌸 🌻 🌿 🍀 🍕 🍔 🍩 ☕ 🍰 🎵 🎧 📷 💡 📌 📣 🚀 🏆 💰 📈 ✅ ❌ ➡️ 💬'.split(' ');

  M.FILTER_PRESETS = [
    ['None', {}],
    ['Vivid', { saturation: 40, contrast: 15 }],
    ['Warm', { warmth: 40, saturation: 10 }],
    ['Cool', { warmth: -40, tint: -5 }],
    ['Fade', { contrast: -25, brightness: 10, saturation: -20 }],
    ['Noir', { saturation: -100, contrast: 30 }],
    ['Mono', { saturation: -100 }],
    ['Vintage', { sepia: 60, contrast: -10, vignette: 40 }],
    ['Drama', { contrast: 45, brightness: -10, vignette: 50 }],
    ['Dreamy', { brightness: 15, blur: 1, saturation: 15 }],
    ['Sunset', { warmth: 60, tint: 15, contrast: 10 }],
    ['Lagoon', { warmth: -30, saturation: 25, tint: -15 }],
  ];
  M.ADJUST = [
    ['brightness', 'Brightness'], ['contrast', 'Contrast'], ['saturation', 'Saturation'], ['vibrance', 'Vibrance'], ['warmth', 'Warmth'], ['tint', 'Tint'],
    ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['whites', 'Whites'], ['blacks', 'Blacks'], ['clarity', 'Clarity'], ['blur', 'Blur', 0, 20], ['vignette', 'Vignette', 0, 100], ['sepia', 'Sepia', 0, 100],
  ];
  M.DUOTONES = [['#1a1a8f', '#ffcc33'], ['#3a0ca3', '#f72585'], ['#073b4c', '#06d6a0'], ['#222222', '#e9e9e9'], ['#5f0f40', '#fb8b24'], ['#03045e', '#90e0ef']];

  M.ANIM_IN = [['none', 'None'], ['fade', 'Fade'], ['rise', 'Rise'], ['pan', 'Pan'], ['pop', 'Pop'], ['drift', 'Drift'], ['tumble', 'Tumble'], ['bounce', 'Bounce'], ['wipe', 'Wipe'], ['zoom', 'Zoom'], ['typewriter', 'Typewriter']];
  M.ANIM_EMPH = [['none', 'None'], ['pulse', 'Pulse'], ['wiggle', 'Wiggle'], ['flicker', 'Flicker'], ['float', 'Float'], ['spin', 'Spin']];
  M.ANIM_OUT = [['none', 'None'], ['fade', 'Fade'], ['sink', 'Sink'], ['shrink', 'Shrink'], ['pan', 'Pan away']];
  M.TRANSITIONS = [['none', 'None'], ['dissolve', 'Dissolve'], ['slide', 'Slide'], ['wipe', 'Wipe'], ['zoom', 'Zoom'], ['flip', 'Flip']];
  M.EFFECTS = [['none', 'None'], ['shadow', 'Shadow'], ['lift', 'Lift'], ['hollow', 'Hollow'], ['splice', 'Splice'], ['echo', 'Echo'], ['glitch', 'Glitch'], ['neon', 'Neon'], ['background', 'Background']];

  // ---------- designs ----------
  M.newPage = (o = {}) => ({ id: U.uid('p_'), title: '', bg: { color: '#ffffff' }, elements: [], duration: 5, transition: 'none', ...o });
  M.newDesign = ({ type = 'custom', w, h, title } = {}) => {
    const t = M.type(type);
    return {
      id: U.uid('d_'),
      title: title || 'Untitled design',
      type: t.id,
      width: w || t.w,
      height: h || t.h,
      pages: [M.newPage()],
      comments: [],
      guides: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      starred: false,
      folderId: null,
    };
  };
  M.layoutOf = (d) => M.type(d.type).layout || 'vertical';

  // All element ids/points shifted for duplication. Given the page, a connector keeps the ends it is drawn with.
  M.cloneElement = (el, dx = 20, dy = 20, page) => {
    const c = U.clone(el);
    c.id = U.uid('e_');
    c.x += dx;
    c.y += dy;
    if (c.type === 'line') {
      if (page) Object.assign(c, U.clone(A.R.lineEnds(el, page)));
      c.p1.x += dx; c.p1.y += dy; c.p2.x += dx; c.p2.y += dy;
      delete c.c1; delete c.c2;
      M.syncLineBox(c);
    }
    return c;
  };
  // Clone a batch: groups get new ids and connectors stay attached to shapes cloned with them.
  M.cloneElements = (els, dx = 20, dy = 20, page) => {
    const ids = {}, groups = {};
    const out = els.map((el) => {
      const c = M.cloneElement(el, dx, dy, page);
      ids[el.id] = c.id;
      if (c.groupId) c.groupId = groups[c.groupId] ||= U.uid('g_');
      return c;
    });
    els.forEach((el, i) => {
      if (ids[el.c1]) out[i].c1 = ids[el.c1];
      if (ids[el.c2]) out[i].c2 = ids[el.c2];
    });
    return out;
  };
  M.syncLineBox = (el) => {
    const pad = Math.max(el.strokeWidth * 2, 8);
    el.x = Math.min(el.p1.x, el.p2.x) - pad;
    el.y = Math.min(el.p1.y, el.p2.y) - pad;
    el.w = Math.abs(el.p2.x - el.p1.x) + pad * 2;
    el.h = Math.abs(el.p2.y - el.p1.y) + pad * 2;
  };
  M.allText = (design) => {
    const out = [];
    for (const p of design.pages)
      for (const e of p.elements) {
        if (typeof e.text === 'string' && e.text.trim()) out.push({ el: e, key: 'text' });
        if (e.type === 'table') e.cells.forEach((row, r) => row.forEach((c, ci) => c && !String(c).startsWith('=') && isNaN(+c) && out.push({ el: e, cell: [r, ci] })));
      }
    return out;
  };
})(window.A);
