# Watchlist interaction contract

## Sources and compatibility

The user-approved living-library plan governs this change. The inherited README and app.js define TV-only TMDB integration, four status shelves, sequential watched-through progress and optional Gist synchronization. No framework or backend is introduced.

Existing local keys wstl_state, wstl_tmdb, wstl_token, wstl_gist, wstl_bg, wstl_epcheck and the Gist watchlist.json shape remain compatible. wstl_bg=aurora now renders the living library; backdrops remains the user's show scenes. wstl_motion is the only new preference. Library operations continue using the existing state shape and sync model; automatic conflict merging is not introduced.

## Canonical owners

| Capability | Owner | Contract / variants | Verification |
|---|---|---|---|
| Dialog | app.js shared dialog helpers and native dialog markup | Setup, settings, statistics, details, removal; native focus containment and explicit restoration | Keyboard and browser workflows |
| Form | app.js shared field-error/busy helpers | Setup and settings; novalidate; preserve values on failure | Fixture setup/auth/storage cases |
| Select/Listbox | Native select | Show status; platform-owned popup accepted | Browser keyboard and open popup |
| Toast/status | app.js toast, storage alert and setSync | Success, failure, local, syncing, synced | Storage and API failure fixtures |
| Scrollbar | style.css global selectors | Document, shelf lane, results and dialog; geometry-specific overflow only | Responsive inspection |
| CRUD | app.js mutation functions | Add, details, status/rating/progress update and confirmed removal | Sample-library complete flow |
| Search | app.js search handlers | Ephemeral TMDB lookup with real action buttons | Stale response, clear, IME and keyboard |
| Motion | library-scene.js | User pause, reduced motion, document hidden, backdrop fallback | Scene-controller tests and browser |

No data table, custom listbox, calendar, drag interaction, locale provider, authentication server, or monetary workflow applies.

## Flow ledger

| Operation | Pending | Success / destination | Error / recovery |
|---|---|---|---|
| Setup | Disable repeat submit; keep field dimensions | Library, focus search | Associated field error or service message; preserve input |
| Add show | Mark selected Add busy; block duplicate adds | Existing Now Watching destination; announce addition | Keep results and offer retry; distinguish network and key failure |
| Open details | Preserve shelf position | Named native dialog | Remain in library if item is gone |
| Record progress | Sequential next episode | Update card/details and count; cross-season transition preserved | Roll back mutation on failed local storage |
| Change rating/status | Keep current dialog | Updated state, same logical focus | Preserve prior stored state when saving fails |
| Remove show | Named confirmation, least destructive initial focus | Close relevant dialog and return to collection | Cancellation changes nothing |
| Save settings | Prevent duplicate submit | Keep settings open with saved confirmation and any newly created Library ID available to copy; Close returns to library | Keep entered values and identify failing field |
| Sync | Text status | Existing Gist behavior | Display failure; never claim an unsuccessful local write was saved |

Search is a temporary external-catalog query, not committed navigation/filter state; it intentionally stays out of the URL. Native buttons provide Tab/Enter/Space behavior, and arrow navigation is supported within search results. Clearing cancels work and restores input focus. IME composition must not trigger premature search or submit.

Episode controls say watched through: selecting S2 E3 marks the chronological prefix, not just an independent checkbox. Stepping back reverses a single episode. Existing automatic completion behavior is retained.

## Dialog and feedback rules

Use native dialog top-layer behavior; never browser alert/confirm/prompt. All close controls have names. Restoration uses the exact opener when present, otherwise a sensible surviving control. Nested removal confirmation returns to the detail dialog if canceled. Setup requires the key and cannot be accidentally dismissed.

Field errors are text, tied with aria-describedby and aria-invalid. Secrets are masked initially; reveal buttons are keyboard accessible. Inputs preserve browser paste support. Optional sync is clearly optional and does not require an account for local tracking.

Toasts supplement critical persistent information. A failed storage write remains visible in the storage alert, including when browser storage is unavailable. Busy controls prevent repeated effects without changing dimensions.

## Motion and appearance

Background controls do not alter watchlist data. Scenery selection saves immediately and is labeled accordingly; the Save connection settings button commits credential changes and keeps the dialog open so a new Library ID can be copied. Reduced-motion changes apply immediately. Hidden tabs suspend decoration and backdrop timers. Paused artwork is fully composed rather than blank. Scenes never handle pointer events or appear in the accessibility tree.

## Release boundary

Review on an isolated branch/local fixture preview. The preview's fictional records and mocked services never run in the published document. Keep the production GitHub Pages branch unchanged until reviewed. Existing sync conflict-resolution limitations remain outside scope and must not be advertised as fixed.
