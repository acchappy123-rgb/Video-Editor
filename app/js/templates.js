'use strict';
// Built-in starter templates, generated in code (no external images needed).
(function (A) {
  const M = A.M;
  const T = (text, x, y, w, size, o = {}) => {
    const el = M.newText({ text, x, y, w, size, ...o });
    el.h = A.R.textHeight(el);
    return el;
  };
  const S = (shape, x, y, w, h, fill, o = {}) => M.newShape(shape, { x, y, w, h, fill, ...o });
  const L = (x1, y1, x2, y2, o = {}) => {
    const l = M.newLine({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...o });
    M.syncLineBox(l);
    return l;
  };
  const P = (bg, elements, o = {}) => M.newPage({ bg: { color: bg }, elements, ...o });

  const list = [
    {
      name: 'Bold Announcement', type: 'social', w: 1080, h: 1080, tags: 'social post sale event bold',
      pages: () => [P('grad:#5e17eb:#ff66c4:135', [
        S('ellipse', 640, -160, 620, 620, '#ffffff', { opacity: 0.12 }),
        S('ellipse', -200, 700, 520, 520, '#ffffff', { opacity: 0.1 }),
        T('BIG NEWS', 90, 300, 900, 150, { font: 'Impact', color: '#ffffff', spacing: 40, anim: { in: 'pop' } }),
        T('Something exciting is coming your way. Stay tuned!', 90, 520, 760, 44, { color: '#ffffff', anim: { in: 'rise' } }),
        S('rounded', 90, 760, 380, 100, '#ffde59', { text: 'Learn more', size: 38, bold: true, color: '#2a1052', align: 'center' }),
      ])],
    },
    {
      name: 'Minimal Quote', type: 'social', w: 1080, h: 1080, tags: 'quote social minimal inspiration',
      pages: () => [P('#f5efe6', [
        M.newIcon('quote', { x: 120, y: 160, w: 140, h: 140, fill: '#c97b63' }),
        T('Design is not just what it looks like. Design is how it works.', 120, 360, 840, 70, { font: 'Georgia', color: '#2b2b2b', italic: true, lh: 1.25 }),
        L(120, 820, 300, 820, { stroke: '#c97b63', strokeWidth: 6 }),
        T('— A thoughtful designer', 120, 850, 700, 36, { color: '#6b5f55', font: 'Inter' }),
      ])],
    },
    {
      name: 'Product Sale', type: 'social', w: 1080, h: 1350, tags: 'sale shop product discount',
      pages: () => [P('#111111', [
        S('rect', 0, 0, 1080, 520, '#ffde59'),
        T('SUMMER', 80, 120, 920, 120, { font: 'Impact', color: '#111111', align: 'center', spacing: 80 }),
        T('SALE', 80, 250, 920, 220, { font: 'Impact', color: '#111111', align: 'center', spacing: 40 }),
        S('star8', 690, 560, 300, 300, '#ff3131', { text: '50%\nOFF', size: 60, bold: true, color: '#ffffff', align: 'center', lh: 1 }),
        T('All items in store and online. This weekend only.', 80, 640, 560, 46, { color: '#ffffff' }),
        S('rounded', 80, 1060, 920, 130, '#ffffff', { text: 'SHOP NOW', size: 50, bold: true, color: '#111', align: 'center', spacing: 120 }),
      ])],
    },
    {
      name: 'Pitch Deck', type: 'presentation', w: 1920, h: 1080, tags: 'presentation pitch business deck slides',
      pages: () => [
        P('grad:#0a3d62:#3c6382:120', [
          T('Project Atlas', 160, 380, 1600, 150, { font: 'Inter', bold: true, color: '#ffffff', anim: { in: 'rise' } }),
          T('A clear plan for the next big thing', 160, 560, 1400, 60, { color: '#d0e6f5', anim: { in: 'fade', delay: 0.4 } }),
          S('rect', 160, 340, 140, 12, '#82ccdd'),
        ], { transition: 'dissolve' }),
        P('#ffffff', [
          T('The problem', 160, 140, 1600, 90, { bold: true, color: '#0a3d62' }),
          T('People spend hours on tasks that could take minutes.\nTools are scattered and hard to learn.\nTeams lose track of what matters.', 160, 300, 900, 48, { color: '#333', list: 'bullet', lh: 1.6 }),
          S('ellipse', 1220, 260, 520, 520, '#82ccdd', { opacity: 0.5 }),
          M.newIcon('bolt', { x: 1360, y: 400, w: 240, h: 240, fill: '#0a3d62' }),
        ], { transition: 'slide' }),
        P('#ffffff', [
          T('Growth', 160, 140, 1600, 90, { bold: true, color: '#0a3d62' }),
          M.newChart('bar', { x: 160, y: 300, w: 1000, h: 620, colors: ['#3c6382', '#60a3bc', '#82ccdd', '#0a3d62'] }),
          T('Steady growth every quarter, driven by word of mouth.', 1260, 420, 500, 44, { color: '#333' }),
        ], { transition: 'slide' }),
        P('#0a3d62', [T('Thank you', 160, 440, 1600, 160, { bold: true, color: '#ffffff', align: 'center', anim: { in: 'pop' } })], { transition: 'zoom' }),
      ],
    },
    {
      name: 'Clean Lesson', type: 'presentation', w: 1920, h: 1080, tags: 'education lesson school class presentation',
      pages: () => [
        P('#fffaf0', [
          S('blob', 1180, 120, 640, 640, '#ffbd59'),
          S('ellipse', 1500, 700, 260, 260, '#5ce1e6'),
          T('Lesson 1', 160, 300, 900, 60, { color: '#ff914d', bold: true, spacing: 100 }),
          T('The Water Cycle', 160, 390, 1100, 110, { font: 'Rounded', bold: true, color: '#1b2a4a' }),
          T('Evaporation · Condensation · Precipitation', 160, 600, 1000, 44, { color: '#556' }),
        ]),
        P('#ffffff', [
          T('How it works', 160, 120, 1600, 90, { font: 'Rounded', bold: true, color: '#1b2a4a' }),
          S('rounded', 160, 320, 480, 480, '#5ce1e6', { text: '1\nEvaporation', size: 48, bold: true, color: '#1b2a4a', align: 'center' }),
          S('rounded', 720, 320, 480, 480, '#ffbd59', { text: '2\nCondensation', size: 48, bold: true, color: '#1b2a4a', align: 'center' }),
          S('rounded', 1280, 320, 480, 480, '#7ed957', { text: '3\nPrecipitation', size: 48, bold: true, color: '#1b2a4a', align: 'center' }),
        ]),
      ],
    },
    {
      name: 'Event Poster', type: 'print', w: 794, h: 1123, tags: 'poster flyer event music concert print',
      pages: () => [P('#1a1033', [
        S('ellipse', 120, 120, 560, 560, 'grad:#ff66c4:#ffde59:45'),
        S('ring', 60, 60, 680, 680, '#ffffff', { opacity: 0.15 }),
        T('NIGHT', 60, 720, 674, 110, { font: 'Impact', color: '#ffffff', align: 'center', spacing: 200 }),
        T('MARKET', 60, 830, 674, 110, { font: 'Impact', color: '#ffde59', align: 'center', spacing: 200 }),
        T('FRI 8PM · CITY PARK · FREE ENTRY', 60, 990, 674, 26, { color: '#ffffff', align: 'center', spacing: 150 }),
      ])],
    },
    {
      name: 'Business Card', type: 'print', w: 336, h: 192, tags: 'business card contact print',
      pages: () => [
        P('#0b2545', [T('Your Name', 24, 64, 290, 28, { bold: true, color: '#ffffff' }), T('Job Title', 24, 100, 290, 14, { color: '#8da9c4', spacing: 100 }), S('rect', 24, 50, 40, 4, '#ffde59')]),
        P('#ffffff', [T('hello@example.com\n+00 000 000 000\nexample.com', 24, 60, 290, 14, { color: '#0b2545', lh: 1.7 }), S('rect', 290, 0, 46, 192, '#0b2545')]),
      ],
    },
    {
      name: 'Simple Resume', type: 'doc', w: 816, h: 1056, tags: 'resume cv job doc',
      pages: () => [P('#ffffff', [
        S('rect', 0, 0, 816, 200, '#2d3436'),
        T('Your Name', 60, 56, 700, 54, { bold: true, color: '#ffffff' }),
        T('Designer · City, Country', 60, 128, 700, 22, { color: '#dfe6e9' }),
        T('EXPERIENCE', 60, 250, 700, 20, { bold: true, color: '#e17055', spacing: 200 }),
        T('Senior Designer — Company\n2021 – Present\nLed the design of products used by thousands of people.', 60, 290, 700, 18, { color: '#2d3436', lh: 1.6 }),
        T('Designer — Studio\n2018 – 2021\nCreated brand identities and marketing material.', 60, 420, 700, 18, { color: '#2d3436', lh: 1.6 }),
        T('SKILLS', 60, 560, 700, 20, { bold: true, color: '#e17055', spacing: 200 }),
        T('Layout\nTypography\nIllustration\nPrototyping', 60, 600, 700, 18, { color: '#2d3436', list: 'bullet', lh: 1.7 }),
      ])],
    },
    {
      name: 'Project Brief', type: 'doc', w: 816, h: 1056, tags: 'doc report brief document',
      pages: () => [P('#ffffff', [
        T('Project Brief', 72, 80, 672, 48, { bold: true, color: '#1a1a1a' }),
        T('Owner · Date', 72, 140, 672, 18, { color: '#888' }),
        L(72, 180, 744, 180, { stroke: '#e0e0e0', strokeWidth: 2 }),
        T('Goal', 72, 210, 672, 26, { bold: true, color: '#5e17eb' }),
        T('Describe what this project should achieve and why it matters.', 72, 250, 672, 18, { color: '#333' }),
        T('Scope', 72, 320, 672, 26, { bold: true, color: '#5e17eb' }),
        T('What is included\nWhat is not included\nKey milestones', 72, 360, 672, 18, { color: '#333', list: 'number', lh: 1.7 }),
        M.newTable(4, 3, { x: 72, y: 480, w: 672, h: 200, cells: [['Task', 'Owner', 'Days'], ['Research', 'Team A', '5'], ['Design', 'Team B', '8'], ['Total', '', '=SUM(C2:C3)']] }),
      ])],
    },
    {
      name: 'Brainstorm Board', type: 'whiteboard', w: 2400, h: 1500, tags: 'whiteboard brainstorm sticky team ideas',
      pages: () => [P('#f7f7f9', [
        T('Brainstorm: our next idea', 100, 80, 1400, 80, { bold: true, color: '#222' }),
        M.newSticky({ x: 100, y: 260, text: 'Ask users what they need' }),
        M.newSticky({ x: 380, y: 260, fill: '#a0e7e5', text: 'Quick wins first' }),
        M.newSticky({ x: 660, y: 260, fill: '#ffaebc', text: 'Try a weekly demo' }),
        M.newSticky({ x: 100, y: 540, fill: '#b4f8c8', text: 'Simplify onboarding' }),
        S('rounded', 1200, 260, 900, 700, '#ffffff', { stroke: '#d0d0d8', strokeWidth: 3, dash: 'dashed' }),
        T('Decisions', 1240, 290, 600, 44, { bold: true, color: '#444' }),
      ])],
    },
    {
      name: 'Landing Page', type: 'website', w: 1366, h: 768, tags: 'website landing page web',
      pages: () => [
        P('#ffffff', [
          T('Acme Studio', 80, 40, 400, 28, { bold: true, color: '#111' }),
          T('Work    About    Contact', 900, 44, 400, 20, { color: '#555', align: 'right' }),
          T('We make simple things beautiful.', 80, 220, 700, 72, { bold: true, color: '#111', lh: 1.1 }),
          T('A small studio for brands that care about details.', 80, 440, 600, 26, { color: '#555' }),
          S('rounded', 80, 520, 260, 70, '#5e17eb', { text: 'Get in touch', size: 24, bold: true, color: '#fff', align: 'center', link: 'mailto:hello@example.com' }),
          S('blob', 820, 140, 480, 480, 'grad:#38b6ff:#8c52ff:45'),
        ]),
        P('#f4f1ff', [
          T('What we do', 80, 100, 1200, 56, { bold: true, color: '#111', align: 'center' }),
          S('rounded', 120, 260, 340, 360, '#ffffff', { text: 'Branding', size: 30, bold: true, color: '#5e17eb', align: 'center', shadow: true }),
          S('rounded', 513, 260, 340, 360, '#ffffff', { text: 'Websites', size: 30, bold: true, color: '#5e17eb', align: 'center', shadow: true }),
          S('rounded', 906, 260, 340, 360, '#ffffff', { text: 'Print', size: 30, bold: true, color: '#5e17eb', align: 'center', shadow: true }),
        ]),
      ],
    },
    {
      name: 'Video Intro', type: 'video', w: 1920, h: 1080, tags: 'video intro youtube animation',
      pages: () => [
        P('#111111', [
          S('ellipse', 760, 340, 400, 400, '#ff3131', { anim: { in: 'pop', emph: 'pulse' } }),
          M.newIcon('play', { x: 860, y: 440, w: 200, h: 200, fill: '#ffffff', anim: { in: 'zoom', delay: 0.3 } }),
        ], { duration: 3, transition: 'dissolve' }),
        P('grad:#8c52ff:#ff66c4:120', [
          T('Welcome to the channel', 160, 420, 1600, 120, { bold: true, color: '#fff', align: 'center', anim: { in: 'typewriter' } }),
          T('New videos every week', 160, 600, 1600, 56, { color: '#fff', align: 'center', anim: { in: 'rise', delay: 1.4 } }),
        ], { duration: 4 }),
      ],
    },
    {
      name: 'Story Promo', type: 'social', w: 1080, h: 1920, tags: 'story vertical promo social',
      pages: () => [P('grad:#00bf63:#0097b2:160', [
        T('NEW', 100, 300, 880, 90, { color: '#c1ff72', bold: true, spacing: 300, align: 'center' }),
        T('Fresh Menu', 100, 420, 880, 160, { font: 'Georgia', color: '#ffffff', align: 'center', italic: true }),
        S('ellipse', 240, 760, 600, 600, '#ffffff', { opacity: 0.18 }),
        { ...M.newText(), type: 'emoji', text: '🥗', x: 340, y: 860, w: 400, h: 400 },
        T('Swipe up to order', 100, 1560, 880, 50, { color: '#ffffff', align: 'center' }),
      ])],
    },
    {
      name: 'Monthly Budget', type: 'sheet', w: 1200, h: 800, tags: 'sheet spreadsheet budget table',
      pages: () => [P('#ffffff', [
        T('Monthly Budget', 60, 40, 1000, 48, { bold: true, color: '#0ba360' }),
        M.newTable(7, 4, {
          x: 60, y: 140, w: 1080, h: 420, headerFill: '#0ba360',
          cells: [['Item', 'Planned', 'Actual', 'Difference'], ['Rent', '1200', '1200', '=B2-C2'], ['Food', '400', '455', '=B3-C3'], ['Transport', '150', '120', '=B4-C4'], ['Fun', '200', '260', '=B5-C5'], ['Savings', '300', '300', '=B6-C6'], ['Total', '=SUM(B2:B6)', '=SUM(C2:C6)', '=B7-C7']],
        }),
        M.newChart('pie', { x: 60, y: 590, w: 600, h: 190, data: [{ label: 'Rent', value: 1200 }, { label: 'Food', value: 455 }, { label: 'Other', value: 680 }], colors: ['#0ba360', '#3cba92', '#a8e6cf'] }),
      ])],
    },
    {
      name: 'Party Invitation', type: 'print', w: 480, h: 672, tags: 'invitation party birthday print card',
      pages: () => [P('#fff0f3', [
        { ...M.newText(), type: 'emoji', text: '🎉', x: 180, y: 60, w: 120, h: 120 },
        T("You're invited!", 40, 200, 400, 52, { font: 'Brush', color: '#c9184a', align: 'center' }),
        T('Join us to celebrate', 40, 290, 400, 22, { color: '#590d22', align: 'center' }),
        T('SATURDAY · 7 PM', 40, 380, 400, 26, { bold: true, color: '#c9184a', align: 'center', spacing: 150 }),
        S('heart', 200, 480, 80, 72, '#ff4d6d'),
      ])],
    },
    {
      name: 'Logo Mark', type: 'social', w: 1000, h: 1000, tags: 'logo brand mark',
      pages: () => [P('#ffffff', [
        S('hexagon', 350, 230, 300, 300, '#5e17eb'),
        T('A', 350, 270, 300, 200, { font: 'Impact', color: '#ffffff', align: 'center' }),
        T('ATELIER', 100, 600, 800, 90, { bold: true, color: '#1a1a1a', align: 'center', spacing: 300 }),
        T('creative studio', 100, 710, 800, 34, { color: '#888', align: 'center', spacing: 200 }),
      ])],
    },
  ];

  A.TEMPLATES = list.map((t, i) => ({ ...t, id: 'tpl_' + i }));
  A.templateDesign = (tpl) => {
    const d = M.newDesign({ type: tpl.type, w: tpl.w, h: tpl.h, title: tpl.name });
    d.pages = tpl.pages();
    return d;
  };
  // Cached preview designs for thumbnails (a user template carries its design instead of pages())
  const cache = {};
  A.templatePreview = (tpl) => cache[tpl.id] || (cache[tpl.id] = A.R.previewURL(tpl.design || A.templateDesign(tpl)));
})(window.A);
