const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT_DIR = path.join(__dirname, '..', '..');
const ROOT_APP_PATH = path.join(ROOT_DIR, 'app.js');
const DEFAULT_RUNTIME_SCRIPTS = [
  'core/domain/constants.js',
  'core/domain/category-defaults.js',
  'core/domain/featured-specials.js',
  'core/auth/auth-api.js',
  'core/auth/auth-session-service.js',
  'core/auth/auth-overlay-template.js',
  'core/auth/auth-overlay-controller.js',
  'core/ui/manager/workspace.js',
  'core/ui/manager/sections.js',
  'core/ui/manager/editors.js',
  'core/ui/manager/open-food-facts.js',
  'core/ui/manager/untappd.js',
  'core/ui/manager/barcode-scanner.js',
  'core/ui/admin/workspace.js',
  'core/ui/admin/switcher.js',
  'core/ui/public/footer-actions.js',
  'core/ui/public/renderer-default.js',
  'core/session/menu-publish-workflow.js',
  'core/session/menu-publish-facade.js',
  'core/session/publish-service.js',
  'core/session/menu-session.js',
  'core/data/menu-state-loader.js',
  'core/session/poll-scheduler.js',
  'routes/shared/public-route-core.js',
  'app.js',
];

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    get length() {
      return store.size;
    },
  };
}

function createClassList() {
  const classes = new Set();
  return {
    add(...tokens) {
      tokens.filter(Boolean).forEach(token => classes.add(token));
    },
    remove(...tokens) {
      tokens.filter(Boolean).forEach(token => classes.delete(token));
    },
    toggle(token, force) {
      if (force === true) {
        classes.add(token);
        return true;
      }
      if (force === false) {
        classes.delete(token);
        return false;
      }
      if (classes.has(token)) {
        classes.delete(token);
        return false;
      }
      classes.add(token);
      return true;
    },
    contains(token) {
      return classes.has(token);
    },
    toString() {
      return Array.from(classes).join(' ');
    },
  };
}

function createElement(tagName = 'div', id = '') {
  const attributes = new Map();
  const element = {
    id,
    tagName: String(tagName || 'div').toUpperCase(),
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    className: '',
    style: {},
    dataset: {},
    children: [],
    classList: createClassList(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    removeChild(child) {
      this.children = this.children.filter(entry => entry !== child);
      return child;
    },
    contains() {
      return false;
    },
    closest() {
      return null;
    },
    focus() {},
    scrollIntoView() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    setAttribute(name, value) {
      const stringValue = String(value);
      attributes.set(name, stringValue);
      if (name === 'id') this.id = stringValue;
      if (name === 'class') this.className = stringValue;
      if (name.startsWith('data-')) {
        const key = name
          .slice(5)
          .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        this.dataset[key] = stringValue;
      }
    },
    getAttribute(name) {
      if (name === 'class') return this.className || '';
      return attributes.has(name) ? attributes.get(name) : null;
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === 'class') this.className = '';
      if (name.startsWith('data-')) {
        const key = name
          .slice(5)
          .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        delete this.dataset[key];
      }
    },
    cloneNode() {
      const clone = createElement(tagName, id);
      clone.innerHTML = this.innerHTML;
      clone.textContent = this.textContent;
      clone.value = this.value;
      clone.hidden = this.hidden;
      clone.className = this.className;
      return clone;
    },
  };

  return element;
}

function createDocument() {
  const byId = new Map();
  const bySelector = new Map();

  const document = {
    body: createElement('body', 'body'),
    documentElement: createElement('html', 'html'),
    addEventListener() {},
    removeEventListener() {},
    createElement(tagName) {
      return createElement(tagName);
    },
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, createElement('div', id));
      return byId.get(id);
    },
    querySelector(selector) {
      const entry = bySelector.get(selector);
      if (Array.isArray(entry)) return entry[0] || null;
      return entry || null;
    },
    querySelectorAll(selector) {
      const entry = bySelector.get(selector);
      if (!entry) return [];
      return Array.isArray(entry) ? entry : [entry];
    },
    _registerElement(id, element = createElement('div', id)) {
      element.id = id;
      byId.set(id, element);
      return element;
    },
    _registerSelector(selector, entry) {
      bySelector.set(selector, entry);
      return entry;
    },
    _elementsById: byId,
    _elementsBySelector: bySelector,
  };

  return document;
}

function createFetchResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function createSandbox(overrides = {}) {
  const document = overrides.document || createDocument();
  const location = overrides.location || {
    origin: 'https://example.com',
    protocol: 'https:',
    hostname: 'example.com',
    pathname: '/',
    search: '',
    hash: '',
    assign() {},
  };
  const window = {};

  const sandbox = {
    console,
    Buffer,
    Date,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    Set,
    String,
    URL,
    URLSearchParams,
    clearTimeout,
    document,
    fetch: async () => createFetchResponse(200, {}),
    history: {
      replaceState() {},
    },
    localStorage: createStorage(),
    navigator: {},
    process: { env: {} },
    requestAnimationFrame: cb => cb(),
    self: window,
    setTimeout,
    setInterval: () => 0,
    clearInterval,
    sessionStorage: createStorage(),
    window,
    location,
  };

  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.document.defaultView = sandbox;
  sandbox.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.window.matchMedia = sandbox.matchMedia;
  sandbox.window.location = location;
  sandbox.window.history = sandbox.history;
  sandbox.window.document = document;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.sessionStorage = sandbox.sessionStorage;
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
  sandbox.window.setTimeout = setTimeout;
  sandbox.window.setInterval = sandbox.setInterval;
  sandbox.window.clearTimeout = clearTimeout;
  sandbox.window.clearInterval = clearInterval;
  sandbox.window.console = console;
  sandbox.window.navigator = sandbox.navigator;
  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.URL = URL;
  sandbox.window.URLSearchParams = URLSearchParams;
  sandbox.window.Buffer = Buffer;
  sandbox.window.process = sandbox.process;
  sandbox.window.globalThis = sandbox;
  sandbox.window.self = sandbox.window;
  sandbox.window.addEventListener = sandbox.addEventListener;
  sandbox.window.removeEventListener = sandbox.removeEventListener;

  Object.assign(sandbox, overrides);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.document.defaultView = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.window.history = sandbox.history;
  sandbox.window.document = sandbox.document;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.sessionStorage = sandbox.sessionStorage;
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
  sandbox.window.setTimeout = sandbox.setTimeout;
  sandbox.window.setInterval = sandbox.setInterval;
  sandbox.window.clearTimeout = sandbox.clearTimeout;
  sandbox.window.clearInterval = sandbox.clearInterval;
  sandbox.window.console = sandbox.console;
  sandbox.window.navigator = sandbox.navigator;
  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.URL = sandbox.URL;
  sandbox.window.URLSearchParams = sandbox.URLSearchParams;
  sandbox.window.Buffer = sandbox.Buffer;
  sandbox.window.process = sandbox.process;
  sandbox.window.globalThis = sandbox;
  sandbox.window.self = sandbox;
  sandbox.window.addEventListener = sandbox.addEventListener;
  sandbox.window.removeEventListener = sandbox.removeEventListener;

  sandbox.__vmContext = vm.createContext(sandbox);
  return sandbox;
}

function loadScript(filePath, sandbox, options = {}) {
  let source = fs.readFileSync(filePath, 'utf8');
  if (options.stripInit) {
    source = source.replace(/\ninit\(\);\s*$/, '\n');
  }
  vm.runInContext(source, sandbox.__vmContext, { filename: path.basename(filePath) });
  return sandbox;
}

function resolveRuntimeScriptPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Script path must be a non-empty string.');
  }
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
}

function loadScriptsInOrder(scriptPaths = [], sandbox, options = {}) {
  const { stripInitRootApp = true } = options;
  if (!sandbox?.__vmContext) {
    throw new Error('Sandbox must be created before loading scripts.');
  }
  if (!Array.isArray(scriptPaths)) {
    throw new Error('scriptPaths must be an array.');
  }

  scriptPaths.forEach(scriptPath => {
    const resolvedPath = resolveRuntimeScriptPath(scriptPath);
    const shouldStripInit = stripInitRootApp &&
      path.resolve(resolvedPath) === path.resolve(ROOT_APP_PATH);
    loadScript(resolvedPath, sandbox, { stripInit: shouldStripInit });
  });

  return sandbox;
}

function getState(sandbox, expression) {
  return vm.runInContext(expression, sandbox.__vmContext);
}

function setState(sandbox, updates = {}) {
  Object.entries(updates).forEach(([name, value]) => {
    sandbox.__testStateValue = value;
    vm.runInContext(`${name} = globalThis.__testStateValue;`, sandbox.__vmContext);
    delete sandbox.__testStateValue;
  });
  return sandbox;
}

function loadAppSandbox(overrides = {}) {
  const sandbox = createSandbox(overrides);
  return loadScriptsInOrder(DEFAULT_RUNTIME_SCRIPTS, sandbox);
}

function loadRouteSandbox(routePath, overrides = {}) {
  const sandbox = createSandbox(overrides);
  return loadScriptsInOrder([...DEFAULT_RUNTIME_SCRIPTS, routePath], sandbox);
}

function loadSandboxWithScripts(scriptPaths = [], overrides = {}, options = {}) {
  const sandbox = createSandbox(overrides);
  return loadScriptsInOrder(scriptPaths, sandbox, options);
}

module.exports = {
  createClassList,
  createDocument,
  createElement,
  createFetchResponse,
  createSandbox,
  createStorage,
  getState,
  loadAppSandbox,
  loadRouteSandbox,
  loadSandboxWithScripts,
  loadScript,
  loadScriptsInOrder,
  resolveRuntimeScriptPath,
  setState,
};
