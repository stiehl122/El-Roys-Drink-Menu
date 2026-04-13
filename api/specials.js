import { requireRole } from './_auth.js';
import { getSupabaseServerConfig } from './_supabase.js';
import {
  executeRestaurantSpecialsCommand,
  parseSpecialsCommand,
  respondWithSpecialsResult,
} from './_specials-command.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let caller;
  try {
    caller = await requireRole(req, 'manager', 'admin');
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Unauthorized' });
  }

  let sbUrl;
  try {
    ({ sbUrl } = getSupabaseServerConfig());
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server misconfigured' });
  }

  try {
    const command = parseSpecialsCommand(req);
    const result = await executeRestaurantSpecialsCommand({
      sbUrl,
      caller,
      command,
    });
    return respondWithSpecialsResult(res, result);
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || { error: error?.message || 'Failed to update specials' });
  }
}
