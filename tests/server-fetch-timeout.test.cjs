const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithTimeout } = require('../server/_fetch.js');

test('fetchWithTimeout aborts hung requests', async () => {
  const started = Date.now();
  await assert.rejects(
    () => fetchWithTimeout('https://example.invalid/hang', {}, {
      timeoutMs: 10,
      fetchImpl: () => new Promise(() => {}),
    }),
    /timed out/
  );
  assert.ok(Date.now() - started < 500, 'timeout should not hang the test process');
});

test('fetchWithTimeout clears timeout after success', async () => {
  const response = await fetchWithTimeout('https://example.test/ok', {}, {
    timeoutMs: 100,
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(response.ok, true);
});
