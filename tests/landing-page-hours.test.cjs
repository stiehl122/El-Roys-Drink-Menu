const assert = require('node:assert/strict');
const test = require('node:test');

const { loadAppSandbox } = require('./helpers/runtime.cjs');

function buildHoursDraft(sandbox) {
  return sandbox.createDefaultLandingPageRecord().draftContent.hours;
}

test('landing hours validation blocks incomplete and zero-length schedules', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const hours = buildHoursDraft(sandbox);

  hours.restaurants[restaurants.LEROYS.id].days.fri = {
    closed: false,
    open: '11:00',
    close: '',
  };
  hours.restaurants[restaurants.ELROYS.id].days.sat = {
    closed: false,
    open: '15:00',
    close: '15:00',
  };

  const result = sandbox.validateLandingHoursSection(hours);

  assert.equal(result.valid, false);
  assert.equal(result.issues.length, 2);
  assert.match(result.issues[0], /Friday needs both an open and close time/i);
  assert.match(result.issues[1], /Saturday cannot open and close at the same time/i);
});

test('landing status reports open, upcoming, and overnight windows from recurring hours', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const hours = buildHoursDraft(sandbox);

  hours.restaurants[restaurants.LEROYS.id].days.fri = {
    closed: false,
    open: '16:00',
    close: '23:00',
  };
  hours.restaurants[restaurants.ELROYS.id].days.fri = {
    closed: false,
    open: '11:00',
    close: '02:00',
  };

  const leroysOpen = sandbox.computeLandingStatusForRestaurant(
    hours,
    restaurants.LEROYS.id,
    Date.parse('2026-04-10T20:30:00-04:00')
  );
  const leroysBeforeOpen = sandbox.computeLandingStatusForRestaurant(
    hours,
    restaurants.LEROYS.id,
    Date.parse('2026-04-10T09:15:00-04:00')
  );
  const elroysOvernight = sandbox.computeLandingStatusForRestaurant(
    hours,
    restaurants.ELROYS.id,
    Date.parse('2026-04-11T00:30:00-04:00')
  );

  assert.equal(leroysOpen.isOpen, true);
  assert.equal(leroysOpen.label, 'Open until 11 PM');
  assert.equal(leroysBeforeOpen.isOpen, false);
  assert.equal(leroysBeforeOpen.label, 'Closed until 4 PM');
  assert.equal(elroysOvernight.isOpen, true);
  assert.equal(elroysOvernight.label, 'Open until 2 AM');
});

test('landing subsection publish copies only the selected sections to live', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const record = sandbox.createDefaultLandingPageRecord();

  record.draftContent.hours.restaurants[restaurants.LEROYS.id].days.fri = {
    closed: false,
    open: '16:00',
    close: '23:00',
  };
  record.draftContent.news.items.push({
    id: 'news-1',
    title: 'Draft story',
    body: 'Draft-only copy',
    target: 'Both',
    href: 'https://example.com/story',
    source: 'Local Press',
    publishedAt: 'Apr 12',
  });

  const published = sandbox.applyLandingSectionPublish(record, ['hours']);

  assert.equal(
    published.liveContent.hours.restaurants[restaurants.LEROYS.id].days.fri.open,
    '16:00'
  );
  assert.equal(published.liveContent.news.items.length, 0);
  assert.equal(record.liveContent.news.items.length, 0);
});
