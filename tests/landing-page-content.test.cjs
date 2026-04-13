const assert = require('node:assert/strict');
const test = require('node:test');

const { loadAppSandbox } = require('./helpers/runtime.cjs');

function buildRecord(sandbox) {
  return sandbox.createDefaultLandingPageRecord();
}

test('landing events, news, and reviews validations block missing required fields', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const record = buildRecord(sandbox);

  record.draftContent.events.items.push({
    id: 'event-1',
    target: 'both',
    title: 'Tequila Tuesday',
    eventDate: '2026-04-21',
    startTime: '19:00',
    endTime: '',
    timingNote: '',
    body: '',
  });
  record.draftContent.news.items.push({
    id: 'news-1',
    target: restaurants.LEROYS.id,
    title: 'Story without date',
    href: 'https://example.com/story',
    source: 'Free Press',
    publishedDate: '',
    importMeta: { lastAttemptTs: '123' },
  });
  record.draftContent.reviews.restaurants[restaurants.ELROYS.id].push({
    id: 'review-1',
    href: 'https://google.com/review',
    author: '',
    quote: 'Great room.',
    rating: 5,
    importMeta: { lastAttemptTs: '456' },
  });

  const eventsValidation = sandbox.validateLandingEventsSection(record.draftContent.events);
  const newsValidation = sandbox.validateLandingNewsSection(record.draftContent.news);
  const reviewsValidation = sandbox.validateLandingReviewsSection(record.draftContent.reviews);

  assert.equal(eventsValidation.valid, false);
  assert.match(eventsValidation.issues[0], /missing end time or note, description/i);
  assert.equal(newsValidation.valid, false);
  assert.match(newsValidation.issues[0], /missing publish date/i);
  assert.equal(reviewsValidation.valid, false);
  assert.match(reviewsValidation.issues[0], /missing author/i);
});

test('landing review pairs require three valid live reviews per restaurant', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const reviews = buildRecord(sandbox).liveContent.reviews;

  const makeReview = (id, url, author) => ({
    id,
    href: url,
    author,
    quote: `Quote from ${author}`,
    source: 'Google Review',
    rating: 5,
    importMeta: { lastAttemptTs: '1000', lastSuccessTs: '1000', status: 'imported', sourceUrl: url },
  });

  reviews.restaurants[restaurants.LEROYS.id] = [
    makeReview('lr-1', 'https://google.com/r1', 'Leroy 1'),
    makeReview('lr-2', 'https://google.com/r2', 'Leroy 2'),
    makeReview('lr-3', 'https://google.com/r3', 'Leroy 3'),
  ];
  reviews.restaurants[restaurants.ELROYS.id] = [
    makeReview('er-1', 'https://google.com/e1', 'El Roy 1'),
    makeReview('er-2', 'https://google.com/e2', 'El Roy 2'),
  ];

  assert.equal(sandbox.buildLandingReviewPairs(reviews).length, 0);

  reviews.restaurants[restaurants.ELROYS.id].push(
    makeReview('er-3', 'https://google.com/e3', 'El Roy 3')
  );

  const pairs = sandbox.buildLandingReviewPairs(reviews);
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0].leroys.author, 'Leroy 1');
  assert.equal(pairs[0].elroys.author, 'El Roy 1');
});

test('landing renderable news excludes archived and invalid items', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const news = buildRecord(sandbox).liveContent.news;

  news.items.push({
    id: 'news-archived',
    target: restaurants.LEROYS.id,
    title: 'Old story',
    href: 'https://example.com/old',
    source: 'Chronicle',
    publishedDate: '2026-03-01',
    archived: true,
    importMeta: { lastAttemptTs: '11', lastSuccessTs: '11', status: 'imported' },
  });
  news.items.push({
    id: 'news-invalid',
    target: restaurants.ELROYS.id,
    title: '',
    href: 'https://example.com/bad',
    source: 'Chronicle',
    publishedDate: '2026-03-02',
    importMeta: { lastAttemptTs: '12', lastSuccessTs: '12', status: 'imported' },
  });
  news.items.push({
    id: 'news-valid',
    target: 'both',
    title: 'Good story',
    href: 'https://example.com/good',
    source: 'Chronicle',
    publishedDate: '2026-04-01',
    importMeta: { lastAttemptTs: '13', lastSuccessTs: '13', status: 'imported' },
  });

  const items = sandbox.getLandingRenderableNews(news);

  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'news-valid');
});
