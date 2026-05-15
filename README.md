# Wan Shi Tong's Library

An *Avatar: The Last Airbender* themed TV show watchlist tracker. Track what you're
watching and what episode you're on. Show data comes from TMDB; your watchlist
syncs across devices through a private GitHub Gist.

## Setup (one time)

1. **TMDB key** — make a free account at [themoviedb.org](https://www.themoviedb.org/),
   then Settings → API → request a **Developer** key (v3 auth).
2. **GitHub token** — create a [classic token](https://github.com/settings/tokens)
   with **only the `gist` scope**.
3. Open the app, paste both keys into the setup screen. The app creates your
   private Gist automatically and shows its **Library ID**.

## Syncing another device

Open the same URL on your phone or another browser, then in the setup screen
paste your TMDB key, your `gist` token, and the **Library ID** (found under the
gear icon → Settings on your first device).

## How it works

- Search any show → it's added to **Now Watching** with full episode data.
- Tap **▶ Watched This** to advance an episode; seasons roll over automatically.
- Finishing the finale moves a show to **Mastered**, where you can rate it.
- Move shows between shelves: Now Watching / Scrolls to Unroll / Frozen in Time / Mastered.

Credentials are stored only in your browser (`localStorage`) — never in this repo.

*This product uses the TMDB API but is not endorsed or certified by TMDB.*
