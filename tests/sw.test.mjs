import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://example.test/watchlist/';
function harness() {
  const listeners = {}, cacheMaps = new Map(), deleted = [], added = [];
  let network = async () => new Response('online');
  const keyOf = request => typeof request === 'string' ? request : request.url;
  const caches = {
    keys: async () => [...cacheMaps.keys()],
    delete: async key => { deleted.push(key); return cacheMaps.delete(key); },
    open: async name => {
      if (!cacheMaps.has(name)) cacheMaps.set(name, new Map());
      const map = cacheMaps.get(name);
      return {
        addAll: async files => { added.push(...files); for (const file of files) map.set(file, new Response('shell:' + file)); },
        put: async (request, response) => map.set(keyOf(request), response.clone()),
        match: async request => map.get(keyOf(request))?.clone()
      };
    }
  };
  const context = vm.createContext({ URL, Response, caches, fetch: request => network(request),
    self: { registration: { scope }, addEventListener: (name, callback) => listeners[name] = callback,
      skipWaiting: async () => {}, clients: { claim: async () => {} } } });
  vm.runInContext(source, context);
  return { cacheMaps, caches, deleted, added, setNetwork(callback) { network = callback; },
    async dispatch(name, request) {
      const waits = [];
      let result;
      const event = { request, waitUntil: p => waits.push(p), respondWith: p => result = p };
      listeners[name](event);
      const response = await result;
      await Promise.all(waits);
      return response;
    } };
}
const request = (path, extra = {}) => ({ url: new URL(path, scope).href, method: 'GET', mode: 'cors', ...extra });

test('install includes the living-library shell with absolute scoped URLs', async () => {
  const h = harness(); await h.dispatch('install');
  for (const path of ['index.html', 'library-scene.css', 'library-scene.js', 'assets/library-interior.svg',
    'fonts.css', 'assets/fonts/cinzel-latin-variable.woff2', 'assets/fonts/inter-latin-variable.woff2'])
    assert.ok(h.added.includes(scope + path), path);
  assert.ok(h.added.every(url => url.startsWith(scope)));
});
test('activation removes only older watchlist caches', async () => {
  const h = harness();
  for (const name of ['wstl-v6', 'another-app-v1', 'wstl-v7-library']) await h.caches.open(name);
  await h.dispatch('activate');
  assert.deepEqual(h.deleted, ['wstl-v6']);
  assert.ok(h.cacheMaps.has('another-app-v1'));
});
test('fetch ignores writes, APIs, other origins, and sibling app paths', async () => {
  const h = harness();
  for (const req of [request('app.js', { method: 'POST' }), request('https://api.themoviedb.org/3/search/tv'),
    request('https://api.github.com/gists/fixture'), request('https://image.tmdb.org/t/p/poster.jpg'),
    request('/elsewhere/index.html'), request('/watchlist-copy/app.js'), request('/__fixtures/poster/0.svg')])
    assert.equal(await h.dispatch('fetch', req), undefined, req.url);
});
test('successful same-origin network response updates cache', async () => {
  const h = harness(); h.setNetwork(async () => new Response('fresh'));
  assert.equal(await (await h.dispatch('fetch', request('app.js'))).text(), 'fresh');
  const cache = await h.caches.open('wstl-v7-library');
  assert.equal(await (await cache.match(scope + 'app.js')).text(), 'fresh');
});
test('HTTP errors and partial responses never overwrite an offline asset', async () => {
  const h = harness(); const cache = await h.caches.open('wstl-v7-library');
  await cache.put(scope + 'app.js', new Response('known good'));
  for (const status of [206, 404, 500]) {
    h.setNetwork(async () => new Response('bad replacement', { status }));
    assert.equal((await h.dispatch('fetch', request('app.js'))).status, status);
    assert.equal(await (await cache.match(scope + 'app.js')).text(), 'known good');
  }
});
test('offline asset returns exact cached response', async () => {
  const h = harness(); const cache = await h.caches.open('wstl-v7-library');
  await cache.put(scope + 'style.css', new Response('body{}', { headers: { 'Content-Type': 'text/css' } }));
  h.setNetwork(async () => { throw new TypeError('offline'); });
  const res = await h.dispatch('fetch', request('style.css'));
  assert.equal(res.headers.get('Content-Type'), 'text/css');
  assert.equal(await res.text(), 'body{}');
});
test('offline navigation falls back to the app index', async () => {
  const h = harness(); const cache = await h.caches.open('wstl-v7-library');
  await cache.put(scope + 'index.html', new Response('<main>Library</main>'));
  h.setNetwork(async () => { throw new TypeError('offline'); });
  assert.equal(await (await h.dispatch('fetch', request('?restored=1', { mode: 'navigate' }))).text(), '<main>Library</main>');
});
test('missing images and scripts never receive HTML fallback', async () => {
  const h = harness(); const cache = await h.caches.open('wstl-v7-library');
  await cache.put(scope + 'index.html', new Response('<main>Library</main>'));
  h.setNetwork(async () => { throw new TypeError('offline'); });
  for (const path of ['missing.png', 'missing.js', 'missing.css'])
    assert.equal((await h.dispatch('fetch', request(path))).type, 'error');
});
test('cache quota failure does not reject a successful online response', async () => {
  const h = harness(); h.caches.open = async () => { throw new Error('quota'); };
  assert.equal(await (await h.dispatch('fetch', request('app.js'))).text(), 'online');
});
