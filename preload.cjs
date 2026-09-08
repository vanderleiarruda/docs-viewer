const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('documentation', {
  load: () => ipcRenderer.invoke('documents:list'),
  chooseFolder: () => ipcRenderer.invoke('documents:choose-folder'),
  openExternal: (url) => ipcRenderer.invoke('links:open', url),
});