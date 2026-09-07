/* Injected by tests/server.mjs only on an explicit ?preview=1 page. */
(function () {
  'use strict';
  const params = new URL(location.href).searchParams;
  if (params.get('preview') !== '1' || !['127.0.0.1', 'localhost'].includes(location.hostname)) return;
  const fixture = window.watchlistPreviewData;
  let scenario = params.get('scenario') || 'populated';
  const marker = 'wstl_preview_v1';
  // Keep the original marker so preview work is never reset by a fixture update.
  // An explicit reset upgrades existing artwork to safe same-origin HTTP URLs.
  const seededShows = fixture.shows.map((show, index) => ({ ...show,
    poster: show.poster ? location.origin + '/__fixtures/poster/' + index + '.svg' : '',
    backdrop: show.backdrop ? location.origin + '/__fixtures/poster/' + index + '.svg' : '' }));
  const keys = ['wstl_tmdb', 'wstl_token', 'wstl_gist', 'wstl_state', 'wstl_epcheck', 'wstl_bg', 'wstl_motion'];
  if (params.get('reset') === '1' || !localStorage.getItem(marker)) {
    keys.forEach(key => localStorage.removeItem(key));
    localStorage.setItem('wstl_tmdb', scenario === 'setup' ? '' : 'fixture-key-only');
    localStorage.setItem('wstl_state', JSON.stringify({ shows: ['setup', 'empty'].includes(scenario) ? [] : seededShows, lastSync: null }));
    localStorage.setItem('wstl_epcheck', String(Date.now()));
    localStorage.setItem(marker, '1');
    // Refresh preserves work. Reset is deliberately a one-shot URL flag.
    params.delete('reset');
    history.replaceState(null, '', location.pathname + '?' + params.toString());
  }
  const requests = [];
  const blockedRequests = [];
  const originalFetch = window.fetch.bind(window);
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
  }
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const signal = options.signal || (typeof input === 'string' ? undefined : input.signal);
    const method = options.method || (typeof input !== 'string' && input.method) || 'GET';
    if (url.hostname === 'api.themoviedb.org' || url.hostname === 'api.github.com') {
      requests.push({ path: url.pathname, method, query: url.searchParams.get('query') || '', time: Date.now() });
      await delay(scenario === 'loading' ? 4000 : 180, signal);
      if (scenario === 'network-error') throw new TypeError('Fixture network unavailable');
      if (scenario === 'key-error') return response({ status_message: 'Invalid API key.' }, 401);
      if (url.hostname === 'api.github.com') {
        if (scenario === 'sync-error') return response({ message: 'Fixture sync failure' }, 503);
        const saved = localStorage.getItem('wstl_state') || '{"shows":[],"lastSync":null}';
        return response({ id: 'fixture-gist', files: { 'watchlist.json': { content: saved } } });
      }
      if (url.pathname.endsWith('/configuration')) return response({ images: { secure_base_url: 'https://image.tmdb.org/t/p/' } });
      const all = fixture.shows.concat(fixture.searchAddition);
      if (url.pathname.endsWith('/search/tv')) {
        const query = (url.searchParams.get('query') || '').toLowerCase();
        const matches = query === 'none' ? [] : all.filter(show => show.name.toLowerCase().includes(query) || query === 'test');
        return response({ results: matches.map(show => ({ id: show.tmdbId, name: show.name, poster_path: null, first_air_date: '2026-01-01' })) });
      }
      const match = url.pathname.match(/\/tv\/(\d+)(?:\/season\/(\d+))?$/);
      if (match) {
        const show = all.find(item => item.tmdbId === Number(match[1])) || fixture.searchAddition;
        if (match[2]) return response({ episodes: (show.seasons.find(s => s.season === Number(match[2]))?.episodes || [])
          .map(ep => ({ episode_number: ep.ep, name: ep.name })) });
        return response({ id: show.tmdbId, name: show.name, poster_path: null, backdrop_path: null,
          overview: show.overview, episode_run_time: [show.runtime], number_of_episodes: show.totalEps,
          seasons: show.seasons.map(s => ({ season_number: s.season, episode_count: s.episodes.length })) });
      }
      return response({ success: true });
    }
    if (url.origin !== location.origin) {
      blockedRequests.push({ origin: url.origin, path: url.pathname, method });
      throw new TypeError('External fetch blocked in isolated preview');
    }
    return originalFetch(input, options);
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register = async () => { throw new Error('Service worker disabled for isolated fixture preview'); };
  }
  const nativeSetItem = Storage.prototype.setItem;
  if (scenario === 'storage-error') Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('wstl_')) throw new DOMException('Fixture storage quota exhausted', 'QuotaExceededError');
    return nativeSetItem.call(this, key, value);
  };
  window.watchlistPreview = Object.freeze({ requests, blockedRequests, get scenario() { return scenario; },
    setScenario(value) { scenario = value; }, fixtureVersion: fixture.version });
})();
