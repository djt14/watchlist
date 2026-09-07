# Wan Shi Tong's Library

An *Avatar: The Last Airbender* themed television watchlist with an illustrated living library, readable episode controls, and optional GitHub Gist sync. The static HTML/CSS/JavaScript app runs on GitHub Pages without a build step.

## Setup

1. Get a TMDB **API key (v3 auth)** from [TMDB developer settings](https://www.themoviedb.org/settings/api).
2. Open the app, enter that key, and choose **Open the library**. Progress saves in this browser. GitHub is optional.
3. For sync, expand **Sync across devices**. Supply a [classic GitHub token](https://github.com/settings/tokens) with the `gist` scope. Leave Library ID blank to create a secret Gist, or paste an existing ID to use it. Copy the resulting ID from Settings to connect another device.

Use the same site address on each device. Enter the TMDB key, token, and matching Library ID on the second device. Credentials are stored in the browser and sent to their respective services when needed; do not commit them to this repository. A secret Gist is unlisted rather than encrypted. The preview described below uses fictional data and does not require credentials.

## Everyday use

- **Find a show to add** searches TMDB. Choose an explicit **Add** button; saved results say **Already in library**.
- Each card always shows its next episode and progress. **Mark S2 E1 watched**, for example, records every episode through that point. Seasons advance automatically, and finishing the finale moves the show to **Mastered**.
- Open the title/poster for details, episode backtracking, shelf changes, ratings, and confirmed removal. Tracking is sequential; it is not an independent checklist of episodes.
- Shelves retain their themed names with plain descriptions: Now Watching / In progress; Scrolls to Unroll / Planned; Frozen in Time / On hold; Mastered / Completed.
- **Pause motion** saves your preference. System reduced motion is respected, and background work stops while the tab is hidden. Settings also retains the slideshow of your shows.
- Readable sync and storage messages distinguish saved changes from failed writes. Existing storage keys and the `watchlist.json` Gist format are preserved. Concurrent multi-device conflict resolution remains outside this redesign.

The service worker caches the app shell, illustration, and bundled fonts after the first successful load. Searching, fetching new posters/metadata, and Gist sync require internet access.

## Development and review

Use Node.js 22 or later. No dependency install or build step is needed.

```sh
npm start
npm test
```

Open <http://127.0.0.1:8763/watchlist/?preview=1> for the isolated sample library. See [tests/README.md](tests/README.md) for error scenarios and baseline comparisons, [VERIFICATION.md](VERIFICATION.md) for checks and limitations, and [DESIGN.md](DESIGN.md) / [UX-CONTRACT.md](UX-CONTRACT.md) for maintained visual and interaction rules.

The production files preserve `/watchlist/` paths and existing GitHub Pages deployment. Review on the redesign branch before merging; previewing locally does not publish changes.

Bundled fonts retain their licenses and provenance in [assets/fonts/README.md](assets/fonts/README.md). The layered library illustration is a project-native SVG, with separately namespaced animation styles.

*This product uses the TMDB API but is not endorsed or certified by TMDB.*
