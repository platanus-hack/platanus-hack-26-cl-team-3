'use strict';

const CACHE = 'capo-ar-shell-__CAPO_AR_BUILD__';
const SHELL = [
  '/detector.js', '/prompts.json', '/runtime/ort.wasm.min.mjs', '/runtime/ort-wasm-simd-threaded.mjs',
  '/runtime/ort-wasm-simd-threaded.wasm', '/runtime/vision.onnx',
  '/', '/app.js', '/styles.css', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
];

self.addEventListener('install', event => {
  const requests = SHELL.map(path => new Request(path, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('capo-ar-shell-') && key !== CACHE)
      .map(key => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname === '/index.html' ? '/' : url.pathname;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin
      || !SHELL.includes(path)) return;
  event.respondWith(caches.open(CACHE)
    .then(cache => cache.match(path))
    .then(response => response ?? fetch(event.request)));
});
