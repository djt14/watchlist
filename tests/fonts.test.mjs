import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('bundled WOFF2 fonts match source blobs and include original licenses', async () => {
  for (const [family, expectedSize, expectedBlob, expectedLicenseBlob] of [
    ['cinzel', 25904, 'a54fd00bf0e964d4d13688d8e8907cf04350e214', '5649a819c631deba9efdfa74beaf0b84d9d34959'],
    ['inter', 48256, 'd15208de03cd1ad7c5199f0a0ce915fe841e4722', '40589daa9de8bc96606292ea0be712ff0f0626eb']
  ]) {
    const data = await fs.readFile(new URL('../assets/fonts/' + family + '-latin-variable.woff2', import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'wOF2');
    assert.equal(data.length, expectedSize);
    assert.equal(data.readUInt32BE(8), data.length);
    const blob = createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
    assert.equal(blob, expectedBlob, family + ' must be an unmodified source font');
    const license = await fs.readFile(new URL('../assets/fonts/' + family + '-OFL.txt', import.meta.url), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE Version 1.1/);
    assert.match(license, /Copyright/);
    const licenseBlob = createHash('sha1').update('blob ' + Buffer.byteLength(license) + '\0').update(license).digest('hex');
    assert.equal(licenseBlob, expectedLicenseBlob, family + ' license must match the original copy');
  }
});
test('HTML loads local typography before application styles without Google Fonts', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../fonts.css', import.meta.url), 'utf8');
  assert.ok(html.indexOf('href="fonts.css"') < html.indexOf('href="style.css"'));
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(css, /font-family: 'Cinzel'/);
  assert.match(css, /font-family: 'Inter'/);
  assert.match(css, /font-weight: 400 900/);
  assert.match(css, /font-weight: 100 900/);
});
