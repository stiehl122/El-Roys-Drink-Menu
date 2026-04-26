const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchWithTimeout,
  readResponseArrayBufferWithTimeout,
  readResponseJsonWithTimeout,
  readResponseTextWithTimeout,
} = require('../server/_fetch.js');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

async function importNotificationDelivery() {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'server/_notification-delivery.js')).href;
  return import(`${moduleUrl}?serverFetchTimeout=${Date.now()}-${Math.random()}`);
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

async function withNotificationDeliveryEnv(fn) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

test('fetchWithTimeout cleans up timeout when fetchImpl throws synchronously', async () => {
  const unhandled = [];
  const onUnhandled = reason => {
    unhandled.push(reason);
  };

  process.on('unhandledRejection', onUnhandled);
  try {
    await assert.rejects(
      () => fetchWithTimeout('https://example.test/sync-fail', {}, {
        timeoutMs: 10,
        fetchImpl: () => {
          throw new Error('sync fetch failure');
        },
      }),
      /sync fetch failure/
    );

    await delay(30);
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('readResponseTextWithTimeout rejects when the body read stalls', async () => {
  const response = {
    text: () => new Promise(() => {}),
  };

  await assert.rejects(
    () => readResponseTextWithTimeout(response, { timeoutMs: 10 }),
    /timed out/
  );
});

test('readResponseTextWithTimeout cancels the active stream reader on timeout', async () => {
  let cancelCount = 0;
  const response = {
    body: {
      getReader() {
        return {
          read: () => new Promise(() => {}),
          cancel() {
            cancelCount += 1;
            return Promise.resolve();
          },
          releaseLock() {},
        };
      },
    },
    text() {
      throw new Error('text fallback should not be used for streams');
    },
  };

  await assert.rejects(
    () => readResponseTextWithTimeout(response, { timeoutMs: 10 }),
    /timed out/
  );

  assert.equal(cancelCount, 1);
});

test('readResponseJsonWithTimeout parses JSON through the timeout-bound text reader', async () => {
  const encoder = new TextEncoder();
  let reads = 0;
  const response = {
    body: {
      getReader() {
        return {
          async read() {
            reads += 1;
            if (reads === 1) return { done: false, value: encoder.encode('{"ok":') };
            if (reads === 2) return { done: false, value: encoder.encode('true}') };
            return { done: true };
          },
          cancel() {},
          releaseLock() {},
        };
      },
    },
    json() {
      throw new Error('json fallback should not be used for streams');
    },
  };

  assert.deepEqual(
    await readResponseJsonWithTimeout(response, { timeoutMs: 100 }),
    { ok: true }
  );
});

test('readResponseArrayBufferWithTimeout assembles stream bytes', async () => {
  const response = {
    body: {
      getReader() {
        let reads = 0;
        return {
          async read() {
            reads += 1;
            if (reads === 1) return { done: false, value: new Uint8Array([1, 2]) };
            if (reads === 2) return { done: false, value: new Uint8Array([3]) };
            return { done: true };
          },
          cancel() {},
          releaseLock() {},
        };
      },
    },
    arrayBuffer() {
      throw new Error('arrayBuffer fallback should not be used for streams');
    },
  };

  const buffer = await readResponseArrayBufferWithTimeout(response, { timeoutMs: 100 });
  assert.deepEqual(Array.from(new Uint8Array(buffer)), [1, 2, 3]);
});

test('readResponseArrayBufferWithTimeout cancels the active stream reader on timeout', async () => {
  let cancelCount = 0;
  const response = {
    body: {
      getReader() {
        return {
          read: () => new Promise(() => {}),
          cancel() {
            cancelCount += 1;
            return Promise.resolve();
          },
          releaseLock() {},
        };
      },
    },
    arrayBuffer() {
      throw new Error('arrayBuffer fallback should not be used for streams');
    },
  };

  await assert.rejects(
    () => readResponseArrayBufferWithTimeout(response, { timeoutMs: 10 }),
    /timed out/
  );

  assert.equal(cancelCount, 1);
});

test('deliverMenuNotification fails closed when menu notification config read fails', async () => {
  await withNotificationDeliveryEnv(async () => {
    const { deliverMenuNotification } = await importNotificationDelivery();
    global.fetch = async url => {
      const href = String(url);
      if (href.includes('/rest/v1/menu_meta?')) {
        throw new Error('network unavailable');
      }
      throw new Error(`Unexpected fetch: ${href}`);
    };

    const result = await deliverMenuNotification('menu-1', 'Updated menu');

    assert.equal(result.status, 500);
    assert.equal(result.results.config, 'error:notification_config_read_failed');
    assert.equal(result.summary.allSkipped, false);
    assert.deepEqual(result.summary.failedChannels, ['config']);
  });
});

test('deliverMenuNotification fails closed when restaurant notification config read hangs', async () => {
  await withNotificationDeliveryEnv(async () => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = (callback, ms, ...args) => originalSetTimeout(callback, Math.min(ms, 10), ...args);
    global.clearTimeout = originalClearTimeout;

    try {
      const { deliverMenuNotification } = await importNotificationDelivery();
      global.fetch = async url => {
        const href = String(url);
        if (href.includes('/rest/v1/menu_meta?')) {
          return jsonResponse([{ notifications: { groupme: { enabled: true } } }]);
        }
        if (href.includes('/rest/v1/menus?')) {
          return jsonResponse([{ restaurant_id: 'restaurant-1' }]);
        }
        if (href.includes('/rest/v1/restaurants?')) {
          return new Promise(() => {});
        }
        throw new Error(`Unexpected fetch: ${href}`);
      };

      const result = await deliverMenuNotification('menu-1', 'Updated menu');

      assert.equal(result.status, 500);
      assert.equal(result.results.config, 'error:notification_config_read_failed');
      assert.equal(result.summary.allSkipped, false);
      assert.deepEqual(result.summary.failedChannels, ['config']);
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });
});

test('deliverMenuNotification still returns all skipped when config reads succeed with no enabled channels', async () => {
  await withNotificationDeliveryEnv(async () => {
    const { deliverMenuNotification } = await importNotificationDelivery();
    global.fetch = async url => {
      const href = String(url);
      if (href.includes('/rest/v1/menu_meta?')) {
        return jsonResponse([{ notifications: {} }]);
      }
      if (href.includes('/rest/v1/menus?')) {
        return jsonResponse([{ restaurant_id: 'restaurant-1' }]);
      }
      if (href.includes('/rest/v1/restaurants?')) {
        return jsonResponse([{ notifications_config: {} }]);
      }
      throw new Error(`Unexpected fetch: ${href}`);
    };

    const result = await deliverMenuNotification('menu-1', 'Updated menu');

    assert.equal(result.status, 202);
    assert.equal(result.summary.allSkipped, true);
    assert.deepEqual(result.results, {
      groupme: 'skipped',
      sms: 'skipped',
      discord: 'skipped',
      webhook: 'skipped',
    });
  });
});

test('external provider modules avoid raw unbounded fetch calls', () => {
  const modules = [
    'server/_product-lookup.js',
    'server/_untappd.js',
    'server/_notification-delivery.js',
    'server/_landing-import.js',
    'server/_font-proxy.js',
  ];

  const rawFetches = modules.flatMap(file => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    return source
      .split('\n')
      .map((line, index) => ({ file, line: index + 1, source: line.trim() }))
      .filter(entry => /\bfetch\s*\(/.test(entry.source) && !entry.source.includes('fetchWithTimeout('));
  });

  assert.deepEqual(rawFetches, []);
});
