import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './helpers.js';

export function createSophyHarness(customFixture = null) {
  const html = fs.readFileSync('app/src/main/assets/www/index.html', 'utf8');
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let fullCode = '';
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    fullCode += match[1] + '\n';
  }

  function createEl(tag) {
    return {
      tagName: (tag || 'div').toUpperCase(),
      id: '',
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      classList: {
        toggle: () => {},
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      style: {},
      dataset: {},
      onclick: null,
      onchange: null,
      focus: () => {},
      blur: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      removeAttribute: () => {},
      appendChild: () => {},
      replaceChildren: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      closest: () => null,
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  }

  const elements = new Map();
  function getEl(id) {
    if (!elements.has(id)) {
      const el = createEl();
      el.id = id;
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    window: {},
    document: {
      getElementById: getEl,
      querySelectorAll: () => [],
      querySelector: (sel) => getEl(sel.replace(/^[#.]/, '')),
      createElement: createEl,
      addEventListener: () => {},
      removeEventListener: () => {},
      body: createEl('body'),
      documentElement: createEl('html')
    },
    navigator: { onLine: true },
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] || null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; }
    },
    indexedDB: null,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    fixture
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(fullCode, context, { filename: 'index.html' });
  
  const seedState = customFixture || fixture();
  sandbox.initFixture = seedState;
  vm.runInContext('state = clone(initFixture); lastSavedState = clone(initFixture); normalize();', context);

  return {
    context,
    sandbox,
    window: sandbox,
    get state() { return vm.runInContext('state', context); },
    eval: (expr) => vm.runInContext(expr, context),
    getState: () => vm.runInContext('state', context),
    setState: (st) => {
      sandbox.tempState = st;
      vm.runInContext('state = clone(tempState); lastSavedState = clone(tempState); normalize();', context);
    },
    sendMessage: async (text) => {
      sandbox.tempText = text;
      await vm.runInContext('sophySendMessage(tempText)', context);
      return vm.runInContext('state.sophy.messages[state.sophy.messages.length - 1]', context);
    },
    processOffline: (text) => {
      sandbox.tempText = text;
      return vm.runInContext('sophyOfflineCore.process(tempText)', context);
    },
    classify: (text) => {
      sandbox.tempText = text;
      return vm.runInContext('sophyRouter.classify(tempText)', context);
    },
    getMemories: () => vm.runInContext('state.sophy.memories || []', context),
    getContext: () => vm.runInContext('state.sophy.context || {}', context)
  };
}

if (process.argv[1] && process.argv[1].endsWith('sophy-semantic-harness.mjs')) {
  const harness = createSophyHarness();
  console.log('Sophy Semantic Harness loaded and verified successfully.');
}
