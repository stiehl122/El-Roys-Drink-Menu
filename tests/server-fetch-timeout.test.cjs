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

test('fetchWithTimeout aborts the fetch signal on timeout when caller supplied a signal', async () => {
  const callerController = new AbortController();
  let receivedSignal = null;

  await assert.rejects(
    () => fetchWithTimeout('https://example.invalid/hang', {
      signal: callerController.signal,
    }, {
      timeoutMs: 10,
      fetchImpl: (_url, options) => {
        receivedSignal = options.signal;
        return new Promise(() => {});
      },
    }),
    /timed out/
  );

  assert.ok(receivedSignal);
  assert.notEqual(receivedSignal, callerController.signal);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(callerController.signal.aborted, false);
});

test('fetchWithTimeout forwards caller aborts to the fetch signal', async () => {
  const callerController = new AbortController();
  let receivedSignal = null;

  const request = fetchWithTimeout('https://example.invalid/hang', {
    signal: callerController.signal,
  }, {
    timeoutMs: 1000,
    fetchImpl: (_url, options) => {
      receivedSignal = options.signal;
      return new Promise(() => {});
    },
  });

  callerController.abort(new Error('caller stopped request'));

  await assert.rejects(request, /caller stopped request/);
  assert.ok(receivedSignal);
  assert.notEqual(receivedSignal, callerController.signal);
  assert.equal(receivedSignal.aborted, true);
});
