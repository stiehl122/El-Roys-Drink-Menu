---
name: creative-change-investigator
description: Investigate the codebase and recommend creative feature, UX, route, or implementation improvements. Use when the user wants exploratory solution ideas, feature/change recommendations, alternative directions, or a grounded investigation of a specific improvement area. If the ask is broad or blank, scan for promising directions and ask the user what to prioritize before going deeper.
---

# Creative Change Investigator

Use this skill when the user wants informed idea generation rather than an
immediate implementation.

This skill has two modes:

- broad exploration mode: the user invokes it without a concrete target and
  wants options
- scoped investigation mode: the user names a route, feature, workflow, bug
  area, or improvement target and wants better solutions

If the user brings up multiple distinct investigation targets, split them into
separate tracks and use sub-agents to investigate each one in parallel when
that capability is available.

## Ground Rules

- stay grounded in the actual repo before suggesting changes
- prefer ideas that respect the zero-dependency, no-build-tool setup
- preserve the two-restaurant, four-menu model
- preserve auth, per-menu access, live polling, and save-vs-send behavior
- preserve route-owned public pages and use the default public renderer only as
  fallback context
- avoid generic product advice that ignores current architecture

## Broad Exploration Mode

Use this when the prompt is effectively blank or only asks for ideas,
directions, recommendations, or "what should we work on?"

### Workflow

1. Scan the repo structure and identify the highest-leverage surfaces:
   - public routes
   - shared manager/admin flows
   - auth/access flows
   - persistence and Supabase-backed hydration
   - notifications, featured items, history, and preview behavior
2. Read only the files needed to understand the most promising opportunity
   areas.
3. Produce 3-6 concrete directions worth exploring.
4. For each direction, include:
   - what it improves
   - why it is promising now
   - likely files or functions involved
   - main risk or tradeoff
5. Pause and ask the user which direction to prioritize, unless they clearly
   asked for a full recommendation.

### Output Shape

When pausing for user direction, keep it decision-friendly:

- one short summary sentence
- 3-6 labeled options
- one recommended option, if there is a clear best bet
- one short question asking what to put the most stock in

## Scoped Investigation Mode

Use this when the user names a specific area such as a route, screen, feature,
workflow, performance issue, UX problem, or implementation idea.

### Workflow

1. Find the relevant files, functions, and adjacent constraints.
2. Read enough surrounding code to understand how the target area interacts
   with the rest of the app.
3. Identify the real constraint set:
   - user-visible behavior that must be preserved
   - data and auth boundaries
   - route ownership vs. shared runtime responsibilities
   - accessibility or release/version implications
4. Generate 2-4 credible solution paths.
5. Compare them on:
   - user impact
   - implementation complexity
   - regression risk
   - fit with current architecture
6. Recommend the strongest path and explain why it wins.

## Multi-Topic Investigation

Use this when the user names multiple routes, features, workflows, or possible
improvements in the same request.

### Workflow

1. Break the request into distinct investigation targets.
2. Spawn one sub-agent per target when the targets are meaningfully separate and
   can be explored in parallel.
3. Give each sub-agent a narrow scope so it investigates only its assigned
   route, feature, or workflow.
4. Keep final synthesis in the main thread:
   - compare the findings
   - remove overlap
   - surface conflicts or shared dependencies
   - recommend what deserves the most attention first
5. If the targets are too tightly coupled for clean parallel work, investigate
   them together instead of forcing delegation.

### Output

Return:

- the distinct areas investigated
- the best idea or solution path for each area
- shared risks or architectural overlap
- the recommended priority order across the areas

## Idea Quality Bar

Recommendations should be:

- specific to this app, not generic SaaS advice
- actionable enough that implementation could start from the recommendation
- creative in approach, but still compatible with current constraints
- honest about tradeoffs and regression risk

Good recommendation themes include:

- route-owned public experience improvements
- manager/admin workflow simplification
- safer or clearer save/send/draft behavior
- menu discovery and switching improvements
- featured or notification flow improvements
- release/version visibility improvements
- targeted data-flow or hydration simplifications

## Suggested Output

Return:

- what area was investigated
- what files or functions were most relevant
- the best solution options
- the recommended direction
- open questions that could change the recommendation

If the request is broad, stop before implementation and ask the user what to
prioritize next.
