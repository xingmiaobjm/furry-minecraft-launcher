const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');

// 确保单例模式
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// 导入核心模块
const ConfigManager = require('./src/modules/ConfigManager');
const AccountManager = require('./src/modules/AccountManager');
const VersionManager = require('./src/modules/VersionManager');
const DownloadManager = require('./src/modules/DownloadManager');
const GameLauncher = require('./src/modules/GameLauncher');

// 全局模块实例
let mainWindow;
let configManager;
let accountManager;
let versionManager;
let downloadManager;
let gameLauncher;

// 确保应用数据目录存在
function ensureAppDataDir() {
  const appDataDir = getAppDataPath();
  const requiredDirs = [
    path.join(appDataDir, 'versions'),
    path.join(appDataDir, 'libraries'),
    path.join(appDataDir, 'assets')
  ];
  
  requiredDirs.forEach(dir => {
    fs.ensureDirSync(dir);
  });
  
  return appDataDir;
}

// 获取应用数据路径
function getAppDataPath() {
  return app.getPath('appData');
}

// 获取跨平台的默认游戏目录
function getDefaultGameDir() {
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA, '.minecraft');
    case 'darwin':
      return path.join(process.env.HOME, 'Library', 'Application Support', 'minecraft');
    case 'linux':
      return path.join(process.env.HOME, '.minecraft');
    default:
      return path.join(app.getPath('appData'), '.minecraft');
  }
}

// 创建窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: 'Furry Minecraft Launcher',
    icon: path.join(__dirname, 'icons/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public/index.html'));

  // 打开开发者工具（仅开发环境）
  // mainWindow.webContents.openDevTools();

  // 窗口关闭时触发
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// 应用就绪
app.whenReady().then(() => {
  // 初始化应用数据目录
  const appDataDir = ensureAppDataDir();
  
  // 初始化配置管理器
  const configPath = path.join(appDataDir, 'config.json');
  configManager = new ConfigManager(configPath);
  
  // 初始化账户管理器
  const accountsPath = path.join(appDataDir, 'accounts.json');
  accountManager = new AccountManager(accountsPath, configManager);
  
  // 初始化版本管理器
  const gameDir = configManager.get('gameDir', getDefaultGameDir());
  versionManager = new VersionManager(gameDir);
  
  // 初始化下载管理器
  const downloadSource = configManager.get('downloadSource', 'official');
  const maxConcurrentDownloads = configManager.get('maxConcurrentDownloads', 3);
  downloadManager = new DownloadManager({
    defaultSource: downloadSource,
    maxConcurrentDownloads: maxConcurrentDownloads
  });
  
  // 初始化游戏启动器
  gameLauncher = new GameLauncher(configManager, versionManager, accountManager);
  
  // 创建窗口
  const window = createWindow();

  // 激活应用
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // 设置IPC监听器
  setupIpcListeners(window);
});

// 设置IPC监听器
function setupIpcListeners(window) {
  // 获取应用数据路径
  ipcMain.handle('get-app-data-path', () => {
    return getAppDataPath();
  });
  
  // 选择目录
  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    
    return null;
  });
  
  // 选择文件
  ipcMain.handle('select-file', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: options.filters || []
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    
    return null;
  });
  
  // 配置管理相关IPC
  ipcMain.handle('config:get', (event, key, defaultValue) => {
    return configManager.get(key, defaultValue);
  });
  
  ipcMain.handle('config:set', (event, key, value) => {
    const success = configManager.set(key, value);
    if (success) {
      configManager.saveConfig();
    }
    return success;
  });
  
  ipcMain.handle('config:save', () => {
    return configManager.saveConfig();
  });
  
  ipcMain.handle('config:reset', () => {
    configManager.reset();
    return true;
  });
  
  // 账户管理相关IPC
  ipcMain.handle('account:login-mojang', async (event, username, password) => {
    return await accountManager.loginMojang(username, password);
  });
  
  ipcMain.handle('account:create-offline', (event, username) => {
    return accountManager.createOfflineAccount(username);
  });
  
  ipcMain.handle('account:get-all', () => {
    return accountManager.getAllAccounts();
  });
  
  ipcMain.handle('account:get-current', () => {
    return accountManager.getCurrentAccount();
  });
  
  ipcMain.handle('account:switch', (event, uuid) => {
    return accountManager.switchAccount(uuid);
  });
  
  ipcMain.handle('account:logout', () => {
    accountManager.logout();
    return true;
  });
  
  ipcMain.handle('account:delete', (event, uuid) => {
    return accountManager.deleteAccount(uuid);
  });
  
  // 版本管理相关IPC
  ipcMain.handle('version:get-all', async () => {
    return await versionManager.getAllVersions();
  });
  
  ipcMain.handle('version:get-info', async (event, versionId) => {
    return await versionManager.getVersionInfo(versionId);
  });
  
  ipcMain.handle('version:delete', async (event, versionId) => {
    return await versionManager.deleteVersion(versionId);
  });
  
  // 下载管理相关IPC
  ipcMain.handle('download:set-source', (event, source) => {
    return downloadManager.setDownloadSource(source);
  });
  
  ipcMain.handle('download:get-version-manifest', async () => {
    return await downloadManager.getVersionManifest();
  });
  
  ipcMain.handle('download:version', async (event, versionId, destination) => {
    // 创建进度回调通道
    const progressChannel = `download-progress-${Date.now()}`;
    
    // 启动下载
    const downloadPromise = downloadManager.downloadVersion(
      versionId, 
      destination,
      (progress) => {
        // 发送进度更新
        window.webContents.send(progressChannel, progress);
      }
    );
    
    // 返回进度通道ID和Promise解析结果
    return {
      progressChannel,
      result: await downloadPromise
    };
  });
  
  ipcMain.handle('download:cancel-all', () => {
    downloadManager.cancelAllDownloads();
    return true;
  });
  
  // 游戏启动相关IPC
  ipcMain.handle('game:launch', async (event, options) => {
    return await gameLauncher.launchGame(options);
  });
  
  ipcMain.handle('game:stop', () => {
    return gameLauncher.stopGame();
  });
  
  ipcMain.handle('game:is-running', () => {
    return gameLauncher.isGameRunning();
  });
  
  ipcMain.handle('game:verify-files', async (event, versionId) => {
    return await gameLauncher.verifyGameFiles(versionId);
  });
  
  // 获取系统信息
  ipcMain.handle('system:get-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      electron: process.versions.electron
    };
  });
  
  // 显示对话框
  ipcMain.handle('dialog:show', async (event, options) => {
    return await dialog.showMessageBox(options);
  });
}

// 关闭所有窗口时退出应用（Windows & Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 处理应用退出
app.on('will-quit', () => {
  // 保存配置
  if (configManager) {
    configManager.saveConfig();
  }
  
  // 停止所有下载
  if (downloadManager) {
    downloadManager.cancelAllDownloads();
  }
  
  // 停止游戏进程
  if (gameLauncher && gameLauncher.isGameRunning()) {
    gameLauncher.stopGame();
  }
});

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

// 捕获Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});