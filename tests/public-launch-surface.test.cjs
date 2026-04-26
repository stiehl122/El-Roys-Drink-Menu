const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('vercel config defines launch security headers', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.ok(Array.isArray(config.headers), 'vercel.json must define headers');
  const launchEntry = config.headers.find(entry => entry.source === '/(.*)');
  assert.ok(launchEntry, 'vercel.json must define catch-all launch headers');
  assert.ok(Array.isArray(launchEntry.headers), 'catch-all launch headers must define headers');

  const headers = new Map(
    launchEntry.headers.map(header => [header.key.toLowerCase(), header.value])
  );

  assert.equal(
    headers.get('strict-transport-security'),
    'max-age=31536000; includeSubDomains; preload'
  );
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=(), payment=()');
  assert.equal(headers.get('x-frame-options'), 'DENY');

  const csp = headers.get('content-security-policy');
  assert.ok(csp, 'missing content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /img-src 'self' data: https:/);
  assert.match(csp, /font-src 'self' data:/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self' https:\/\/\*\.supabase\.co https:\/\/world\.openfoodfacts\.org https:\/\/api\.untappd\.com https:\/\/api\.groupme\.com https:\/\/api\.twilio\.com https:\/\/discord\.com https:\/\/discordapp\.com/);
  assert.match(csp, /form-action 'self'/);
});
