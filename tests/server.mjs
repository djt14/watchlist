/** Local review server; stdlib only. Production files remain unmodified. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const port = Number(option('--port', process.env.PORT || '8763'));
const baseline = path.resolve(option('--baseline', path.join(root, '..', 'watchlist-baseline')));
const fixtureContext = {};
vm.runInNewContext(await fs.readFile(path.join(here, 'preview-data.js'), 'utf8'), fixtureContext);
const posters = fixtureContext.watchlistPreviewData.shows.map(show => show.poster
  ? decodeURIComponent(show.poster.slice(show.poster.indexOf(',') + 1)) : null);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function safePath(base, relative) {
  const result = path.resolve(base, relative);
  return result.startsWith(base + path.sep) ? result : null;
}
function previewHtml(html, pathname, search) {
  const resetUrl = pathname + '?' + new URLSearchParams({ ...Object.fromEntries(search), reset: '1' });
  const injection = (pathname.startsWith('/baseline/') ? '<link rel="stylesheet" href="/watchlist/fonts.css">' : '') +
    '<script src="/__fixtures/preview-data.js"></script><script src="/__fixtures/preview-fixtures.js"></script>';
  const banner = '<aside id="preview-notice" aria-label="Isolated preview" style="position:relative;z-index:90;background:#192831;color:#e9e7e0;padding:9px 20px;font:13px/1.5 system-ui;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">' +
    '<span>Preview data — isolated from your live library. All shows are fictional.</span><a style="color:#e6c36b" href="' + resetUrl.replaceAll('&', '&amp;') + '">Reset sample data</a></aside>';
  return html.replace(/<head([^>]*)>/i, '<head$1>' + injection).replace(/<body([^>]*)>/i, '<body$1>' + banner);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const posterMatch = url.pathname.match(/^\/__fixtures\/poster\/(\d+)\.svg$/);
    if (posterMatch) {
      const poster = posters[Number(posterMatch[1])];
      if (!poster) { res.writeHead(404).end('No fixture poster'); return; }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        .end(req.method === 'HEAD' ? undefined : poster);
      return;
    }
    if (url.pathname === '/') { res.writeHead(302, { Location: '/watchlist/?preview=1' }).end(); return; }
    let base, relative;
    if (url.pathname.startsWith('/__fixtures/')) { base = here; relative = decodeURIComponent(url.pathname.slice('/__fixtures/'.length)); }
    else if (url.pathname.startsWith('/watchlist/')) { base = root; relative = decodeURIComponent(url.pathname.slice('/watchlist/'.length)) || 'index.html'; }
    else if (url.pathname.startsWith('/baseline/')) { base = baseline; relative = decodeURIComponent(url.pathname.slice('/baseline/'.length)) || 'index.html'; }
    else { res.writeHead(404).end('Not found'); return; }
    const file = safePath(base, relative);
    if (!file) { res.writeHead(403).end('Outside preview directory'); return; }
    let data = await fs.readFile(file);
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' };
    if (path.extname(file) === '.html' && url.searchParams.get('preview') === '1') {
      data = Buffer.from(previewHtml(data.toString(), url.pathname, url.searchParams));
      headers['Content-Security-Policy'] = "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'";
    }
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : data);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Preview could not load file'); }
});
server.on('error', error => { console.error('Could not start fixed preview port:', error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  const actualPort = server.address().port;
  console.log('Isolated preview: http://127.0.0.1:' + actualPort + '/watchlist/?preview=1\nBaseline: http://127.0.0.1:' + actualPort + '/baseline/?preview=1');
});
