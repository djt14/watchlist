/* Wan Shi Tong's Library — own-scope network-first shell cache. */
'use strict';
const CACHE_PREFIX = 'wstl-';
const CACHE = 'wstl-v7-library';
const SCOPE = new URL(self.registration.scope);
const SHELL = ['./', 'index.html', 'fonts.css', 'style.css', 'app.js', 'library-scene.css',
  'library-scene.js', 'manifest.json', 'icon.svg', 'assets/library-interior.svg',
  'assets/fonts/cinzel-latin-variable.woff2', 'assets/fonts/inter-latin-variable.woff2']
  .map(path => new URL(path, SCOPE).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Do not intercept API traffic, writes, or another application on this origin.
  if (request.method !== 'GET' || url.origin !== SCOPE.origin ||
      !url.pathname.startsWith(SCOPE.pathname)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      // Errors and opaque/cross-origin responses must not replace good offline assets.
      if (response.status === 200 && ['basic', 'default'].includes(response.type) &&
          (!response.url || new URL(response.url).origin === SCOPE.origin)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy))
          .catch(() => { /* Cache failures must not break an online response. */ }));
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const page = await cache.match(new URL('index.html', SCOPE).href);
        if (page) return page;
      }
      // Never serve HTML as an image, stylesheet, or script.
      return Response.error();
    }
  })());
});
