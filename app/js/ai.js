'use strict';
// Optional AI features. Uses the user's own Anthropic API key, entered in Settings and
// stored only on this device. No key ships with the app and nothing is sent anywhere
// unless the user enables AI and runs an AI action.
(function (A) {
  const U = A.U, M = A.M;
  const AI = (A.AI = {});
  AI.MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5 (best quality)'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (faster)'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5 (fastest, lowest cost)'],
  ];

  AI.settings = () => A.app.settings || {};
  AI.ready = () => !!(AI.settings().apiKey && AI.settings().aiEnabled !== false);

  // Low-level call to the Messages API (direct browser access; the key never leaves this device
  // except to api.anthropic.com).
  AI.call = async ({ system, messages, maxTokens = 8000, effort }) => {
    const s = AI.settings();
    if (!s.apiKey) throw new Error('Add your Anthropic API key in Settings → AI to use AI features.');
    const model = s.model || 'claude-opus-5-5';
    const body = { model, max_tokens: maxTokens, system, messages };
    if (effort || s.effort) body.output_config = { effort: effort || s.effort };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    // Server-side fallback on refusals (not available for Haiku).
    if (!model.includes('haiku')) {
      body.fallbacks = 'default';
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    }
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error('Could not reach the AI service. Check your internet connection.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      if (res.status === 401) throw new Error('The API key was rejected. Check it in Settings → AI.');
      if (res.status === 429) throw new Error('Rate limited by the AI service. Try again shortly.');
      throw new Error('AI error: ' + msg);
    }
    if (data.stop_reason === 'refusal') throw new Error('The AI declined this request' + (data.stop_details?.explanation ? ': ' + data.stop_details.explanation : '.'));
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (data.stop_reason === 'max_tokens' && !text) throw new Error('The AI response was cut off. Try a shorter request.');
    return text;
  };
  AI.ask = (prompt, system, opts = {}) => AI.call({ system, messages: [{ role: 'user', content: prompt }], ...opts });

  AI.json = (text) => {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const src = m ? m[1] : text;
    const a = src.indexOf('{'), b = src.lastIndexOf('}');
    const a2 = src.indexOf('['), b2 = src.lastIndexOf(']');
    const useArr = a2 !== -1 && (a === -1 || a2 < a);
    const s = useArr ? src.slice(a2, b2 + 1) : src.slice(a, b + 1);
    return JSON.parse(s);
  };

  const voice = () => {
    const v = A.app.brand?.voice;
    return v ? `\nBrand voice to follow: ${v}` : '';
  };

  AI.write = (prompt) =>
    AI.ask(prompt, 'You write short, polished copy for visual designs (posters, slides, social posts). Return only the text to place in the design, with no preamble, quotes or markdown.' + voice(), { maxTokens: 2000, effort: 'low' });

  AI.rewrite = (text, how) =>
    AI.ask(`Rewrite this text to be ${how}. Keep the meaning. Return only the rewritten text.\n\n${text}`, 'You edit copy for visual designs. Return only the final text, no quotes or markdown.' + voice(), { maxTokens: 2000, effort: 'low' });

  const FONT_NAMES = M.FONTS.map((f) => f[0]).join(', ');
  const SHAPE_NAMES = M.SHAPES.map((s) => s[0]).join(', ');
  const ELEMENT_SCHEMA = `Element objects (coordinates in px from the top-left of the page):
- {"type":"text","text":"...","x":0,"y":0,"w":400,"size":48,"font":"Inter","color":"#111111","bold":false,"italic":false,"align":"left|center|right","lh":1.3,"spacing":0,"upper":false}
- {"type":"shape","shape":"<one of: ${SHAPE_NAMES}>","x":0,"y":0,"w":200,"h":200,"fill":"#8c52ff","radius":0,"opacity":1,"text":"optional label","size":32,"color":"#ffffff","align":"center"}
- {"type":"line","x1":0,"y1":0,"x2":100,"y2":0,"stroke":"#111111","strokeWidth":4,"end":"none|arrow|triangle|circle"}
- {"type":"icon","icon":"<one of: ${Object.keys(M.ICONS).join(', ')}>","x":0,"y":0,"w":120,"h":120,"fill":"#111111"}
- {"type":"emoji","text":"🎉","x":0,"y":0,"w":120,"h":120}
Fonts available: ${FONT_NAMES}. Colors are hex. Fills may also be gradients written as "grad:#hex1:#hex2:angle".
Optional on any element: "anim":{"in":"fade|rise|pan|pop|zoom|typewriter"}.`;

  AI.toElements = (list = []) =>
    list
      .map((o) => {
        try {
          if (o.type === 'text') {
            const el = M.newText({ ...pick(o, ['text', 'x', 'y', 'w', 'size', 'font', 'color', 'bold', 'italic', 'align', 'lh', 'spacing', 'upper', 'anim', 'opacity', 'rot']) });
            el.h = A.R.textHeight(el);
            return el;
          }
          if (o.type === 'shape') return M.newShape(o.shape || 'rect', pick(o, ['x', 'y', 'w', 'h', 'fill', 'radius', 'opacity', 'stroke', 'strokeWidth', 'text', 'size', 'color', 'align', 'bold', 'font', 'anim', 'rot']));
          if (o.type === 'line') {
            const l = M.newLine({ p1: { x: +o.x1 || 0, y: +o.y1 || 0 }, p2: { x: +o.x2 || 100, y: +o.y2 || 0 }, ...pick(o, ['stroke', 'strokeWidth', 'end', 'start', 'dash']) });
            M.syncLineBox(l);
            return l;
          }
          if (o.type === 'icon' && M.ICONS[o.icon]) return M.newIcon(o.icon, pick(o, ['x', 'y', 'w', 'h', 'fill', 'anim', 'rot', 'opacity']));
          if (o.type === 'emoji') return { ...M.newText(), type: 'emoji', ...pick(o, ['text', 'x', 'y', 'w', 'h', 'anim', 'rot']) };
        } catch (e) {}
        return null;
      })
      .filter(Boolean);
  const pick = (o, keys) => {
    const r = {};
    for (const k of keys) if (o[k] !== undefined) r[k] = o[k];
    return r;
  };

  AI.design = async (prompt, w, h, pages = 1) => {
    const brand = A.app.brand || {};
    const brandInfo = (brand.colors?.length ? `Brand colors: ${brand.colors.join(', ')}. ` : '') + (brand.fonts?.heading ? `Heading font: ${brand.fonts.heading}. Body font: ${brand.fonts.body || brand.fonts.heading}. ` : '');
    const text = await AI.ask(
      `Create a ${pages}-page design (${w}×${h} px each) for: ${prompt}\n${brandInfo}\nReturn JSON: {"title":"...","pages":[{"background":"#hex or grad:...","elements":[...]}]}.\nUse a strong layout with clear hierarchy, generous margins, 4–12 elements per page, and keep everything inside the page.`,
      `You are an expert graphic designer who outputs designs as JSON only.\n${ELEMENT_SCHEMA}` + voice(),
      { maxTokens: 12000 }
    );
    const j = AI.json(text);
    return { title: j.title, pages: (j.pages || []).map((p) => M.newPage({ bg: { color: p.background || '#ffffff' }, elements: AI.toElements(p.elements) })) };
  };

  AI.graphic = async (prompt) => {
    const text = await AI.ask(
      `Draw an SVG illustration of: ${prompt}`,
      'You are an illustrator. Reply with a single self-contained SVG document only (no prose). Use a viewBox, flat shapes and gradients. No scripts, no external images, no fonts, no foreignObject.',
      { maxTokens: 12000 }
    );
    return AI.sanitizeSVG(text);
  };
  AI.sanitizeSVG = (text) => {
    const m = text.match(/<svg[\s\S]*<\/svg>/i);
    if (!m) throw new Error('The AI did not return an SVG graphic.');
    const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('The generated graphic was not valid SVG.');
    doc.querySelectorAll('script,foreignObject,iframe,use[href^="http"],image').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => {
      for (const at of [...n.attributes]) {
        if (/^on/i.test(at.name)) n.removeAttribute(at.name);
        if (/href$/i.test(at.name) && !String(at.value).startsWith('#')) n.removeAttribute(at.name);
      }
    });
    const svg = doc.documentElement;
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const vb = (svg.getAttribute('viewBox') || '0 0 512 512').split(/[\s,]+/).map(Number);
    if (!svg.getAttribute('width')) { svg.setAttribute('width', vb[2] || 512); svg.setAttribute('height', vb[3] || 512); }
    return { svg: new XMLSerializer().serializeToString(svg), w: vb[2] || 512, h: vb[3] || 512 };
  };

  AI.translate = async (strings, lang) => {
    const text = await AI.ask(`Translate each string in this JSON array into ${lang}. Keep line breaks. Return a JSON array of the same length only.\n\n${JSON.stringify(strings)}`, 'You are a professional translator. Output JSON only.', { maxTokens: 16000 });
    const arr = AI.json(text);
    if (!Array.isArray(arr) || arr.length !== strings.length) throw new Error('Translation came back in an unexpected shape. Please try again.');
    return arr;
  };

  AI.miniApp = (prompt) =>
    AI.ask(
      `Build this small interactive widget: ${prompt}`,
      'You build tiny single-file web widgets. Reply with one complete HTML document only (inline CSS and JS, no external resources, no network requests).',
      { maxTokens: 16000 }
    ).then((t) => {
      const m = t.match(/<!doctype html[\s\S]*<\/html>/i) || t.match(/<html[\s\S]*<\/html>/i);
      return m ? m[0] : t.replace(/```html|```/g, '');
    });

  // Assistant that edits the current page through JSON operations.
  AI.assistant = async (history, design, page) => {
    const summary = page.elements.map((e) => {
      const o = { id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) };
      if (e.text) o.text = e.text.slice(0, 200);
      if (e.fill) o.fill = e.fill;
      if (e.color) o.color = e.color;
      if (e.size) o.size = e.size;
      if (e.font) o.font = e.font;
      if (e.shape) o.shape = e.shape;
      return o;
    });
    const system = `You are a design assistant inside a graphic design editor. The user is editing a ${design.width}×${design.height} px page.
Current page background: ${page.bg?.color || '#ffffff'}
Current elements: ${JSON.stringify(summary)}
${ELEMENT_SCHEMA}
Reply with JSON only: {"reply":"short friendly message","ops":[...]} where each op is one of:
{"op":"add","element":{...}} | {"op":"update","id":"...","props":{...}} | {"op":"delete","id":"..."} | {"op":"background","color":"#hex"} | {"op":"addPage","background":"#hex","elements":[...]}
Use an empty ops list if the user only asked a question.` + voice();
    const text = await AI.call({ system, messages: history, maxTokens: 10000 });
    try {
      return AI.json(text);
    } catch (e) {
      return { reply: text, ops: [] };
    }
  };
})(window.A);
