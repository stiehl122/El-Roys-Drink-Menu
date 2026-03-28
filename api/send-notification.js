import { requireRole } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    await requireRole(req, 'manager', 'admin');
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const { menu_id, text } = req.body;
  if (!menu_id) return res.status(400).json({ error: 'Missing menu_id' });
  if (!text)    return res.status(400).json({ error: 'Missing text' });

  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fetch per-menu notification config from menu_meta
  let notifications = {};
  let legacyBotId   = '';
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menu_id}&select=notifications,bot_id`,
      { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
    );
    if (r.ok) {
      const [meta] = await r.json();
      notifications = meta?.notifications || {};
      legacyBotId   = meta?.bot_id        || '';
    }
  } catch(e) {}

  const MAX_LEN = 1000;
  const safeText = text.length > MAX_LEN
    ? text.slice(0, MAX_LEN - 16) + '... (truncated)'
    : text;

  const results = {};

  // ── GroupMe ──────────────────────────────────────────────────────────────────
  const gm      = notifications.groupme || {};
  const gmBotId = gm.bot_id || legacyBotId;
  if (gm.enabled && gmBotId) {
    try {
      const r = await fetch('https://api.groupme.com/v3/bots/post', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bot_id: gmBotId, text: safeText }),
      });
      results.groupme = (r.ok || r.status === 202) ? 'ok' : `error:${r.status}`;
    } catch(e) {
      results.groupme = `error:${e.message}`;
    }
  } else {
    results.groupme = 'skipped';
  }

  // ── Twilio SMS ────────────────────────────────────────────────────────────────
  const sms = notifications.sms || {};
  if (sms.enabled && Array.isArray(sms.numbers) && sms.numbers.length) {
    const sid      = process.env.TWILIO_ACCOUNT_SID;
    const authTok  = process.env.TWILIO_AUTH_TOKEN;
    const fromNum  = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !authTok || !fromNum) {
      results.sms = 'error:TWILIO env vars not configured';
    } else {
      const basicAuth = Buffer.from(`${sid}:${authTok}`).toString('base64');
      const apiUrl    = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const errors    = [];
      for (const to of sms.numbers) {
        try {
          const body = new URLSearchParams({ From: fromNum, To: to, Body: safeText });
          const r = await fetch(apiUrl, {
            method:  'POST',
            headers: {
              'Authorization': `Basic ${basicAuth}`,
              'Content-Type':  'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          });
          if (!r.ok) errors.push(`${to}:${r.status}`);
        } catch(e) {
          errors.push(`${to}:${e.message}`);
        }
      }
      results.sms = errors.length ? `error:${errors.join('; ')}` : 'ok';
    }
  } else {
    results.sms = 'skipped';
  }

  // ── Discord ───────────────────────────────────────────────────────────────────
  const discord = notifications.discord || {};
  if (discord.enabled && discord.webhook_url) {
    try {
      const r = await fetch(discord.webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: safeText }),
      });
      results.discord = r.ok ? 'ok' : `error:${r.status}`;
    } catch(e) {
      results.discord = `error:${e.message}`;
    }
  } else {
    results.discord = 'skipped';
  }

  // ── Generic Webhook ───────────────────────────────────────────────────────────
  const webhook = notifications.webhook || {};
  if (webhook.enabled && webhook.url) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (webhook.secret) headers['X-Webhook-Secret'] = webhook.secret;
      const r = await fetch(webhook.url, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ text: safeText, menu_id }),
      });
      results.webhook = r.ok ? 'ok' : `error:${r.status}`;
    } catch(e) {
      results.webhook = `error:${e.message}`;
    }
  } else {
    results.webhook = 'skipped';
  }

  // 202 = at least one ok or all skipped; 207 = partial; 500 = all enabled channels failed
  const values     = Object.values(results);
  const anyOk      = values.some(v => v === 'ok');
  const allSkipped = values.every(v => v === 'skipped');
  const anyError   = values.some(v => v.startsWith('error'));

  let status = 202;
  if (!allSkipped && !anyOk && anyError) status = 500;
  else if (anyOk && anyError)            status = 207;

  res.status(status).json({ results });
}
