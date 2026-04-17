export function parseRequestBody(req) {
  const incoming = req?.body;
  if (!incoming) return {};
  if (typeof incoming === 'string') {
    try {
      const parsed = JSON.parse(incoming);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      throw { status: 400, message: 'Invalid JSON body' };
    }
  }
  return incoming && typeof incoming === 'object' ? incoming : {};
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
