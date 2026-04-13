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
