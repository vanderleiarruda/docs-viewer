const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const defaultDocumentRoot = () => app.isPackaged
  ? path.join(process.resourcesPath, 'docs')
  : path.resolve(__dirname, '..', 'task-docs');

let selectedDocumentRoot = defaultDocumentRoot();

async function findMarkdownFiles(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await findMarkdownFiles(root, file));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(file);
  }
  return files;
}

async function readDocuments(root = selectedDocumentRoot) {
  selectedDocumentRoot = path.resolve(root);
  const files = await findMarkdownFiles(selectedDocumentRoot);
  const result = await Promise.all(files.map(async (file) => {
    const content = await fs.readFile(file, 'utf8');
    const relative = path.relative(selectedDocumentRoot, file);
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, '.md');
    const parent = path.dirname(relative) === '.' ? 'Raiz' : path.basename(path.dirname(relative));
    return { id: relative, title, file: relative, group: parent, content };
  }));
  return result.sort((left, right) => left.file.localeCompare(right.file));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#f4f7f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('documents:list', readDocuments);
ipcMain.handle('documents:choose-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecionar pasta da documentação',
    defaultPath: selectedDocumentRoot,
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readDocuments(result.filePaths[0]);
});
ipcMain.handle('links:open', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});