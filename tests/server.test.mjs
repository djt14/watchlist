import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('HTTP preview is opt-in, private to loopback, and leaves production HTML untouched', async t => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('server.mjs', import.meta.url)), '--port', '0'],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => child.kill());
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview server did not start')), 6000);
    child.once('error', reject);
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Preview server exited with ' + code)); });
  });
  const production = await fetch(origin + '/watchlist/');
  const normalHtml = await production.text();
  assert.equal(production.status, 200);
  assert.ok(!normalHtml.includes('/__fixtures/preview-fixtures.js'));
  assert.ok(!normalHtml.includes('id="preview-notice"'));
  const preview = await fetch(origin + '/watchlist/?preview=1');
  const html = await preview.text();
  assert.ok(html.includes('/__fixtures/preview-data.js'));
  assert.ok(html.includes('/__fixtures/preview-fixtures.js'));
  assert.ok(html.includes('id="preview-notice"'));
  assert.ok(html.indexOf('preview-fixtures.js') < html.indexOf('src="app.js"'));
  assert.match(preview.headers.get('Content-Security-Policy'), /connect-src 'self'/);
  const fixture = await fetch(origin + '/__fixtures/preview-fixtures.js');
  assert.match(fixture.headers.get('Content-Type'), /text\/javascript/);
  const poster = await fetch(origin + '/__fixtures/poster/0.svg');
  assert.equal(poster.status, 200);
  assert.equal(poster.headers.get('Content-Type'), 'image/svg+xml');
  assert.match(await poster.text(), /FICTIONAL PREVIEW/);
  assert.equal((await fetch(origin + '/__fixtures/poster/3.svg')).status, 404);
  const font = await fetch(origin + '/watchlist/assets/fonts/cinzel-latin-variable.woff2');
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('Content-Type'), 'font/woff2');
  assert.equal(Buffer.from(await font.arrayBuffer()).toString('ascii', 0, 4), 'wOF2');
  assert.equal((await fetch(origin + '/watchlist/app.js', { method: 'POST' })).status, 405);
  assert.equal((await fetch(origin + '/watchlist/%2e%2e%2fserver.mjs')).status, 403);
  assert.equal((await fetch(origin + '/outside')).status, 404);
});
