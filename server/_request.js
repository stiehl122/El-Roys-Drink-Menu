export async function readRequestText(req, maxBytes = 1024 * 1024) {
  if (typeof req?.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) throwRequestError(413, 'Request body too large');
    return req.body;
  }

  if (typeof req?.[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) throwRequestError(413, 'Request body too large');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  return '';
}

function readHeaderValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) return value;
  }
  return '';
}

function normalizeMaxBytes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024 * 1024;
}

function throwRequestError(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export async function parseJsonBody(req, options = {}) {
  if (req?.body && typeof req.body === 'object' && !Array.isArray(req.body) && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const maxBytes = normalizeMaxBytes(options.maxBytes || 1024 * 1024);
  const contentType = String(readHeaderValue(req?.headers, 'content-type'));
  const text = await readRequestText(req, maxBytes);
  if (!text.trim()) return {};
  if (!/^application\/json\b/i.test(contentType)) {
    throwRequestError(415, 'Content-Type must be application/json');
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    throwRequestError(400, 'Invalid JSON body');
  }
}

export async function parseRequestBody(req, options = {}) {
  const parsed = await parseJsonBody(req, options);
  if (req && (typeof req.body === 'string' || typeof req[Symbol.asyncIterator] === 'function')) {
    req.body = parsed;
  }
  return parsed;
}

export function readUrl(req) {
  try {
    return new URL(req?.url || '/', `http://${req?.headers?.host || 'localhost'}`);
  } catch (_) {
    return new URL('http://localhost/');
  }
}

export function readQueryValue(req, key) {
  if (req?.query && Object.prototype.hasOwnProperty.call(req.query, key)) {
    return req.query[key];
  }
  return readUrl(req).searchParams.get(key);
}

export function readAction(req, body = null) {
  const fromBody = body && typeof body === 'object' ? body.action : '';
  const value = fromBody || readQueryValue(req, 'action') || readQueryValue(req, 'mode') || '';
  return String(value || '').trim().toLowerCase();
}

export const getRequestUrl = readUrl;
