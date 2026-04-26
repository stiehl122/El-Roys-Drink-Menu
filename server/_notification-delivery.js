import { getSupabaseServerConfig, serviceHeaders } from './_supabase.js';
import { fetchWithTimeout, readResponseJsonWithTimeout } from './_fetch.js';

function summarizeNotificationResults(results = {}) {
  const entries = Object.entries(results || {}).filter(([channel]) => !!channel);
  const okChannels = [];
  const skippedChannels = [];
  const failedChannels = [];

  entries.forEach(([channel, status]) => {
    if (status === 'ok') okChannels.push(channel);
    else if (status === 'skipped') skippedChannels.push(channel);
    else failedChannels.push(channel);
  });

  return {
    results,
    okChannels,
    skippedChannels,
    failedChannels,
    anyOk: okChannels.length > 0,
    anyError: failedChannels.length > 0,
    allSkipped: entries.length > 0 && skippedChannels.length === entries.length,
  };
}

function notificationConfigReadFailure() {
  const results = {
    config: 'error:notification_config_read_failed',
  };
  return {
    status: 500,
    results,
    summary: summarizeNotificationResults(results),
  };
}

async function readSupabaseRows(url, sbService) {
  const response = await fetchWithTimeout(
    url,
    { headers: serviceHeaders({}, sbService) },
    { timeoutMs: 5000 }
  );
  if (!response.ok) throw new Error('notification_config_read_failed');
  return await readResponseJsonWithTimeout(response, { timeoutMs: 5000 });
}

export async function deliverMenuNotification(menuId, safeText) {
  let sbUrl;
  let sbService;
  ({ sbUrl, sbService } = getSupabaseServerConfig());

  let notifications = {};
  let restaurantId = null;
  let notifConfig = {};

  try {
    const [meta] = await readSupabaseRows(
      `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}&select=notifications`,
      sbService
    );
    notifications = meta?.notifications || {};
  } catch (_) {
    return notificationConfigReadFailure();
  }

  try {
    const [menu] = await readSupabaseRows(
      `${sbUrl}/rest/v1/menus?id=eq.${menuId}&select=restaurant_id`,
      sbService
    );
    restaurantId = menu?.restaurant_id || null;
    if (restaurantId) {
      const [rest] = await readSupabaseRows(
        `${sbUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=notifications_config`,
        sbService
      );
      notifConfig = rest?.notifications_config || {};
    }
  } catch (_) {
    return notificationConfigReadFailure();
  }

  const envVal = (channelKey, field, globalDefault) => {
    const key = notifConfig[channelKey]?.[field];
    if (key && typeof key === 'string') {
      const val = process.env[key];
      if (val) return val;
    }
    return globalDefault ? process.env[globalDefault] : undefined;
  };

  const results = {};

  const gmEnabled = notifications.groupme?.enabled;
  const gmBotId = envVal('groupme', 'env_key', 'GROUPME_BOT_ID');
  if (gmEnabled && gmBotId) {
    try {
      const r = await fetchWithTimeout('https://api.groupme.com/v3/bots/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_id: gmBotId, text: safeText }),
      }, { timeoutMs: 5000 });
      results.groupme = (r.ok || r.status === 202) ? 'ok' : `error:${r.status}`;
    } catch (error) {
      results.groupme = `error:${error.message}`;
    }
  } else {
    results.groupme = 'skipped';
  }

  const smsEnabled = notifications.sms?.enabled;
  if (smsEnabled) {
    const sid = envVal('sms', 'env_key_sid', 'TWILIO_ACCOUNT_SID');
    const authTok = envVal('sms', 'env_key_token', 'TWILIO_AUTH_TOKEN');
    const fromNum = envVal('sms', 'env_key_from', 'TWILIO_FROM_NUMBER');
    const toNums = (envVal('sms', 'env_key_to', 'TWILIO_TO_NUMBERS') || '')
      .split(',').map(entry => entry.trim()).filter(Boolean);
    if (!sid || !authTok || !fromNum) {
      results.sms = 'error:TWILIO env vars not configured';
    } else if (!toNums.length) {
      results.sms = 'error:TWILIO_TO_NUMBERS not configured';
    } else {
      const basicAuth = Buffer.from(`${sid}:${authTok}`).toString('base64');
      const apiUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const errors = [];
      for (const to of toNums) {
        try {
          const body = new URLSearchParams({ From: fromNum, To: to, Body: safeText });
          const r = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          }, { timeoutMs: 5000 });
          if (!r.ok) errors.push(`${to}:${r.status}`);
        } catch (error) {
          errors.push(`${to}:${error.message}`);
        }
      }
      results.sms = errors.length ? `error:${errors.join('; ')}` : 'ok';
    }
  } else {
    results.sms = 'skipped';
  }

  const discEnabled = notifications.discord?.enabled;
  const discWebhookUrl = envVal('discord', 'env_key', 'DISCORD_WEBHOOK_URL');
  if (discEnabled && discWebhookUrl) {
    try {
      const r = await fetchWithTimeout(discWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: safeText }),
      }, { timeoutMs: 5000 });
      results.discord = r.ok ? 'ok' : `error:${r.status}`;
    } catch (error) {
      results.discord = `error:${error.message}`;
    }
  } else {
    results.discord = 'skipped';
  }

  const whEnabled = notifications.webhook?.enabled;
  const whUrl = envVal('webhook', 'env_key_url', 'GENERIC_WEBHOOK_URL');
  if (whEnabled && whUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const secret = envVal('webhook', 'env_key_secret', 'GENERIC_WEBHOOK_SECRET');
      if (secret) headers['X-Webhook-Secret'] = secret;
      const r = await fetchWithTimeout(whUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: safeText, menu_id: menuId }),
      }, { timeoutMs: 5000 });
      results.webhook = r.ok ? 'ok' : `error:${r.status}`;
    } catch (error) {
      results.webhook = `error:${error.message}`;
    }
  } else {
    results.webhook = 'skipped';
  }

  const summary = summarizeNotificationResults(results);
  let status = 202;
  if (!summary.allSkipped && !summary.anyOk && summary.anyError) status = 500;
  else if (summary.anyOk && summary.anyError) status = 207;

  return {
    status,
    results,
    summary,
  };
}
