import { createBootstrapResponse, createProfileResponse, executeAuthAction } from '../server/_auth-proxy.js';
import { readAction } from '../server/_request.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT') return res.status(405).end();

  try {
    if (req.method === 'GET') {
      const mode = readAction(req);
      if (mode === 'profile') return res.json(await createProfileResponse(req));
      return res.json(await createBootstrapResponse(req));
    }

    return res.json(await executeAuthAction(req));
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
