const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  const cspDirectives = new Map(
    csp.split(';').map(directive => directive.trim().split(/\s+/)).map(parts => [parts[0], parts.slice(1)])
  );
  assert.deepEqual(cspDirectives.get('default-src'), ["'self'"]);
  assert.deepEqual(cspDirectives.get('base-uri'), ["'self'"]);
  assert.deepEqual(cspDirectives.get('object-src'), ["'none'"]);
  assert.deepEqual(cspDirectives.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(cspDirectives.get('img-src'), ["'self'", 'data:', 'https:']);
  assert.deepEqual(cspDirectives.get('font-src'), ["'self'", 'data:']);
  assert.deepEqual(cspDirectives.get('style-src'), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(cspDirectives.get('script-src'), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(cspDirectives.get('connect-src'), [
    "'self'",
    'https://*.supabase.co',
    'https://world.openfoodfacts.org',
    'https://api.untappd.com',
    'https://api.groupme.com',
    'https://api.twilio.com',
    'https://discord.com',
    'https://discordapp.com'
  ]);
  assert.deepEqual(cspDirectives.get('form-action'), ["'self'"]);
  assert.equal(cspDirectives.has('script-src-attr'), false, 'inline handler allowance should remain explicit in script-src');
  assert.equal(
    [...cspDirectives.values()].flat().includes("'unsafe-eval'"),
    false,
    'CSP must not allow unsafe eval'
  );
});

test('vercel config preserves route rewrites', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(config.rewrites, [
    { source: '/leroyslounge', destination: '/leroyslounge/index.html' },
    { source: '/leroyslounge/', destination: '/leroyslounge/index.html' },
    { source: '/elroyscantina', destination: '/elroyscantina/index.html' },
    { source: '/elroyscantina/', destination: '/elroyscantina/index.html' },
    { source: '/manager', destination: '/manager/index.html' },
    { source: '/manager/', destination: '/manager/index.html' },
    { source: '/admin', destination: '/admin/index.html' },
    { source: '/admin/', destination: '/admin/index.html' }
  ]);
});

test('public launch files exist', () => {
  for (const file of ['robots.txt', 'sitemap.xml', '404.html', '500.html']) {
    assert.ok(fs.existsSync(file), `${file} must exist before launch`);
  }
});

test('robots and sitemap expose the public routes only', () => {
  const origin = 'https://el-roys-drink-menu.vercel.app';
  const publicUrls = [
    `${origin}/`,
    `${origin}/leroyslounge`,
    `${origin}/elroyscantina`
  ];

  const robots = fs.readFileSync('robots.txt', 'utf8');
  assert.match(robots, /^User-agent:\s*\*/m);
  assert.match(robots, /^Allow:\s*\/$/m);
  assert.match(robots, new RegExp(`^Sitemap:\\s*${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml$`, 'm'));

  const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(sitemapUrls, publicUrls);
});

test('public html shells include launch metadata', () => {
  const pages = new Map([
    ['index.html', 'https://el-roys-drink-menu.vercel.app/'],
    ['leroyslounge/index.html', 'https://el-roys-drink-menu.vercel.app/leroyslounge'],
    ['elroyscantina/index.html', 'https://el-roys-drink-menu.vercel.app/elroyscantina']
  ]);

  for (const [file, canonicalUrl] of pages) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/, `${file} missing meta description`);
    assert.match(html, new RegExp(`<link\\s+rel="canonical"\\s+href="${canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*/?>`), `${file} has the wrong canonical link`);
    assert.match(html, /<meta\s+property="og:title"\s+content="[^"]+"\s*\/?>/, `${file} missing Open Graph title`);
    assert.match(html, /<meta\s+property="og:description"\s+content="[^"]+"\s*\/?>/, `${file} missing Open Graph description`);
    assert.match(html, /<meta\s+property="og:type"\s+content="website"\s*\/?>/, `${file} missing Open Graph type`);
    assert.match(html, new RegExp(`<meta\\s+property="og:url"\\s+content="${canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*/?>`), `${file} has the wrong Open Graph URL`);
    assert.match(html, /<meta\s+name="twitter:card"\s+content="summary"\s*\/?>/, `${file} missing Twitter card`);
  }
});

test('Leroy public wall images use optimized lazy assets for non-critical signs', () => {
  const html = fs.readFileSync('leroyslounge/index.html', 'utf8');
  const imageTags = [...html.matchAll(/<img\b[^>]*class="([^"]*\bll-wall-[^"]*)"[^>]*>/g)].map(match => match[0]);

  assert.ok(imageTags.length >= 8, 'expected Leroy wall image tags');

  const nonCriticalTags = imageTags.filter(tag => !/ll-wall-location-sign|ll-wall-brand-sign|ll-wall-beer-sign/.test(tag));
  for (const tag of nonCriticalTags) {
    assert.match(tag, /loading="lazy"/, `${tag} must lazy load`);
    assert.match(tag, /decoding="async"/, `${tag} must async decode`);
    assert.match(tag, /\/assets\/leroys-lounge\/wall\/optimized\//, `${tag} must use optimized asset path`);
  }

  const optimizedFiles = [
    'leroys-established-sign.png',
    'leroys-horizontal-wood-sign.png',
    'leroys-ice-cold-beer-sign.png',
    'leroys-pool-free-play-sign.png',
    'leroys-pull-tabs-sign.png',
    'leroys-thumbs-up-panel.png',
    'leroys-michigan-plate.png',
    'leroys-margarita-note.png',
  ];

  for (const file of optimizedFiles) {
    const fullPath = path.join('assets', 'leroys-lounge', 'wall', 'optimized', file);
    assert.ok(fs.existsSync(fullPath), `${fullPath} must exist`);
    const size = fs.statSync(fullPath).size;
    assert.ok(size <= 700 * 1024, `${fullPath} must be 700KB or smaller, got ${size}`);
  }
});

test('restaurant public routes do not boot manager or admin modules', () => {
  const routeFiles = ['leroyslounge/index.html', 'elroyscantina/index.html'];
  for (const file of routeFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /\/core\/ui\/manager\//, `${file} must not load manager UI modules`);
    assert.doesNotMatch(html, /\/core\/ui\/admin\//, `${file} must not load admin UI modules`);
    assert.doesNotMatch(html, /\/core\/landing\/admin-workspace\.js/, `${file} must not load landing admin workspace`);
    assert.match(html, /\/core\/ui\/public\/footer-actions\.js/, `${file} must keep public footer actions`);
    assert.match(html, /\/routes\/shared\/public-route-core\.js/, `${file} must keep route core`);
    assert.match(html, /\/app\.js/, `${file} still uses shared runtime until the final app split`);
  }
});
