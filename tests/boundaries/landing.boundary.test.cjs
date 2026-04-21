const assert = require('node:assert/strict');
const test = require('node:test');

const { loadSandboxWithScripts } = require('../helpers/runtime.cjs');

test('landing runtime scripts register landing factories', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
    'core/landing/store.js',
    'core/landing/data-service.js',
    'core/landing/admin-workspace.js',
    'core/landing/root-renderer.js',
  ]);

  assert.equal(typeof sandbox.__HF_LANDING_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingModel, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingStore, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingDataService, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingAdminWorkspaceService, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingRootRendererService, 'function');
});

test('landing model factory publishes selected draft sections without mutating live state', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
  ]);
  const model = sandbox.__HF_LANDING_MODULES__.createLandingModel();
  const record = model.createDefaultRecord();

  record.draftContent.news.items.push({
    id: 'news-1',
    title: 'Draft story',
    body: 'Draft-only copy',
    target: 'both',
    href: 'https://example.com/story',
    source: 'Local Press',
    publishedAt: '2026-04-12',
    importMeta: { lastAttemptTs: '1000', lastSuccessTs: '1000', status: 'imported' },
  });

  const published = model.applySectionPublish(record, ['news']);

  assert.equal(record.liveContent.news.items.length, 0);
  assert.equal(published.liveContent.news.items.length, 1);
  assert.equal(model.validateNewsSection(published.liveContent.news).valid, true);
});
