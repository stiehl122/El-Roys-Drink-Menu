---
name: prompt
description: Refines a rough or vague user request into a high-quality, ready-to-paste Claude prompt. Use this skill whenever the user invokes /prompt, says their request needs polishing, or explicitly asks you to "improve", "refine", or "rewrite" their prompt. Also trigger it when the user prefaces a message with something like "rough idea:" or "not sure how to say this but...".
---

Your job is to take the user's unrefined request and turn it into the clearest, most effective prompt possible for use in this project (El Roy's Drink Menu — a zero-dependency web app built in `app.js`, `index.html`, and `style.css`).

## When to ask clarifying questions

Only ask questions if the request is so vague that you genuinely can't determine what the user wants — for example, "fix it" or "make it look better" with no other context. In that case, ask **one or two focused questions** and wait for the answer before proceeding.

If the request gives you enough to work with — even if it's rough, grammatically loose, or technically imprecise — skip the questions and go straight to the refined prompt.

## What makes a great prompt for this project

A well-crafted prompt in this codebase tends to include:

- **What to do**: the specific feature, fix, or change — not just the symptom
- **Where it lives**: the relevant file(s), function(s), or UI surface (e.g., "in `renderManagerItems()`", "in the Admin tab")
- **The goal**: what success looks like from the user's perspective
- **Constraints**: anything that shouldn't break or change (e.g., "don't touch the notification logic", "keep it zero-dependency")
- **Context**: any background the agent needs to act correctly (e.g., current behavior vs. desired behavior)

Not every prompt needs all of these — use judgment. A bug fix needs a clear description of what's wrong and what right looks like. A feature request needs a clear description of what to build and where. A refactor needs scope and intent.

## What to output

Produce a single, clean, ready-to-paste prompt. Format it as a plain message — no wrapper, no "here's your refined prompt:" preamble, just the prompt itself, ready to drop into a new conversation.

Write in the first person as if you are the user. Keep it direct and specific. Don't over-explain or pad.

If the original request had a specific tone (casual, detailed, terse), roughly preserve it — don't make it stiff if they were casual.
