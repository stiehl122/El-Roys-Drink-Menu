import { saveSharedDraftCommand } from './_menu-draft.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const result = await saveSharedDraftCommand(req);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || {
      ok: false,
      status: 'draft_save_failed',
      error: error?.message || 'Failed to save draft',
      compatibility: error?.compatibility || null,
    });
  }
}
