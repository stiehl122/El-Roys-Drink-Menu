---
name: launch-readiness-auditor
description: Re-run the exhaustive hostile tester, confused first-time user, and launch-readiness audit against the current repo state. Use when asked for a no-code-change pre-launch review covering website, iOS, dependency-free server, API contracts, security, privacy/legal, QA, deployment, observability, performance, accessibility, docs, brand/content, data, configuration, and monorepo health with P0/P1/P2 findings.
---

# Launch Readiness Auditor

Use this skill to repeat the hostile tester / first-time user /
launch-readiness audit against the current repository state. The goal is to
answer:

> What do we need to do before this project is ready to launch?

This is an audit, diagnosis, and planning-input pass. Do not implement fixes,
create implementation plans, edit product code, stage files, clean generated
files, or revert unrelated work unless the user explicitly asks.

## Operating Posture

Before writing the final report, try to break the project like:

- a hostile tester looking for the shortest path to embarrassment, data loss,
  app rejection, broken launch, security/privacy breach, or authorization bypass
- a confused first-time public user, staff manager, admin, and iOS user
- a senior launch-readiness engineer, security reviewer, product QA lead, iOS
  release engineer, web platform engineer, and backend reliability engineer

Be candid. Prefer evidence from the repo, commands, official sources, and
manual/browser checks over guesses. Do not assume existing code is correct
because it builds. Do not assume an omission is intentional unless the repo
documents it.

When a conclusion is inferred, say it is an inference and state what would
confirm or falsify it.

## Project Constraints To Preserve

Carry these constraints through every finding and recommendation:

- zero dependencies, no bundler, no build step for the web/server app
- exactly two restaurants: Leroy's Lounge and El Roy's Cantina
- exactly two fixed menus per restaurant: Drinks and Food
- do not generalize into arbitrary restaurant or menu CRUD
- web is the primary surface, but shared server contracts must not drift from
  iOS expectations
- preserve Supabase auth, live polling, database-backed menu state, and
  per-menu access control
- managers have per-menu access; admins have global access
- keep auth overlay markup and styling centralized in the shared auth layer
- `Save` persists quietly
- `Send Update` persists, sends notifications, and updates public
  timestamp/history
- landing-page draft save stays separate from publishing selected sections live
- draft indicators reflect unsent changes since last send/publish
- 86'd items stay visible publicly with strike-through or badge treatment
- Food menus hide recipe controls and use food defaults
- recovery session data stays in memory only, never `localStorage`
- legacy `?menu=el-roys` normalizes to El Roy's Cantina Drinks
- deleted categories move items into `__uncategorized__`, hidden publicly
- public footer shows `APP_VERSION`, last-updated time, and preview badge
- public routes should boot route-first and avoid shared loading-shell flashes
- shared fallback rendering should still work if a dedicated public route fails
- public route sign-in stays in footer staff actions, not top-of-page buttons
- schema changes belong in `supabase/migrations/`
- if shared web/iOS capability parity changes, `docs/FEATURES.md` must be
  called out as needing an update

For the dependency-free server, do not recommend dependencies casually. Suggest
dependency-free fixes when reasonable. If a dependency is truly warranted,
explain why and give a no-dependency alternative.

## Required Reading Order

Start with:

1. `AGENTS.md` or `CLAUDE.md`, whichever exists in the repo root.
2. `docs/design/` before design-facing findings.
3. `docs/architecture/` before ownership or boundary conclusions.
4. `docs/FEATURES.md` before web/iOS parity conclusions.
5. Existing test files under `tests/` that match the audited areas.

Then inspect the smallest relevant code areas:

- public routes: `leroyslounge/`, `elroyscantina/`
- entry shells: `index.html`, `manager/index.html`, `admin/index.html`
- shared runtime: `app.js`, `core/`, `routes/shared/`
- API/server: `api/`, `server/`
- Supabase: `supabase/migrations/`
- iOS: `ios/`
- tests: `tests/`
- deployment/release/config/docs/scripts/assets at repo root

## First Pass: Repository Map

Before conclusions, map the repo. Include:

- top-level folders and what each appears to do
- website framework/build system
- iOS project type, language, targets, schemes, bundle IDs if discoverable
- server language/runtime/protocol
- shared modules and cross-cutting code
- config files
- build scripts
- test locations
- deployment/release-related files
- documentation files
- environment/configuration files
- assets and vendored code
- unusual or risky structure

Then explain how the pieces appear to interact:

- website to server
- iOS app to server
- website/iOS shared assumptions
- auth/session/token flow
- data flow and storage flow
- third-party services
- local development flow
- production deployment flow, if discoverable

## Command And Evidence Rules

Run and record the smallest useful command set for the current audit. Include
exact commands, pass/fail status, and important output summaries in the report.
If a command is skipped, explain why. If a command fails because credentials,
devices, config, simulators, env vars, or network are missing, say exactly what
is missing and how to unblock it.

Baseline commands to consider:

```sh
git status --short --branch
rg --files
find . -maxdepth 2 -type d | sort
find . -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f | sort
find tests -maxdepth 2 -type f | sort
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
```

For iOS, if Xcode is available, consider:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Search explicitly for launch-risk terms:

```sh
rg -n "TODO|FIXME|HACK|temporary|temp|mock|stub|demo|sample|placeholder|lorem|test|fake|debug|console\\.log|print\\(|NSLog|fatalError|localhost|127\\.0\\.0\\.1|dev|staging" .
```

Also search for:

- secrets: `secret`, `token`, `password`, `private_key`, `.env`, `service_role`
- web launch files: `robots`, `sitemap`, `404`, `500`, `privacy`, `terms`
- iOS release/privacy: `PrivacyInfo.xcprivacy`, `Info.plist`,
  `PRODUCT_BUNDLE_IDENTIFIER`, `MARKETING_VERSION`,
  `CURRENT_PROJECT_VERSION`, permission strings, entitlements, build configs
- server hardening: CORS, cookies, CSRF, rate limits, request size, timeouts,
  retries, health checks

Do not hide dirty worktree state. Treat unrelated changes as someone else's
work and audit the current state without reverting them.

## Official Platform Requirement Verification

If web access is available, verify current iOS/App Store/privacy/platform
requirements from official sources instead of relying on memory. Use official
sources only for platform-sensitive claims:

- Apple Developer Documentation
- App Store Review Guidelines
- App Store Connect Help
- Apple Human Interface Guidelines
- Vercel documentation
- Supabase documentation
- MDN Web Docs or WHATWG/W3C standards

For each platform-sensitive issue, record:

- source title and URL
- access date
- the requirement in your own words
- repo evidence that appears compliant or non-compliant
- whether the conclusion is confirmed or inferred

Keep direct quotes short and cite links in the final report.

## Investigation Areas

Cover every section below. Report meaningful launch-relevant findings; do not
pad the report with harmless search hits.

### 1. Product Completeness

Look for:

- missing core flows
- dead buttons
- placeholder copy
- TODOs/FIXMEs/HACKs
- stub/mock/demo/sample/fake data paths
- temporary routes or screens
- missing empty/loading/error states
- broken navigation
- confusing onboarding
- incomplete settings/account/logout/delete/account management flows
- missing support/contact/terms/privacy links
- inconsistent naming/branding
- inconsistent behavior between web and iOS
- features present on one client but absent or broken on another
- hardcoded test/demo values
- developer-only UI accidentally exposed

### 2. Website Readiness

Audit:

- production build or no-build startup success
- routing correctness and broken internal links
- external links if practical
- responsive desktop/mobile layout
- accessibility basics, keyboard navigation, focus states
- semantic HTML, ARIA misuse, form labels, validation
- loading/error/empty states
- SEO metadata, page titles, meta descriptions, canonical tags
- Open Graph/Twitter cards
- favicon/app icons
- sitemap, robots, 404, 500/error page
- analytics readiness and cookie/privacy banner needs
- legal footer links
- cache/security headers and HTTPS assumptions
- environment variable/API endpoint handling
- production vs development behavior
- bundle/performance/image/font/Core Web Vitals risks
- client-side secrets
- browser compatibility
- graceful behavior if the server is down

Classify each website issue as P0/P1/P2.

### 3. iOS App Readiness

Audit:

- project structure, targets, schemes, build configurations
- bundle identifier, version/build number handling
- signing/provisioning assumptions
- app icons, launch screen, asset catalog completeness
- supported devices, iOS versions, orientations
- dark mode, Dynamic Type, VoiceOver/accessibility labels
- localization readiness if relevant
- permissions and required usage descriptions
- privacy manifest and App Store privacy declarations
- App Tracking Transparency concerns
- push/background modes/keychain usage/secure token storage
- network security/ATS/API base URL/debug-vs-release config
- simulator vs device behavior
- error/offline/loading/empty states
- crash-prone code, force unwraps, fatal errors
- threading/main actor, async failure, memory/performance risks
- retain cycles
- App Store review risks
- App Store metadata, screenshots, TestFlight readiness
- crash reporting, analytics, dSYM handling
- account deletion, terms/privacy links

Specifically identify anything that could cause App Store rejection,
production crash, broken release networking, privacy compliance failure, data
leakage, inability to ship, or inability to debug production issues.

### 4. Server Readiness

Audit:

- production startup path and runtime requirements
- configuration/env validation, port/host behavior
- request parsing, response formatting, status correctness
- API route completeness
- input validation, error handling
- authentication and authorization
- session/token/password handling
- rate limiting, abuse resistance, brute-force exposure
- request size limits and timeout handling
- CORS, CSRF, cookies, security headers, TLS assumptions
- logging and sensitive data redaction
- observability, health/readiness checks, graceful shutdown
- concurrency/race conditions, idempotency, retry safety
- file/database locking if applicable
- persistence layer, migrations, backups, restore
- data retention/deletion/export
- API compatibility with web and iOS
- deployment/rollback/local development process
- dependency-free design risks
- missing tests and denial-of-service risks

Pay special attention to places where the server trusts the client too much.

### 5. Cross-Platform API Contract

Compare website, iOS, and server expectations for:

- API routes and HTTP methods
- request bodies and response shapes
- error response formats
- auth headers and token/session formats
- date/time formats and IDs
- pagination, sorting/filtering
- upload/download behavior
- CORS and Content-Type assumptions
- base URLs by environment
- versioning and backward compatibility
- retry/offline/failure behavior

Produce an API mismatch table:

| Area | Website expectation | iOS expectation | Server behavior | Risk | Recommended fix |

### 6. Security Audit

Look for:

- hardcoded secrets/API keys/tokens/passwords/private keys
- committed `.env` files
- debug endpoints, admin/dev routes
- overly permissive CORS
- insecure cookies or missing SameSite/Secure/HttpOnly
- weak/missing auth or broken authorization
- IDOR, injection, XSS, CSRF, SSRF, path traversal
- unsafe file handling, redirects, deserialization
- sensitive logs and PII leakage
- insecure web localStorage or iOS storage
- overbroad iOS permissions
- missing rate limits and brute-force protection
- dependency/supply-chain risks
- source maps/build artifact leakage
- exposed internal/staging URLs
- missing security headers

For every issue include severity, exploit scenario, evidence, fix, and whether
it blocks launch.

### 7. Privacy, Legal, Compliance

Audit:

- privacy policy, terms, cookie policy needs
- data collection disclosures
- App Store privacy nutrition label readiness
- iOS privacy manifest readiness
- tracking/analytics disclosures
- account deletion requirements
- user data export/delete flows
- age-rating and children's privacy risks
- sensitive data handling
- retention/deletion policy
- support/contact process
- copyright/trademark/asset licensing
- open-source license obligations
- third-party service disclosures
- consent requirements
- regional risks such as GDPR/CCPA

Do not give legal advice. Identify launch risks and what needs owner/counsel
review.

### 8. QA And Testing

Inventory:

- unit, integration, E2E, UI, snapshot tests
- iOS simulator tests
- server route and contract tests
- smoke, accessibility, performance, security tests
- manual QA scripts
- regression coverage and flaky risks
- CI test execution

Produce:

1. existing test inventory
2. tests that fail
3. critical missing tests
4. pre-launch smoke checklist
5. manual QA checklist for website
6. manual QA checklist for iOS
7. server/API test checklist

### 9. Build, Release, Deployment

Audit:

- website build/deploy/start commands
- iOS archive/TestFlight/App Store process
- server start/deploy process
- env requirements and prod/staging/local config
- CI/CD pipeline
- release scripts, versioning, changelog/release notes
- rollback process
- migrations, backup/restore
- monitoring after deploy and post-deploy smoke
- DNS/domain/SSL/CDN/cache readiness
- source maps/debug symbols/dSYM/crash reporting

Call out inability to reliably deploy/release as P0 when appropriate.

### 10. Observability And Operations

Audit:

- server/client logs
- error/crash reporting
- metrics, uptime checks, alerting
- admin visibility and audit logs
- support diagnostics and bug report flow
- correlation/request IDs
- sensitive data redaction
- incident playbook
- backup/restore verification
- capacity, rate, traffic, and cost assumptions

Produce an operations gap list.

### 11. Performance And Scalability

Website:

- initial load size, render-blocking resources, images, fonts, caching
- slow routes/components and expensive client computation

iOS:

- launch time, network behavior, main-thread work
- image/resource handling, memory/battery risks
- offline/retry behavior

Server:

- request efficiency, blocking operations, bottlenecks
- concurrency, large payloads, rate limiting, DoS, memory leaks
- startup time and graceful shutdown

Only classify as P0 when plausibly harmful at expected launch scale.

### 12. Accessibility And Inclusive Design

Website:

- keyboard navigation, focus indicators, semantic structure
- form labels, contrast, alt text, ARIA
- screen reader support, reduced motion, error messaging

iOS:

- VoiceOver labels, Dynamic Type, contrast, hit targets
- Reduce Motion, accessibility traits, navigation order, error messaging

Identify high-impact issues to fix before launch.

### 13. Documentation Readiness

Audit:

- README accuracy
- local setup for website/iOS/server
- env vars and secrets management
- deployment, App Store/TestFlight, troubleshooting
- API, architecture, data model docs
- ops runbook, incident response, backup/restore
- contributing/development workflow
- known issues

Produce a missing-docs checklist.

### 14. Brand, Content, Launch Surface

Audit:

- app/website names, bundle display name
- copy consistency and placeholders
- missing/broken images
- app icon, favicon, social preview image
- error page copy
- emails/notifications
- support email, legal links
- marketing/App Store description, screenshots, release notes
- onboarding and empty-state copy

Flag anything that feels unfinished.

### 15. Data, Persistence, Migrations

Audit:

- schema/model clarity
- migration strategy and seed/prod initialization
- backups/restores
- deletion/export/retention
- corrupted/partial/concurrent writes
- duplicate/failed requests
- app/server version mismatch
- old clients after server changes

Call out catastrophic data-loss risks.

### 16. Configuration And Environment

Audit:

- required/optional env vars
- defaults and validation
- unsafe defaults
- dev/staging/prod separation
- public vs private config
- iOS release vs debug config
- web client-exposed env vars
- server secrets
- localhost/staging URLs in production
- config docs/loading/failure behavior

Produce a table:

| Config item | Used by | Required? | Current default | Risk | Needed before launch |

### 17. Monorepo Health

Audit:

- repo organization and naming consistency
- build scripts and shared boundaries
- generated/ignored/committed artifacts
- duplicate/dead code, assets, routes, endpoints, screens
- formatting/linting/tooling friction
- contributor onboarding
- accidental complexity

Identify cleanup that materially reduces launch risk.

## Severity Definitions

Use these consistently:

- `P0 launch blocker`: real risk of app rejection, production crash, data loss,
  security/privacy breach, inability to deploy, broken core user flow, or
  inability to operate the product after launch
- `P1 important`: meaningful risk to UX, reliability, maintainability, or trust,
  but not necessarily fatal for a small beta
- `P2 polish/post-launch`: useful improvement, cleanup, optimization, or
  non-critical UX/docs issue

## Required Final Report Format

Use this structure exactly so reports can be compared over time.

### A. Executive Summary

Give a direct verdict:

- Ready to launch
- Almost ready, with specific blockers
- Not ready
- Cannot determine because of missing information

Include a short explanation and the count of P0/P1/P2 findings.

### B. Launch Readiness Scorecard

Score each area from 0-5:

| Area | Score | Reason |
|---|---:|---|
| Website |  |
| iOS app |  |
| Server |  |
| API contract |  |
| Security |  |
| Privacy/legal |  |
| QA/testing |  |
| Release/deployment |  |
| Observability/ops |  |
| Performance |  |
| Accessibility |  |
| Documentation |  |
| Brand/content |  |
| Data/persistence |  |
| Configuration |  |
| Monorepo health |  |

Scale:

- 0 = unknown or absent
- 1 = severe launch risk
- 2 = major gaps
- 3 = usable but needs work
- 4 = minor gaps
- 5 = launch-ready

### C. P0 Launch Blockers

List only issues that should block launch. For each include:

- title
- affected area: website / iOS / server / cross-platform / ops / legal /
  security
- evidence
- user/business risk
- recommended fix
- estimated effort: S / M / L / XL
- validation method

### D. P1 Important Pre-Launch Issues

Use the same format as P0.

### E. P2 Post-Launch Or Polish Issues

Use the same format, but keep concise.

### F. API / Client / Server Mismatch Table

Include:

| Area | Website | iOS | Server | Risk | Fix |

### G. Security And Privacy Risk Register

Include:

| Risk | Severity | Evidence | Exploit/privacy scenario | Fix | Launch blocker? |

### H. Missing Tests

Include:

| Missing test | Area | Why it matters | Suggested test approach | Priority |

### I. Required Launch Checklist

Produce concrete checklists grouped by:

- Website
- iOS app
- Server
- Security
- Privacy/legal
- QA
- Deployment
- Observability
- Documentation
- App Store/TestFlight
- Post-launch operations

### J. Suggested Launch Plan

Provide:

1. What to do today
2. What to do this week
3. What to do before public launch
4. What can wait until after launch

Also recommend one launch type:

- Internal test only
- Private beta
- Public beta
- Full public launch

Explain why.

### K. Commands Run

List all commands run and summarize results. If no commands could be run,
explain why.

### L. Unknowns And Questions

List only important unknowns affecting launch readiness. For each:

- why it matters
- how to resolve it
- whether launch can proceed without resolving it

## Output Quality Bar

The report should be specific enough to become an implementation plan. Cite
file paths and line numbers where practical. Distinguish true launch blockers
from nice-to-haves. Include exact blockers caused by missing credentials,
devices, simulators, env vars, or external services. Keep recommendations
compatible with the project constraints.

