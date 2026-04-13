const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
  path.join(__dirname, '..', 'api', '_landing-import.js')
).href;

async function loadImportModule() {
  return import(MODULE_URL);
}

test('news import extracts best-effort article metadata', async () => {
  const { importNewsFromUrl } = await loadImportModule();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => `
      <html>
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="Downtown patios are back">
          <meta property="og:description" content="A short imported dek.">
          <meta property="og:site_name" content="Metro Times">
          <meta property="article:published_time" content="2026-04-12T12:00:00Z">
          <meta property="og:image" content="https://cdn.example.com/story.jpg">
          <link rel="canonical" href="https://example.com/story">
        </head>
      </html>
    `,
  });

  try {
    const result = await importNewsFromUrl('https://example.com/story?utm_source=test');
    assert.equal(result.status, 'imported');
    assert.equal(result.href, 'https://example.com/story');
    assert.equal(result.title, 'Downtown patios are back');
    assert.equal(result.source, 'Metro Times');
    assert.equal(result.publishedDate, '2026-04-12');
    assert.equal(result.imageUrl, 'https://cdn.example.com/story.jpg');
  } finally {
    global.fetch = originalFetch;
  }
});

test('news import decodes numeric html entities in imported fields', async () => {
  const { importNewsFromUrl } = await loadImportModule();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => `
      <html>
        <head>
          <meta property="og:title" content="Leroy&#039;s patio is back">
          <meta property="og:description" content="Tonight&#x27;s first round is on us.">
          <meta property="og:site_name" content="City&#039;s Best">
          <meta property="article:published_time" content="2026-04-12T12:00:00Z">
          <link rel="canonical" href="https://example.com/story">
        </head>
      </html>
    `,
  });

  try {
    const result = await importNewsFromUrl('https://example.com/story');
    assert.equal(result.title, "Leroy's patio is back");
    assert.equal(result.body, "Tonight's first round is on us.");
    assert.equal(result.source, "City's Best");
  } finally {
    global.fetch = originalFetch;
  }
});

test('news import preserves apostrophes inside quoted meta tags', async () => {
  const { importNewsFromUrl } = await loadImportModule();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => `
      <html>
        <head>
          <meta property="og:title" content="Leroy's patio is back">
          <meta property="og:description" content="Tonight's first round is on us.">
          <meta property="og:site_name" content="Detroit's Best">
          <meta property="article:published_time" content="2026-04-12T12:00:00Z">
          <link rel="canonical" href="https://example.com/story">
        </head>
      </html>
    `,
  });

  try {
    const result = await importNewsFromUrl('https://example.com/story');
    assert.equal(result.title, "Leroy's patio is back");
    assert.equal(result.body, "Tonight's first round is on us.");
    assert.equal(result.source, "Detroit's Best");
  } finally {
    global.fetch = originalFetch;
  }
});

test('news import rejects localhost and private-network URLs', async () => {
  const { importNewsFromUrl } = await loadImportModule();
  await assert.rejects(
    () => importNewsFromUrl('http://127.0.0.1/private'),
    error => error?.status === 400 && /public internet url/i.test(String(error?.message || ''))
  );
});

test('review import extracts best-effort Google review fields', async () => {
  const { importReviewFromUrl } = await loadImportModule();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => `
      <html>
        <head>
          <link rel="canonical" href="https://google.com/review/123">
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Review",
              "author": { "@type": "Person", "name": "Casey" },
              "reviewBody": "Still the best late-night stop.",
              "reviewRating": { "@type": "Rating", "ratingValue": "5" }
            }
          </script>
        </head>
      </html>
    `,
  });

  try {
    const result = await importReviewFromUrl('https://www.google.com/maps/reviews/123');
    assert.equal(result.status, 'imported');
    assert.equal(result.href, 'https://google.com/review/123');
    assert.equal(result.author, 'Casey');
    assert.equal(result.quote, 'Still the best late-night stop.');
    assert.equal(result.rating, 5);
    assert.equal(result.source, 'Google Review');
  } finally {
    global.fetch = originalFetch;
  }
});
