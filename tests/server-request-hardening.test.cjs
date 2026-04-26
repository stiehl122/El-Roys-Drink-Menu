const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonBody } = require('../server/_request.js');

function makeReq({ body = '', headers = {}, method = 'POST' } = {}) {
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}

test('parseJsonBody rejects oversized JSON bodies', async () => {
  const body = JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 1) });
  await assert.rejects(
    () => parseJsonBody(makeReq({
      body,
      headers: { 'content-type': 'application/json' },
    }), { maxBytes: 1024 }),
    /Request body too large/
  );
});

test('parseJsonBody rejects non-json content types when body is present', async () => {
  await assert.rejects(
    () => parseJsonBody(makeReq({
      body: '{"ok":true}',
      headers: { 'content-type': 'text/plain' },
    })),
    /Content-Type must be application\/json/
  );
});

test('parseJsonBody returns parsed JSON for valid bounded JSON body', async () => {
  const parsed = await parseJsonBody(makeReq({
    body: '{"ok":true}',
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }));
  assert.deepEqual(parsed, { ok: true });
});

test('parseJsonBody accepts case-insensitive content-type headers', async () => {
  const parsed = await parseJsonBody(makeReq({
    body: '{"ok":true}',
    headers: { 'CONTENT-TYPE': 'application/json; charset=utf-8' },
  }));
  assert.deepEqual(parsed, { ok: true });
});
