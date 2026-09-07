/* Wan Shi Tong's Library — local-first watchlist. */
'use strict';
const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w342';
const IMG_SM = 'https://image.tmdb.org/t/p/w185';
const IMG_BD = 'https://image.tmdb.org/t/p/w1280';
const GIST_FILE = 'watchlist.json';
const ELEMENT = { watching: 'fire', plan: 'air', hold: 'water', completed: 'earth' };
const STATUS_LABEL = { watching: 'Now Watching', plan: 'Scrolls to Unroll', hold: 'Frozen in Time', completed: 'Mastered' };
const STATUS_DESCRIPTION = { watching: 'In progress', plan: 'Planned', hold: 'On hold', completed: 'Completed' };
const EP_CHECK_KEY = 'wstl_epcheck', BG_KEY = 'wstl_bg';
const $ = id => document.getElementById(id);
let creds = { tmdb: '', token: '', gist: '' };
let state = { shows: [], lastSync: null };
let syncTimer = null, detailShowId = null, pendingRemoval = null;
let storageFailed = false, stateReadFailed = false;
// Session-only guards; the persisted watchlist/Gist payload stays unchanged.
let localRevision = 0, inFlightPushes = 0;
const adding = new Set(), refreshing = new Set(), dialogOrigins = new WeakMap();

/* A failed library write rolls the edit back and leaves an actionable warning. */
function storageError() {
  storageFailed = true;
  if ($('storage-alert')) {
    $('storage-alert').classList.remove('hidden');
    $('storage-alert').hidden = false;
    $('storage-alert').textContent = 'Your browser could not save changes. Keep this tab open, free some browser storage or allow site data, then retry. The last edit was not saved.';
  }
  setSync('storage');
}
function readLocal(key) { try { return localStorage.getItem(key); } catch (_) { storageError(); return null; } }
function writeLocal(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { storageError(); return false; } }
function loadCreds() { creds = { tmdb: readLocal('wstl_tmdb') || '', token: readLocal('wstl_token') || '', gist: readLocal('wstl_gist') || '' }; }
function saveCreds(candidate = creds) {
  const previous = { ...creds }, entries = [['wstl_tmdb', 'tmdb'], ['wstl_token', 'token'], ['wstl_gist', 'gist']];
  try { entries.forEach(([key, field]) => localStorage.setItem(key, candidate[field])); creds = candidate; return true; }
  catch (_) {
    for (const [key, field] of entries) { try { localStorage.setItem(key, previous[field]); } catch (_) { /* warning below */ } }
    storageError(); return false;
  }
}
function validateState(value) {
  if (!value || !Array.isArray(value.shows)) throw new Error('This library file is not a supported watchlist.');
  const ids = new Set();
  for (const show of value.shows) {
    if (!Number.isSafeInteger(show.tmdbId) || ids.has(show.tmdbId) || typeof show.name !== 'string' ||
        !Object.hasOwn(ELEMENT, show.status) || !Array.isArray(show.seasons) ||
        !Number.isInteger(show.currentSeason) || !Number.isInteger(show.currentEpisode) || show.currentEpisode < 0)
      throw new Error('This library contains an invalid show. Your local library has been kept.');
    ids.add(show.tmdbId);
    for (const season of show.seasons) {
      if (!Number.isInteger(season.season) || !Array.isArray(season.episodes) || season.episodes.some(ep => !Number.isInteger(ep.ep) || ep.ep < 1))
        throw new Error('This library contains invalid episode data. Your local library has been kept.');
    }
  }
  return value;
}
function loadState() {
  const raw = readLocal('wstl_state'); if (!raw) return;
  try { state = validateState(JSON.parse(raw)); }
  catch (_) {
    if ($('storage-alert')) {
      $('storage-alert').classList.remove('hidden');
      $('storage-alert').hidden = false;
      $('storage-alert').textContent = 'Your saved library could not be read. Its stored copy has not been changed. Restore a valid watchlist from your synced library before making edits.';
    }
    storageFailed = true; stateReadFailed = true;
  }
}
function saveState(push = true) {
  if (stateReadFailed) { storageError(); return false; }
  const previousSync = state.lastSync; state.lastSync = new Date().toISOString();
  if (!writeLocal('wstl_state', JSON.stringify(state))) { state.lastSync = previousSync; return false; }
  storageFailed = false; if ($('storage-alert')) $('storage-alert').hidden = true;
  if (push) scheduleSync(); return true;
}
function commitChange(change) {
  const before = JSON.parse(JSON.stringify(state)); change();
  if (saveState()) { localRevision++; return true; }
  state = before; render();
  const current = state.shows.find(s => s.tmdbId === detailShowId); if (current) renderDetail(current);
  toast('Change not saved. Resolve the storage message and retry.', true); return false;
}
function replaceFromRemote(remote) {
  if (!remote) return false;
  const previous = state, readFailure = stateReadFailed;
  state = validateState(remote); stateReadFailed = false;
  if (!saveState(false)) { state = previous; stateReadFailed = readFailure; return false; }
  render(); refreshBackdropPool();
  if (detailShowId !== null) { const show = state.shows.find(s => s.tmdbId === detailShowId); if (show) renderDetail(show); else closeDetail(); }
  return true;
}
function applyPulledState(remote, startedAtRevision) {
  if (startedAtRevision !== localRevision || syncTimer || inFlightPushes) {
    // A pull is a replacement, never a merge: an older response must not erase an edit.
    setSync(syncTimer || inFlightPushes ? 'busy' : 'err');
    return false;
  }
  return replaceFromRemote(remote);
}

/* Error messages omit request URLs, which contain the TMDB key. */
class ServiceError extends Error {
  constructor(service, status) {
    const auth = status === 401 || status === 403;
    super(service === 'TMDB'
      ? (auth ? 'TMDB rejected the API key. Check your v3 API key in Settings.' : status === 429 ? 'TMDB is busy. Wait a moment and try again.' : 'TMDB could not complete the request. Please try again.')
      : (auth ? 'GitHub rejected the token. Check its access and gist permission.' : status === 404 ? 'That library was not found. Check the Library ID and token access.' : 'GitHub could not complete the sync. Please try again.'));
    this.status = status; this.service = service;
  }
}
function errorMessage(error) {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof TypeError) return 'Could not connect. Check your internet connection and try again.';
  return error.message || 'Something went wrong. Please try again.';
}
async function tmdbGet(path, signal) {
  const join = path.includes('?') ? '&' : '?';
  const response = await fetch(`${TMDB}${path}${join}api_key=${encodeURIComponent(creds.tmdb)}`, { signal });
  if (!response.ok) throw new ServiceError('TMDB', response.status); return response.json();
}
async function tmdbSearch(query, signal) { return (await tmdbGet('/search/tv?query=' + encodeURIComponent(query), signal)).results || []; }
function tmdbShow(id) { return tmdbGet('/tv/' + id); }
function tmdbSeason(id, n) { return tmdbGet('/tv/' + id + '/season/' + n); }
async function fetchSeasons(tmdbId, info) {
  const seasons = [];
  for (const s of (info.seasons || []).filter(s => s.season_number >= 1 && s.episode_count > 0)) {
    const data = await tmdbSeason(tmdbId, s.season_number);
    seasons.push({ season: s.season_number, episodes: (data.episodes || []).map(e => ({ ep: e.episode_number, name: e.name || '' })) });
  }
  return seasons.sort((a, b) => a.season - b.season);
}
function extraFields(info) {
  const times = info.episode_run_time || [];
  return { backdrop: info.backdrop_path ? IMG_BD + info.backdrop_path : '', overview: info.overview || '',
    runtime: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 40, totalEps: info.number_of_episodes || 0 };
}

/* Existing Gist payload and storage keys are intentionally preserved. */
function ghHeaders(credentials = creds) {
  return { Authorization: 'Bearer ' + credentials.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
}
async function gistCreate(credentials = creds, library = state) {
  const response = await fetch('https://api.github.com/gists', { method: 'POST', headers: ghHeaders(credentials),
    body: JSON.stringify({ description: "Wan Shi Tong's Library — watchlist data", public: false, files: { [GIST_FILE]: { content: JSON.stringify(library, null, 2) } } }) });
  if (!response.ok) throw new ServiceError('GitHub', response.status); return (await response.json()).id;
}
async function gistPush() {
  if (!creds.token || !creds.gist) return;
  inFlightPushes++;
  try {
    const response = await fetch('https://api.github.com/gists/' + encodeURIComponent(creds.gist), { method: 'PATCH', headers: ghHeaders(), body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(state, null, 2) } } }) });
    if (!response.ok) throw new ServiceError('GitHub', response.status);
  } finally { inFlightPushes--; }
}
async function gistPull(credentials = creds) {
  if (!credentials.token || !credentials.gist) return null;
  const response = await fetch('https://api.github.com/gists/' + encodeURIComponent(credentials.gist), { headers: ghHeaders(credentials) });
  if (!response.ok) throw new ServiceError('GitHub', response.status);
  const data = await response.json(), file = data.files && data.files[GIST_FILE];
  if (!file || !file.content) throw new Error('That Gist does not contain watchlist.json. Check your Library ID.');
  return validateState(JSON.parse(file.content));
}
function scheduleSync() {
  clearTimeout(syncTimer);
  if (!creds.token || !creds.gist) { syncTimer = null; setSync('local'); return; }
  setSync('busy'); syncTimer = setTimeout(async () => {
    syncTimer = null; try { await gistPush(); setSync(syncTimer || inFlightPushes ? 'busy' : 'ok'); } catch (_) { setSync('err'); }
  }, 1400);
}
function setSync(value) {
  const el = $('sync-status'); if (!el) return; if (storageFailed) value = 'storage';
  const labels = { ok: 'Synced', busy: 'Syncing…', err: 'Sync needs attention', local: 'Saved on this device', storage: 'Not saved' };
  const descriptions = { ok: 'Library synced to GitHub. Open settings.', busy: 'Saving your library to GitHub. Open settings.', err: 'Sync failed; changes remain saved on this device. Open settings to retry.', local: 'Library is stored on this device. Open settings for optional sync.', storage: 'Browser storage failed. Check the storage message.' };
  el.className = 'sync-status ' + value; el.textContent = labels[value] || labels.local; el.title = descriptions[value]; el.setAttribute('aria-label', descriptions[value]);
}

/* Sequential watched-through progress, including boundaries between seasons. */
function episodeList(show) { return show.seasons.slice().sort((a, b) => a.season - b.season).flatMap(s => s.episodes.map(e => ({ season: s.season, ep: e.ep, name: e.name || '' }))); }
function upNext(show) { return episodeList(show).find(e => e.season > show.currentSeason || (e.season === show.currentSeason && e.ep > show.currentEpisode)) || null; }
function totalEpisodes(show) { return show.seasons.reduce((sum, s) => sum + s.episodes.length, 0); }
function watchedCount(show) { return episodeList(show).filter(e => e.season < show.currentSeason || (e.season === show.currentSeason && e.ep <= show.currentEpisode)).length; }
function episodeText(show) {
  const next = upNext(show), total = totalEpisodes(show), done = watchedCount(show);
  if (!total) return { line: 'No episode data yet', name: 'Refresh details when episodes are available' };
  const line = done ? `Watched through S${show.currentSeason} E${show.currentEpisode}` : 'Not started';
  return next ? { line, name: `Next: S${next.season} E${next.ep}${next.name ? ' — ' + next.name : ''}` } : { line: 'Caught up', name: `All ${total} available episodes watched` };
}
function applyProgressStatus(show) { if (totalEpisodes(show) && !upNext(show)) show.status = 'completed'; else if (show.status === 'completed') show.status = 'watching'; }
function updated(show) { show.updatedAt = new Date().toISOString(); }
function markWatched(show) {
  const next = upNext(show); if (!next) return;
  if (!commitChange(() => { show.currentSeason = next.season; show.currentEpisode = next.ep; updated(show); applyProgressStatus(show); })) return;
  render(); refreshDetailIfOpen(show); toast(`Marked ${show.name}: S${next.season} E${next.ep} watched.`);
}
function stepBack(show) {
  const list = episodeList(show), done = watchedCount(show); if (!done) return; const previous = list[done - 2];
  if (!commitChange(() => { show.currentSeason = previous ? previous.season : (list[0] ? list[0].season : 1); show.currentEpisode = previous ? previous.ep : 0; if (show.status === 'completed') show.status = 'watching'; updated(show); })) return;
  render(); refreshDetailIfOpen(show);
}
function setEpisodeTo(show, season, ep) {
  if (!commitChange(() => { show.currentSeason = season; show.currentEpisode = ep; updated(show); applyProgressStatus(show); })) return;
  render(); refreshDetailIfOpen(show); toast(`Marked watched through S${season} E${ep}. All earlier episodes are included.`);
}
async function addShow(tmdbId, button) {
  const existing = state.shows.find(s => s.tmdbId === tmdbId); if (existing) { openDetail(existing); return; }
  if (adding.has(tmdbId)) return; adding.add(tmdbId); if (button) { button.disabled = true; button.textContent = 'Adding…'; }
  try {
    const info = await tmdbShow(tmdbId), seasons = await fetchSeasons(tmdbId, info); if (state.shows.some(s => s.tmdbId === tmdbId)) return;
    const show = Object.assign({ tmdbId, name: info.name || 'Untitled show', poster: info.poster_path ? IMG + info.poster_path : '', status: 'watching', currentSeason: seasons.length ? seasons[0].season : 1, currentEpisode: 0, seasons, rating: null, hasNew: false, updatedAt: new Date().toISOString() }, extraFields(info));
    if (!commitChange(() => state.shows.push(show))) return;
    render(); refreshBackdropPool(); toast('“' + show.name + '” added to Now Watching.'); hideSearch(); $('search').value = ''; updateSearchClear();
    requestAnimationFrame(() => document.querySelector(`.pcard[data-id="${tmdbId}"] .p-open`)?.focus());
  } catch (error) { toast('Could not add show. ' + errorMessage(error), true); }
  finally { adding.delete(tmdbId); if (button?.isConnected) { button.disabled = false; button.textContent = state.shows.some(s => s.tmdbId === tmdbId) ? 'Already in library' : 'Add'; } }
}
function moveStatus(show, status) { if (!Object.hasOwn(ELEMENT, status) || !commitChange(() => { show.status = status; updated(show); })) return; render(); refreshDetailIfOpen(show); }
function removeShow(show) {
  if (!commitChange(() => { state.shows = state.shows.filter(s => s.tmdbId !== show.tmdbId); })) return;
  closeDialog($('remove-confirm')); pendingRemoval = null; closeDetail(); render(); refreshBackdropPool(); toast('“' + show.name + '” removed from your library.');
}
function setRating(show, n) { if (!commitChange(() => { show.rating = show.rating === n ? null : n; updated(show); })) return; render(); refreshDetailIfOpen(show); }
async function refreshShowData(show) {
  if (refreshing.has(show.tmdbId)) return; refreshing.add(show.tmdbId); refreshDetailIfOpen(show);
  try {
    const info = await tmdbShow(show.tmdbId), seasons = await fetchSeasons(show.tmdbId, info); if (!state.shows.includes(show)) return;
    if (!commitChange(() => { show.seasons = seasons; Object.assign(show, extraFields(info)); show.name = info.name || show.name; if (info.poster_path) show.poster = IMG + info.poster_path; show.hasNew = false; if (show.status === 'completed' && upNext(show)) show.status = 'watching'; updated(show); })) return;
    render(); refreshBackdropPool(); toast('“' + show.name + '” is up to date.');
  } catch (error) { toast('Refresh failed. ' + errorMessage(error), true); }
  finally { refreshing.delete(show.tmdbId); refreshDetailIfOpen(show); }
}
async function migrate() {
  if (!creds.tmdb || stateReadFailed) return;
  for (const show of state.shows.filter(s => s.backdrop === undefined || s.totalEps === undefined)) {
    try { const fields = extraFields(await tmdbShow(show.tmdbId)); if (state.shows.includes(show)) commitChange(() => Object.assign(show, fields)); } catch (_) { /* retry next load */ }
  }
  render(); refreshBackdropPool();
}
async function checkNewEpisodes() {
  if (!creds.tmdb || !state.shows.length || stateReadFailed) return;
  const last = Number(readLocal(EP_CHECK_KEY) || 0); if (Date.now() - last < 24 * 3600 * 1000 || !writeLocal(EP_CHECK_KEY, String(Date.now()))) return;
  let found = 0;
  for (const show of state.shows) {
    if (!show.totalEps) continue;
    try { const info = await tmdbShow(show.tmdbId); if ((info.number_of_episodes || 0) > show.totalEps && !show.hasNew && state.shows.includes(show) && commitChange(() => { show.hasNew = true; })) found++; } catch (_) { /* background metadata checks do not block viewing */ }
  }
  if (found) { render(); toast(`${found} ${found === 1 ? 'show has' : 'shows have'} new episodes available.`); }
}

/* External text is escaped; images are restricted to HTTP(S). */
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function imageUrl(value) {
  if (!value) return '';
  try { const url = new URL(value, location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
}
function mkBtn(label, cls = 'btn btn-secondary') { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; return b; }
function render() {
  const focused = document.activeElement, focusId = focused?.closest('.pcard')?.dataset.id;
  const focusClass = focused?.classList.contains('p-watch') ? '.p-watch' : '.p-open';
  for (const status of Object.keys(ELEMENT)) {
    const lane = $('lane-' + status), chip = $('chip-' + status), shows = state.shows.filter(s => s.status === status), scroll = lane.scrollLeft;
    if (chip) { chip.textContent = shows.length; chip.setAttribute('aria-label', `${shows.length} ${shows.length === 1 ? 'show' : 'shows'}`); }
    const section = lane.closest('.shelf');
    section?.querySelectorAll('.shelf-count').forEach(el => { el.textContent = `${shows.length} ${shows.length === 1 ? 'show' : 'shows'}`; });
    const desc = section?.querySelector('.shelf-description'); if (desc) desc.textContent = STATUS_DESCRIPTION[status];
    lane.replaceChildren();
    if (!shows.length) {
      const empty = document.createElement('div'); empty.className = 'shelf-empty'; const text = document.createElement('p');
      text.textContent = { watching: 'Your next story starts here.', plan: 'Keep the shows you want to watch next.', hold: 'A place for stories you will return to.', completed: 'Finished shows will find their home here.' }[status];
      const button = mkBtn(status === 'watching' ? 'Find your first show' : 'Find a show', 'btn btn-secondary empty-action');
      button.onclick = () => { $('search').focus(); $('search').scrollIntoView({ block: 'center', behavior: motionAllowed() ? 'smooth' : 'instant' }); };
      empty.append(text, button); lane.append(empty);
    } else shows.forEach(show => lane.append(renderCard(show)));
    lane.scrollLeft = scroll;
  }
  if (focusId && !focused.isConnected) { const card = document.querySelector(`.pcard[data-id="${focusId}"]`); (card?.querySelector(focusClass) || card?.querySelector('.p-open'))?.focus({ preventScroll: true }); }
  requestAnimationFrame(updateRowOverflow);
}
function renderCard(show) {
  const card = document.createElement('article'); card.className = 'pcard el-' + ELEMENT[show.status]; card.dataset.id = show.tmdbId;
  const next = upNext(show), total = totalEpisodes(show), done = watchedCount(show), pct = total ? Math.round(done / total * 100) : 0, poster = imageUrl(show.poster);
  card.innerHTML = `<button type="button" class="p-open" aria-label="Open details for ${esc(show.name)}">
    <span class="p-art">${poster ? `<img class="poster" src="${esc(poster)}" alt="" loading="lazy">` : '<span class="p-fallback" aria-hidden="true">WST<br>LIBRARY</span>'}${show.hasNew ? '<span class="badge-new">New episodes</span>' : ''}</span>
    <span class="p-overlay"><span class="p-name">${esc(show.name)}</span><span class="p-next">${esc(episodeText(show).name)}</span><span class="p-count">${done} / ${total} episodes · ${pct}%</span></span>
    </button><div class="p-progress" role="progressbar" aria-label="${esc(show.name)} episode progress" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total || 1}"><i style="width:${pct}%"></i></div>`;
  card.querySelector('.p-open').onclick = () => openDetail(show);
  const img = card.querySelector('img');
  if (img) img.onerror = () => { const fallback = document.createElement('span'); fallback.className = 'p-fallback'; fallback.setAttribute('aria-hidden', 'true'); fallback.textContent = 'WST LIBRARY'; img.replaceWith(fallback); };
  if (next) { const watch = mkBtn(`Mark S${next.season} E${next.ep} watched`, 'p-watch btn btn-primary'); watch.setAttribute('aria-label', `Mark ${show.name}, S${next.season} E${next.ep} watched`); watch.onclick = () => markWatched(show); card.append(watch); }
  else { const label = document.createElement('div'); label.className = 'p-caught-up'; label.textContent = total ? '✓ Caught up' : 'No episodes listed'; card.append(label); }
  return card;
}
function motionAllowed() { return !matchMedia('(prefers-reduced-motion: reduce)').matches && readLocal('wstl_motion') !== 'paused'; }
function updateRowOverflow() {
  document.querySelectorAll('.row-wrap').forEach(wrap => {
    const lane = wrap.querySelector('.cards'), max = lane.scrollWidth - lane.clientWidth; wrap.classList.toggle('has-overflow', max > 4);
    const left = wrap.querySelector('.row-arrow.left'), right = wrap.querySelector('.row-arrow.right');
    if (left) left.disabled = lane.scrollLeft <= 2; if (right) right.disabled = lane.scrollLeft >= max - 2;
  });
}
function initRows() {
  document.querySelectorAll('.row-wrap').forEach(wrap => {
    const lane = wrap.querySelector('.cards');
    wrap.querySelector('.row-arrow.left').onclick = () => lane.scrollBy({ left: -lane.clientWidth * .8, behavior: motionAllowed() ? 'smooth' : 'instant' });
    wrap.querySelector('.row-arrow.right').onclick = () => lane.scrollBy({ left: lane.clientWidth * .8, behavior: motionAllowed() ? 'smooth' : 'instant' });
    lane.addEventListener('scroll', updateRowOverflow, { passive: true });
  });
  window.addEventListener('resize', updateRowOverflow);
}

/* Native dialogs provide focus containment and inert background content. */
function openDialog(dialog) {
  if (dialog.open) return;
  const active = document.activeElement; dialogOrigins.set(dialog, { element: active, showId: active?.closest('.pcard')?.dataset.id });
  dialog.classList.remove('hidden'); dialog.showModal(); document.body.classList.add('modal-open');
}
function closeDialog(dialog) { if (dialog.open) dialog.close(); }
function initModals() {
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => { if (dialog.id === 'setup' && !creds.tmdb) event.preventDefault(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog || dialog.id === 'setup') return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      if (dialog.id === 'detail') detailShowId = null; if (dialog.id === 'remove-confirm') pendingRemoval = null;
      const open = [...document.querySelectorAll('dialog[open]')]; document.body.classList.toggle('modal-open', open.length > 0);
      const origin = dialogOrigins.get(dialog), fallback = (origin?.showId ? document.querySelector(`.pcard[data-id="${origin.showId}"] .p-open`) : null) || $('search');
      let target = origin?.element?.isConnected ? origin.element : fallback;
      if (target?.closest('.hidden, [hidden]') || (target?.closest('dialog') && !target.closest('dialog').open)) target = fallback;
      if (target && (!open.length || open[open.length - 1].contains(target))) target.focus({ preventScroll: true });
    });
  });
  $('btn-close-detail').onclick = closeDetail; $('btn-stats').onclick = openStats; $('btn-close-stats').onclick = () => closeDialog($('stats'));
  $('btn-close-settings').onclick = () => closeDialog($('settings'));
  $('btn-cancel-remove').onclick = () => closeDialog($('remove-confirm'));
  $('btn-confirm-remove').onclick = () => { const show = state.shows.find(s => s.tmdbId === pendingRemoval); if (show) removeShow(show); };
}
function openDetail(show) { detailShowId = show.tmdbId; hideSearch(); renderDetail(show); openDialog($('detail')); }
function closeDetail() { closeDialog($('detail')); detailShowId = null; }
function refreshDetailIfOpen(show) {
  if (detailShowId !== show.tmdbId) return;
  // Storage rollback replaces object identities; always render the current saved object.
  const current = state.shows.find(item => item.tmdbId === show.tmdbId);
  if (current) renderDetail(current);
}
function requestRemoval(show) {
  pendingRemoval = show.tmdbId; $('remove-title').textContent = 'Remove “' + show.name + '”?';
  $('remove-description').textContent = 'This removes the show, its episode progress, and your rating from this library. You can add the show again, but its progress will start over.';
  $('btn-confirm-remove').textContent = 'Remove show'; openDialog($('remove-confirm')); $('btn-cancel-remove').focus();
}
function renderDetail(show) {
  const box = $('detail-content'), activeKey = box.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
  const openSeasons = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.season)), priorShowId = box.dataset.showId; box.dataset.showId = show.tmdbId;
  const total = totalEpisodes(show), done = watchedCount(show), pct = total ? Math.round(done / total * 100) : 0, next = upNext(show), el = ELEMENT[show.status];
  box.innerHTML = `<div class="d-hero no-img"></div>
    <div class="d-head"><h2 class="d-title" id="detail-title">${esc(show.name)}</h2><div class="d-meta"><span class="el-tag" style="color:var(--${el})">${STATUS_LABEL[show.status]}</span><span>${done} / ${total} episodes</span>${show.hasNew ? '<span class="badge-new">New episodes available</span>' : ''}</div></div>
    <div class="d-body">${show.overview ? `<p class="d-overview">${esc(show.overview)}</p>` : ''}
    <div class="d-progress" role="progressbar" aria-label="Episodes watched" aria-valuemin="0" aria-valuemax="${total || 1}" aria-valuenow="${done}"><i style="width:${pct}%;background:var(--${el})"></i></div>
    <p class="d-count">${esc(episodeText(show).line)} · ${esc(episodeText(show).name)}</p>
    <fieldset class="rating-field"><legend>Your rating</legend><div class="stars"></div><p class="hint">Choose the selected rating again to clear it.</p></fieldset>
    <div class="d-actions"></div><h3 class="d-section-title">Episodes</h3><p class="episode-help" id="episode-help">Track where you have watched through. Choosing an episode marks it and every earlier episode watched. Choose an earlier episode to move your progress back.</p><div class="d-seasons"></div></div>`;
  const backdrop = imageUrl(show.backdrop);
  if (backdrop) { box.querySelector('.d-hero').style.backgroundImage = `url("${backdrop.replace(/"/g, '%22')}")`; box.querySelector('.d-hero').classList.remove('no-img'); }
  for (let n = 1; n <= 5; n++) {
    const button = mkBtn('★', (!show.rating || n > show.rating) ? 'rating-star off' : 'rating-star'); button.setAttribute('aria-label', `${n} ${n === 1 ? 'star' : 'stars'}`); button.setAttribute('aria-pressed', String(show.rating === n));
    button.dataset.focus = 'rating-' + n; button.onclick = () => setRating(show, n); box.querySelector('.stars').append(button);
  }
  const actions = box.querySelector('.d-actions');
  if (next) { const watch = mkBtn(`Mark S${next.season} E${next.ep} watched`, 'btn btn-primary'); watch.dataset.focus = 'watch'; watch.onclick = () => markWatched(show); actions.append(watch); }
  if (done > 0) { const back = mkBtn('Step back one episode'); back.dataset.focus = 'back'; back.onclick = () => stepBack(show); actions.append(back); }
  const label = document.createElement('label'); label.className = 'd-status-label'; label.textContent = 'Shelf';
  const select = document.createElement('select'); select.className = 'd-status'; select.setAttribute('aria-label', 'Move show to shelf'); select.dataset.focus = 'status';
  for (const status of Object.keys(ELEMENT)) { const option = document.createElement('option'); option.value = status; option.textContent = STATUS_LABEL[status] + ' · ' + STATUS_DESCRIPTION[status]; option.selected = status === show.status; select.append(option); }
  select.onchange = () => moveStatus(show, select.value); label.append(select); actions.append(label);
  const refresh = mkBtn(refreshing.has(show.tmdbId) ? 'Refreshing…' : show.hasNew ? 'Fetch new episodes' : 'Refresh show data'); refresh.dataset.focus = 'refresh'; refresh.disabled = refreshing.has(show.tmdbId); refresh.onclick = () => refreshShowData(show); actions.append(refresh);
  const remove = mkBtn('Remove show', 'btn btn-danger'); remove.dataset.focus = 'remove'; remove.onclick = () => requestRemoval(show); actions.append(remove);
  const seasonsBox = box.querySelector('.d-seasons');
  show.seasons.forEach(season => {
    const details = document.createElement('details'); details.dataset.season = season.season; details.open = priorShowId === String(show.tmdbId) ? openSeasons.has(String(season.season)) : season.season === show.currentSeason;
    const watchedInSeason = season.episodes.filter(e => season.season < show.currentSeason || (season.season === show.currentSeason && e.ep <= show.currentEpisode)).length;
    details.innerHTML = `<summary>Season ${season.season}<span class="s-count">${watchedInSeason} / ${season.episodes.length} watched</span></summary>`; details.querySelector('summary').dataset.focus = 'season-' + season.season;
    const list = document.createElement('div'); list.className = 'ep-list';
    season.episodes.forEach(episode => {
      const watched = season.season < show.currentSeason || (season.season === show.currentSeason && episode.ep <= show.currentEpisode), row = mkBtn('', 'ep-row' + (watched ? ' watched' : ''));
      row.dataset.focus = `episode-${season.season}-${episode.ep}`; row.setAttribute('aria-describedby', 'episode-help'); row.setAttribute('aria-label', `Mark watched through S${season.season} E${episode.ep}: ${episode.name || 'Episode ' + episode.ep}${watched ? '. Watched' : ''}`);
      row.innerHTML = `<span class="ep-check" aria-hidden="true">${watched ? '✓' : '○'}</span><span class="ep-num">E${episode.ep}</span><span class="ep-title">${esc(episode.name || 'Episode ' + episode.ep)}</span><span class="ep-action">${watched ? 'Watched' : 'Watch through'}</span>`;
      row.onclick = () => setEpisodeTo(show, season.season, episode.ep); list.append(row);
    });
    details.append(list); seasonsBox.append(details);
  });
  if (!show.seasons.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No episodes have been listed yet. Use Refresh show data to check again.'; seasonsBox.append(p); }
  if (activeKey) { const replacement = [...box.querySelectorAll('[data-focus]')].find(el => el.dataset.focus === activeKey); (replacement || $('btn-close-detail')).focus({ preventScroll: true }); }
}
function openStats() {
  const shows = state.shows, count = shows.reduce((sum, s) => sum + watchedCount(s), 0), hours = Math.round(shows.reduce((sum, s) => sum + watchedCount(s) * (s.runtime || 40), 0) / 60);
  const rated = shows.filter(s => s.rating), average = rated.length ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1) : '—';
  const counts = Object.fromEntries(Object.keys(ELEMENT).map(status => [status, shows.filter(s => s.status === status).length])), max = Math.max(1, ...Object.values(counts));
  $('stats-content').innerHTML = `<div class="stat-grid"><div class="stat"><b>${count.toLocaleString()}</b><span>episodes watched</span></div><div class="stat"><b>${hours.toLocaleString()}</b><span>estimated hours watched</span></div><div class="stat"><b>${counts.completed}</b><span>completed shows</span></div><div class="stat"><b>${average}</b><span>average rating out of 5</span></div></div><p class="hint">Watch time uses each show’s listed average runtime, or 40 minutes when no runtime is available.</p><div class="stat-bars">${Object.keys(ELEMENT).map(status => `<div class="stat-bar-row"><span class="sb-label">${STATUS_LABEL[status]}</span><span class="sb-track" aria-hidden="true"><i style="width:${Math.round(counts[status] / max * 100)}%;background:var(--${ELEMENT[status]})"></i></span><span class="sb-num">${counts[status]}</span></div>`).join('')}</div>`;
  openDialog($('stats'));
}
function toast(message, error = false) { const item = document.createElement('div'); item.className = 'toast' + (error ? ' err' : ''); item.textContent = message; $('toasts').append(item); setTimeout(() => item.remove(), error ? 7000 : 4500); }

/* Scene module owns decorative work and its pause preference. */
function bgTheme() { return readLocal(BG_KEY) === 'backdrops' ? 'backdrops' : 'aurora'; }
function applyBg(theme) { if (!writeLocal(BG_KEY, theme)) return; window.LibraryScene?.setMode(theme); document.querySelectorAll('input[name="bg"]').forEach(input => { input.checked = input.value === theme; }); }
function refreshBackdropPool() { window.LibraryScene?.setShows(state.shows); }

/* Native search result buttons, abortable requests and IME-safe debounce. */
let searchTimer = null, searchController = null, searchVersion = 0, composing = false;
function updateSearchClear() {
  const button = $('btn-clear-search');
  if (button) { button.classList.remove('hidden'); button.hidden = !$('search').value; }
}
function hideSearch() { $('results').classList.add('hidden'); $('search').setAttribute('aria-expanded', 'false'); }
function invalidateSearch() { clearTimeout(searchTimer); searchController?.abort(); searchVersion++; }
function initSearch() {
  const input = $('search'), box = $('results');
  function changed() {
    invalidateSearch(); updateSearchClear(); const query = input.value.trim();
    if (query.length < 2 || composing) { hideSearch(); return; }
    searchTimer = setTimeout(() => runSearch(query), 300);
  }
  input.addEventListener('input', changed);
  input.addEventListener('compositionstart', () => { composing = true; invalidateSearch(); });
  input.addEventListener('compositionend', () => { composing = false; changed(); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && box.childElementCount) { box.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); } });
  input.addEventListener('keydown', event => {
    if (event.isComposing || composing) return;
    if (event.key === 'ArrowDown' && !box.classList.contains('hidden')) { event.preventDefault(); box.querySelector('button:not([disabled])')?.focus(); }
    if (event.key === 'Escape') { invalidateSearch(); hideSearch(); event.preventDefault(); }
  });
  box.addEventListener('keydown', event => {
    const buttons = [...box.querySelectorAll('button:not([disabled])')], current = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const step = event.key === 'ArrowDown' ? 1 : -1; if (current + step < 0) input.focus(); else buttons[Math.min(current + step, buttons.length - 1)]?.focus(); }
    if (event.key === 'Escape') { invalidateSearch(); hideSearch(); input.focus(); }
  });
  $('btn-clear-search').onclick = () => { invalidateSearch(); input.value = ''; hideSearch(); updateSearchClear(); input.focus(); };
  document.addEventListener('click', event => { if (!event.target.closest('.search-wrap')) hideSearch(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') && !event.target.closest('input, textarea, select, [contenteditable="true"]')) { event.preventDefault(); input.focus(); }
  });
  updateSearchClear();
}
async function runSearch(query) {
  searchController?.abort(); searchController = new AbortController(); const version = ++searchVersion;
  const box = $('results'); box.classList.remove('hidden'); $('search').setAttribute('aria-expanded', 'true'); box.setAttribute('aria-busy', 'true'); box.innerHTML = '<p class="empty" role="status">Finding shows…</p>';
  try {
    if (!creds.tmdb) throw new ServiceError('TMDB', 401);
    const results = await tmdbSearch(query, searchController.signal);
    if (version !== searchVersion || query !== $('search').value.trim()) return;
    box.replaceChildren();
    if (!results.length) { box.innerHTML = '<p class="empty" role="status">No shows found. Try another title or spelling.</p>'; return; }
    results.slice(0, 8).forEach(result => {
      const row = document.createElement('div'); row.className = 'result'; const year = result.first_air_date ? result.first_air_date.slice(0, 4) : 'Year unavailable';
      row.innerHTML = `${result.poster_path ? `<img src="${esc(IMG_SM + result.poster_path)}" alt="" loading="lazy">` : '<span class="r-poster-fallback" aria-hidden="true">TV</span>'}<div class="r-copy"><div class="r-name">${esc(result.name)}</div><div class="r-year">${esc(year)}</div></div>`;
      const existing = state.shows.find(show => show.tmdbId === result.id), button = mkBtn(existing ? 'Already in library' : adding.has(result.id) ? 'Adding…' : 'Add', 'r-action btn btn-secondary');
      button.disabled = adding.has(result.id); button.setAttribute('aria-label', existing ? `Open ${result.name}, already in library` : `Add ${result.name} to library`);
      button.onclick = () => existing ? openDetail(existing) : addShow(result.id, button); row.append(button); box.append(row);
      const img = row.querySelector('img'); if (img) img.onerror = () => { img.hidden = true; row.classList.add('missing-poster'); };
    });
  } catch (error) {
    if (version !== searchVersion || error.name === 'AbortError') return;
    box.replaceChildren(); const message = document.createElement('p'); message.className = 'empty search-error'; message.setAttribute('role', 'alert'); message.textContent = errorMessage(error); box.append(message);
    if (error instanceof ServiceError && [401, 403].includes(error.status)) { const button = mkBtn('Open settings'); button.onclick = openSettings; box.append(button); }
    else { const button = mkBtn('Try again'); button.onclick = () => runSearch($('search').value.trim()); box.append(button); }
  } finally { if (version === searchVersion) box.removeAttribute('aria-busy'); }
}

/* Setup requires only TMDB. Gist sync is optional. */
function fieldError(id, message = '') {
  const field = $(id), error = $(id + '-error');
  if (field) {
    field.setAttribute('aria-invalid', String(Boolean(message)));
    if (error) field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby') || '', error.id].join(' ').split(/\s+/).filter((value, index, list) => value && list.indexOf(value) === index).join(' '));
  }
  if (error) { error.textContent = message; error.hidden = !message; }
}
function validateFields(prefix, includeGist = false) {
  const candidate = { tmdb: $(prefix + '-tmdb').value.trim(), token: $(prefix + '-token').value.trim(), gist: includeGist ? $(prefix + '-gist').value.trim() : creds.gist };
  ['tmdb', 'token', 'gist'].forEach(key => fieldError(prefix + '-' + key)); let first = null;
  if (!candidate.tmdb) { fieldError(prefix + '-tmdb', 'Enter your TMDB v3 API key.'); first = $(prefix + '-tmdb'); }
  if (includeGist && candidate.gist && !candidate.token) { fieldError(prefix + '-token', 'Add a GitHub token to connect this existing library, or clear the Library ID to use this device only.'); first ||= $(prefix + '-token'); }
  if (includeGist && candidate.gist && !/^[a-f\d]+$/i.test(candidate.gist)) { fieldError(prefix + '-gist', 'Use the Library ID only, not the full Gist URL.'); first ||= $(prefix + '-gist'); }
  if (first) { if (first.id !== prefix + '-tmdb') $('setup-sync')?.setAttribute('open', ''); first.focus(); return null; }
  return candidate;
}
function setMessage(id, text, error = false) { const el = $(id); el.className = 'msg' + (error ? ' err' : ''); el.textContent = text; }
function markServiceField(prefix, error) {
  if (!(error instanceof ServiceError)) return;
  const id = error.service === 'TMDB' ? prefix + '-tmdb' : error.status === 404 ? prefix + '-gist' : prefix + '-token';
  fieldError(id, errorMessage(error)); $(id)?.closest('details')?.setAttribute('open', ''); $(id)?.focus();
}
function showSetup() { openDialog($('setup')); }
function hideSetup() { closeDialog($('setup')); }
function initSetup() {
  let busy = false;
  $('setup-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; const candidate = validateFields('in', true); if (!candidate) return;
    busy = true; $('btn-setup').disabled = true; setMessage('setup-msg', 'Opening your library…'); const beforeState = state;
    try {
      let remote = null;
      if (candidate.token && candidate.gist) remote = await gistPull(candidate); else if (candidate.token) candidate.gist = await gistCreate(candidate);
      if (!saveCreds(candidate)) throw new Error('Your browser could not save the keys. Resolve the storage message and retry.');
      if (remote) { if (!replaceFromRemote(remote)) throw new Error('Your library could not be saved on this device.'); }
      else if (!saveState(false)) throw new Error('Your library could not be saved on this device.');
      hideSetup(); setSync(candidate.token && candidate.gist ? 'ok' : 'local'); render(); refreshBackdropPool(); migrate().then(checkNewEpisodes); $('search').focus();
    } catch (error) { state = beforeState; setMessage('setup-msg', errorMessage(error), true); markServiceField('in', error); }
    finally { busy = false; $('btn-setup').disabled = false; }
  });
}
function openSettings() {
  $('set-gist').value = creds.gist || ''; $('set-tmdb').value = creds.tmdb; $('set-token').value = creds.token;
  $('settings').querySelectorAll('[data-reveal]').forEach(button => { $(button.dataset.reveal).type = 'password'; button.textContent = 'Show'; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', 'Show ' + (button.dataset.reveal.includes('tmdb') ? 'TMDB API key' : 'GitHub token')); });
  ['tmdb', 'token', 'gist'].forEach(key => fieldError('set-' + key)); setMessage('settings-msg', ''); $('btn-copy-gist').disabled = !creds.gist; $('btn-pull').disabled = !creds.token || !creds.gist;
  document.querySelectorAll('input[name="bg"]').forEach(input => { input.checked = input.value === bgTheme(); }); hideSearch(); openDialog($('settings'));
}
function initSettings() {
  let busy = false; $('btn-settings').onclick = openSettings; $('sync-status').onclick = openSettings;
  document.querySelectorAll('[data-reveal]').forEach(button => { button.onclick = () => {
    const field = $(button.dataset.reveal); if (!field) return; const showing = field.type === 'password'; field.type = showing ? 'text' : 'password'; button.textContent = showing ? 'Hide' : 'Show'; button.setAttribute('aria-pressed', String(showing));
    button.setAttribute('aria-label', (showing ? 'Hide ' : 'Show ') + (field.id.includes('tmdb') ? 'TMDB API key' : 'GitHub token'));
  }; });
  document.querySelectorAll('input[name="bg"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return; applyBg(input.value);
    if (input.value === 'backdrops' && !state.shows.some(show => show.backdrop)) toast('Your living library stays visible until your shows have backdrop images.');
  }));
  $('settings-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; const candidate = validateFields('set'); if (!candidate) return;
    busy = true; $('btn-save-settings').disabled = true; $('btn-pull').disabled = true; setMessage('settings-msg', 'Saving settings…');
    try {
      if (candidate.token && !candidate.gist) candidate.gist = await gistCreate(candidate);
      if (!saveCreds(candidate)) throw new Error('Settings were not saved. Resolve the browser storage message and retry.');
      $('set-gist').value = creds.gist || ''; $('btn-copy-gist').disabled = !creds.gist; setMessage('settings-msg', 'Settings saved on this device.');
      if (creds.token && creds.gist) scheduleSync(); else setSync('local');
    } catch (error) { setMessage('settings-msg', errorMessage(error), true); markServiceField('set', error); }
    finally { busy = false; $('btn-save-settings').disabled = false; $('btn-pull').disabled = !creds.token || !creds.gist; }
  });
  $('btn-pull').onclick = async () => {
    if (busy || !creds.token || !creds.gist) return;
    if (inFlightPushes) { setMessage('settings-msg', 'Your latest changes are still syncing. Wait for “Synced”, then try again.'); return; }
    busy = true; $('btn-pull').disabled = true; $('btn-save-settings').disabled = true; setMessage('settings-msg', 'Getting your synced library…'); setSync('busy');
    try {
      // Finish a queued edit first so an immediate manual pull cannot discard it.
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; await gistPush(); }
      if (syncTimer || inFlightPushes) { setMessage('settings-msg', 'New changes are still syncing. Your local library was kept; try again once it is synced.'); return; }
      const revision = localRevision, remote = await gistPull();
      if (!applyPulledState(remote, revision)) {
        setMessage('settings-msg', storageFailed ? 'Could not save the synced library on this device.' : 'Your library changed while syncing. Your latest local changes were kept. Try Sync now again once syncing finishes.', storageFailed);
        return;
      }
      setMessage('settings-msg', 'Your synced library is saved on this device.'); setSync('ok');
    } catch (error) { setMessage('settings-msg', errorMessage(error), true); setSync('err'); }
    finally { busy = false; $('btn-pull').disabled = !creds.token || !creds.gist; $('btn-save-settings').disabled = false; }
  };
  $('btn-copy-gist').onclick = async () => {
    if (!creds.gist) return;
    try { await navigator.clipboard.writeText(creds.gist); setMessage('settings-msg', 'Library ID copied.'); }
    catch (_) { $('set-gist').focus(); $('set-gist').select(); setMessage('settings-msg', 'Copy was unavailable. Your Library ID is selected; press Ctrl+C or use Copy.'); }
  };
}

async function boot() {
  window.addEventListener('library-storage-error', storageError);
  loadCreds(); loadState(); initSearch(); initModals(); initSetup(); initSettings(); initRows(); render(); window.LibraryScene?.init({ mode: bgTheme(), shows: state.shows });
  if (!creds.tmdb) showSetup(); else setSync(creds.token && creds.gist ? 'ok' : 'local');
  if (creds.token && creds.gist) {
    setSync('busy');
    try {
      const revision = localRevision, remote = await gistPull();
      if (remote && applyPulledState(remote, revision)) setSync('ok');
      else if (!storageFailed) toast('Your library changed during sync. Your latest local changes were kept.');
    } catch (_) { setSync('err'); }
  }
  if (creds.tmdb) migrate().then(checkNewEpisodes);
  let focusPull = false;
  window.addEventListener('focus', async () => {
    if (!creds.token || !creds.gist || syncTimer || inFlightPushes || focusPull || document.querySelector('dialog[open]')) return; focusPull = true;
    try {
      const revision = localRevision, remote = await gistPull();
      if (remote && applyPulledState(remote, revision)) setSync('ok');
      else if (!storageFailed) toast('Your library changed during sync. Your latest local changes were kept.');
    } catch (_) { setSync('err'); } finally { focusPull = false; }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
