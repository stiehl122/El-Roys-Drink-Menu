---
name: prompt
description: Refines a rough or vague user request into a high-quality, ready-to-paste Claude prompt. Use this skill whenever the user invokes /prompt, says their request needs polishing, or explicitly asks you to "improve", "refine", or "rewrite" their prompt. Also trigger it when the user prefaces a message with something like "rough idea:" or "not sure how to say this but...".
---

Take the user's rough request and produce a single ready-to-paste prompt. Output only the prompt — no preamble, no wrapper.

## Rules

1. **Ask questions only** if the request is truly ambiguous (e.g., "fix it" with zero context). Otherwise, go straight to output.
2. Write in **first person** as the user. Match their tone.
3. Every prompt must include:
   - **What** to change (the specific fix, feature, or refactor)
   - **Where** it lives (file + function/section name, e.g., "`renderManagerItems()` in app.js" or "the `#admin-section` panel in index.html")
   - **Why / success criteria** (what "done" looks like)
4. Add **constraints** only when needed (e.g., "don't break offline fallback", "no new dependencies").
5. Reference concrete landmarks from CLAUDE.md's Code Map when pointing to locations — don't be vague.
6. Keep it short. A bug fix is 2-4 sentences. A feature is a short paragraph. A refactor states scope and intent.
