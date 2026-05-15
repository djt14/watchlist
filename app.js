/* ===== Wan Shi Tong's Library — app logic ===== */
'use strict';

const TMDB = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p/w342';
const IMG_SM = 'https://image.tmdb.org/t/p/w185';
const GIST_FILE = 'watchlist.json';

const ELEMENT = { watching: 'fire', plan: 'air', hold: 'water', completed: 'earth' };

let creds = { tmdb: '', token: '', gist: '' };
let state = { shows: [], lastSync: null };
let syncTimer = null;

/* ---------- credentials & persistence ---------- */
function loadCreds() {
  creds.tmdb  = localStorage.getItem('wstl_tmdb')  || '';
  creds.token = localStorage.getItem('wstl_token') || '';
  creds.gist  = localStorage.getItem('wstl_gist')  || '';
}
function saveCreds() {
  localStorage.setItem('wstl_tmdb',  creds.tmdb);
  localStorage.setItem('wstl_token', creds.token);
  localStorage.setItem('wstl_gist',  creds.gist);
}
function loadState() {
  try { state = JSON.parse(localStorage.getItem('wstl_state')) || state; }
  catch (e) { /* keep default */ }
}
function saveState(push = true) {
  state.lastSync = new Date().toISOString();
  localStorage.setItem('wstl_state', JSON.stringify(state));
  if (push) scheduleSync();
}

/* ---------- TMDB ---------- */
async function tmdbSearch(query) {
  const url = `${TMDB}/search/tv?api_key=${encodeURIComponent(creds.tmdb)}&query=${encodeURIComponent(query)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('TMDB search failed (' + r.status + ')');
  return (await r.json()).results || [];
}
async function tmdbShow(id) {
  const r = await fetch(`${TMDB}/tv/${id}?api_key=${encodeURIComponent(creds.tmdb)}`);
  if (!r.ok) throw new Error('TMDB show lookup failed');
  return r.json();
}
async function tmdbSeason(id, n) {
  const r = await fetch(`${TMDB}/tv/${id}/season/${n}?api_key=${encodeURIComponent(creds.tmdb)}`);
  if (!r.ok) throw new Error('TMDB season lookup failed');
  return r.json();
}

/* ---------- GitHub Gist sync ---------- */
function ghHeaders() {
  return {
    'Authorization': 'Bearer ' + creds.token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}
async function gistCreate() {
  const r = await fetch('https://api.github.com/gists', {
    method: 'POST', headers: ghHeaders(),
    body: JSON.stringify({
      description: "Wan Shi Tong's Library — watchlist data",
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify(state, null, 2) } }
    })
  });
  if (!r.ok) throw new Error('Could not create library (' + r.status + ')');
  return (await r.json()).id;
}
async function gistPush() {
  if (!creds.token || !creds.gist) return;
  const r = await fetch('https://api.github.com/gists/' + creds.gist, {
    method: 'PATCH', headers: ghHeaders(),
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(state, null, 2) } } })
  });
  if (!r.ok) throw new Error('Push failed (' + r.status + ')');
}
async function gistPull() {
  if (!creds.token || !creds.gist) return null;
  const r = await fetch('https://api.github.com/gists/' + creds.gist, { headers: ghHeaders() });
  if (!r.ok) throw new Error('Pull failed (' + r.status + ')');
  const data = await r.json();
  const file = data.files && data.files[GIST_FILE];
  if (!file || !file.content) return null;
  return JSON.parse(file.content);
}
function scheduleSync() {
  if (!creds.token || !creds.gist) { setSync('local'); return; }
  setSync('busy');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try { await gistPush(); setSync('ok'); }
    catch (e) { setSync('err'); console.error(e); }
  }, 1400);
}
function setSync(s) {
  const el = document.getElementById('sync-status');
  el.className = 'sync-status ' + s;
  el.title = { ok: 'Synced', busy: 'Syncing…', err: 'Sync error — changes saved locally',
               local: 'Local only — no sync token' }[s] || '';
}

/* ---------- episode logic ---------- */
function seasonOf(show, n) { return show.seasons.find(s => s.season === n); }

function upNext(show) {
  const s = seasonOf(show, show.currentSeason);
  if (!s) return null;
  if (show.currentEpisode < s.episodes.length) {
    const ep = show.currentEpisode + 1;
    return { season: show.currentSeason, ep, name: s.episodes[ep - 1] ? s.episodes[ep - 1].name : '' };
  }
  const next = show.seasons
    .filter(x => x.season > show.currentSeason && x.episodes.length)
    .sort((a, b) => a.season - b.season)[0];
  if (next) return { season: next.season, ep: 1, name: next.episodes[0] ? next.episodes[0].name : '' };
  return null;
}
function totalEpisodes(show) { return show.seasons.reduce((t, s) => t + s.episodes.length, 0); }
function watchedCount(show) {
  let c = 0;
  for (const s of show.seasons) {
    if (s.season < show.currentSeason) c += s.episodes.length;
    else if (s.season === show.currentSeason) c += show.currentEpisode;
  }
  return c;
}
function episodeText(show) {
  const next = upNext(show);
  const total = totalEpisodes(show);
  if (show.currentEpisode === 0 && next)
    return { line: 'Not started',
      name: 'Up next: S' + next.season + ' · E' + next.ep + (next.name ? ' — ' + next.name : '') };
  if (next)
    return { line: 'Watched: S' + show.currentSeason + ' · E' + show.currentEpisode,
      name: 'Up next: S' + next.season + ' · E' + next.ep + (next.name ? ' — ' + next.name : '') };
  return { line: 'Series complete', name: 'All ' + total + ' episodes watched' };
}
function markWatched(show) {
  const n = upNext(show);
  if (!n) return;
  const wasStatus = show.status;
  const wasFirst = watchedCount(show) === 0;
  show.currentSeason = n.season;
  show.currentEpisode = n.ep;
  show.updatedAt = new Date().toISOString();
  if (!upNext(show)) show.status = 'completed';
  else if (show.status === 'completed') show.status = 'watching';
  saveState();
  if (show.status !== wasStatus || wasFirst) render();
  else updateCardInPlace(show);
}
function stepBack(show) {
  const wasStatus = show.status;
  if (show.currentEpisode > 0) {
    show.currentEpisode--;
  } else {
    const prev = show.seasons
      .filter(x => x.season < show.currentSeason && x.episodes.length)
      .sort((a, b) => b.season - a.season)[0];
    if (prev) { show.currentSeason = prev.season; show.currentEpisode = prev.episodes.length; }
  }
  if (show.status === 'completed') show.status = 'watching';
  show.updatedAt = new Date().toISOString();
  saveState();
  if (show.status !== wasStatus || watchedCount(show) === 0) render();
  else updateCardInPlace(show);
}

/* ---------- mutations ---------- */
async function addShow(tmdbId) {
  if (state.shows.some(s => s.tmdbId === tmdbId)) { alert('That show is already in your library.'); return; }
  setSync('busy');
  try {
    const info = await tmdbShow(tmdbId);
    const realSeasons = (info.seasons || []).filter(s => s.season_number >= 1 && s.episode_count > 0);
    const seasons = [];
    for (const s of realSeasons) {
      const sd = await tmdbSeason(tmdbId, s.season_number);
      seasons.push({
        season: s.season_number,
        episodes: (sd.episodes || []).map(e => ({ ep: e.episode_number, name: e.name || '' }))
      });
    }
    seasons.sort((a, b) => a.season - b.season);
    state.shows.push({
      tmdbId,
      name: info.name,
      poster: info.poster_path ? IMG + info.poster_path : '',
      status: 'watching',
      currentSeason: seasons.length ? seasons[0].season : 1,
      currentEpisode: 0,
      seasons,
      rating: null,
      updatedAt: new Date().toISOString()
    });
    saveState(); render();
    setSync(creds.gist ? 'ok' : 'local');
  } catch (e) {
    setSync('err'); alert('Could not add show: ' + e.message);
  }
}
function moveStatus(show, status) {
  show.status = status;
  show.updatedAt = new Date().toISOString();
  saveState(); render();
}
function removeShow(show) {
  if (!confirm('Remove "' + show.name + '" from your library?')) return;
  state.shows = state.shows.filter(s => s !== show);
  saveState(); render();
}
function setRating(show, n) {
  show.rating = (show.rating === n) ? null : n;
  show.updatedAt = new Date().toISOString();
  saveState(); render();
}

/* ---------- rendering ---------- */
function render() {
  for (const status of Object.keys(ELEMENT)) {
    const lane = document.getElementById('lane-' + status);
    const shows = state.shows.filter(s => s.status === status);
    lane.innerHTML = '';
    if (!shows.length) {
      const d = document.createElement('div');
      d.className = 'shelf-empty';
      d.textContent = { watching: 'Nothing being watched yet — search above.',
        plan: 'No scrolls waiting.', hold: 'Nothing frozen.',
        completed: 'No shows mastered yet.' }[status];
      lane.appendChild(d);
      continue;
    }
    shows.forEach((show, i) => lane.appendChild(renderCard(show, i)));
  }
}

function renderCard(show, idx) {
  const el = ELEMENT[show.status];
  const card = document.createElement('div');
  card.className = 'card el-' + el + (show.status === 'completed' ? ' done' : '');
  card.dataset.id = show.tmdbId;
  card.style.animationDelay = ((idx || 0) * 0.05) + 's';

  const next = upNext(show);
  const total = totalEpisodes(show);
  const done = watchedCount(show);
  const pct = total ? Math.round(done / total * 100) : 0;
  const et = episodeText(show);
  const epLine = et.line, epName = et.name;

  const poster = show.poster
    ? `<img class="poster" src="${show.poster}" alt="" loading="lazy">`
    : `<div class="poster"></div>`;

  card.innerHTML = `
    ${poster}
    <div class="body">
      <div class="show-name">${esc(show.name)}</div>
      <div class="ep-line">${esc(epLine)}</div>
      <div class="ep-name">${esc(epName)}</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="count">${done} / ${total} episodes${show.status === 'completed' ? ' · mastered' : ''}</div>
      <div class="card-actions"></div>
    </div>`;

  const actions = card.querySelector('.card-actions');

  if (next) {
    const nb = mkBtn('▶ Watched This', 'btn btn-' +
      ({ fire: 'fire', air: 'air', water: 'water', earth: 'earth' }[el]) + ' next-btn');
    nb.onclick = () => { bendPress(nb); markWatched(show); };
    actions.appendChild(nb);
  }
  if (done > 0) {
    const back = mkBtn('◀', 'mini');
    back.title = 'Step back one episode';
    back.onclick = () => { bendPress(back); stepBack(show); };
    actions.appendChild(back);
  }

  // status moves
  const moves = [
    ['watching', 'Watching'], ['plan', 'Plan'], ['hold', 'Hold'], ['completed', 'Done']
  ].filter(([s]) => s !== show.status);
  moves.forEach(([s, label]) => {
    const b = mkBtn(label, 'mini');
    b.onclick = () => moveStatus(show, s);
    actions.appendChild(b);
  });

  const del = mkBtn('✕', 'mini');
  del.title = 'Remove from library';
  del.onclick = () => removeShow(show);
  actions.appendChild(del);

  if (show.status === 'completed') {
    const stars = document.createElement('div');
    stars.className = 'stars';
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      if (!show.rating || i > show.rating) s.className = 'off';
      s.onclick = () => setRating(show, i);
      stars.appendChild(s);
    }
    card.querySelector('.body').insertBefore(stars, actions);
  }
  return card;
}

function mkBtn(label, cls) {
  const b = document.createElement('button');
  b.className = cls; b.textContent = label;
  return b;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* in-place card update — animates progress without a full re-render */
function updateCardInPlace(show) {
  const card = document.querySelector('.card[data-id="' + show.tmdbId + '"]');
  if (!card) { render(); return; }
  const t = episodeText(show);
  const total = totalEpisodes(show);
  const done = watchedCount(show);
  const pct = total ? Math.round(done / total * 100) : 0;
  card.querySelector('.ep-line').textContent = t.line;
  card.querySelector('.ep-name').textContent = t.name;
  card.querySelector('.progress > i').style.width = pct + '%';
  card.querySelector('.count').textContent = done + ' / ' + total + ' episodes';
  animatePop(card);
}
function animatePop(card) {
  card.animate(
    [ { transform: 'scale(1)',    boxShadow: '0 4px 12px rgba(50,30,5,0.22)' },
      { transform: 'scale(1.035)', boxShadow: '0 0 28px rgba(230,126,34,0.75)', offset: 0.35 },
      { transform: 'scale(1)',    boxShadow: '0 4px 12px rgba(50,30,5,0.22)' } ],
    { duration: 480, easing: 'ease-out' }
  );
}
function bendPress(btn) {
  btn.animate(
    [ { transform: 'scale(1)',    filter: 'brightness(1)' },
      { transform: 'scale(1.14)', filter: 'brightness(1.45)', offset: 0.4 },
      { transform: 'scale(1)',    filter: 'brightness(1)' } ],
    { duration: 330, easing: 'cubic-bezier(0.34,1.56,0.64,1)' }
  );
}

/* ---------- search UI ---------- */
let searchTimer = null;
function initSearch() {
  const input = document.getElementById('search');
  const box = document.getElementById('results');
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { box.classList.add('hidden'); return; }
    searchTimer = setTimeout(() => runSearch(q), 380);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) box.classList.add('hidden');
  });
}
async function runSearch(q) {
  const box = document.getElementById('results');
  box.classList.remove('hidden');
  box.innerHTML = '<div class="empty">Consulting the archives…</div>';
  try {
    const results = await tmdbSearch(q);
    if (!results.length) { box.innerHTML = '<div class="empty">No shows found.</div>'; return; }
    box.innerHTML = '';
    results.slice(0, 8).forEach(r => {
      const row = document.createElement('div');
      row.className = 'result';
      const year = r.first_air_date ? r.first_air_date.slice(0, 4) : '—';
      row.innerHTML = `
        ${r.poster_path ? `<img src="${IMG_SM + r.poster_path}" alt="">` : '<img alt="">'}
        <div><div class="r-name">${esc(r.name)}</div><div class="r-year">${year}</div></div>`;
      row.onclick = () => {
        box.classList.add('hidden');
        document.getElementById('search').value = '';
        addShow(r.id);
      };
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = '<div class="empty">Search failed — check your TMDB key in Settings.</div>';
  }
}

/* ---------- setup & settings ---------- */
function showSetup() { document.getElementById('setup').classList.remove('hidden'); }
function hideSetup() { document.getElementById('setup').classList.add('hidden'); }

function initSetup() {
  document.getElementById('btn-setup').onclick = async () => {
    const msg = document.getElementById('setup-msg');
    const tmdb = document.getElementById('in-tmdb').value.trim();
    const token = document.getElementById('in-token').value.trim();
    const gist = document.getElementById('in-gist').value.trim();
    if (!tmdb) { msg.className = 'msg err'; msg.textContent = 'A TMDB key is required.'; return; }
    creds.tmdb = tmdb; creds.token = token; creds.gist = gist;
    msg.className = 'msg'; msg.textContent = 'Opening the library…';
    try {
      if (token && gist) {
        const remote = await gistPull();
        if (remote) state = remote;
      } else if (token && !gist) {
        creds.gist = await gistCreate();
      }
      saveCreds(); saveState(false); hideSetup();
      setSync(creds.gist ? 'ok' : 'local');
      render();
    } catch (e) {
      msg.className = 'msg err'; msg.textContent = e.message;
    }
  };
}

function initSettings() {
  const panel = document.getElementById('settings');
  document.getElementById('btn-settings').onclick = () => {
    document.getElementById('set-gist').value = creds.gist || '(none — add a token to enable sync)';
    document.getElementById('set-tmdb').value = creds.tmdb;
    document.getElementById('set-token').value = creds.token;
    document.getElementById('settings-msg').textContent = '';
    panel.classList.remove('hidden');
  };
  document.getElementById('btn-close-settings').onclick = () => panel.classList.add('hidden');
  document.getElementById('btn-save-settings').onclick = async () => {
    const msg = document.getElementById('settings-msg');
    creds.tmdb = document.getElementById('set-tmdb').value.trim();
    creds.token = document.getElementById('set-token').value.trim();
    try {
      if (creds.token && !creds.gist) {
        creds.gist = await gistCreate();
        document.getElementById('set-gist').value = creds.gist;
      }
      saveCreds();
      msg.className = 'msg ok'; msg.textContent = 'Saved.';
      setSync(creds.gist ? 'ok' : 'local');
    } catch (e) {
      msg.className = 'msg err'; msg.textContent = e.message;
    }
  };
  document.getElementById('btn-pull').onclick = async () => {
    const msg = document.getElementById('settings-msg');
    try {
      const remote = await gistPull();
      if (remote) { state = remote; saveState(false); render(); }
      msg.className = 'msg ok'; msg.textContent = 'Synced from the cloud.';
    } catch (e) {
      msg.className = 'msg err'; msg.textContent = e.message;
    }
  };
}

/* ---------- boot ---------- */
async function boot() {
  loadCreds(); loadState();
  initSearch(); initSetup(); initSettings();
  render();

  if (!creds.tmdb) { showSetup(); }
  else { setSync(creds.gist ? 'ok' : 'local'); }

  // pull latest on load if synced
  if (creds.token && creds.gist) {
    try {
      const remote = await gistPull();
      if (remote) { state = remote; localStorage.setItem('wstl_state', JSON.stringify(state)); render(); }
      setSync('ok');
    } catch (e) { setSync('err'); }
  }
  // refresh when the tab regains focus
  window.addEventListener('focus', async () => {
    if (!creds.token || !creds.gist) return;
    try {
      const remote = await gistPull();
      if (remote) { state = remote; localStorage.setItem('wstl_state', JSON.stringify(state)); render(); }
      setSync('ok');
    } catch (e) { setSync('err'); }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
