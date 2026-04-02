---
name: promptx
description: Generates detailed, implementation-ready prompts designed for Codex execution. Use this skill when the user invokes /promptx, asks for a "codex prompt", wants to "hand this to codex", says "plan this for codex", or wants Claude to design an approach that Codex will execute. Also trigger when the user says "make a detailed prompt" or "write an execution plan" for a coding task. This is the Claude-designs, Codex-executes workflow.
---

# PromptX — Claude Designs, Codex Executes

Turn a rough user request into a fully researched, implementation-ready prompt that Codex can execute without further clarification.

The difference between `/prompt` and `/promptx`: `/prompt` polishes wording. `/promptx` does the thinking — it reads the codebase, maps the change, identifies edge cases, and produces a structured execution plan wrapped in Codex-native XML blocks.

## Workflow

### Phase 1: Understand the Request

If the request references specific features, files, or behaviors, read the relevant code before planning. Use CLAUDE.md's Code Map to locate sections quickly. The goal is to gather enough context that the Codex prompt can stand alone — Codex should not need to do exploratory research.

Identify:
- **Scope**: which files, functions, and DOM regions are involved
- **Dependencies**: what other code reads from or writes to those areas
- **Constraints**: offline fallback, no-dependency rule, CSS variable requirement, accessibility patterns, or other project rules that apply
- **Risk areas**: things that could break if touched carelessly

### Phase 2: Design the Approach

Plan the implementation in concrete terms:
- Exact functions to modify or create, with line-range references
- The order of changes (what depends on what)
- Edge cases to handle
- What "done" looks like — observable behavior, not vague goals

This is where Claude earns its keep. Codex is fast at execution but benefits from a clear blueprint. Spend the thinking here so Codex can spend its tokens doing.

### Phase 3: Assemble the Codex Prompt

Output a single fenced prompt block using Codex-native XML structure. Select blocks based on task type:

**Always include:**
- `<task>` — the concrete job with full context (files, functions, line ranges, expected behavior). This is the bulk of the prompt. Be specific enough that someone unfamiliar with the codebase could execute it.
- `<action_safety>` — scope boundaries so Codex stays focused

**Include for implementation/fix tasks:**
- `<completeness_contract>` — prevent Codex from stopping at first draft
- `<verification_loop>` — require self-check before finalizing
- `<default_follow_through_policy>` — keep Codex moving on routine decisions

**Include for multi-step or risky tasks:**
- `<missing_context_gating>` — prevent guessing on facts it can verify with tools

**Skip for simple tasks** — don't add blocks that don't earn their keep. A 3-line CSS fix doesn't need a verification loop.

### Output Format

Output the prompt inside a single fenced code block (```xml). No preamble, no explanation outside the block — just a brief one-line summary of what the prompt will accomplish, then the block.

**Example shape for a typical implementation task:**

```xml
<task>
In app.js, modify `renderPublicView()` (line ~1290) to [specific change].

Context:
- This function is called by [X] and its output feeds into [Y]
- The current behavior is [Z]
- The desired behavior is [W]

Files to modify:
1. `app.js` — `renderPublicView()` (~line 1290): [what to change and why]
2. `style.css` — add [specific rule] after the `.public-item` block (~line 340)

Implementation steps:
1. [First concrete step]
2. [Second concrete step]
3. [Third concrete step]

Edge cases:
- [Case 1]: handle by [approach]
- [Case 2]: handle by [approach]

Done when: [observable, testable outcome]
</task>

<completeness_contract>
Resolve the task fully before stopping.
Do not stop after the first file — all listed files must be updated.
Check that [specific integration point] still works after the change.
</completeness_contract>

<verification_loop>
Before finalizing, verify:
1. [Specific check relevant to this task]
2. [Another specific check]
3. No hardcoded hex colors in CSS (project rule: use var(--*) only)
</verification_loop>

<action_safety>
Keep changes scoped to the listed files and functions.
Do not refactor surrounding code, add comments to unchanged lines, or introduce new abstractions.
Preserve offline/localStorage fallback behavior.
</action_safety>

<default_follow_through_policy>
Default to the most reasonable low-risk interpretation and keep going.
Only stop when a missing detail changes correctness or could break an existing feature.
</default_follow_through_policy>
```

## Task-Type Templates

Choose the template closest to the task, then customize:

**Bug fix**: `<task>` (root cause + fix location + expected vs. actual) + `<verification_loop>` + `<action_safety>`

**New feature**: `<task>` (full spec with integration points) + `<completeness_contract>` + `<verification_loop>` + `<action_safety>` + `<default_follow_through_policy>`

**Refactor**: `<task>` (what moves where, what the new structure looks like) + `<completeness_contract>` + `<verification_loop>` (behavior must not change) + `<action_safety>`

**Style/CSS change**: `<task>` (exact selectors, properties, values, responsive breakpoints) + `<action_safety>`

**API route change**: `<task>` (endpoint, request/response shape, auth requirements) + `<verification_loop>` + `<missing_context_gating>` + `<action_safety>`

## Quality Checklist

Before outputting, verify the prompt:
- [ ] Names specific files and functions (not "the relevant code")
- [ ] Includes line-range references where helpful
- [ ] States the end condition in observable terms
- [ ] Mentions project constraints that apply (no deps, CSS vars, accessibility, etc.)
- [ ] Uses only the XML blocks the task actually needs
- [ ] Is self-contained — Codex shouldn't need to ask follow-up questions
