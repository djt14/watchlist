/* ===== Wan Shi Tong's Library — app logic ===== */
'use strict';

const TMDB = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p/w342';
const IMG_SM = 'https://image.tmdb.org/t/p/w185';
const IMG_BD = 'https://image.tmdb.org/t/p/w1280';
const GIST_FILE = 'watchlist.json';

const ELEMENT = { watching: 'fire', plan: 'air', hold: 'water', completed: 'earth' };
const STATUS_LABEL = { watching: 'Now Watching', plan: 'Scrolls to Unroll', hold: 'Frozen in Time', completed: 'Mastered' };
const EP_CHECK_KEY = 'wstl_epcheck';
const BG_KEY = 'wstl_bg';

let creds = { tmdb: '', token: '', gist: '' };
let state = { shows: [], lastSync: null };
let syncTimer = null;
let detailShowId = null;

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
async function fetchSeasons(tmdbId, info) {
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
  return seasons;
}
function extraFields(info) {
  return {
    backdrop: info.backdrop_path ? IMG_BD + info.backdrop_path : '',
    overview: info.overview || '',
    runtime: (info.episode_run_time && info.episode_run_time.length)
      ? Math.round(info.episode_run_time.reduce((a, b) => a + b, 0) / info.episode_run_time.length)
      : 40,
    totalEps: info.number_of_episodes || 0
  };
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
  if (show.currentEpisode === 0 && watchedCount(show) === 0 && next)
    return { line: 'Not started',
      name: 'Up next: S' + next.season + ' · E' + next.ep + (next.name ? ' — ' + next.name : '') };
  if (next)
    return { line: 'Watched: S' + show.currentSeason + ' · E' + show.currentEpisode,
      name: 'Up next: S' + next.season + ' · E' + next.ep + (next.name ? ' — ' + next.name : '') };
  return { line: 'Series complete', name: 'All ' + total + ' episodes watched' };
}
function applyProgressStatus(show) {
  if (!upNext(show)) show.status = 'completed';
  else if (show.status === 'completed') show.status = 'watching';
}
function markWatched(show) {
  const n = upNext(show);
  if (!n) return;
  const wasStatus = show.status;
  const wasFirst = watchedCount(show) === 0;
  show.currentSeason = n.season;
  show.currentEpisode = n.ep;
  show.updatedAt = new Date().toISOString();
  applyProgressStatus(show);
  saveState();
  if (show.status !== wasStatus || wasFirst) render();
  else updateCardInPlace(show);
  refreshDetailIfOpen(show);
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
  refreshDetailIfOpen(show);
}
function setEpisodeTo(show, season, ep) {
  show.currentSeason = season;
  show.currentEpisode = ep;
  show.updatedAt = new Date().toISOString();
  applyProgressStatus(show);
  saveState();
  render();
  refreshDetailIfOpen(show);
}

/* ---------- mutations ---------- */
async function addShow(tmdbId) {
  if (state.shows.some(s => s.tmdbId === tmdbId)) { toast('That show is already in your library.', true); return; }
  setSync('busy');
  try {
    const info = await tmdbShow(tmdbId);
    const seasons = await fetchSeasons(tmdbId, info);
    state.shows.push(Object.assign({
      tmdbId,
      name: info.name,
      poster: info.poster_path ? IMG + info.poster_path : '',
      status: 'watching',
      currentSeason: seasons.length ? seasons[0].season : 1,
      currentEpisode: 0,
      seasons,
      rating: null,
      hasNew: false,
      updatedAt: new Date().toISOString()
    }, extraFields(info)));
    saveState(); render();
    setSync(creds.gist ? 'ok' : 'local');
    toast('"' + info.name + '" added to your library.');
    refreshBackdropPool();
  } catch (e) {
    setSync('err'); toast('Could not add show: ' + e.message, true);
  }
}
function moveStatus(show, status) {
  show.status = status;
  show.updatedAt = new Date().toISOString();
  saveState(); render();
  refreshDetailIfOpen(show);
}
function removeShow(show) {
  state.shows = state.shows.filter(s => s !== show);
  saveState(); render();
  closeDetail();
  toast('"' + show.name + '" removed.');
  refreshBackdropPool();
}
function setRating(show, n) {
  show.rating = (show.rating === n) ? null : n;
  show.updatedAt = new Date().toISOString();
  saveState(); render();
  refreshDetailIfOpen(show);
}
async function refreshShowData(show) {
  try {
    toast('Consulting the archives for "' + show.name + '"…');
    const info = await tmdbShow(show.tmdbId);
    show.seasons = await fetchSeasons(show.tmdbId, info);
    Object.assign(show, extraFields(info));
    show.name = info.name || show.name;
    if (info.poster_path) show.poster = IMG + info.poster_path;
    show.hasNew = false;
    if (show.status === 'completed' && upNext(show)) show.status = 'watching';
    show.updatedAt = new Date().toISOString();
    saveState(); render();
    refreshDetailIfOpen(show);
    toast('"' + show.name + '" is up to date.');
    refreshBackdropPool();
  } catch (e) {
    toast('Refresh failed: ' + e.message, true);
  }
}

/* ---------- migration: backfill fields added by the redesign ---------- */
async function migrate() {
  if (!creds.tmdb) return;
  const missing = state.shows.filter(s => s.backdrop === undefined || s.totalEps === undefined);
  if (!missing.length) return;
  let changed = 0;
  for (const show of missing) {
    try {
      const info = await tmdbShow(show.tmdbId);
      Object.assign(show, extraFields(info));
      changed++;
    } catch (e) { /* try again next load */ }
  }
  if (changed) { saveState(); render(); refreshBackdropPool(); }
}

/* ---------- new-episode check (max once per 24h) ---------- */
async function checkNewEpisodes() {
  if (!creds.tmdb || !state.shows.length) return;
  const last = Number(localStorage.getItem(EP_CHECK_KEY) || 0);
  if (Date.now() - last < 24 * 3600 * 1000) return;
  localStorage.setItem(EP_CHECK_KEY, String(Date.now()));
  let found = 0;
  for (const show of state.shows) {
    if (typeof show.totalEps !== 'number' || !show.totalEps) continue;
    try {
      const info = await tmdbShow(show.tmdbId);
      const now = info.number_of_episodes || 0;
      if (now > show.totalEps && !show.hasNew) { show.hasNew = true; found++; }
    } catch (e) { /* skip quietly */ }
  }
  if (found) {
    saveState(); render();
    toast(found === 1 ? 'A new scroll has arrived in your library.' : found + ' new scrolls have arrived.');
  }
}

/* ---------- rendering ---------- */
function render() {
  for (const status of Object.keys(ELEMENT)) {
    const lane = document.getElementById('lane-' + status);
    const chip = document.getElementById('chip-' + status);
    const shows = state.shows.filter(s => s.status === status);
    chip.textContent = shows.length || '';
    lane.innerHTML = '';
    if (!shows.length) {
      const d = document.createElement('div');
      d.className = 'shelf-empty';
      d.textContent = { watching: 'Nothing being watched yet — search above.',
        plan: 'No scrolls waiting.', hold: 'Nothing frozen.',
        completed: 'No shows mastered yet.' }[status];
      lane.appendChild(d);
    } else {
      shows.forEach((show, i) => lane.appendChild(renderCard(show, i)));
    }
  }
  requestAnimationFrame(updateRowOverflow);
}

function renderCard(show, idx) {
  const el = ELEMENT[show.status];
  const card = document.createElement('div');
  card.className = 'pcard el-' + el;
  card.dataset.id = show.tmdbId;
  card.tabIndex = 0;
  card.style.animationDelay = (Math.min(idx || 0, 12) * 0.045) + 's';

  const next = upNext(show);
  const total = totalEpisodes(show);
  const done = watchedCount(show);
  const pct = total ? Math.round(done / total * 100) : 0;
  const et = episodeText(show);

  card.innerHTML = `
    ${show.poster
      ? `<img class="poster" src="${show.poster}" alt="" loading="lazy">`
      : `<div class="p-fallback">${esc(show.name)}</div>`}
    ${show.hasNew ? '<span class="badge-new">NEW</span>' : ''}
    <div class="p-overlay">
      <div class="p-name">${esc(show.name)}</div>
      <div class="p-next">${esc(et.name)}</div>
      ${next ? '<button class="p-watch">&#9654; Watched</button>' : ''}
    </div>
    <div class="p-progress"><i style="width:${pct}%"></i></div>`;

  const watch = card.querySelector('.p-watch');
  if (watch) watch.onclick = e => { e.stopPropagation(); bendPress(watch); markWatched(show); };
  card.onclick = () => openDetail(show);
  card.onkeydown = e => { if (e.key === 'Enter') openDetail(show); };
  return card;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* in-place card update — animates progress without a full re-render */
function updateCardInPlace(show) {
  const card = document.querySelector('.pcard[data-id="' + show.tmdbId + '"]');
  if (!card) { render(); return; }
  const t = episodeText(show);
  const total = totalEpisodes(show);
  const done = watchedCount(show);
  const pct = total ? Math.round(done / total * 100) : 0;
  card.querySelector('.p-next').textContent = t.name;
  card.querySelector('.p-progress > i').style.width = pct + '%';
  const watch = card.querySelector('.p-watch');
  if (watch && !upNext(show)) watch.remove();
  animatePop(card);
}
function animatePop(card) {
  card.animate(
    [ { boxShadow: '0 0 0 rgba(0,0,0,0)' },
      { boxShadow: '0 0 30px rgba(240,147,43,0.8)', offset: 0.35 },
      { boxShadow: '0 0 0 rgba(0,0,0,0)' } ],
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

/* row overflow: edge fades + arrows only when scrollable */
function updateRowOverflow() {
  document.querySelectorAll('.row-wrap').forEach(wrap => {
    const lane = wrap.querySelector('.cards');
    wrap.classList.toggle('has-overflow', lane.scrollWidth > lane.clientWidth + 4);
  });
}
function initRows() {
  document.querySelectorAll('.row-wrap').forEach(wrap => {
    const lane = wrap.querySelector('.cards');
    wrap.querySelector('.row-arrow.left').onclick  = () => lane.scrollBy({ left: -lane.clientWidth * 0.8, behavior: 'smooth' });
    wrap.querySelector('.row-arrow.right').onclick = () => lane.scrollBy({ left:  lane.clientWidth * 0.8, behavior: 'smooth' });
  });
  window.addEventListener('resize', updateRowOverflow);
}

/* ---------- show detail modal ---------- */
function openDetail(show) {
  detailShowId = show.tmdbId;
  renderDetail(show);
  document.getElementById('detail').classList.remove('hidden');
}
function closeDetail() {
  detailShowId = null;
  document.getElementById('detail').classList.add('hidden');
}
function refreshDetailIfOpen(show) {
  if (detailShowId === show.tmdbId && state.shows.includes(show)) renderDetail(show);
}
function renderDetail(show) {
  const el = ELEMENT[show.status];
  const box = document.getElementById('detail-content');
  const total = totalEpisodes(show);
  const done = watchedCount(show);
  const pct = total ? Math.round(done / total * 100) : 0;
  const et = episodeText(show);

  box.innerHTML = `
    <div class="d-hero ${show.backdrop ? '' : 'no-img'}"
         ${show.backdrop ? `style="background-image:url('${show.backdrop}')"` : ''}></div>
    <div class="d-head">
      <div class="d-title">${esc(show.name)}</div>
      <div class="d-meta">
        <span class="el-tag" style="color:var(--${el})">${STATUS_LABEL[show.status]}</span>
        <span>${done} / ${total} episodes</span>
        ${show.hasNew ? '<span class="badge-new" style="position:static">NEW EPISODES</span>' : ''}
      </div>
    </div>
    <div class="d-body">
      ${show.overview ? `<p class="d-overview">${esc(show.overview)}</p>` : ''}
      <div class="d-progress"><i style="width:${pct}%;background:linear-gradient(90deg,var(--${el}),var(--${el}-glow))"></i></div>
      <div class="d-count">${esc(et.line)}${et.name ? ' · ' + esc(et.name) : ''}</div>
      <div class="stars" title="Your rating"></div>
      <div class="d-actions"></div>
      <div class="d-section-title">Episodes</div>
      <div class="d-seasons"></div>
    </div>`;

  // rating stars
  const stars = box.querySelector('.stars');
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    if (!show.rating || i > show.rating) s.className = 'off';
    s.onclick = () => setRating(show, i);
    stars.appendChild(s);
  }

  // actions
  const actions = box.querySelector('.d-actions');
  if (upNext(show)) {
    const nb = mkBtn('▶ Watched This', 'btn btn-' + el);
    nb.onclick = () => { bendPress(nb); markWatched(show); };
    actions.appendChild(nb);
  }
  if (done > 0) {
    const back = mkBtn('◀ Step back', 'mini');
    back.onclick = () => stepBack(show);
    actions.appendChild(back);
  }
  Object.keys(STATUS_LABEL).filter(s => s !== show.status).forEach(s => {
    const b = mkBtn(STATUS_LABEL[s], 'mini');
    b.title = 'Move to ' + STATUS_LABEL[s];
    b.onclick = () => moveStatus(show, s);
    actions.appendChild(b);
  });
  const refresh = mkBtn(show.hasNew ? '⟳ Fetch new episodes' : '⟳ Refresh data', 'mini');
  refresh.onclick = () => refreshShowData(show);
  actions.appendChild(refresh);
  const del = mkBtn('Remove', 'btn btn-danger');
  del.onclick = () => {
    if (del.dataset.armed) { removeShow(show); return; }
    del.dataset.armed = '1';
    del.textContent = 'Really remove?';
    setTimeout(() => { delete del.dataset.armed; del.textContent = 'Remove'; }, 3000);
  };
  actions.appendChild(del);

  // seasons accordion
  const seasonsBox = box.querySelector('.d-seasons');
  show.seasons.forEach(s => {
    const det = document.createElement('details');
    if (s.season === show.currentSeason) det.open = true;
    const watchedInSeason = s.season < show.currentSeason ? s.episodes.length
      : (s.season === show.currentSeason ? show.currentEpisode : 0);
    det.innerHTML = `<summary>Season ${s.season}
      <span class="s-count">${watchedInSeason} / ${s.episodes.length}</span></summary>`;
    const list = document.createElement('div');
    list.className = 'ep-list';
    s.episodes.forEach(e => {
      const watched = s.season < show.currentSeason ||
        (s.season === show.currentSeason && e.ep <= show.currentEpisode);
      const row = document.createElement('div');
      row.className = 'ep-row' + (watched ? ' watched' : '');
      row.title = 'Mark watched through this episode';
      row.innerHTML = `<span class="ep-check">✓</span><span class="ep-num">E${e.ep}</span>
        <span class="ep-title">${esc(e.name || 'Episode ' + e.ep)}</span>`;
      row.onclick = () => setEpisodeTo(show, s.season, e.ep);
      list.appendChild(row);
    });
    det.appendChild(list);
    seasonsBox.appendChild(det);
  });
}
function mkBtn(label, cls) {
  const b = document.createElement('button');
  b.className = cls; b.textContent = label;
  return b;
}

/* ---------- stats ---------- */
function openStats() {
  const box = document.getElementById('stats-content');
  const shows = state.shows;
  const epsWatched = shows.reduce((t, s) => t + watchedCount(s), 0);
  const hours = Math.round(shows.reduce((t, s) => t + watchedCount(s) * (s.runtime || 40), 0) / 60);
  const mastered = shows.filter(s => s.status === 'completed').length;
  const rated = shows.filter(s => s.rating);
  const avgRating = rated.length
    ? (rated.reduce((t, s) => t + s.rating, 0) / rated.length).toFixed(1) : '—';

  const counts = {};
  for (const st of Object.keys(ELEMENT)) counts[st] = shows.filter(s => s.status === st).length;
  const max = Math.max(1, ...Object.values(counts));

  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>${epsWatched.toLocaleString()}</b><span>episodes watched</span></div>
      <div class="stat"><b>${hours.toLocaleString()}</b><span>hours in the library</span></div>
      <div class="stat"><b>${mastered}</b><span>shows mastered</span></div>
      <div class="stat"><b>${avgRating}</b><span>average rating</span></div>
    </div>
    <div class="stat-bars">
      ${Object.keys(ELEMENT).map(st => `
        <div class="stat-bar-row">
          <span class="sb-label" style="color:var(--${ELEMENT[st]})">
            <svg class="insignia"><use href="#sym-${ELEMENT[st]}"/></svg>${STATUS_LABEL[st]}</span>
          <span class="sb-track"><i style="width:${Math.round(counts[st] / max * 100)}%;
            background:linear-gradient(90deg,var(--${ELEMENT[st]}),var(--${ELEMENT[st]}-glow))"></i></span>
          <span class="sb-num">${counts[st]}</span>
        </div>`).join('')}
    </div>`;
  document.getElementById('stats').classList.remove('hidden');
}

/* ---------- toasts ---------- */
function toast(msg, err = false) {
  const holder = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  holder.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3400);
}

/* ---------- background engine ---------- */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let spiritsRAF = null, bdTimer = null, bdIndex = 0, bdPool = [], bdFlip = false;

function bgTheme() { return localStorage.getItem(BG_KEY) || 'aurora'; }

function applyBg(theme) {
  localStorage.setItem(BG_KEY, theme);
  const useBackdrops = theme === 'backdrops' && bdPool.length > 0;
  document.body.classList.toggle('bg-backdrops', useBackdrops);
  document.getElementById('bg-aurora').classList.toggle('hidden', useBackdrops);
  document.getElementById('bg-backdrops').classList.toggle('hidden', !useBackdrops);
  if (useBackdrops) { stopSpirits(); stopParade(); startBackdrops(); }
  else { stopBackdrops(); startSpirits(); startParade(); }
  document.querySelectorAll('input[name="bg"]').forEach(r => { r.checked = r.value === theme; });
}
function refreshBackdropPool() {
  bdPool = [...new Set(state.shows.map(s => s.backdrop).filter(Boolean))];
  // reapply in case the pool just became (non)empty while in backdrop mode
  if (bgTheme() === 'backdrops') applyBg('backdrops');
}

/* spirit-light particles over the aurora */
function startSpirits() {
  const canvas = document.getElementById('spirits');
  if (spiritsRAF || reducedMotion || !canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  const size = () => { w = canvas.width = innerWidth; h = canvas.height = innerHeight; };
  size();
  window.addEventListener('resize', size);
  const P = Array.from({ length: 26 }, () => ({
    x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.4,
    v: 0.008 + Math.random() * 0.02, sway: Math.random() * Math.PI * 2,
    hue: [168, 268, 38, 205][Math.floor(Math.random() * 4)]
  }));
  let last = performance.now();
  const step = now => {
    spiritsRAF = requestAnimationFrame(step);
    if (document.hidden) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    ctx.clearRect(0, 0, w, h);
    for (const p of P) {
      p.y -= p.v * dt; p.sway += dt * 0.5;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      const x = (p.x + Math.sin(p.sway) * 0.012) * w, y = p.y * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, p.r * 7);
      g.addColorStop(0, `hsla(${p.hue}, 80%, 72%, 0.5)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, p.r * 7, 0, Math.PI * 2); ctx.fill();
    }
  };
  spiritsRAF = requestAnimationFrame(step);
}
function stopSpirits() {
  if (spiritsRAF) { cancelAnimationFrame(spiritsRAF); spiritsRAF = null; }
}

/* ---------- spirit parade: one creature act crosses the sky at a time ---------- */
const PARADE_ACTS = [
  { id: 'koi',     dur: [40, 54], y: [5, 42] },
  { id: 'dragon',  dur: [48, 62], y: [8, 36] },
  { id: 'moth',    dur: [30, 42], y: [10, 46] },
  { id: 'jellies', dur: [42, 56], rise: true }
];
let paradeTimer = null, lastActId = null;

function startParade() {
  if (paradeTimer !== null || reducedMotion) return;
  paradeTimer = setTimeout(runParadeAct, 3000 + Math.random() * 7000);
}
function stopParade() {
  clearTimeout(paradeTimer); paradeTimer = null;
  document.getElementById('spirit-stage').innerHTML = '';
}
function runParadeAct() { spawnAct(); }

function spawnAct(forceId, progress) {
  const stage = document.getElementById('spirit-stage');
  const pool = PARADE_ACTS.filter(a => a.id !== lastActId);
  const act = forceId
    ? PARADE_ACTS.find(a => a.id === forceId)
    : pool[Math.floor(Math.random() * pool.length)];
  if (!act) return;
  lastActId = act.id;

  const node = document.getElementById('tpl-' + act.id).content.firstElementChild.cloneNode(true);
  const dur = (act.dur[0] + Math.random() * (act.dur[1] - act.dur[0])) * 1000;
  node.style.setProperty('--dur', dur + 'ms');
  if (act.rise) {
    node.style.left = (12 + Math.random() * 62) + '%';
  } else {
    node.style.top = (act.y[0] + Math.random() * (act.y[1] - act.y[0])) + '%';
    if (Math.random() < 0.5) node.classList.add('rtl');
  }
  if (progress) node.style.animationDelay = (-dur * progress) + 'ms';

  node.addEventListener('animationend', e => {
    if (e.target !== node) return;
    node.remove();
    if (paradeTimer !== null)
      paradeTimer = setTimeout(runParadeAct, 8000 + Math.random() * 14000);
  });
  stage.appendChild(node);
}

/* Ken Burns slideshow of the user's own show backdrops */
function startBackdrops() {
  if (bdTimer || !bdPool.length) return;
  bdIndex = Math.floor(Math.random() * bdPool.length);
  const show = () => {
    const url = bdPool[bdIndex % bdPool.length];
    bdIndex++;
    const nextUrl = bdPool[bdIndex % bdPool.length];
    const layerOn  = document.getElementById(bdFlip ? 'bd-a' : 'bd-b');
    const layerOff = document.getElementById(bdFlip ? 'bd-b' : 'bd-a');
    bdFlip = !bdFlip;
    const img = new Image();
    img.onload = () => {
      layerOn.style.backgroundImage = `url('${url}')`;
      layerOn.classList.remove('on'); void layerOn.offsetWidth; // restart ken burns
      layerOn.classList.add('on');
      layerOff.classList.remove('on');
      const pre = new Image(); pre.src = nextUrl; // preload the next slide
    };
    img.src = url;
  };
  show();
  bdTimer = setInterval(show, 20000);
}
function stopBackdrops() {
  if (bdTimer) { clearInterval(bdTimer); bdTimer = null; }
  document.querySelectorAll('.bd-layer').forEach(l => l.classList.remove('on'));
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
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.closest('input, textarea')) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') {
      box.classList.add('hidden');
      closeDetail();
      document.getElementById('stats').classList.add('hidden');
      document.getElementById('settings').classList.add('hidden');
    }
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
      render(); refreshBackdropPool();
      migrate().then(checkNewEpisodes);
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
    document.querySelectorAll('input[name="bg"]').forEach(r => { r.checked = r.value === bgTheme(); });
    panel.classList.remove('hidden');
  };
  document.getElementById('btn-close-settings').onclick = () => panel.classList.add('hidden');
  panel.addEventListener('click', e => { if (e.target === panel) panel.classList.add('hidden'); });

  document.querySelectorAll('input[name="bg"]').forEach(r => {
    r.addEventListener('change', () => {
      applyBg(r.value);
      if (r.value === 'backdrops' && !bdPool.length)
        toast('No backdrops yet — the aurora stays until your shows load some.');
    });
  });

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
      if (remote) { state = remote; saveState(false); render(); refreshBackdropPool(); }
      msg.className = 'msg ok'; msg.textContent = 'Synced from the cloud.';
    } catch (e) {
      msg.className = 'msg err'; msg.textContent = e.message;
    }
  };
}

function initModals() {
  const detail = document.getElementById('detail');
  document.getElementById('btn-close-detail').onclick = closeDetail;
  detail.addEventListener('click', e => { if (e.target === detail) closeDetail(); });

  const stats = document.getElementById('stats');
  document.getElementById('btn-stats').onclick = openStats;
  document.getElementById('btn-close-stats').onclick = () => stats.classList.add('hidden');
  stats.addEventListener('click', e => { if (e.target === stats) stats.classList.add('hidden'); });
}

/* ---------- boot ---------- */
async function boot() {
  loadCreds(); loadState();
  initSearch(); initSetup(); initSettings(); initModals(); initRows();
  render(); refreshBackdropPool();
  applyBg(bgTheme());

  if (!creds.tmdb) { showSetup(); }
  else { setSync(creds.gist ? 'ok' : 'local'); }

  // pull latest on load if synced, then backfill new fields + check for new episodes
  if (creds.token && creds.gist) {
    try {
      const remote = await gistPull();
      if (remote) { state = remote; localStorage.setItem('wstl_state', JSON.stringify(state)); render(); refreshBackdropPool(); }
      setSync('ok');
    } catch (e) { setSync('err'); }
  }
  if (creds.tmdb) migrate().then(checkNewEpisodes);

  // refresh when the tab regains focus
  window.addEventListener('focus', async () => {
    if (!creds.token || !creds.gist) return;
    try {
      const remote = await gistPull();
      if (remote) { state = remote; localStorage.setItem('wstl_state', JSON.stringify(state)); render(); refreshBackdropPool(); }
      setSync('ok');
    } catch (e) { setSync('err'); }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
