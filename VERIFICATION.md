# Verification — living-library redesign

Reviewed on 2026-09-07. This report distinguishes browser checks, isolated automated tests, and checks that could not be completed. The published GitHub Pages site was not changed during review.

The redesign is prepared on `redesign/living-library` for review before merging. The source baseline is public commit `dd781775c04cd6253cd712275fe4a922da2b06ea`. The downloadable package also contains a local snapshot branch bundle and an apply-ready patch.

## Completed checks

**Automated tests: 38 passing test entries.** Run `npm test` from this folder with Node.js 22 or newer; no installed packages, accounts, or external network are required. The suite checks:

- Sequential episode advancement, season boundaries, one-episode backtracking, completion, watched-through selection, ratings, and shows with no episode data.
- Existing storage shape and metadata, rejected malformed remote data, duplicate IDs, failed-save rollback, and preservation of an unreadable stored library.
- Escaped external text, HTTP-only image URLs, isolated fixture requests, superseded-search cancellation, loading/error scenarios, and preview progress surviving refresh.
- Service-worker scope and GET restrictions, preservation of unrelated caches, successful-response caching, exact offline asset lookup, navigation-only HTML fallback, and cache failure handling.
- Saved scenery pause, live reduced-motion changes, hidden-tab suspension, slideshow fallback, and failed image/storage behavior in an isolated controller harness.
- Local WOFF2 signatures and source hashes, exact original license copies, local stylesheet references, font MIME type, and opt-in fixture-server isolation.

**Chrome interface review:** the redesigned application was inspected at 390px, 768px, and 1440px widths using fictional shows and locally generated SVG posters. Populated shelves, long titles, missing artwork, empty states, setup, search, and dialogs were reviewed. Exercised workflows included setup with optional mock GitHub sync, search/add/remove, shelf changes, rating, a sequential season transition, failed-save rollback, and refresh persistence. Before/after screenshots accompany the deliverable.

Both comparison versions use the same fictional records and local Cinzel/Inter fonts. The baseline preview supplies those font faces locally because external font requests are blocked in the isolated preview. Original baseline source files remain unchanged.

Final phone review caught and repaired horizontal overflow from the detail artwork's aspect ratio/minimum height. After constraining it to the panel width, the 390px view measured 340px for both the dialog's content width and scroll width. Lower actions remained reachable, and removal cancellation restored the dialog.

**Actual offline browser shell: passed.** A clean production page at `http://127.0.0.1:8764/watchlist/` was opened without fixture injection. The local server was then stopped and the same URL was opened again. Setup and empty shelves loaded from the service worker; bundled Cinzel and the illustrated shelves/owl remained visibly present. This verifies the cached application shell, not offline TMDB search or metadata refresh.

## Audit results and limitations

- **Premium strict audit completed with exit code 1:** its JSON report contains 16 `affordance.actionless-button` findings. Manual source review found corresponding handlers in `app.js` and `library-scene.js` for all 16 controls, including settings, clear search, scenery pause, credential reveal, copy/sync, close, and removal confirmation. These are documented scanner false positives because this check does not follow handlers attached from external JavaScript. The audit must not be described as a clean automated pass.
- **Official DESIGN.md lint was unavailable** in this environment and was not completed. Design and interaction documents were reviewed against the implementation; that review does not substitute for the unavailable official linter.
- **Actual 200% browser zoom was blocked by browser policy.** Responsive width checks passed, but they are not equivalent to a verified 200% zoom journey. This remains a manual review item.
- **Live OS reduced-motion changes and hidden-tab suspension were not manually verified in Chrome.** Their behavior is covered by controller tests; the distinction matters when reproducing review results.
- **No real TMDB or GitHub account was exercised.** API success, authorization errors, sync failure, and optional sync setup used local mocks. Real credentials, remote permissions, service availability, and cross-device behavior remain outside those fixture results. Search, artwork retrieval, episode updates, and Gist synchronization require internet access.
- The existing Gist data format and local storage keys are preserved. Conflict resolution and a sync merge-engine redesign were intentionally excluded; the application does not claim conflict-free concurrent editing across devices.

## Reproduce the local review

Run `npm start`, then open `http://127.0.0.1:8763/watchlist/?preview=1`. This is an isolated local origin with fictional data; API calls are mocked and external requests are blocked. Use the banner's reset link once when upgrading older preview fixtures, or append `&reset=1`. Subsequent refreshes preserve preview work. Scenario and baseline instructions are in `tests/README.md`.

The production route without `?preview=1` contains no fixture scripts. Use a separate fixed port for service-worker/offline checks so test injection and cached production content cannot mix. The font licenses and verified source provenance are in `assets/fonts/`.
