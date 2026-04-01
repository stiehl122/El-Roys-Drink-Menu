import { requireRole } from './_auth.js';

/**
 * Sanitizes a menu name to a safe storage path segment.
 * Mirrors sanitizeMenuName() in app.js.
 */
function sanitizeMenuName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export default async function handler(req, res) {
  // Auth — admin only
  try {
    await requireRole(req, 'admin');
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // ── DELETE — remove both design files for a menu ──────────────────────────
  if (req.method === 'DELETE') {
    const { menuName } = req.query;
    const sanitized = sanitizeMenuName(menuName);
    if (!sanitized) return res.status(400).json({ error: 'Invalid menuName' });

    const paths = [`${sanitized}_design.html`, `${sanitized}_design.css`];
    const deleteRes = await fetch(
      `${sbUrl}/storage/v1/object/menu-designs`,
      {
        method: 'DELETE',
        headers: {
          'apikey': sbService,
          'Authorization': `Bearer ${sbService}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: paths }),
      }
    );
    if (!deleteRes.ok) {
      const err = await deleteRes.text();
      return res.status(502).json({ error: 'Storage delete failed', detail: err });
    }
    return res.status(200).json({ ok: true });
  }

  // ── POST — upload a design file ───────────────────────────────────────────
  if (req.method === 'POST') {
    const { menuName, fileType } = req.body || {};
    if (!menuName) return res.status(400).json({ error: 'Missing menuName' });
    if (!['html', 'css'].includes(fileType)) {
      return res.status(400).json({ error: 'fileType must be html or css' });
    }

    const sanitized = sanitizeMenuName(menuName);
    if (!sanitized) return res.status(400).json({ error: 'Invalid menuName' });

    // Read raw body — Vercel exposes it as req.body when Content-Type is text/*
    // For binary/form uploads, the client should send the file content as plain text
    // with Content-Type: text/html or text/css accordingly.
    const content = typeof req.body === 'string' ? req.body : req.body?.content;
    if (!content) return res.status(400).json({ error: 'Missing file content' });

    // Validate size (500KB HTML, 200KB CSS)
    const maxBytes = fileType === 'html' ? 512_000 : 204_800;
    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
      return res.status(413).json({ error: `File too large (max ${maxBytes / 1024}KB)` });
    }

    const fileName    = `${sanitized}_design.${fileType}`;
    const contentType = fileType === 'html' ? 'text/html; charset=utf-8' : 'text/css; charset=utf-8';

    const uploadRes = await fetch(
      `${sbUrl}/storage/v1/object/menu-designs/${encodeURIComponent(fileName)}`,
      {
        method: 'PUT',
        headers: {
          'apikey': sbService,
          'Authorization': `Bearer ${sbService}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: content,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(502).json({ error: 'Storage upload failed', detail: err });
    }

    return res.status(200).json({ ok: true, fileName });
  }

  return res.status(405).end();
}
