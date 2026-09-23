const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

async function setup(context) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'docs-viewer-test-'));
  context.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'task-docs');
  await fs.mkdir(root);
  const handlers = new Map();
  const events = new Map();
  const links = [];
  const windows = [];
  let startup;
  let quits = 0;
  const electron = {
    app: {
      isPackaged: false,
      whenReady: () => ({ then: (callback) => { startup = callback; } }),
      on: (event, callback) => events.set(event, callback),
      quit: () => { quits++; },
    },
    BrowserWindow: class {
      constructor(options) { this.options = options; windows.push(this); }
      loadFile(file) { this.file = file; }
      static getAllWindows() { return windows; }
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    shell: { openExternal: (url) => links.push(url) },
  };
  const source = await fs.readFile(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  vm.runInNewContext(source, {
    require: (name) => name === 'electron' ? electron : require(name),
    __dirname: path.join(temporary, 'viewer'),
    process: { platform: 'win32' },
  }, { filename: path.join(__dirname, '..', 'main.cjs') });
  const write = async (relative, content) => {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };
  return { root, handlers, electron, links, windows, events, write,
    start: () => startup(), quits: () => quits };
}

test('lists documents through IPC without treating the event or renderer input as a path', async (context) => {
  const app = await setup(context);
  await app.write('README.md', '# Project\nDocumentation');
  await app.write('guides/setup.md', '# Setup\nSteps');
  await app.write('notes.md', 'No heading');
  for (const ignored of ['.private/secret.md', 'node_modules/module.md', 'dist/bundle.md', 'image.png']) {
    await app.write(ignored, 'ignored');
  }
  const documents = await app.handlers.get('documents:list')({ sender: {} }, '../untrusted');
  assert.equal(documents.length, 3);
  assert.deepEqual(Array.from(documents, (document) => document.file),
    ['guides/setup.md', 'notes.md', 'README.md'].map((file) => file.replaceAll('/', path.sep)).sort((left, right) => left.localeCompare(right)));
  assert.equal(documents.find((document) => document.title === 'Setup').group, 'guides');
  assert.equal(documents.find((document) => document.file === 'README.md').content, '# Project\nDocumentation');
  assert.equal(documents.find((document) => document.file === 'notes.md').title, 'notes');
});

test('canceling folder selection keeps the current document root', async (context) => {
  const app = await setup(context);
  await app.write('README.md', '# Original');
  assert.equal(await app.handlers.get('documents:choose-folder')(), null);
  const documents = await app.handlers.get('documents:list')({ sender: {} });
  assert.equal(documents[0].title, 'Original');
});

test('folder selection updates subsequent IPC listings', async (context) => {
  const app = await setup(context);
  await app.write('selected/README.md', '# Selected');
  app.electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(app.root, 'selected')] });
  const selected = await app.handlers.get('documents:choose-folder')();
  assert.equal(selected[0].title, 'Selected');
  const listed = await app.handlers.get('documents:list')({ sender: {} });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, 'Selected');
});

test('opens only HTTP and HTTPS external links', async (context) => {
  const app = await setup(context);
  const open = app.handlers.get('links:open');
  for (const url of ['file:///private', 'javascript:alert(1)', 'data:text/html,test', null, 42, {}]) open({}, url);
  assert.deepEqual(app.links, []);
  open({}, 'https://example.com/docs');
  open({}, 'http://localhost:3000');
  assert.deepEqual(app.links, ['https://example.com/docs', 'http://localhost:3000']);
});

test('creates an isolated window and handles the desktop lifecycle', async (context) => {
  const app = await setup(context);
  app.start();
  assert.equal(app.windows.length, 1);
  assert.equal(app.windows[0].options.webPreferences.contextIsolation, true);
  assert.equal(app.windows[0].options.webPreferences.nodeIntegration, false);
  assert.ok(app.windows[0].file.endsWith(path.join('renderer', 'index.html')));
  app.events.get('activate')();
  assert.equal(app.windows.length, 1);
  app.windows.length = 0;
  app.events.get('activate')();
  assert.equal(app.windows.length, 1);
  app.events.get('window-all-closed')();
  assert.equal(app.quits(), 1);
});