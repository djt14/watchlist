/* Original decorative artwork and a single motion controller.
   No library data is persisted here. app.js owns the existing wstl_bg setting. */
(() => {
  'use strict';

  const MOTION_KEY = 'wstl_motion';
  const SLIDE_MS = 28000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let initialized = false;
  let mode = 'aurora';
  let paused = false;
  let backdropPool = [];
  let poolSignature = '';
  let failedBackdrops = new Set();
  let timer = null;
  let imageRequest = null;
  let requestVersion = 0;
  let currentUrl = '';
  let currentLayer = 0;
  let nextIndex = 0;
  let scene;
  let backdrops;
  let motionButton;
  let layers = [];

  // This markup is authored artwork, never interpolated with show/API content.
  const OWL = `<svg class="library-scene__owl" viewBox="0 0 360 600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="library-owl-feathers" x1="0" x2="1"><stop stop-color="#131d26"/><stop offset=".45" stop-color="#26343a"/><stop offset="1" stop-color="#0c141f"/></linearGradient>
      <linearGradient id="library-owl-breast" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#283840"/><stop offset="1" stop-color="#101c26"/></linearGradient>
      <linearGradient id="library-owl-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ece3c8"/><stop offset=".5" stop-color="#c7cbb8"/><stop offset="1" stop-color="#899c95"/></linearGradient>
      <linearGradient id="library-owl-rim" x1="0" x2="1"><stop stop-color="#c8ac6e" stop-opacity=".6"/><stop offset=".7" stop-color="#8fb6a2" stop-opacity=".1"/></linearGradient>
    </defs>
    <!-- The guardian's long folded wings frame its narrow, watchful face. -->
    <path d="M157 167C99 165 78 221 66 316L34 506C33 527 34 553 43 568L80 540 103 529 127 490 158 380Z" fill="url(#library-owl-feathers)" stroke="#485550" stroke-width="1.5"/>
    <path d="M211 161C263 180 277 223 285 309L328 517 309 554 283 539 257 498 227 403Z" fill="url(#library-owl-feathers)" stroke="#2a4445" stroke-width="2"/>
    <path d="M147 163C123 215 124 300 137 369L117 490 160 511 188 502 224 517 250 483 220 344C232 266 232 201 213 168Z" fill="url(#library-owl-breast)" stroke="#34454a" stroke-width="2"/>
    <path d="M153 175C143 218 153 268 181 309 204 271 217 221 209 173Z" fill="#3b4a4e" opacity=".5"/>
    <path d="M136 242L111 375 78 514M128 258L97 391 57 540M119 252L79 418 43 555M143 290L119 435 99 507M220 240L245 379 282 524M231 253L264 408 305 540M214 312L232 444 252 488" stroke="#587069" stroke-opacity=".35" stroke-width="2"/>
    <path d="M76 328L99 344M66 368L89 384M59 410L80 426M51 453L70 470M268 326L249 343M277 368L256 388M289 412L270 431M300 458L279 477" stroke="#89947a" stroke-opacity=".23" stroke-width="2"/>
    <path d="M161 264L169 278 179 272M184 283L191 296 202 285M152 307L163 326 174 316M181 335L193 352 205 335M145 363L157 379 170 366M182 389L195 404 207 386M141 416L155 433 169 419M178 451L193 469 207 450" stroke="#6a827a" stroke-opacity=".27" stroke-width="2"/>
    <path d="M153 489L150 531M191 496L198 534M145 531L128 539M150 530L153 541M158 534L174 540M191 535L178 544M200 534L205 544M205 535L219 541" stroke="#9f9d7e" stroke-width="5" stroke-linecap="round"/>
    <!-- A carved perch echoes the library's woodwork. -->
    <path d="M92 546L242 530 267 548 98 566Z" fill="#4c4934" stroke="#a68b51" stroke-opacity=".56" stroke-width="2"/>
    <path d="M111 565L138 600H243L222 552Z" fill="#242d29" stroke="#6f6844" stroke-width="2"/>
    <path d="M131 567L155 594M151 564L175 594M171 562L195 594" stroke="#83754b" stroke-opacity=".4" stroke-width="2"/>
    <g class="library-scene__owl-head">
      <path d="M118 142L105 103 107 69 91 44 121 52 119 25 145 38 153 14 173 34 193 18 208 37 231 23 232 47 260 42 247 70 260 89 245 109 246 138 224 171 199 186 161 188 134 170Z" fill="#12212a" stroke="url(#library-owl-rim)" stroke-width="2"/>
      <path d="M115 72C130 43 159 45 181 66 205 40 235 47 244 76 257 113 226 151 183 175 143 156 106 120 115 72Z" fill="url(#library-owl-face)" stroke="#b2baa4" stroke-opacity=".55" stroke-width="1.5"/>
      <path d="M123 72C138 50 159 54 181 75 204 50 225 55 237 75M122 83C111 115 148 147 181 164 213 147 246 114 237 82" stroke="#eee5ca" stroke-opacity=".35" stroke-width="2"/>
      <path d="M128 84C143 70 157 71 171 86L170 104C151 119 135 108 128 84ZM193 85C211 69 226 70 237 82 232 105 218 116 197 103Z" fill="#101e27"/>
      <path d="M124 77Q147 59 173 82M190 82Q214 59 239 75" stroke="#738b83" stroke-width="4" stroke-linecap="round"/>
      <g class="library-scene__owl-eye"><ellipse cx="150" cy="92" rx="6.5" ry="10" fill="#b8b98a"/><ellipse cx="151" cy="93" rx="3" ry="9" fill="#0b1420"/><circle cx="152" cy="88" r="1.6" fill="#e5e4c4"/></g>
      <g class="library-scene__owl-eye"><ellipse cx="216" cy="90" rx="6.5" ry="10" fill="#b8b98a"/><ellipse cx="215" cy="92" rx="3" ry="9" fill="#0b1420"/><circle cx="217" cy="87" r="1.6" fill="#e5e4c4"/></g>
      <path d="M180 95L170 119 183 148 196 119 186 94Z" fill="#525f54"/>
      <path d="M182 100L174 120 183 140 188 116Z" fill="#b4aa7a"/>
      <path d="M183 140V149" stroke="#293e3f" stroke-width="2"/>
      <path d="M123 109L138 127M128 120L145 138M138 133L155 145M243 106L229 125M237 119L222 136M226 134L210 146" stroke="#768f87" stroke-opacity=".45" stroke-width="1.3"/>
      <path d="M142 160L157 167 167 179M222 158L211 168 200 178" stroke="#698177" stroke-opacity=".5" stroke-width="2"/>
    </g>
  </svg>`;

  function storageError() {
    window.dispatchEvent(new CustomEvent('library-storage-error', {
      detail: { setting: 'motion', message: 'Your background preference could not be saved.' }
    }));
  }

  function canMove() {
    return !paused && !reducedMotion.matches && !document.hidden;
  }

  function cancelPending() {
    requestVersion += 1;
    if (imageRequest) {
      imageRequest.onload = null;
      imageRequest.onerror = null;
      imageRequest.src = '';
      imageRequest = null;
    }
  }

  function clearSlideTimer() {
    window.clearTimeout(timer);
    timer = null;
  }

  function showLibrary() {
    scene.hidden = false;
    backdrops.hidden = true;
    document.body.classList.remove('bg-backdrops');
    document.body.classList.toggle('library-scene--empty-backdrops', mode === 'backdrops');
  }

  function scheduleSlide() {
    clearSlideTimer();
    if (canMove() && mode === 'backdrops' && backdropPool.length > 1) {
      timer = window.setTimeout(() => {
        timer = null;
        advanceSlide();
      }, SLIDE_MS);
    }
  }

  function advanceSlide() {
    if (imageRequest || mode !== 'backdrops' || document.hidden || !backdropPool.length) return;
    const candidates = backdropPool.filter(url => !failedBackdrops.has(url));
    if (!candidates.length) {
      currentUrl = '';
      showLibrary();
      return;
    }
    const url = candidates[nextIndex % candidates.length];
    nextIndex = (nextIndex + 1) % candidates.length;
    if (url === currentUrl && candidates.length === 1) return;
    if (url === currentUrl) {
      advanceSlide();
      return;
    }
    cancelPending();
    const version = requestVersion;
    const image = new Image();
    imageRequest = image;
    image.onload = () => {
      if (version !== requestVersion || mode !== 'backdrops' || document.hidden) return;
      imageRequest = null;
      const nextLayer = currentUrl ? 1 - currentLayer : currentLayer;
      layers[nextLayer].style.backgroundImage = `url("${url.replaceAll('"', '%22')}")`;
      layers[nextLayer].classList.add('library-scene__backdrop--active');
      layers[1 - nextLayer].classList.remove('library-scene__backdrop--active');
      currentLayer = nextLayer;
      currentUrl = url;
      scene.hidden = true;
      backdrops.hidden = false;
      document.body.classList.add('bg-backdrops');
      document.body.classList.remove('library-scene--empty-backdrops');
      scheduleSlide();
    };
    image.onerror = () => {
      if (version !== requestVersion) return;
      imageRequest = null;
      failedBackdrops.add(url);
      advanceSlide();
    };
    image.src = url;
  }

  function updateMotion() {
    const reduced = reducedMotion.matches;
    document.body.classList.toggle('motion-paused', paused);
    document.body.classList.toggle('motion-reduced', reduced);
    document.body.classList.toggle('library-scene--hidden', document.hidden);
    if (motionButton) {
      const label = reduced ? 'Motion off · system' : paused ? 'Resume motion' : 'Pause motion';
      const text = motionButton.querySelector('.motion-label');
      if (text) text.textContent = label;
      else motionButton.textContent = label;
      motionButton.disabled = reduced;
      motionButton.setAttribute('aria-pressed', String(paused || reduced));
      motionButton.setAttribute('aria-label', reduced ? 'Background motion is off because of your system preference' : label);
      motionButton.title = reduced ? 'Reduced motion is enabled in your system settings.' : 'Control background animation';
    }
    if (!canMove()) {
      clearSlideTimer();
      cancelPending();
    } else if (mode === 'backdrops') {
      if (!currentUrl) advanceSlide();
      else scheduleSlide();
    }
    if (!currentUrl && mode === 'backdrops' && !document.hidden) advanceSlide();
  }

  function setPaused(value) {
    if (!initialized) init();
    paused = Boolean(value);
    try { localStorage.setItem(MOTION_KEY, paused ? 'paused' : 'running'); }
    catch { storageError(); }
    updateMotion();
    // A paused backdrop still has a first image; only the slide changes are paused.
    if (!currentUrl && mode === 'backdrops' && !document.hidden) advanceSlide();
  }

  function setMode(value) {
    if (!initialized) {
      init({ mode: value });
      return;
    }
    mode = value === 'backdrops' ? 'backdrops' : 'aurora';
    clearSlideTimer();
    cancelPending();
    if (mode === 'aurora' || !backdropPool.length) {
      showLibrary();
    } else if (currentUrl && backdropPool.includes(currentUrl)) {
      scene.hidden = true;
      backdrops.hidden = false;
      document.body.classList.add('bg-backdrops');
      document.body.classList.remove('library-scene--empty-backdrops');
      scheduleSlide();
    } else {
      showLibrary();
      advanceSlide();
    }
  }

  function setShows(shows = []) {
    if (!initialized) {
      init({ shows });
      return;
    }
    const urls = (Array.isArray(shows) ? shows : []).map(show => {
      try {
        const url = new URL(typeof show?.backdrop === 'string' ? show.backdrop : '');
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
      } catch { return ''; }
    }).filter(Boolean);
    const pool = [...new Set(urls)];
    const signature = pool.join('\n');
    if (signature === poolSignature) return;
    poolSignature = signature;
    backdropPool = pool;
    failedBackdrops = new Set();
    nextIndex = 0;
    if (!backdropPool.includes(currentUrl)) currentUrl = '';
    setMode(mode);
  }

  function init(options = {}) {
    if (initialized) {
      if (options.shows) setShows(options.shows);
      if (options.mode) setMode(options.mode);
      return;
    }
    scene = document.getElementById('bg-aurora');
    backdrops = document.getElementById('bg-backdrops');
    motionButton = document.getElementById('btn-motion');
    layers = [document.getElementById('bd-a'), document.getElementById('bd-b')];
    if (!scene || !backdrops || layers.some(layer => !layer)) return;
    initialized = true;
    scene.innerHTML = '<img class="library-scene__architecture" src="assets/library-interior.svg" alt="" decoding="async" draggable="false" width="1600" height="1000">' +
      '<div class="library-scene__light library-scene__light--left"></div><div class="library-scene__light library-scene__light--right"></div>' + OWL;
    // Fixed positions keep a paused scene composed and avoid per-frame scripting.
    for (let i = 0; i < 24; i += 1) {
      const dust = document.createElement('span');
      dust.className = 'library-scene__dust';
      dust.style.cssText = `--library-x:${(i * 37 + 7) % 100}%;--library-y:${(i * 19 + 13) % 95}%;--library-size:${1 + i % 3}px;--library-duration:${26 + i % 11 * 3}s;--library-delay:-${i * 3}s`;
      scene.append(dust);
    }
    for (let i = 0; i < 4; i += 1) {
      const spirit = document.createElement('span');
      spirit.className = 'library-scene__spirit';
      spirit.style.cssText = `--library-x:${[8, 30, 74, 94][i]}%;--library-y:${[49, 78, 66, 36][i]}%;--library-duration:${19 + i * 7}s;--library-delay:-${i * 9}s`;
      scene.append(spirit);
    }
    try { paused = localStorage.getItem(MOTION_KEY) === 'paused'; }
    catch { storageError(); }
    motionButton?.addEventListener('click', () => setPaused(!paused));
    document.addEventListener('visibilitychange', updateMotion);
    reducedMotion.addEventListener('change', () => {
      updateMotion();
      if (!currentUrl && mode === 'backdrops' && !document.hidden) advanceSlide();
    });
    window.addEventListener('storage', event => {
      if (event.key === MOTION_KEY || event.key === null) {
        paused = event.key === MOTION_KEY && event.newValue === 'paused';
        updateMotion();
      }
    });
    setShows(options.shows || []);
    setMode(options.mode || 'aurora');
    updateMotion();
    if (!currentUrl && mode === 'backdrops' && !document.hidden) advanceSlide();
  }

  window.LibraryScene = Object.freeze({ init, setMode, setShows, setPaused });
})();
