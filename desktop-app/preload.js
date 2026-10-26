const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tracker', {
  getState: () => ipcRenderer.invoke('tracker:get-state'),
  login: (credentials) => ipcRenderer.invoke('tracker:login', credentials),
  start: () => ipcRenderer.invoke('tracker:start'),
  stop: () => ipcRenderer.invoke('tracker:stop'),
  logout: () => ipcRenderer.invoke('tracker:logout'),
  onStateChange(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('tracker:state', listener);
    return () => ipcRenderer.removeListener('tracker:state', listener);
  },
});
