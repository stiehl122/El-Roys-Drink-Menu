const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const IOS_APP = path.join(ROOT, 'ios', 'ElRoysManagerApp');
const LIQUID_GLASS_SYMBOLS = [
  /\bGlassEffectContainer\b/,
  /\.glassEffect\b/,
  /\.glassProminent\b/,
];

function listSwiftFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSwiftFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.swift') ? [fullPath] : [];
  });
}

function isInsideCompilerGuard(lines, index) {
  let depth = 0;
  for (let lineIndex = index; lineIndex >= 0; lineIndex -= 1) {
    const trimmed = lines[lineIndex].trim();
    if (trimmed.startsWith('#endif')) {
      depth += 1;
      continue;
    }
    if (trimmed.startsWith('#if')) {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      return /#if\s+compiler\(>=\s*6\.2\)/.test(trimmed);
    }
  }
  return false;
}

test('iOS Liquid Glass symbols are compiler-gated for Xcode 16 CI', () => {
  const violations = [];
  for (const file of listSwiftFiles(IOS_APP)) {
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!LIQUID_GLASS_SYMBOLS.some(symbol => symbol.test(line))) return;
      if (isInsideCompilerGuard(lines, index)) return;
      violations.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
    });
  }

  assert.deepEqual(violations, []);
});
