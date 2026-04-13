const assert = require('node:assert/strict');
const test = require('node:test');

const { createElement, loadAppSandbox, setState } = require('./helpers/runtime.cjs');

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

test('landing hours validation accepts browser time values with seconds', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const hours = buildHoursDraft(sandbox);

  hours.restaurants[restaurants.LEROYS.id].days.fri = {
    closed: false,
    open: '11:00:00',
    close: '23:30:00',
  };

  const result = sandbox.validateLandingHoursSection(hours);

  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
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

test('landing hours sync reads current admin DOM values before validation', () => {
  const sandbox = loadAppSandbox({ Intl });
  const restaurants = sandbox.__HF_DOMAIN_CONSTANTS__.RESTAURANTS;
  const record = sandbox.createDefaultLandingPageRecord();
  const document = sandbox.document;
  const adminShell = document.getElementById('admin-landing-page-section');
  const openInput = createElement('input');
  const closeInput = createElement('input');
  const closedInput = createElement('input');

  openInput.value = '16:00';
  openInput.setAttribute('data-landing-hours-field', 'open');
  openInput.setAttribute('data-landing-hours-restaurant', restaurants.LEROYS.id);
  openInput.setAttribute('data-landing-hours-day', 'fri');

  closeInput.value = '23:00';
  closeInput.setAttribute('data-landing-hours-field', 'close');
  closeInput.setAttribute('data-landing-hours-restaurant', restaurants.LEROYS.id);
  closeInput.setAttribute('data-landing-hours-day', 'fri');

  closedInput.checked = false;
  closedInput.setAttribute('data-landing-hours-field', 'closed');
  closedInput.setAttribute('data-landing-hours-restaurant', restaurants.LEROYS.id);
  closedInput.setAttribute('data-landing-hours-day', 'fri');

  document._registerSelector('[data-landing-hours-field]', [openInput, closeInput, closedInput]);
  setState(sandbox, { _landingPageState: record });

  assert.equal(Boolean(adminShell), true);

  const synced = sandbox.syncLandingHoursDraftFromDom();
  const day = synced.draftContent.hours.restaurants[restaurants.LEROYS.id].days.fri;
  const validation = sandbox.validateLandingHoursSection(synced.draftContent.hours);

  assert.equal(day.closed, false);
  assert.equal(day.open, '16:00');
  assert.equal(day.close, '23:00');
  assert.equal(validation.valid, true);
});
