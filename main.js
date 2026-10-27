const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// Where PowerShell 7 is normally installed on macOS: the official .pkg,
// Homebrew (Apple Silicon and Intel) and the dotnet global tool.
const PWSH_CANDIDATES = [
  '/usr/local/bin/pwsh',
  '/opt/homebrew/bin/pwsh',
  '/usr/local/microsoft/powershell/7/pwsh',
  path.join(os.homedir(), '.dotnet', 'tools', 'pwsh'),
];

let currentRun = null;
let win = null;

function findPwsh() {
  const fromPath = (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, 'pwsh'));
  return [...PWSH_CANDIDATES, ...fromPath].find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || null;
}

function pwshVersion(exe) {
  return new Promise((resolve) => {
    const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()']);
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Runs a script file (or a single command) in a fresh pwsh 7 process and
// streams its output to the console pane.
function runPowerShell(args, label, onFinish = () => {}) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onFinish();
  };
  const exe = findPwsh();
  if (!exe) {
    send('console:append', {
      kind: 'error',
      text: 'PowerShell 7 (pwsh) was not found. Install it from https://aka.ms/powershell or run: brew install --cask powershell\n',
    });
    finish();
    return;
  }
  if (currentRun) {
    send('console:append', { kind: 'error', text: 'A script is already running. Stop it first.\n' });
    finish();
    return;
  }

  send('console:append', { kind: 'prompt', text: `PS> ${label}\n` });
  // Use the home folder as the working directory: it always exists, unlike the
  // folder the app was launched from (which may have been moved or deleted).
  const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: os.homedir(),
  });
  currentRun = child;
  send('run:state', { running: true });

  child.stdout.on('data', (d) => send('console:append', { kind: 'output', text: d.toString() }));
  child.stderr.on('data', (d) => send('console:append', { kind: 'error', text: d.toString() }));
  child.on('error', (err) => {
    send('console:append', { kind: 'error', text: `Failed to start pwsh: ${err.message}\n` });
    finish();
  });
  child.on('close', (code, signal) => {
    currentRun = null;
    send('run:state', { running: false });
    const status = signal ? `stopped (${signal})` : `exit code ${code}`;
    send('console:append', { kind: 'info', text: `\n[${status}]\n\n` });
    finish();
  });
}

ipcMain.handle('pwsh:info', async () => {
  const exe = findPwsh();
  return { exe, version: exe ? await pwshVersion(exe) : null };
});

ipcMain.handle('script:run', (_e, { text, selection }) => {
  // Write the buffer (or the selected text) to a temp .ps1 so the script runs
  // exactly as it would from a file, with its own line numbers and errors.
  const body = selection && selection.trim() ? selection : text;
  let file;
  try {
    fs.mkdirSync(os.tmpdir(), { recursive: true });
    file = path.join(os.tmpdir(), `pwsh-ise-${process.pid}-${Date.now()}.ps1`);
    fs.writeFileSync(file, body, 'utf8');
  } catch (err) {
    send('console:append', { kind: 'error', text: `Could not write the temporary script (${file || os.tmpdir()}): ${err.message}\n` });
    return;
  }
  // Remove the temp script once pwsh has finished with it.
  const removeTempScript = () => fs.rm(file, { force: true }, () => {});
  runPowerShell(['-ExecutionPolicy', 'Bypass', '-File', file], selection && selection.trim() ? '(selection)' : '(script)', removeTempScript);
});

ipcMain.handle('command:run', (_e, { command }) => {
  if (!command.trim()) return;
  runPowerShell(['-Command', command], command);
});

// Lists every command PowerShell can see (cmdlets, functions, aliases, scripts).
ipcMain.handle('commands:list', () => {
  const exe = findPwsh();
  if (!exe) return { error: 'PowerShell 7 (pwsh) was not found.', commands: [] };
  const script =
    'Get-Command | Select-Object @{n="name";e={$_.Name}}, @{n="type";e={[string]$_.CommandType}}, @{n="module";e={$_.ModuleName}} | ConvertTo-Json -Compress';
  return new Promise((resolve) => {
    const child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { cwd: os.homedir() });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => resolve({ error: e.message, commands: [] }));
    child.on('close', (code) => {
      if (code !== 0) return resolve({ error: err.trim() || `pwsh exited with code ${code}`, commands: [] });
      try {
        const parsed = JSON.parse(out || '[]');
        resolve({ error: null, commands: Array.isArray(parsed) ? parsed : [parsed] });
      } catch (e) {
        resolve({ error: `Could not read command list: ${e.message}`, commands: [] });
      }
    });
  });
});

ipcMain.handle('run:stop', () => {
  if (currentRun) currentRun.kill('SIGTERM');
});

ipcMain.handle('file:open', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'PowerShell scripts', extensions: ['ps1', 'psm1', 'psd1', 'txt'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const filePath = res.filePaths[0];
  return { filePath, text: fs.readFileSync(filePath, 'utf8') };
});

ipcMain.handle('file:save', async (_e, { filePath, text, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: target || 'Untitled.ps1',
      filters: [{ name: 'PowerShell script', extensions: ['ps1'] }],
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  fs.writeFileSync(target, text, 'utf8');
  return { filePath: target };
});

ipcMain.handle('confirm:discard', async () => {
  const res = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Discard', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'You have unsaved changes. Discard them?',
  });
  return res.response === 0;
});

function buildMenu() {
  const send2 = (action) => () => send('menu:action', action);
  const template = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Script', accelerator: 'Cmd+N', click: send2('new') },
        { label: 'Open...', accelerator: 'Cmd+O', click: send2('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'Cmd+S', click: send2('save') },
        { label: 'Save As...', accelerator: 'Shift+Cmd+S', click: send2('saveAs') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'Debug',
      submenu: [
        { label: 'Run Script', accelerator: 'F5', click: send2('run') },
        { label: 'Run Selection', accelerator: 'F8', click: send2('runSelection') },
        { label: 'Stop Execution', accelerator: 'Shift+F5', click: send2('stop') },
        { type: 'separator' },
        { label: 'Clear Output', click: send2('clear') },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'PowerShell Documentation', click: () => shell.openExternal('https://learn.microsoft.com/powershell/') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 480,
    title: 'Untitled1.ps1 - PowerShell ISE',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#012456',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  if (app.dock) app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (currentRun) currentRun.kill('SIGTERM');
  app.quit();
});
