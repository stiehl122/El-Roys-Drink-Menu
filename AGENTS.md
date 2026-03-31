# Repository Guidelines

## Project Structure & Module Organization
This is a zero-dependency web app with no build step. Keep changes small and targeted:

- `index.html`: static markup for the public menu, manager/admin panels, auth overlay, and modals.
- `app.js`: main client logic, state management, Supabase/Firebase sync, auth, and rendering.
- `style.css`: all styling; use existing CSS custom properties in `:root` and `body.manager-mode`.
- `api/`: Vercel serverless routes such as `config.js`, `role.js`, `users.js`, and notification handlers.
- `supabase/migrations/`: ordered SQL migrations for schema and data changes.
- `scripts/`: one-off maintenance scripts such as `migrate-firebase-to-supabase.js`.
- `docs/`: plans and design notes; reference these for historical context, not runtime behavior.

## Build, Test, and Development Commands
There is no `package.json`, bundler, or local build pipeline.

- `python3 -m http.server 8000`: serve the static app locally for UI checks.
- `open http://localhost:8000`: load the local app in a browser.
- `node scripts/migrate-firebase-to-supabase.js`: run the migration script when the required env vars are set.
- `git diff --stat`: review the scope of your changes before opening a PR.

Full auth, database writes, and notifications require a Vercel deployment with the expected environment variables.

## Coding Style & Naming Conventions
Use plain JavaScript, HTML, and CSS only. Match the existing style:

- Use 2-space indentation in `index.html`, `style.css`, and `api/` files.
- Prefer `const`/`let`, camelCase for variables/functions, and UPPER_SNAKE_CASE for shared constants like `APP_VERSION`.
- Keep `app.js` organized under the existing `// ─── SECTION ───` banners.
- Add new colors through CSS variables before using them directly in rules.

## Testing Guidelines
There is no automated test suite yet. Verify changes manually in browser:

- public menu rendering
- manager/admin flows
- auth overlay and role-gated actions
- API route behavior when relevant

For schema changes, add a new timestamped file under `supabase/migrations/`.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit messages such as `gitignore changes`, `Removed unused "lib" folder and items`, and merge commits from feature branches. Prefer concise, descriptive subjects focused on one change.

PRs should include a clear summary, linked issue or context, screenshots for UI changes, notes about env vars or migrations, and manual test coverage performed.
