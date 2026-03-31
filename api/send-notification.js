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

  // Fetch per-menu enabled flags from menu_meta.notifications
  let notifications = {};
  let restaurantId = null;
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menu_id}&select=notifications`,
      { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
    );
    if (r.ok) {
      const [meta] = await r.json();
      notifications = meta?.notifications || {};
    }
  } catch(e) {}

  // Look up the restaurant_id for this menu, then fetch per-restaurant env var config
  let notifConfig = {};
  try {
    const menuR = await fetch(
      `${sbUrl}/rest/v1/menus?id=eq.${menu_id}&select=restaurant_id`,
      { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
    );
    if (menuR.ok) {
      const [menu] = await menuR.json();
      restaurantId = menu?.restaurant_id;
    }
    if (restaurantId) {
      const restR = await fetch(
        `${sbUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=notifications_config`,
        { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
      );
      if (restR.ok) {
        const [rest] = await restR.json();
        notifConfig = rest?.notifications_config || {};
      }
    }
  } catch(e) {}

  // Helper: resolve an env var key from per-restaurant config, falling back to the global default
  const envVal = (channelKey, field, globalDefault) => {
    const key = notifConfig[channelKey]?.[field];
    if (key && typeof key === 'string') {
      const val = process.env[key];
      if (val) return val;
    }
    return globalDefault ? process.env[globalDefault] : undefined;
  };

  const MAX_LEN = 1000;
  const safeText = text.length > MAX_LEN
    ? text.slice(0, MAX_LEN - 16) + '... (truncated)'
    : text;

  const results = {};

  // ── GroupMe ──────────────────────────────────────────────────────────────────
  const gmEnabled = notifications.groupme?.enabled;
  const gmBotId   = envVal('groupme', 'env_key', 'GROUPME_BOT_ID');
  if (gmEnabled && gmBotId) {
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
  const smsEnabled = notifications.sms?.enabled;
  if (smsEnabled) {
    const sid      = envVal('sms', 'env_key_sid',   'TWILIO_ACCOUNT_SID');
    const authTok  = envVal('sms', 'env_key_token', 'TWILIO_AUTH_TOKEN');
    const fromNum  = envVal('sms', 'env_key_from',  'TWILIO_FROM_NUMBER');
    const toNums   = (envVal('sms', 'env_key_to',   'TWILIO_TO_NUMBERS') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (!sid || !authTok || !fromNum) {
      results.sms = 'error:TWILIO env vars not configured';
    } else if (!toNums.length) {
      results.sms = 'error:TWILIO_TO_NUMBERS not configured';
    } else {
      const basicAuth = Buffer.from(`${sid}:${authTok}`).toString('base64');
      const apiUrl    = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const errors    = [];
      for (const to of toNums) {
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
  const discEnabled    = notifications.discord?.enabled;
  const discWebhookUrl = envVal('discord', 'env_key', 'DISCORD_WEBHOOK_URL');
  if (discEnabled && discWebhookUrl) {
    try {
      const r = await fetch(discWebhookUrl, {
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
  const whEnabled = notifications.webhook?.enabled;
  const whUrl     = envVal('webhook', 'env_key_url',    'GENERIC_WEBHOOK_URL');
  if (whEnabled && whUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const secret  = envVal('webhook', 'env_key_secret', 'GENERIC_WEBHOOK_SECRET');
      if (secret) headers['X-Webhook-Secret'] = secret;
      const r = await fetch(whUrl, {
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
