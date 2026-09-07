/* Fictional, offline-only review data. Never loaded by the production page. */
(function (root) {
  'use strict';
  const names = [
    'The Lantern Keepers', 'Across the Amber Sea', 'The Extraordinary Chronicle of the Last Cartographer and the City Beyond the Clouds',
    'A Place Without a Poster', 'Night Train to Everspring', 'The Glass Observatory', 'Letters from the Moon',
    'Quiet Thunder', 'The Archivist’s Apprentice', 'Wildwood', 'Salt & Starlight', 'The Fourth Garden',
    'The Paper Kingdom', 'A Hundred Small Adventures', 'Winter at the Lighthouse', 'The Silver Road',
    'After the Rain', 'The Clockmaker’s Map', 'Blue Horizon', 'The Last Summer', 'A Study in Daylight', 'Tides of Home'
  ];
  const colors = ['#806338', '#386968', '#78514b', '#515970', '#676944', '#794f66'];
  function poster(index) {
    const color = colors[index % colors.length];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450">' +
      '<defs><linearGradient id="g" x2=".6" y2="1"><stop stop-color="' + color + '"/><stop offset="1" stop-color="#121824"/></linearGradient></defs>' +
      '<rect width="300" height="450" fill="url(#g)"/><circle cx="150" cy="148" r="65" fill="#edcf8a" opacity=".24"/>' +
      '<path d="M0 370 70 192 132 315 195 224 300 377V450H0Z" fill="#0c1720" opacity=".8"/>' +
      '<path d="M34 28H266V422H34Z" fill="none" stroke="#edd8a5" opacity=".3"/>' +
      '<text x="150" y="368" text-anchor="middle" fill="#eee5cd" font-family="Georgia" font-size="16" letter-spacing="5">ARCHIVE ' + (index + 1) + '</text>' +
      '<text x="150" y="394" text-anchor="middle" fill="#c8bdab" font-family="sans-serif" font-size="10" letter-spacing="2">FICTIONAL PREVIEW</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function seasons(index) {
    return [1, 2].map(season => ({ season, episodes: [1, 2, 3, 4].map(ep => ({ ep,
      name: ['A new beginning', 'The hidden passage', 'An unexpected visitor', 'When the lanterns return'][(ep + index) % 4] })) }));
  }
  const shows = names.map((name, i) => {
    const status = i < 12 ? 'watching' : i < 16 ? 'plan' : i < 19 ? 'hold' : 'completed';
    const done = status === 'completed';
    return { tmdbId: 990001 + i, name, poster: i === 3 ? '' : poster(i),
      backdrop: i === 3 ? '' : poster(i), overview: 'An original fictional series used to review the library interface. No viewing history or real account is involved. Follow its characters as a small discovery changes their world.',
      runtime: 24 + i % 5 * 6, totalEps: 8, status, seasons: seasons(i),
      currentSeason: done ? 2 : 1, currentEpisode: done ? 4 : status === 'plan' ? 0 : i === 0 ? 4 : i % 4,
      rating: done ? 4 : null, hasNew: i === 1, updatedAt: '2026-09-07T12:00:00.000Z' };
  });
  root.watchlistPreviewData = { version: 2, shows, searchAddition: {
    tmdbId: 999901, name: 'The New Arrival', poster: '', backdrop: '', overview: 'A fictional search result for testing the add flow.',
    runtime: 28, totalEps: 8, status: 'watching', seasons: seasons(0), currentSeason: 1,
    currentEpisode: 0, rating: null, hasNew: false, updatedAt: '2026-09-07T12:00:00.000Z' } };
})(typeof window !== 'undefined' ? window : globalThis);
