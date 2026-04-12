const assert = require('node:assert/strict');
const test = require('node:test');

const { loadSandboxWithScripts } = require('./helpers/runtime.cjs');

test('session/data module scripts register deep-module factory boundaries', () => {
  const sandbox = loadSandboxWithScripts([
    'core/session/publish-service.js',
    'core/session/menu-session.js',
    'core/data/menu-state-loader.js',
    'core/session/poll-scheduler.js',
  ]);

  assert.equal(typeof sandbox.__HF_SESSION_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_SESSION_MODULES__.createMenuPublishService, 'function');
  assert.equal(typeof sandbox.__HF_SESSION_MODULES__.createMenuSessionLifecycle, 'function');
  assert.equal(typeof sandbox.__HF_SESSION_MODULES__.createMenuStateLoaderService, 'function');
  assert.equal(typeof sandbox.__HF_SESSION_MODULES__.createMenuPollScheduler, 'function');
});

test('app createMenuPublishService delegates through session module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_SESSION_MODULES__: {
      createMenuPublishService: (...args) => {
        calls.push(args);
        return { delegated: true, type: 'publish' };
      },
    },
  });
  const result = sandbox.createMenuPublishService({ buildPreview() {} }, {});

  assert.equal(result.delegated, true);
  assert.equal(result.type, 'publish');
  assert.equal(calls.length, 1);
});

test('app createMenuSessionLifecycle delegates through session module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_SESSION_MODULES__: {
      createMenuSessionLifecycle: (...args) => {
        calls.push(args);
        return { delegated: true, type: 'lifecycle' };
      },
    },
  });
  const result = sandbox.createMenuSessionLifecycle({});

  assert.equal(result.delegated, true);
  assert.equal(result.type, 'lifecycle');
  assert.equal(calls.length, 1);
});

test('app createMenuStateLoaderService delegates through session module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_SESSION_MODULES__: {
      createMenuStateLoaderService: (...args) => {
        calls.push(args);
        return { delegated: true, type: 'state-loader' };
      },
    },
  });
  const result = sandbox.createMenuStateLoaderService({});

  assert.equal(result.delegated, true);
  assert.equal(result.type, 'state-loader');
  assert.equal(calls.length, 1);
});

test('app createMenuPollScheduler delegates through session module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_SESSION_MODULES__: {
      createMenuPollScheduler: (...args) => {
        calls.push(args);
        return { delegated: true, type: 'poll-scheduler' };
      },
    },
  });
  const result = sandbox.createMenuPollScheduler({});

  assert.equal(result.delegated, true);
  assert.equal(result.type, 'poll-scheduler');
  assert.equal(calls.length, 1);
});
