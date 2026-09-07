import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const dataSource = await fs.readFile(new URL('preview-data.js', import.meta.url), 'utf8');
const fixtureSource = await fs.readFile(new URL('preview-fixtures.js', import.meta.url), 'utf8');
function harness(query = '?preview=1', previous = {}) {
  const values = new Map(Object.entries(previous));
  class Storage {
    getItem(key) { return values.get(key) ?? null; }
    setItem(key, value) { values.set(key, String(value)); }
    removeItem(key) { values.delete(key); }
  }
  let requestCount = 0;
  const context = vm.createContext({ URL, Response, DOMException, Storage, AbortController,
    setTimeout, clearTimeout, localStorage: new Storage(),
    location: { href: 'http://127.0.0.1:8763/watchlist/' + query, hostname: '127.0.0.1', origin: 'http://127.0.0.1:8763', pathname: '/watchlist/' },
    history: { replaceState() {} }, navigator: { serviceWorker: { register: async () => {} } },
    fetch: async () => { requestCount++; return new Response('actual request'); } });
  context.window = context;
  vm.runInContext(dataSource, context); vm.runInContext(fixtureSource, context);
  return { context, values, networkCalls: () => requestCount };
}
test('fixture library covers every shelf, long title, missing artwork and a season boundary', () => {
  const h = harness(); const shows = h.context.watchlistPreviewData.shows;
  assert.equal(shows.length, 22);
  assert.deepEqual([...new Set(shows.map(s => s.status))], ['watching', 'plan', 'hold', 'completed']);
  assert.ok(shows.some(s => s.name.length > 80));
  assert.ok(shows.some(s => !s.poster));
  assert.equal(shows[0].currentEpisode, 4);
  assert.equal(shows[0].seasons[1].season, 2);
  assert.equal(new Set(shows.map(s => s.tmdbId)).size, shows.length);
  for (const show of shows) assert.ok(!show.poster || show.poster.startsWith('data:image/svg+xml'));
  const seeded = JSON.parse(h.values.get('wstl_state')).shows;
  assert.equal(seeded[0].poster, 'http://127.0.0.1:8763/__fixtures/poster/0.svg');
  assert.equal(seeded[0].backdrop, seeded[0].poster);
  assert.equal(seeded[3].poster, '');
  assert.equal(h.context.watchlistPreviewData.version, 2);
});
test('fixture boot preserves previously changed preview progress', () => {
  const prior = { wstl_preview_v1: '1', wstl_state: '{"shows":[],"lastSync":"saved"}', wstl_tmdb: 'fixture-key-only' };
  const h = harness('?preview=1', prior);
  assert.equal(h.values.get('wstl_state'), prior.wstl_state);
});
test('setup and empty scenarios use explicit reset without retaining old sample shows', () => {
  for (const scenario of ['setup', 'empty']) {
    const h = harness('?preview=1&reset=1&scenario=' + scenario);
    assert.equal(JSON.parse(h.values.get('wstl_state')).shows.length, 0);
    assert.equal(Boolean(h.values.get('wstl_tmdb')), scenario !== 'setup');
  }
});
test('search, show, seasons and Gist writes are answered locally', async () => {
  const h = harness();
  const search = await h.context.fetch('https://api.themoviedb.org/3/search/tv?query=arrival');
  assert.equal((await search.json()).results[0].name, 'The New Arrival');
  const show = await h.context.fetch('https://api.themoviedb.org/3/tv/999901');
  assert.equal((await show.json()).number_of_episodes, 8);
  const season = await h.context.fetch('https://api.themoviedb.org/3/tv/999901/season/2');
  assert.equal((await season.json()).episodes.length, 4);
  const gist = await h.context.fetch('https://api.github.com/gists', { method: 'POST' });
  assert.equal((await gist.json()).id, 'fixture-gist');
  assert.equal(h.networkCalls(), 0);
});
test('error scenarios distinguish bad key and disconnected network', async () => {
  const key = harness('?preview=1&scenario=key-error');
  assert.equal((await key.context.fetch('https://api.themoviedb.org/3/search/tv?query=test')).status, 401);
  const network = harness('?preview=1&scenario=network-error');
  await assert.rejects(network.context.fetch('https://api.themoviedb.org/3/search/tv?query=test'), /unavailable/);
});
test('aborted superseded searches reject as AbortError', async () => {
  const h = harness('?preview=1&scenario=loading'); const controller = new AbortController();
  const work = h.context.fetch('https://api.themoviedb.org/3/search/tv?query=test', { signal: controller.signal });
  controller.abort(); await assert.rejects(work, error => error.name === 'AbortError');
});
test('unexpected external fetch and service-worker registration are blocked in preview', async () => {
  const h = harness();
  await assert.rejects(h.context.fetch('https://example.net/unexpected'), /blocked/);
  await assert.rejects(h.context.navigator.serviceWorker.register('sw.js'), /disabled/);
  assert.equal(h.networkCalls(), 0);
});
