// Isolated motion-controller checks. No network, real browser storage, or live library.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '..', 'library-scene.js'), 'utf8');

function harness(saved = {}, blocked = false) {
  const events = {}, docEvents = {}, timers = new Map(), requests = [], emitted = [];
  let serial = 0;
  class Classes {
    constructor() { this.values = new Set(); }
    add(value) { this.values.add(value); }
    remove(value) { this.values.delete(value); }
    contains(value) { return this.values.has(value); }
    toggle(value, on) {
      if (on ?? !this.values.has(value)) this.add(value);
      else this.remove(value);
    }
  }
  const element = () => ({
    classList: new Classes(), style: {}, hidden: false, children: [], attributes: {}, listeners: {},
    append(value) { this.children.push(value); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelector() { return null; }
  });
  const elements = Object.fromEntries(['bg-aurora', 'bg-backdrops', 'bd-a', 'bd-b', 'btn-motion'].map(id => [id, element()]));
  const document = {
    body: element(), hidden: false, getElementById: id => elements[id],
    createElement: element, addEventListener: (type, fn) => docEvents[type] = fn
  };
  const media = { matches: false, addEventListener: (type, fn) => media.change = fn };
  const window = {
    matchMedia: () => media, addEventListener: (type, fn) => events[type] = fn,
    dispatchEvent: event => emitted.push(event),
    setTimeout: fn => {
      const id = ++serial;
      timers.set(id, () => { timers.delete(id); fn(); });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  };
  class Image {
    set src(value) { this.url = value; if (value) requests.push(this); }
    get src() { return this.url; }
  }
  const localStorage = {
    getItem: key => { if (blocked) throw Error('denied'); return saved[key]; },
    setItem: (key, value) => { if (blocked) throw Error('denied'); saved[key] = value; }
  };
  vm.runInNewContext(code, {
    window, document, localStorage, Image, URL,
    CustomEvent: class { constructor(type, props) { this.type = type; Object.assign(this, props); } }
  });
  return { api: window.LibraryScene, media, document, elements, timers, requests, events, docEvents, saved, emitted };
}

let h = harness();
h.api.init({ mode: 'aurora', shows: [] });
assert.equal(h.elements['bg-aurora'].hidden, false);
assert.equal(h.elements['bg-backdrops'].hidden, true);
assert.equal(h.elements['bg-aurora'].children.length, 28);
assert.equal(h.elements['btn-motion'].textContent, 'Pause motion');
h.api.init();
assert.equal(h.elements['bg-aurora'].children.length, 28, 'initialization is idempotent');
h.elements['btn-motion'].listeners.click();
assert.equal(h.saved.wstl_motion, 'paused');
assert(h.document.body.classList.contains('motion-paused'));
h.elements['btn-motion'].listeners.click();
assert.equal(h.saved.wstl_motion, 'running');
h.media.matches = true; h.media.change();
assert.equal(h.elements['btn-motion'].disabled, true);
assert(h.document.body.classList.contains('motion-reduced'));
h.media.matches = false; h.media.change();
assert.equal(h.elements['btn-motion'].disabled, false);
h.api.setMode('backdrops');
assert.equal(h.requests.length, 0);
assert(h.document.body.classList.contains('library-scene--empty-backdrops'));
h.api.setShows([
  { backdrop: 'https://example.com/a.jpg' }, { backdrop: 'https://example.com/b.jpg' },
  { backdrop: 'javascript:bad' }, { backdrop: 'https://example.com/a.jpg' }
]);
assert.equal(h.requests.length, 1);
h.requests.at(-1).onload();
assert.equal(h.elements['bg-backdrops'].hidden, false);
assert.equal(h.timers.size, 1);
h.api.setPaused(true);
assert.equal(h.timers.size, 0);
h.api.setPaused(false);
assert.equal(h.timers.size, 1);
h.document.hidden = true; h.docEvents.visibilitychange();
assert.equal(h.timers.size, 0);
assert(h.document.body.classList.contains('library-scene--hidden'));
h.document.hidden = false; h.docEvents.visibilitychange();
assert.equal(h.timers.size, 1);
[...h.timers.values()][0]();
assert.equal(h.requests.length, 2);
h.requests.at(-1).onload();
assert(h.elements['bd-b'].classList.contains('library-scene__backdrop--active'));
h.api.setShows([]);
assert.equal(h.elements['bg-aurora'].hidden, false);
assert.equal(h.timers.size, 0);
h.events.storage({ key: 'wstl_motion', newValue: 'paused' });
assert(h.document.body.classList.contains('motion-paused'));

h = harness({ wstl_motion: 'paused' });
h.api.init({ mode: 'backdrops', shows: [{ backdrop: 'https://example.com/a.jpg' }] });
assert.equal(h.timers.size, 0);
h.requests.at(-1).onload();
assert.equal(h.elements['bg-backdrops'].hidden, false);
assert.equal(h.timers.size, 0);

h = harness();
h.api.init({ mode: 'backdrops', shows: [
  { backdrop: 'https://example.com/bad.jpg' }, { backdrop: 'https://example.com/bad2.jpg' }
] });
h.requests.at(-1).onerror();
h.requests.at(-1).onerror();
assert.equal(h.elements['bg-aurora'].hidden, false);
assert.equal(h.timers.size, 0);

h = harness({}, true);
h.api.init();
h.api.setPaused(true);
assert.equal(h.emitted.length, 2);
assert(h.emitted.every(event => event.type === 'library-storage-error'));
console.log('PASS: scene initialization, persistent pause, live reduced motion, safe image pool, slideshow, hidden-tab suspension, static paused image, empty/failed-image fallback, and storage errors.');
