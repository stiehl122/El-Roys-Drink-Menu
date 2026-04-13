import { authorizeNotificationRequest } from '../server/_notification-gateway.js';
import { deliverMenuNotification } from '../server/_notification-delivery.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let payload;
  try {
    payload = await authorizeNotificationRequest(req);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const menu_id = payload.menuId;
  const safeText = payload.text;

  try {
    const delivery = await deliverMenuNotification(menu_id, safeText);
    return res.status(delivery.status).json({ results: delivery.results });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server misconfigured' });
  }
}
