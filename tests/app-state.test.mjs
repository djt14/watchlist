/* Data-level regressions only; interactive behavior is reviewed in the browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('../app.js', import.meta.url), 'utf8')).replace(/\bboot\(\);\s*$/, '');
function harness() {
  const saved = new Map(); let blocked = false;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', className: '', classList: { remove() {} }, setAttribute() {} });
    return elements.get(id);
  };
  const context = vm.createContext({ URL, console, clearTimeout, setTimeout,
    document: { getElementById: element }, location: { href: 'http://127.0.0.1:8763/watchlist/' },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem(key, value) {
      if (blocked) throw new Error('fixture quota failure'); saved.set(key, String(value));
    } }, window: {}, requestAnimationFrame() {} });
  vm.runInContext(source, context);
  vm.runInContext('render = () => {}; refreshDetailIfOpen = () => {}; refreshBackdropPool = () => {}; toast = () => {}; renderDetail = () => {};', context);
  const initial = { shows: [{ tmdbId: 42, name: 'Fixture', status: 'watching', currentSeason: 1, currentEpisode: 0,
    seasons: [{ season: 1, episodes: [{ ep: 1, name: 'One' }, { ep: 2, name: 'Two' }] },
      { season: 2, episodes: [{ ep: 1, name: 'Three' }, { ep: 2, name: 'Four' }] }], rating: null,
    poster: '', backdrop: '', runtime: 24, totalEps: 4 }], lastSync: null };
  vm.runInContext('state = ' + JSON.stringify(initial), context);
  return { saved, elements, run: code => vm.runInContext(code, context), blockWrites() { blocked = true; },
    state: () => JSON.parse(vm.runInContext('JSON.stringify(state)', context)) };
}
test('mark watched crosses seasons and completes only after the final available episode', () => {
  const h = harness();
  h.run('markWatched(state.shows[0]); markWatched(state.shows[0]);');
  assert.equal(h.state().shows[0].currentEpisode, 2);
  assert.equal(h.run('upNext(state.shows[0]).season'), 2);
  h.run('markWatched(state.shows[0]);');
  assert.equal(h.state().shows[0].currentSeason, 2);
  assert.equal(h.state().shows[0].currentEpisode, 1);
  assert.equal(h.state().shows[0].status, 'watching');
  h.run('markWatched(state.shows[0]);');
  assert.equal(h.run('watchedCount(state.shows[0])'), 4);
  assert.equal(h.state().shows[0].status, 'completed');
});
test('step back removes exactly one episode at a season boundary and stops at zero', () => {
  const h = harness(); h.run('setEpisodeTo(state.shows[0], 2, 1); stepBack(state.shows[0]);');
  assert.equal(h.state().shows[0].currentSeason, 1);
  assert.equal(h.state().shows[0].currentEpisode, 2);
  assert.equal(h.run('watchedCount(state.shows[0])'), 2);
  h.run('stepBack(state.shows[0]); stepBack(state.shows[0]); stepBack(state.shows[0]);');
  assert.equal(h.run('watchedCount(state.shows[0])'), 0);
  assert.equal(h.state().shows[0].currentEpisode, 0);
});
test('watched-through selection includes preceding seasons and backtracking reopens completion', () => {
  const h = harness(); h.run('setEpisodeTo(state.shows[0], 2, 2);');
  assert.equal(h.run('watchedCount(state.shows[0])'), 4);
  assert.equal(h.state().shows[0].status, 'completed');
  h.run('stepBack(state.shows[0]);');
  assert.equal(h.state().shows[0].status, 'watching');
  assert.equal(h.run('watchedCount(state.shows[0])'), 3);
});
test('a show with no episode information is not falsely marked complete', () => {
  const h = harness(); h.run('state.shows[0].seasons = []; applyProgressStatus(state.shows[0]); markWatched(state.shows[0]);');
  assert.equal(h.state().shows[0].status, 'watching');
  assert.equal(h.run('episodeText(state.shows[0]).line'), 'No episode data yet');
});
test('rating can be saved and cleared without changing episode progress', () => {
  const h = harness(); h.run('setRating(state.shows[0], 4);'); assert.equal(h.state().shows[0].rating, 4);
  h.run('setRating(state.shows[0], 4);'); assert.equal(h.state().shows[0].rating, null);
  assert.equal(h.run('watchedCount(state.shows[0])'), 0);
});
test('existing storage schema and metadata survive saving and reloading', () => {
  const h = harness(); h.run('state.shows[0].futureCompatibleField = "preserve me"; saveState(false); state = { shows: [], lastSync: null }; loadState();');
  assert.equal(h.state().shows[0].futureCompatibleField, 'preserve me');
  assert.ok(h.saved.has('wstl_state'));
  assert.deepEqual(Object.keys(JSON.parse(h.saved.get('wstl_state'))).sort(), ['lastSync', 'shows']);
});
test('invalid remote duplicate IDs are rejected without replacing the local library', () => {
  const h = harness();
  assert.throws(() => h.run('replaceFromRemote({ shows: [state.shows[0], state.shows[0]], lastSync: null });'), /invalid show/);
  assert.equal(h.state().shows.length, 1);
  assert.equal(h.state().shows[0].tmdbId, 42);
});
test('storage failure rolls back progress and shows an actionable unsaved state', () => {
  const h = harness(); h.run('saveState(false);'); const before = h.saved.get('wstl_state');
  h.blockWrites(); h.run('markWatched(state.shows[0]);');
  assert.equal(h.run('watchedCount(state.shows[0])'), 0);
  assert.equal(h.saved.get('wstl_state'), before);
  assert.equal(h.elements.get('sync-status').textContent, 'Not saved');
  assert.match(h.elements.get('storage-alert').textContent, /last edit was not saved/);
});
test('unreadable stored data is preserved and blocks accidental replacement edits', () => {
  const h = harness(); h.saved.set('wstl_state', '{broken'); h.run('loadState(); markWatched(state.shows[0]);');
  assert.equal(h.saved.get('wstl_state'), '{broken');
  assert.equal(h.run('watchedCount(state.shows[0])'), 0);
});
test('untrusted title characters are escaped and non-HTTP image sources are rejected', () => {
  const h = harness();
  assert.equal(h.run('esc("<img onerror=alert(1)> & \\\"test\\\"")'), '&lt;img onerror=alert(1)&gt; &amp; &quot;test&quot;');
  assert.equal(h.run('imageUrl("javascript:alert(1)")'), '');
  assert.equal(h.run('imageUrl("data:image/svg+xml,<svg/>")'), '');
  assert.equal(h.run('imageUrl("https://image.tmdb.org/t/p/image.jpg")'), 'https://image.tmdb.org/t/p/image.jpg');
});
