const { contextBridge, ipcRenderer } = require('electron');

// The renderer only gets this narrow API; it has no direct Node access.
contextBridge.exposeInMainWorld('ise', {
  info: () => ipcRenderer.invoke('pwsh:info'),
  runScript: (text, selection) => ipcRenderer.invoke('script:run', { text, selection }),
  runCommand: (command) => ipcRenderer.invoke('command:run', { command }),
  listCommands: () => ipcRenderer.invoke('commands:list'),
  stop: () => ipcRenderer.invoke('run:stop'),
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (filePath, text, saveAs) => ipcRenderer.invoke('file:save', { filePath, text, saveAs }),
  confirmDiscard: () => ipcRenderer.invoke('confirm:discard'),
  onConsole: (cb) => ipcRenderer.on('console:append', (_e, msg) => cb(msg)),
  onRunState: (cb) => ipcRenderer.on('run:state', (_e, msg) => cb(msg)),
  onMenu: (cb) => ipcRenderer.on('menu:action', (_e, action) => cb(action)),
});
