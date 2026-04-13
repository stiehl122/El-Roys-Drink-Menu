---
name: stitch-root-handoff
description: >
  Review Google Stitch desktop/mobile designs for the shared public `/`
  landing page, compare them against the root landing-page brief, and produce
  actionable Gemini revision prompts before import.
---

# Stitch Root Handoff

Use this skill when the user wants to:

- inspect a Google Stitch design for the public root homepage
- judge whether Stitch screens are workable before import
- compare desktop/mobile homepage screens against the landing-page brief
- generate revision prompts for Gemini before implementation

This skill is for the shared public `/` landing page only.

Do not use it for:

- `leroyslounge/`
- `elroyscantina/`
- `manager`
- `admin`
- direct Stitch imports of restaurant route pages

Use the separate `stitch` skill for route-owned restaurant imports after the
design is approved.

## Required reference

Read this file first:

- `design-loop/root/landing-page-stitch-brief.md`

Treat that brief as the source of truth for v1 design judgments.

## Expected inputs

- `stitch_project_id`
- `desktop_screen_id`
- `mobile_screen_id`
- optional user question about readiness, fidelity, or revision direction

Valid example asks:

- `Use $stitch-root-handoff for project 10770482172087921077 with desktop screen abc and mobile screen def`
- `Review these Stitch homepage screens and tell me what needs to change before import`

## Workflow

1. Read the root landing-page brief.

2. Fetch the Stitch project and the specified desktop/mobile screens.

Use:

- `mcp__stitch__get_project`
- `mcp__stitch__get_screen`

3. Inspect the actual design, not just metadata.

When visual judgment matters:

- download screenshots locally with `curl -L`
- open them with `view_image`
- download HTML exports if implementation practicality matters

4. Judge the screens against the v1 brief.

Focus on product fit, not just taste. Pay special attention to whether the
design:

- feels like a shared hub for exactly two restaurants
- is decision-first above the fold
- keeps Leroy's left / first and El Roy's right / second
- uses the existing sign assets or a clearly importable v1-safe identity system
- keeps hours clearly split by restaurant
- keeps Events and News separate
- supports the paired reviews carousel concept
- keeps the footer contract unchanged
- avoids invented product surfaces like booking, reservations, fake top-nav IA,
  or umbrella hospitality-group branding

5. Separate visual praise from import readiness.

Always call out:

- what is strong and should be preserved
- what misses the actual product
- what creates unnecessary implementation churn
- what must change before import

6. Produce actionable revision prompts.

By default, output:

- one desktop prompt
- one mobile prompt

If the user explicitly wants one combined prompt, provide that instead.

7. Stop at the handoff unless the user asks for import work.

Do not import the design into the repo from this skill alone. Once the design is
approved, switch to the appropriate implementation/import workflow.

## Output contract

Use this structure unless the user asks for something shorter:

### Verdict

Short answer on whether the design is workable as-is, workable with changes, or
not ready.

### What Works

Preserve-worthy strengths.

### What Must Change Before Import

Concrete mismatches against the brief and product.

### Revision Prompts

Copy-paste Gemini prompts for desktop and mobile.

## Style rules for the review

- Be direct and specific.
- Judge the screens against the product we are actually building.
- Prefer changes that reduce implementation churn.
- Do not drift into generic design critique.
- If the design is close, say so.
- If the design invents product surfaces we do not have, call that out clearly.
