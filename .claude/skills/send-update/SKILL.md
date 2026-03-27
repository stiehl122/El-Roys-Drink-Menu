---
name: send-update
description: Reference guide for composing and sending a GroupMe menu update from the El Roy's app.
---

This skill explains how the GroupMe menu update flow works in the El Roy's app.

## How it works

1. In **Manager mode**, make your menu changes (add/remove items, toggle 86'd, update descriptions).
2. Changed items show a **green dot** (draft indicator) — saved locally but not yet announced.
3. The **Send Update** button shows a badge with the count of unsent changes.
4. Clicking **Send Update**:
   - Saves all changes to Firebase (same as Save)
   - Updates the "Last Updated" timestamp in the header
   - Sends a formatted patch-note message to the GroupMe group via `/api/send-groupme`
   - Clears all draft indicators

## Troubleshooting

- **GroupMe silent after Send Update:** Check that `GROUPME_BOT_ID` is set — either as a Vercel env var or via the Admin tab. Check Vercel function logs for `/api/send-groupme` errors.
- **Badge shows 0 but changes exist:** Changes must differ from the last *announced* state, not just the last saved state.
