import { createBootstrapResponse, createProfileResponse, executeAuthAction } from '../server/_auth-proxy.js';
import { readAction } from '../server/_request.js';

function applyResponseHeaders(res, headers) {
  if (!headers || typeof headers !== 'object') return;
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT') return res.status(405).end();

  try {
    if (req.method === 'GET') {
      const mode = readAction(req);
      if (mode === 'profile') return res.json(await createProfileResponse(req));
      return res.json(await createBootstrapResponse(req));
    }

    const result = await executeAuthAction(req);
    const hasResponseMetadata = !!result && typeof result === 'object'
      && result.authResponse === true;

    if (!hasResponseMetadata) return res.json(result);

    applyResponseHeaders(res, result.headers);
    if (Number.isInteger(result.status)) return res.status(result.status).json(result.body || {});
    return res.json(result.body || {});
  } catch (error) {
    applyResponseHeaders(res, error?.headers);
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
