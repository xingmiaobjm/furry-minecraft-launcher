const { contextBridge, ipcRenderer } = require('electron');

// 暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  fs: {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
  },
  
  // 路径相关
  path: {
    getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  },
  
  // 配置管理
  config: {
    get: (key, defaultValue) => ipcRenderer.invoke('config:get', key, defaultValue),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    save: () => ipcRenderer.invoke('config:save'),
    reset: () => ipcRenderer.invoke('config:reset'),
  },
  
  // 账户管理
  account: {
    loginMojang: (username, password) => ipcRenderer.invoke('account:login-mojang', username, password),
    createOffline: (username) => ipcRenderer.invoke('account:create-offline', username),
    getAll: () => ipcRenderer.invoke('account:get-all'),
    getCurrent: () => ipcRenderer.invoke('account:get-current'),
    switchAccount: (uuid) => ipcRenderer.invoke('account:switch', uuid),
    logout: () => ipcRenderer.invoke('account:logout'),
    delete: (uuid) => ipcRenderer.invoke('account:delete', uuid),
  },
  
  // 版本管理
  version: {
    getAll: () => ipcRenderer.invoke('version:get-all'),
    getInfo: (versionId) => ipcRenderer.invoke('version:get-info', versionId),
    delete: (versionId) => ipcRenderer.invoke('version:delete', versionId),
  },
  
  // 下载管理
  download: {
    setSource: (source) => ipcRenderer.invoke('download:set-source', source),
    getVersionManifest: () => ipcRenderer.invoke('download:get-version-manifest'),
    downloadVersion: (versionId, destination) => ipcRenderer.invoke('download:version', versionId, destination),
    cancelAll: () => ipcRenderer.invoke('download:cancel-all'),
  },
  
  // 游戏管理
  game: {
    launch: (options) => ipcRenderer.invoke('game:launch', options),
    stop: () => ipcRenderer.invoke('game:stop'),
    isRunning: () => ipcRenderer.invoke('game:is-running'),
    verifyFiles: (versionId) => ipcRenderer.invoke('game:verify-files', versionId),
  },
  
  // 系统信息
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
  },
  
  // 对话框
  dialog: {
    show: (options) => ipcRenderer.invoke('dialog:show', options),
  },
  
  // 事件监听
  on: (channel, callback) => {
    const validChannels = [
      'download-progress-',
      'game-status-',
      'update-available',
      'p2p-room-',
      'p2p-player-',
      'p2p-message-received'
    ];
    
    // 检查通道是否有效（支持通配符前缀）
    const isValid = validChannels.some(prefix => channel.startsWith(prefix));
    if (isValid) {
      const wrappedCallback = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, wrappedCallback);
      
      // 返回清理函数
      return () => ipcRenderer.removeListener(channel, wrappedCallback);
    }
    
    console.error(`无效的事件通道: ${channel}`);
    return () => {};
  },
  
  // 一次性事件监听
  once: (channel, callback) => {
    const validChannels = [
      'download-progress-',
      'game-status-',
      'update-available',
      'p2p-room-',
      'p2p-player-',
      'p2p-message-received'
    ];
    
    // 检查通道是否有效（支持通配符前缀）
    const isValid = validChannels.some(prefix => channel.startsWith(prefix));
    if (isValid) {
      ipcRenderer.once(channel, (event, ...args) => callback(...args));
    } else {
      console.error(`无效的事件通道: ${channel}`);
    }
  },
  
  // 发送事件
  send: (channel, ...args) => {
    const validChannels = [
      'ui-event',
      'user-action',
      'debug-log',
      'p2p-create-room',
      'p2p-join-room',
      'p2p-leave-room',
      'p2p-send-message',
      'window-min',
      'window-max',
      'window-close'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.error(`无效的发送通道: ${channel}`);
    }
  }
});

// 暴露平台信息
contextBridge.exposeInMainWorld('process', {
  platform: process.platform,
  arch: process.arch
});

// 暴露环境变量（仅安全的变量）
contextBridge.exposeInMainWorld('env', {
  NODE_ENV: process.env.NODE_ENV,
  APP_VERSION: process.env.APP_VERSION
});

// 添加错误处理
window.addEventListener('error', (error) => {
  console.error('渲染进程错误:', error);
  // 可以发送到主进程记录
  ipcRenderer.send('ui-error', {
    message: error.message,
    filename: error.filename,
    lineno: error.lineno,
    colno: error.colno
  });
});

// 确保在页面卸载时清理所有监听器
window.addEventListener('beforeunload', () => {
  // 清理逻辑将由各个on方法返回的清理函数处理
});