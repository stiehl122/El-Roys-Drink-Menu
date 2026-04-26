# Smoke Test Checklist

## Public Web

- `/api/health` returns HTTP 200 and reports required Supabase config as configured without exposing secret values.
- Launch TODO: add an external uptime monitor for production `/api/health`; Vercel Monitoring is not currently configured.
- `/` loads without console errors.
- `/leroyslounge` loads route-first and shows footer staff sign-in.
- `/elroyscantina` loads route-first and shows footer staff sign-in.
- Public footer shows `APP_VERSION` and last-updated time.
- Preview deployments show `PREVIEW`.
- `?menu=el-roys` normalizes to El Roy's Cantina Drinks.

## Manager

- Manager signs in.
- Manager only sees menus they are allowed to edit.
- Save persists quietly and does not send notifications.
- Send Update persists, sends notifications, and updates public timestamp/history.
- 86'd items remain public with badge or strike-through.
- Food menu hides recipe controls.

## Admin

- Admin signs in.
- Admin can update landing draft without publishing live sections.
- Admin can publish selected landing sections live.
- Preview only: automated access atomicity test passes with a safe test account.
- Production: no manager access regression is visible after deploy.

## Auth Abuse Controls

- Repeated auth attempts eventually return HTTP 429 with retry metadata.
- Owner verifies production Supabase Auth rate limits and password policy.
- Owner verifies Vercel Firewall or provider-level limits protect public auth endpoints; app-local throttles are best-effort per serverless instance only.
- Preview audit sign-in secrets remain restricted to preview deployments only.

## iOS

- App launches on simulator.
- Staff sign-in works.
- Menu load works.
- Save and Send Update preserve their different meanings.
- Offline draft can be created, restored, sent, and cleared.
- Account deletion request path is reachable.
