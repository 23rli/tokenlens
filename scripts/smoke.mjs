// Hermetic smoke test: mock the `vscode` API, activate the bundled extension,
// invoke the score command, and confirm the scoring pipeline runs end-to-end.
import Module from 'node:module';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const commands = new Map();
let statusItem;

const makeConfig = (section) => ({
  get: (key, def) => {
    if (section === 'ecoprompt.passiveCapture' && key === 'enabled') return false;
    return def;
  },
  update: async () => {},
});

class EventEmitter {
  constructor() {
    this._handlers = [];
    this.event = (h) => {
      this._handlers.push(h);
      return { dispose: () => {} };
    };
  }
  fire(v) {
    for (const h of this._handlers) h(v);
  }
  dispose() {}
}

const vscodeMock = {
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  EventEmitter,
  Uri: {
    file: (f) => ({ fsPath: f, toString: () => f }),
    joinPath: (base, ...p) => ({ fsPath: path.join(base.fsPath ?? String(base), ...p) }),
  },
  RelativePattern: class {
    constructor(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    }
  },
  window: {
    activeTextEditor: undefined,
    createStatusBarItem: () => {
      statusItem = { text: '', tooltip: '', command: '', show() {}, hide() {}, dispose() {} };
      return statusItem;
    },
    registerWebviewViewProvider: () => ({ dispose() {} }),
    showInputBox: async () =>
      'Could you please, if it is not too much trouble, kindly and thoroughly help me to maybe possibly write some code that does the thing, you know, like the usual stuff, and also please re-read all the context I pasted again and again.',
    showInformationMessage: async () => undefined,
  },
  commands: {
    registerCommand: (id, cb) => {
      commands.set(id, cb);
      return { dispose() {} };
    },
    executeCommand: async (id, ...args) => {
      const cb = commands.get(id);
      return cb ? cb(...args) : undefined;
    },
  },
  workspace: {
    getConfiguration: makeConfig,
    createFileSystemWatcher: () => ({
      onDidCreate() {},
      onDidChange() {},
      onDidDelete() {},
      dispose() {},
    }),
  },
  env: { clipboard: { writeText: async () => {} } },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return origLoad.apply(this, arguments);
};

const ext = require(path.resolve('dist/extension.js'));

const memState = () => {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    update: (k, v) => {
      m.set(k, v);
      return Promise.resolve();
    },
  };
};

const context = {
  subscriptions: [],
  globalState: memState(),
  workspaceState: memState(),
  secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} },
  extensionUri: { fsPath: process.cwd() },
};

ext.activate(context);
console.log('activate() ok — commands:', [...commands.keys()].join(', '));
console.log('initial status:', statusItem.text);

await commands.get('ecoprompt.scorePrompt')();
console.log('after scoring status:', statusItem.text);

Module._load = origLoad;

const score = Number((statusItem.text.match(/(\d+)\s*$/) || [])[1]);
if (!Number.isFinite(score)) {
  console.error('SMOKE FAIL: no numeric score in status bar');
  process.exit(1);
}
console.log(`SMOKE PASS: scored a prompt → ${score}/100`);
