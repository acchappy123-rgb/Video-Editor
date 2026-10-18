// Offline cache for the web/PWA build. Bump VERSION when files change.
const VERSION = 'atelier-v1.0.2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/util.js', 'js/store.js', 'js/model.js', 'js/render.js', 'js/templates.js', 'js/export.js', 'js/video.js', 'js/imagetools.js', 'js/ai.js',
  'js/editor.js', 'js/editor-ui.js', 'js/panels.js', 'js/present.js', 'js/home.js', 'js/app.js',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
