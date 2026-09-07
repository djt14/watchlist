# Isolated review and verification

From the repository folder, run `node tests/server.mjs` and open <http://127.0.0.1:8763/watchlist/?preview=1>.
The default fixed loopback port has its own browser storage; it does not read the published site's library.
All 22 shows and poster illustrations are fictional. Production HTML never loads these fixtures.
Fixture version 2 serves SVG artwork at same-origin `/__fixtures/poster/INDEX.svg` URLs, compatible with the application's HTTP-only image validation. Existing preview work is preserved; use an explicit reset once to upgrade older data-URL fixtures.
No API call leaves the preview tab: TMDB and Gist responses are local fixtures, and CSP blocks other external resources.
Service-worker registration is disabled only in fixture previews, preventing test HTML from entering its production cache.

Changes persist between refreshes. The preview banner's **Reset sample data** link explicitly starts over.
For a specific starting state, append `&scenario=NAME&reset=1`. Supported scenarios:

- `populated`: all shelves, long title, missing poster, horizontal overflow, and season boundary.
- `empty`: a configured empty library.
- `setup`: setup with no key.
- `loading`: slow mock API calls (four seconds).
- `key-error`: mock API responds 401.
- `network-error`: mock API throws a connection error.
- `sync-error`: Gist responds 503.
- `storage-error`: saved fixture data loads, then writes fail with quota errors.

Search `arrival` to add a new show, `lantern` to inspect an existing result, `test` for several results, or `none` for no results.
The first show's next action crosses from season 1 episode 4 to season 2 episode 1.
For setup testing, any nonempty TMDB key is accepted by the mock; a token and Gist value are also synthetic.

Run `node --test tests/app-state.test.mjs tests/sw.test.mjs tests/fixtures.test.mjs tests/server.test.mjs tests/library-scene.test.cjs tests/fonts.test.mjs` for offline checks of application progress, storage rollback, service-worker cache isolation,
asset and navigation fallbacks, cache failures, fixture coverage, request isolation, persistence and error scenarios.
These are infrastructure tests; browser review remains necessary for visual layout, keyboard behavior, and application workflows.

Run `node --test tests/app.test.cjs` for repeatable checks of the actual application logic: watched-through progress across season boundaries,
completion and backtracking, existing saved-data compatibility, duplicate-ID rejection, text/URL safety, rollback after a failed storage write,
stale pull responses, in-flight push guards, and refresh-button recovery after rollback.
The harness uses fictional in-memory data, omits UI startup, and cannot access real browser storage or services.

Baseline HTML can be served from a sibling `watchlist-baseline` folder at `/baseline/?preview=1`, or specify
`node tests/server.mjs --baseline ABSOLUTE_PATH`. The baseline and redesigned pages share this preview origin,
so reset sample data before a before/after comparison. Use another `--port` for simultaneous independent sessions.
The baseline preview loads the same locally bundled Cinzel/Inter fonts so the comparison can run without external font requests. Its production files remain unchanged.
