const { contextBridge, ipcRenderer, platform } = require('electron');
const path = require('path');

// 安全的IPC通信桥接
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  fs: {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFile: (options) => ipcRenderer.invoke('select-file', options)
  },
  
  // 路径管理
  path: {
    getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
    getGameDir: () => ipcRenderer.invoke('get-game-dir'),
    setGameDir: (dir) => ipcRenderer.invoke('set-game-dir', dir)
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
    switch: (uuid) => ipcRenderer.invoke('account:switch', uuid),
    logout: () => ipcRenderer.invoke('account:logout'),
    delete: (uuid) => ipcRenderer.invoke('account:delete', uuid)
  },
  
  // 版本管理
  version: {
    getAll: () => ipcRenderer.invoke('version:get-all'),
    getInfo: (versionId) => ipcRenderer.invoke('version:get-info', versionId),
    delete: (versionId) => ipcRenderer.invoke('version:delete', versionId),
    getInstalledVersions: () => ipcRenderer.invoke('get-installed-versions'),
    getVersionMods: (versionId) => ipcRenderer.invoke('get-version-mods', versionId),
    getVersionResourcePacks: (versionId) => ipcRenderer.invoke('get-version-resource-packs', versionId),
    checkModLoader: (versionId, loaderType) => ipcRenderer.invoke('check-mod-loader', versionId, loaderType),
    verifyVersion: (versionId) => ipcRenderer.invoke('verify-version', versionId)
  },
  
  // 下载管理
  download: {
    setSource: (source) => ipcRenderer.invoke('download:set-source', source),
    getVersionManifest: () => ipcRenderer.invoke('download:get-version-manifest'),
    downloadVersion: (versionId, destination) => ipcRenderer.invoke('download:version', versionId, destination),
    cancelAll: () => ipcRenderer.invoke('download:cancel-all'),
    getVersionList: (options) => ipcRenderer.invoke('get-version-list', options),
    downloadVersion: (versionId, options) => ipcRenderer.invoke('download-version', versionId, options),
    cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
    saveOptions: (options) => ipcRenderer.invoke('save-download-options', options),
    getOptions: () => ipcRenderer.invoke('get-download-options')
  },
  
  // 游戏管理
  game: {
    launch: (options) => ipcRenderer.invoke('game:launch', options),
    stop: () => ipcRenderer.invoke('game:stop'),
    isRunning: () => ipcRenderer.invoke('game:is-running'),
    verifyFiles: (versionId) => ipcRenderer.invoke('game:verify-files', versionId),
    getJavaPaths: () => ipcRenderer.invoke('get-java-paths')
  },
  
  // 系统信息
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info')
  },
  
  // 对话框
  dialog: {
    show: (options) => ipcRenderer.invoke('dialog:show', options)
  },
  
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.send('window-min'),
    maximize: () => ipcRenderer.send('window-max'),
    close: () => ipcRenderer.send('window-close')
  },
  
  // P2P房间管理
  p2p: {
    createRoom: (options) => ipcRenderer.invoke('p2p-create-room', options),
    joinRoom: (options) => ipcRenderer.invoke('p2p-join-room', options),
    leaveRoom: (options) => ipcRenderer.invoke('p2p-leave-room', options),
    getRooms: () => ipcRenderer.invoke('p2p-get-rooms'),
    getRoomDetails: (roomId) => ipcRenderer.invoke('p2p-get-room-details', roomId),
    getMyRooms: () => ipcRenderer.invoke('p2p-get-my-rooms'),
    sendMessage: (options) => ipcRenderer.invoke('p2p-send-message', options),
    setRoomStatus: (roomId, status) => ipcRenderer.invoke('p2p-set-room-status', roomId, status),
    closeRoom: (roomId) => ipcRenderer.invoke('p2p-close-room', roomId),
    startRoomServer: (roomId, options) => ipcRenderer.invoke('p2p-start-room-server', roomId, options),
    stopRoomServer: (roomId) => ipcRenderer.invoke('p2p-stop-room-server', roomId),
    testConnection: () => ipcRenderer.invoke('p2p-test-connection'),
    on: (event, callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on(event, listener);
      return () => ipcRenderer.removeListener(event, listener);
    }
  },
  
  // 事件监听
  on: {
    downloadProgress: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('download-progress', listener);
      return () => ipcRenderer.removeListener('download-progress', listener);
    },
    verifyProgress: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('verify-progress', listener);
      return () => ipcRenderer.removeListener('verify-progress', listener);
    },
    versionsUpdated: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('versions-updated', listener);
      return () => ipcRenderer.removeListener('versions-updated', listener);
    },
    p2pRoomCreated: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-room-created', listener);
      return () => ipcRenderer.removeListener('p2p-room-created', listener);
    },
    p2pPlayerJoined: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-player-joined', listener);
      return () => ipcRenderer.removeListener('p2p-player-joined', listener);
    },
    p2pPlayerLeft: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-player-left', listener);
      return () => ipcRenderer.removeListener('p2p-player-left', listener);
    },
    p2pPlayerListUpdated: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-player-list-updated', listener);
      return () => ipcRenderer.removeListener('p2p-player-list-updated', listener);
    },
    p2pRoomClosed: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-room-closed', listener);
      return () => ipcRenderer.removeListener('p2p-room-closed', listener);
    },
    p2pRoomStatusChanged: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-room-status-changed', listener);
      return () => ipcRenderer.removeListener('p2p-room-status-changed', listener);
    },
    p2pRoomMessage: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-room-message', listener);
      return () => ipcRenderer.removeListener('p2p-room-message', listener);
    },
    p2pRoomError: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-room-error', listener);
      return () => ipcRenderer.removeListener('p2p-room-error', listener);
    },
    p2pServerStarted: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-server-started', listener);
      return () => ipcRenderer.removeListener('p2p-server-started', listener);
    },
    p2pServerStopped: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-server-stopped', listener);
      return () => ipcRenderer.removeListener('p2p-server-stopped', listener);
    },
    p2pPeerConnected: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-peer-connected', listener);
      return () => ipcRenderer.removeListener('p2p-peer-connected', listener);
    },
    p2pPeerDisconnected: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-peer-disconnected', listener);
      return () => ipcRenderer.removeListener('p2p-peer-disconnected', listener);
    },
    p2pPeerError: (callback) => {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on('p2p-peer-error', listener);
      return () => ipcRenderer.removeListener('p2p-peer-error', listener);
    }
  }
});

// 暴露平台信息
contextBridge.exposeInMainWorld('platform', platform);

// 暴露环境变量（谨慎使用）
contextBridge.exposeInMainWorld('env', {
  NODE_ENV: process.env.NODE_ENV
});

// 通知渲染进程准备就绪
ipcRenderer.send('renderer-ready');

// 错误处理
window.addEventListener('error', (event) => {
  console.error('渲染进程错误:', event.error);
});

// 页面卸载时清理所有监听器
window.addEventListener('beforeunload', () => {
  // 清理逻辑可以在这里添加
});