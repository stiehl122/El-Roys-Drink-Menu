# Smoke Test Checklist

## Public Web

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

## iOS

- App launches on simulator.
- Staff sign-in works.
- Menu load works.
- Save and Send Update preserve their different meanings.
- Offline draft can be created, restored, sent, and cleared.
- Account deletion request path is reachable.
