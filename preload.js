const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pv', {
  exists: () => ipcRenderer.invoke('vault:exists'),
  create: (m) => ipcRenderer.invoke('vault:create', m),
  unlock: (m) => ipcRenderer.invoke('vault:unlock', m),
  lock: () => ipcRenderer.invoke('vault:lock'),
  list: () => ipcRenderer.invoke('vault:list'),
  get: (id) => ipcRenderer.invoke('vault:get', id),
  add: (e) => ipcRenderer.invoke('vault:add', e),
  del: (id) => ipcRenderer.invoke('vault:delete', id),
  gen: (o) => ipcRenderer.invoke('vault:generate', o),
  token: () => ipcRenderer.invoke('vault:token')
});
EOF