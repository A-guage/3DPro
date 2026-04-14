const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件选择
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // 窗口控制（无边框窗口用）
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),

  // 服务状态
  getServicesStatus: () => ipcRenderer.invoke('get-services-status'),

  // 平台信息
  platform: process.platform,
  version: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  apiUrl: 'http://127.0.0.1:8000',
});
