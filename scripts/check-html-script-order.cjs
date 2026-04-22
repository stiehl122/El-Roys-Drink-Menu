#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const SHARED_RUNTIME_SCRIPTS = [
  '/core/domain/constants.js',
  '/core/domain/category-defaults.js',
  '/core/auth/auth-api.js',
  '/core/auth/auth-session-service.js',
  '/core/auth/auth-overlay-template.js',
  '/core/auth/auth-overlay-controller.js',
  '/core/ui/manager/workspace.js',
  '/core/ui/manager/sections.js',
  '/core/ui/manager/editors.js',
  '/core/ui/admin/workspace.js',
  '/core/ui/admin/switcher.js',
  '/core/ui/public/footer-actions.js',
  '/core/ui/public/renderer-default.js',
  '/core/session/publish-service.js',
  '/core/session/menu-session.js',
  '/core/data/menu-state-loader.js',
  '/core/session/poll-scheduler.js',
  '/core/landing/model.js',
  '/core/landing/store.js',
  '/core/landing/data-service.js',
  '/core/landing/admin-workspace.js',
  '/core/landing/root-renderer.js',
];

const EXPECTED_SCRIPT_ORDER = {
  'index.html': [...SHARED_RUNTIME_SCRIPTS, '/app.js'],
  'manager/index.html': [...SHARED_RUNTIME_SCRIPTS, '/app.js'],
  'admin/index.html': [...SHARED_RUNTIME_SCRIPTS, '/app.js'],
  'leroyslounge/index.html': [...SHARED_RUNTIME_SCRIPTS, '/routes/shared/public-route-core.js', '/leroyslounge/app.js', '/app.js'],
  'elroyscantina/index.html': [...SHARED_RUNTIME_SCRIPTS, '/routes/shared/public-route-core.js', '/elroyscantina/app.js', '/app.js'],
};

function readScriptSources(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const matches = html.matchAll(/<script\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>\s*<\/script>/gi);
  const sources = [];
  for (const match of matches) {
    sources.push(match[2]);
  }
  return sources;
}

function findOutOfOrderScript(actual, expected) {
  let cursor = 0;
  for (const source of expected) {
    const index = actual.indexOf(source, cursor);
    if (index === -1) return source;
    cursor = index + 1;
  }
  return '';
}

function run() {
  const rootDir = process.cwd();
  const failures = [];

  Object.entries(EXPECTED_SCRIPT_ORDER).forEach(([relativePath, expectedSources]) => {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push({
        relativePath,
        reason: 'missing-file',
        expectedSources,
        actualSources: [],
      });
      return;
    }

    const actualSources = readScriptSources(absolutePath);
    const missingOrOutOfOrder = findOutOfOrderScript(actualSources, expectedSources);
    if (missingOrOutOfOrder) {
      failures.push({
        relativePath,
        reason: 'unexpected-order',
        expectedSources,
        actualSources,
        missingOrOutOfOrder,
      });
    }
  });

  if (!failures.length) {
    console.log('HTML script order check passed.');
    return;
  }

  console.error('HTML script order check failed:\n');
  failures.forEach(failure => {
    if (failure.reason === 'missing-file') {
      console.error(`- ${failure.relativePath}: missing file`);
    } else {
      console.error(`- ${failure.relativePath}`);
      console.error(`  expected: ${failure.expectedSources.join(' -> ')}`);
      console.error(`  actual:   ${failure.actualSources.join(' -> ') || '(none)'}`);
      console.error(`  first missing/out-of-order script: ${failure.missingOrOutOfOrder}`);
    }
  });

  process.exit(1);
}

run();
