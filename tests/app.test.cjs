// Repeatable application-logic checks. No network, user keys, or browser storage.
// Run from the repository folder: node --test tests/app.test.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
// Evaluate actual production functions without booting their browser UI.
assert.match(source, /\nboot\(\);\s*$/);
const logic = source.replace(/\nboot\(\);\s*$/, '');

function harness() {
  const saved = new Map();
  const context = vm.createContext({
    console, URL, AbortController,
    location: { href: 'http://127.0.0.1:8763/watchlist/' },
    document: { getElementById() { return null; } },
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    setTimeout() { throw new Error('Unexpected scheduled work in isolated logic check'); },
    clearTimeout() {}
  });
  vm.runInContext(logic, context);
  const run = code => vm.runInContext(code, context);
  run(`
    const productionRefreshDetail = refreshDetailIfOpen;
    render = () => {};
    refreshDetailIfOpen = () => {};
    toast = () => {};
    const fixture = {
      tmdbId: 1, name: 'Fictional show', status: 'watching',
      currentSeason: 1, currentEpisode: 0,
      seasons: [
        { season: 1, episodes: [{ ep: 1, name: 'One' }, { ep: 2, name: 'Two' }] },
        { season: 2, episodes: [{ ep: 1, name: 'Three' }, { ep: 2, name: 'Four' }] }
      ]
    };
    state = { shows: [fixture], lastSync: null };
  `);
  return { run, saved };
}

test('watched-through progress traverses seasons and steps back exactly one episode', () => {
  const { run } = harness();
  assert.equal(run('watchedCount(fixture)'), 0);
  run('markWatched(fixture); markWatched(fixture)');
  assert.equal(run('upNext(fixture).season'), 2);
  assert.equal(run('upNext(fixture).ep'), 1);
  run('markWatched(fixture)');
  assert.equal(run('watchedCount(fixture)'), 3);
  run('stepBack(fixture)');
  assert.equal(run('fixture.currentSeason'), 1);
  assert.equal(run('fixture.currentEpisode'), 2);
  assert.equal(run('watchedCount(fixture)'), 2);
});

test('completion and selecting earlier episodes retain sequential semantics', () => {
  const { run } = harness();
  run('setEpisodeTo(fixture, 2, 2)');
  assert.equal(run('fixture.status'), 'completed');
  assert.equal(run('upNext(fixture)'), null);
  run('stepBack(fixture)');
  assert.equal(run('fixture.status'), 'watching');
  assert.equal(run('watchedCount(fixture)'), 3);
  run('setEpisodeTo(fixture, 1, 1)');
  assert.equal(run('watchedCount(fixture)'), 1);
  run('stepBack(fixture)');
  assert.equal(run('watchedCount(fixture)'), 0);
  assert.equal(run('upNext(fixture).ep'), 1);
});

test('existing payload shape is accepted while duplicate IDs and unsafe content are rejected', () => {
  const { run } = harness();
  assert.throws(() => run('validateState({ shows: [fixture, fixture] })'));
  assert.equal(run(`esc('<img src="x" onerror="boom">')`), '&lt;img src=&quot;x&quot; onerror=&quot;boom&quot;&gt;');
  assert.equal(run(`imageUrl('javascript:alert(1)')`), '');
  assert.equal(run('validateState({ shows: [fixture] }).shows[0].name'), 'Fictional show');
});

test('a rejected storage write rolls back the edit and keeps the saved episode position', () => {
  const { run, saved } = harness();
  run('saveState(false)');
  run(`localStorage.setItem = () => { throw new Error('simulated quota failure'); };`);
  run('markWatched(fixture)');
  assert.equal(run('watchedCount(state.shows[0])'), 0);
  assert.equal(run('storageFailed'), true);
  assert.equal(JSON.parse(saved.get('wstl_state')).shows[0].currentEpisode, 0);
});

test('a pull started before a local edit cannot replace that newer edit', () => {
  const { run } = harness();
  run('const pullRevision = localRevision; const olderRemote = JSON.parse(JSON.stringify(state));');
  run('markWatched(fixture)');
  assert.equal(run('localRevision'), 1);
  assert.equal(run('applyPulledState(olderRemote, pullRevision)'), false);
  assert.equal(run('watchedCount(state.shows[0])'), 1);
  assert.equal(run('Object.hasOwn(state, "localRevision")'), false, 'revision is not added to the saved payload');
});

test('an in-flight push blocks applying a pull until the push settles', async () => {
  const { run } = harness();
  run(`
    creds.token = 'synthetic-token'; creds.gist = 'abc123';
    let completePush;
    fetch = () => new Promise(resolve => { completePush = resolve; });
    const pendingPush = gistPush();
  `);
  assert.equal(run('inFlightPushes'), 1);
  assert.equal(run('applyPulledState(JSON.parse(JSON.stringify(state)), localRevision)'), false);
  run('completePush({ok: true})');
  await run('pendingPush');
  assert.equal(run('inFlightPushes'), 0);
});

test('a failed push clears its in-flight guard', async () => {
  const { run } = harness();
  run(`creds.token = 'synthetic-token'; creds.gist = 'abc123'; fetch = async () => ({ok:false, status:503});`);
  await assert.rejects(run('gistPush()'), /GitHub could not complete/);
  assert.equal(run('inFlightPushes'), 0);
});

test('refresh after storage rollback resolves the current show and clears its busy state', async () => {
  const { run } = harness();
  run(`
    saveState(false);
    detailShowId = fixture.tmdbId;
    refreshDetailIfOpen = productionRefreshDetail;
    const detailRenders = [];
    renderDetail = show => detailRenders.push({ name:show.name, busy:refreshing.has(show.tmdbId), current:state.shows.includes(show) });
    tmdbShow = async () => ({name:'Updated title', overview:'Updated overview', number_of_episodes:4, episode_run_time:[25]});
    fetchSeasons = async () => fixture.seasons;
    localStorage.setItem = () => { throw new Error('simulated quota failure'); };
  `);
  await run('refreshShowData(fixture)');
  assert.equal(run('state.shows[0].name'), 'Fictional show');
  assert.equal(run('detailRenders.at(-1).name'), 'Fictional show');
  assert.equal(run('detailRenders.at(-1).busy'), false);
  assert.equal(run('detailRenders.at(-1).current'), true);
});
