---
name: investigate
description: "Run a dual-investigator investigation only when explicitly invoked as `$investigate`. Spawn a Codemonkey investigator on `gpt-5.3-codex` and a Sherlock investigator on `gpt-5.4` to investigate the topic named in the invocation, then reconcile their evidence into one answer. Do not use this skill for ordinary natural-language requests to investigate, debug, review, or explore."
---

# Investigate

Use this skill only for explicit `$investigate ...` invocations. Do not trigger
it from ordinary natural-language requests such as "investigate this",
"debug this", or "look into this".

This skill is investigation-only by default:

- stay read-only unless the invocation explicitly asks for edits
- do not make commits, open PRs, or change files unless the user asks
- prefer evidence from code, logs, docs, tests, and command output over theory

## Invocation

Expected form:

```text
$investigate <what to investigate>
```

If the user invokes `$investigate` without a subject, ask what to investigate.

## Workflow

1. Parse the investigation target.
- Extract the core question, any constraints, and the most likely places to
  inspect first.
- If the scope is broad, narrow it into a concrete investigation brief before
  delegating.

2. Do one small local framing pass first.
- Read enough local context to make the delegated asks specific.
- Identify obvious files, routes, modules, logs, or commands worth checking.
- Do not spend the whole turn investigating locally before delegating.

3. Spawn both investigators in parallel.

- **Codemonkey investigator**
  - use `spawn_agent`
  - `agent_type`: `explorer`
  - `model`: `gpt-5.3-codex`
  - `reasoning_effort`: `medium`
  - mission: trace concrete evidence, inspect the relevant code paths, and
    return the most likely explanation with file references, commands run, and
    verification ideas

- **Sherlock investigator**
  - use `spawn_agent`
  - `agent_type`: `default`
  - `model`: `gpt-5.4`
  - `reasoning_effort`: `high`
  - mission: investigate independently, stress-test assumptions, surface
    contradictions and edge cases, and propose the strongest explanation plus
    what evidence would confirm or falsify it

4. Keep both investigators read-only unless the invocation explicitly asks for
implementation.

5. While they run, continue non-overlapping local evidence gathering when that
adds signal.
- good examples: inspect one more suspect module, gather logs, or confirm a
  reproduction path
- do not duplicate the delegated work unless you need a quick sanity check

6. Reconcile the results yourself.
- compare where Codemonkey and Sherlock agree
- call out disagreements clearly
- prefer primary evidence over confidence
- label each conclusion as `confirmed`, `likely`, or `uncertain`
- surface missing evidence instead of papering over it

## Delegation Prompt Shape

Give each investigator:

- the exact thing to investigate
- any known constraints or reproduction steps
- a reminder to stay read-only unless explicitly told otherwise
- the output shape you want back

Ask Codemonkey for:

- strongest evidence-backed explanation
- relevant files and line references when possible
- concrete commands or traces used
- gaps that still need checking

Ask Sherlock for:

- independent theory of the case
- alternative explanations or hidden failure modes
- contradictions in the current assumptions
- what would most efficiently disprove the leading theory

## Output

Respond with a compact investigation report:

1. what was investigated
2. the best current answer
3. evidence from each investigator
4. disagreements or uncertainty
5. the most useful next step

If the user wants a fix after the investigation, ask whether to implement it
unless the invocation already explicitly requested implementation too.
