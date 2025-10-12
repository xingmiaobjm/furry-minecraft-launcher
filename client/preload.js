const { contextBridge, ipcRenderer } = require('electron');

// 安全的IPC通信桥接
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.send('window-min'),
    maximize: () => ipcRenderer.send('window-max'),
    close: () => ipcRenderer.send('window-close')
  },
  
  // 配置管理
  config: {
    get: (key, defaultValue) => ipcRenderer.invoke('config:get', key, defaultValue),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    save: () => ipcRenderer.invoke('config:save'),
    reset: () => ipcRenderer.invoke('config:reset')
  },
  
  // 账户管理
  account: {
    loginMojang: (username, password) => ipcRenderer.invoke('account:login-mojang', username, password),
    createOffline: (username) => ipcRenderer.invoke('account:create-offline', username),
    getAll: () => ipcRenderer.invoke('account:get-all'),
    getCurrent: () => ipcRenderer.invoke('account:get-current'),
    switchAccount: (uuid) => ipcRenderer.invoke('account:switch', uuid),
    logout: () => ipcRenderer.invoke('account:logout'),
    delete: (uuid) => ipcRenderer.invoke('account:delete', uuid)
  },
  
  // 版本管理
  version: {
    getAll: () => ipcRenderer.invoke('version:get-all'),
    getInfo: (versionId) => ipcRenderer.invoke('version:get-info', versionId),
    delete: (versionId) => ipcRenderer.invoke('version:delete', versionId),
    getInstalled: () => ipcRenderer.invoke('get-installed-versions'),
    verify: (versionId) => ipcRenderer.invoke('verify-version', versionId),
    getMods: (versionId) => ipcRenderer.invoke('get-version-mods', versionId),
    getResourcePacks: (versionId) => ipcRenderer.invoke('get-version-resource-packs'),
    checkModLoader: (versionId, loaderType) => ipcRenderer.invoke('check-mod-loader', versionId, loaderType)
  },
  
  // 下载管理
  download: {
    setSource: (source) => ipcRenderer.invoke('download:set-source', source),
    getVersionManifest: () => ipcRenderer.invoke('download:get-version-manifest'),
    downloadVersion: (versionId, destination) => ipcRenderer.invoke('download:version', versionId, destination),
    cancelAll: () => ipcRenderer.invoke('download:cancel-all'),
    downloadGameVersion: (versionId, options) => ipcRenderer.invoke('download-version', versionId, options),
    saveOptions: (options) => ipcRenderer.invoke('save-download-options', options),
    getOptions: () => ipcRenderer.invoke('get-download-options'),
    cancel: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId)
  },
  
  // 游戏管理
  game: {
    launch: (options) => ipcRenderer.invoke('game:launch', options),
    stop: () => ipcRenderer.invoke('game:stop'),
    isRunning: () => ipcRenderer.invoke('game:is-running'),
    verifyFiles: (versionId) => ipcRenderer.invoke('game:verify-files', versionId)
  },
  
  // 系统信息
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
    getJavaPaths: () => ipcRenderer.invoke('get-java-paths'),
    getAppDataPath: () => ipcRenderer.invoke('get-app-data-path')
  },
  
  // 文件对话框
  dialog: {
    show: (options) => ipcRenderer.invoke('dialog:show', options),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFile: (options) => ipcRenderer.invoke('select-file', options)
  },
  
  // 游戏目录
  gameDir: {
    get: () => ipcRenderer.invoke('get-game-dir'),
    set: (dir) => ipcRenderer.invoke('set-game-dir', dir)
  },
  
  // P2P房间管理
  p2p: {
    // 房间操作
    createRoom: (options) => ipcRenderer.invoke('p2p-create-room', options),
    joinRoom: (options) => ipcRenderer.invoke('p2p-join-room', options),
    leaveRoom: (options) => ipcRenderer.invoke('p2p-leave-room', options),
    closeRoom: (roomId) => ipcRenderer.invoke('p2p-close-room', roomId),
    
    // 房间信息
    getRooms: () => ipcRenderer.invoke('p2p-get-rooms'),
    getRoomDetails: (roomId) => ipcRenderer.invoke('p2p-get-room-details', roomId),
    getMyRooms: () => ipcRenderer.invoke('p2p-get-my-rooms'),
    
    // 房间交互
    sendMessage: (options) => ipcRenderer.invoke('p2p-send-message', options),
    setRoomStatus: (roomId, status) => ipcRenderer.invoke('p2p-set-room-status', roomId, status),
    
    // 服务器操作
    startRoomServer: (roomId, options) => ipcRenderer.invoke('p2p-start-room-server', roomId, options),
    stopRoomServer: (roomId) => ipcRenderer.invoke('p2p-stop-room-server', roomId),
    
    // 测试
    testConnection: () => ipcRenderer.invoke('p2p-test-connection'),
    
    // 事件监听
    on: {
      roomCreated: (callback) => ipcRenderer.on('p2p-room-created', (event, ...args) => callback(...args)),
      playerJoined: (callback) => ipcRenderer.on('p2p-player-joined', (event, ...args) => callback(...args)),
      playerLeft: (callback) => ipcRenderer.on('p2p-player-left', (event, ...args) => callback(...args)),
      roomClosed: (callback) => ipcRenderer.on('p2p-room-closed', (event, ...args) => callback(...args)),
      roomStatusChanged: (callback) => ipcRenderer.on('p2p-room-status-changed', (event, ...args) => callback(...args)),
      roomMessage: (callback) => ipcRenderer.on('p2p-room-message', (event, ...args) => callback(...args)),
      playerListUpdated: (callback) => ipcRenderer.on('p2p-player-list-updated', (event, ...args) => callback(...args)),
      serverStarted: (callback) => ipcRenderer.on('p2p-server-started', (event, ...args) => callback(...args)),
      serverStopped: (callback) => ipcRenderer.on('p2p-server-stopped', (event, ...args) => callback(...args)),
      peerConnected: (callback) => ipcRenderer.on('p2p-peer-connected', (event, ...args) => callback(...args)),
      peerDisconnected: (callback) => ipcRenderer.on('p2p-peer-disconnected', (event, ...args) => callback(...args)),
      error: (callback) => ipcRenderer.on('p2p-room-error', (event, ...args) => callback(...args)),
      peerError: (callback) => ipcRenderer.on('p2p-peer-error', (event, ...args) => callback(...args))
    }
  },
  
  // 下载进度更新
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, ...args) => callback(...args)),
  
  // 验证进度更新
  onVerifyProgress: (callback) => ipcRenderer.on('verify-progress', (event, ...args) => callback(...args)),
  
  // 版本更新通知
  onVersionsUpdated: (callback) => ipcRenderer.on('versions-updated', (event, ...args) => callback(...args)),
  
  // 渲染器准备就绪通知
  rendererReady: () => ipcRenderer.send('renderer-ready')
});

// 暴露版本信息
try {
  const packageJson = require('./package.json');
  contextBridge.exposeInMainWorld('appVersion', packageJson.version);
} catch (error) {
  contextBridge.exposeInMainWorld('appVersion', '0.0.0');
}

// 添加一些常用的工具函数
contextBridge.exposeInMainWorld('utils', {
  formatBytes: (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },
  
  formatTime: (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  },
  
  generateUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
});