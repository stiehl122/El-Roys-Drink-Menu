const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonBody, parseRequestBody } = require('../server/_request.js');

function makeStreamReq({ body = '', headers = {}, method = 'POST' } = {}) {
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}

function makeStringBodyReq({ body = '', headers = {}, method = 'POST' } = {}) {
  return {
    method,
    headers,
    body,
  };
}

test('parseJsonBody rejects oversized JSON bodies', async () => {
  const body = JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 1) });
  await assert.rejects(
    () => parseJsonBody(makeStreamReq({
      body,
      headers: { 'content-type': 'application/json' },
    }), { maxBytes: 1024 }),
    /Request body too large/
  );
});

test('parseJsonBody rejects non-json content types when body is present', async () => {
  await assert.rejects(
    () => parseJsonBody(makeStreamReq({
      body: '{"ok":true}',
      headers: { 'content-type': 'text/plain' },
    })),
    /Content-Type must be application\/json/
  );
});

test('parseJsonBody returns parsed JSON for valid bounded JSON body', async () => {
  const parsed = await parseJsonBody(makeStreamReq({
    body: '{"ok":true}',
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }));
  assert.deepEqual(parsed, { ok: true });
});

test('parseJsonBody accepts case-insensitive content-type headers', async () => {
  const parsed = await parseJsonBody(makeStreamReq({
    body: '{"ok":true}',
    headers: { 'CONTENT-TYPE': 'application/json; charset=utf-8' },
  }));
  assert.deepEqual(parsed, { ok: true });
});

test('parseJsonBody returns parsed JSON from string request bodies', async () => {
  const parsed = await parseJsonBody(makeStringBodyReq({
    body: '{"ok":true}',
    headers: { 'content-type': 'application/json' },
  }));
  assert.deepEqual(parsed, { ok: true });
});

test('parseJsonBody rejects invalid JSON bodies', async () => {
  await assert.rejects(
    () => parseJsonBody(makeStreamReq({
      body: '{"ok":',
      headers: { 'content-type': 'application/json' },
    })),
    /Invalid JSON body/
  );
});

test('parseJsonBody returns empty object for whitespace bodies', async () => {
  const parsed = await parseJsonBody(makeStreamReq({
    body: '   \n\t  ',
    headers: { 'content-type': 'application/json' },
  }));
  assert.deepEqual(parsed, {});
});

test('parseJsonBody falls back to the default size limit for invalid maxBytes options', async () => {
  const body = JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 1) });
  await assert.rejects(
    () => parseJsonBody(makeStreamReq({
      body,
      headers: { 'content-type': 'application/json' },
    }), { maxBytes: 'not-a-number' }),
    /Request body too large/
  );
});

test('parseJsonBody preserves pre-parsed object request bodies', async () => {
  const body = { ok: true };
  const parsed = await parseJsonBody(makeStringBodyReq({
    body,
    headers: { 'content-type': 'application/json' },
  }));
  assert.equal(parsed, body);
});

test('parseRequestBody caches parsed string request bodies for downstream consumers', async () => {
  const req = makeStringBodyReq({
    body: '{"action":"save_live"}',
    headers: { 'content-type': 'application/json' },
  });
  const parsed = await parseRequestBody(req);
  assert.deepEqual(parsed, { action: 'save_live' });
  assert.equal(req.body, parsed);
});

test('parseRequestBody caches parsed stream request bodies for downstream consumers', async () => {
  const req = makeStreamReq({
    body: '{"action":"save_live"}',
    headers: { 'content-type': 'application/json' },
  });
  const parsed = await parseRequestBody(req);
  assert.deepEqual(parsed, { action: 'save_live' });
  assert.equal(req.body, parsed);
});

test('parseJsonBody exposes request error status codes', async () => {
  await assert.rejects(
    () => parseJsonBody(makeStreamReq({
      body: '{"ok":true}',
      headers: { 'content-type': 'text/plain' },
    })),
    { status: 415, message: 'Content-Type must be application/json' }
  );

  await assert.rejects(
    () => parseJsonBody(makeStreamReq({
      body: '{"ok":',
      headers: { 'content-type': 'application/json' },
    })),
    { status: 400, message: 'Invalid JSON body' }
  );

  await assert.rejects(
    () => parseJsonBody(makeStreamReq({
      body: '{"ok":true}',
      headers: { 'content-type': 'application/json' },
    }), { maxBytes: 1 }),
    { status: 413, message: 'Request body too large' }
  );
});
