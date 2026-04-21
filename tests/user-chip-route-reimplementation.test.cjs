const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  createDocument,
  createElement,
  loadSandboxWithScripts,
  getState,
} = require('./helpers/runtime.cjs');

const ROOT = path.join(__dirname, '..');
const USER_CHIP_ROOT_SELECTOR = '[data-user-chip], .user-chip, [data-route-user-chip]';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('user chip runtime hydrates route-owned chips by data contract instead of hard-coded ids', () => {
  const source = read('app.js');

  assert.match(source, /querySelectorAll\('\[data-user-chip\], \.user-chip, \[data-route-user-chip\]'\)/);
  assert.match(source, /querySelector\('\[data-user-chip-name\]'\)/);
  assert.match(source, /querySelector\('\[data-user-chip-role\]'\)/);
  assert.match(source, /querySelector\('\[data-user-chip-initials\]'\)/);
  assert.doesNotMatch(source, /window\.event/);

  assert.doesNotMatch(source, /ll-user-dropdown-name/);
  assert.doesNotMatch(source, /erc-user-dropdown-name/);
  assert.doesNotMatch(source, /document\.getElementById\('user-initials'\)/);
});

function createUserChipFixture({ id, includeDataContract = false, includeLegacyClass = false }) {
  const root = createElement('div', id);
  const trigger = createElement('button', `${id}-trigger`);
  const panel = createElement('div', `${id}-panel`);
  const panelAction = createElement('button', `${id}-action`);
  const initials = createElement('span', `${id}-initials`);
  const name = createElement('span', `${id}-name`);
  const role = createElement('span', `${id}-role`);
  const children = new Set([root, trigger, panel, panelAction, initials, name, role]);
  const selectorMap = new Map();

  if (includeDataContract) {
    root.setAttribute('data-user-chip', 'true');
    selectorMap.set('[data-user-chip-trigger]', trigger);
    selectorMap.set('[data-user-chip-panel]', panel);
    selectorMap.set('[data-user-chip-initials]', initials);
    selectorMap.set('[data-user-chip-name]', name);
    selectorMap.set('[data-user-chip-role]', role);
    selectorMap.set('[data-user-chip-panel] button, [data-user-chip-panel] a', panelAction);
  }

  if (includeLegacyClass) {
    root.classList.add('user-chip');
    selectorMap.set('.user-dropdown, .ll-site-userdropdown, .erc-userdropdown', panel);
    selectorMap.set('[id$="user-initials"]', initials);
    selectorMap.set('[id$="user-dropdown-name"]', name);
    selectorMap.set('[id$="user-dropdown-role"]', role);
  }

  const closest = selector => (selector === USER_CHIP_ROOT_SELECTOR ? root : null);
  root.closest = closest;
  [trigger, panel, panelAction, initials, name, role].forEach(node => {
    node.closest = closest;
  });

  root.querySelector = selector => selectorMap.get(selector) || null;
  panel.querySelector = selector => (selector === 'button, a' ? panelAction : null);
  root.contains = target => children.has(target);

  panelAction.focus = () => {
    panelAction.focusCount = (panelAction.focusCount || 0) + 1;
  };
  trigger.focus = () => {
    trigger.focusCount = (trigger.focusCount || 0) + 1;
  };

  return { root, trigger, panel, panelAction, initials, name, role };
}

test('user chip runtime supports mixed rollout roots, hydration, open/close, and no-arg legacy fallback', () => {
  const document = createDocument();
  const dataChip = createUserChipFixture({ id: 'data-chip', includeDataContract: true });
  const legacyChip = createUserChipFixture({ id: 'user-chip', includeLegacyClass: true });

  document._registerElement('data-chip', dataChip.root);
  document._registerElement('user-chip', legacyChip.root);
  document._registerSelector(USER_CHIP_ROOT_SELECTOR, [dataChip.root, dataChip.root, legacyChip.root]);
  document._registerSelector('[data-route-dropdown]', []);

  const sandbox = loadSandboxWithScripts(['app.js'], { document });
  sandbox.__dataChip = dataChip.root;
  sandbox.__legacyChip = legacyChip.root;
  sandbox.window.event = undefined;

  const discoveredIds = getState(sandbox, 'getUserChipRoots().map(chip => chip.id)');
  assert.equal(Array.from(discoveredIds).join(','), 'data-chip,user-chip');

  getState(sandbox, 'hydrateUserChip(globalThis.__dataChip, { initials: "AB", fullName: "Alice Bob", roleLabel: "Manager" })');
  assert.equal(dataChip.initials.textContent, 'AB');
  assert.equal(dataChip.name.textContent, 'Alice Bob');
  assert.equal(dataChip.role.textContent, 'Manager');
  assert.equal(dataChip.trigger.getAttribute('aria-expanded'), 'false');

  getState(sandbox, 'toggleUserDropdown("data-chip")');
  assert.equal(dataChip.root.classList.contains('open'), true);
  assert.equal(dataChip.trigger.getAttribute('aria-expanded'), 'true');
  assert.ok((dataChip.panelAction.focusCount || 0) >= 1);

  getState(sandbox, 'toggleUserDropdown("user-chip")');
  assert.equal(dataChip.root.classList.contains('open'), false);
  assert.equal(legacyChip.root.classList.contains('open'), true);

  getState(sandbox, 'closeUserChips()');
  document.activeElement = legacyChip.root;
  assert.equal(getState(sandbox, 'getUserChipRoot()?.id || ""'), 'user-chip');

  getState(sandbox, 'toggleUserDropdown()');
  assert.equal(legacyChip.root.classList.contains('open'), true);
  getState(sandbox, 'toggleUserDropdown()');
  assert.equal(legacyChip.root.classList.contains('open'), false);

  const neutralActive = createElement('div', 'neutral-active');
  neutralActive.closest = () => null;
  document.activeElement = neutralActive;
  assert.equal(getState(sandbox, 'getUserChipRoot()?.id || ""'), 'user-chip');
  getState(sandbox, 'toggleUserDropdown()');
  assert.equal(legacyChip.root.classList.contains('open'), true);
  getState(sandbox, 'toggleUserDropdown()');
  assert.equal(legacyChip.root.classList.contains('open'), false);
});

test('manager route owns a rail user chip inside the drawer action stack', () => {
  const html = read('manager/index.html');
  const css = read('style.css');

  assert.match(html, /class="manager-userchip manager-dossier-userchip"/);
  assert.match(html, /data-user-chip-variant="rail"/);
  assert.match(html, /data-user-chip-trigger/);
  assert.match(html, /data-user-chip-panel/);
  assert.doesNotMatch(html, /id="user-chip"/);

  assert.match(css, /body\.manager-dossier-shell \.manager-userchip/);
  assert.match(css, /body\.manager-stitch-shell \.manager-userchip/);
});
