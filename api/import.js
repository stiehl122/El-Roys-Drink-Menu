import { requireRole } from '../server/_auth.js';
import { importNewsFromUrl, importReviewFromUrl, readRequestJson } from './_landing-import.js';

const IMPORT_KIND = {
  NEWS: 'news',
  REVIEW: 'review',
};

function resolveImportKind(req) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    return (url.searchParams.get('kind') || '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function isReviewImport(body = {}, kind = '') {
  if (kind === IMPORT_KIND.REVIEW) return true;
  if (kind === IMPORT_KIND.NEWS) return false;
  return !!String(body?.restaurantId || '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireRole(req, 'admin');
    const body = await readRequestJson(req);
    const kind = resolveImportKind(req);

    if (isReviewImport(body, kind)) {
      const result = await importReviewFromUrl(body?.url || '');
      return res.status(200).json(result);
    }

    const result = await importNewsFromUrl(body?.url || '');
    return res.status(200).json(result);
  } catch (error) {
    const isReviewFlow = isReviewImport({}, resolveImportKind(req));
    return res.status(error?.status || 500).json({
      error: error?.message || (isReviewFlow ? 'Review import failed' : 'News import failed'),
    });
  }
}
