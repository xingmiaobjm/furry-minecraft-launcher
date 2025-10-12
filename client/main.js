const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

// 处理GPU进程崩溃问题
app.disableHardwareAcceleration(); // 禁用硬件加速
const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');

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
const P2PRoomManager = require('./src/modules/P2PRoomManager');

// 全局模块实例
let mainWindow;
let appDataPath;
let configManager;
let accountManager;
let versionManager;
let downloadManager;
let gameLauncher;
let p2pRoomManager;

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

// 自动搜索Java
function autoSearchJava() {
  console.log('开始自动搜索Java...');
  const javaPaths = [];
  
  try {
    // Windows系统搜索
    if (process.platform === 'win32') {
      // 搜索Program Files目录
      const programFiles = ['C:\\Program Files\\Java', 'C:\\Program Files (x86)\\Java'];
      
      programFiles.forEach(dir => {
        if (fs.existsSync(dir)) {
          const javaDirs = fs.readdirSync(dir).filter(d => d.startsWith('jdk') || d.startsWith('jre'));
          javaDirs.forEach(javaDir => {
            const javaExe = path.join(dir, javaDir, 'bin', 'java.exe');
            if (fs.existsSync(javaExe)) {
              try {
                const version = execSync(`"${javaExe}" -version`, { stderr: 'pipe' }).toString('utf8');
                javaPaths.push({ path: javaExe, version });
              } catch (e) {
                // 忽略无法获取版本的Java
              }
            }
          });
        }
      });
      
      // 检查环境变量中的Java
      try {
        const envJava = execSync('where java', { stderr: 'pipe' }).toString('utf8').trim();
        if (envJava && fs.existsSync(envJava)) {
          try {
            const version = execSync(`"${envJava}" -version`, { stderr: 'pipe' }).toString('utf8');
            javaPaths.push({ path: envJava, version });
          } catch (e) {
            // 忽略无法获取版本的Java
          }
        }
      } catch (e) {
        // 环境变量中没有Java
      }
    } else if (process.platform === 'darwin' || process.platform === 'linux') {
      // macOS和Linux系统搜索
      try {
        const javaPathsOutput = execSync('which -a java', { stderr: 'pipe' }).toString('utf8').trim();
        const paths = javaPathsOutput.split('\n');
        
        paths.forEach(javaPath => {
          if (javaPath && fs.existsSync(javaPath)) {
            try {
              const version = execSync(`${javaPath} -version`, { stderr: 'pipe' }).toString('utf8');
              javaPaths.push({ path: javaPath, version });
            } catch (e) {
              // 忽略无法获取版本的Java
            }
          }
        });
      } catch (e) {
        // 无法找到Java
      }
    }
    
    // 按Java版本排序，优先选择Java 17+（推荐用于新版Minecraft）
    javaPaths.sort((a, b) => {
      const aVersion = extractJavaVersion(a.version);
      const bVersion = extractJavaVersion(b.version);
      return bVersion - aVersion;
    });
    
    console.log('找到的Java路径:', javaPaths.map(j => j.path));
    return javaPaths;
  } catch (error) {
    console.error('Java搜索失败:', error);
    return [];
  }
}

// 提取Java版本号
function extractJavaVersion(versionString) {
  // 匹配Java版本号的正则表达式
  const versionMatch = versionString.match(/version "(\d+)(\.(\d+))?/);
  if (versionMatch && versionMatch[1]) {
    const major = parseInt(versionMatch[1]);
    const minor = versionMatch[3] ? parseInt(versionMatch[3]) : 0;
    // 处理Java 8及以下版本和Java 9+版本的不同编号方式
    if (major === 1) {
      return minor; // Java 1.8 -> 8
    }
    return major;
  }
  return 0;
}

// 提取Java版本显示文本
function extractJavaVersionDisplay(versionString) {
  const versionMatch = versionString.match(/version "([^"]+)"/);
  if (versionMatch && versionMatch[1]) {
    return versionMatch[1];
  }
  return '未知版本';
}

// 初始化版本管理器
function initVersionManager() {
  const gameDir = configManager.get('gameDir', getDefaultGameDir());
  return new VersionManager(gameDir, true);
}

// 在启动器根目录创建.minecraft目录
function createMinecraftDir() {
  const launcherDir = path.dirname(app.getPath('exe'));
  const minecraftDir = path.join(launcherDir, '.minecraft');
  
  console.log('检查.minecraft目录:', minecraftDir);
  
  if (!fs.existsSync(minecraftDir)) {
    try {
      fs.mkdirSync(minecraftDir, { recursive: true });
      // 创建必要的子目录
      const subDirs = ['versions', 'libraries', 'assets', 'mods', 'resourcepacks', 'saves'];
      subDirs.forEach(subDir => {
        fs.mkdirSync(path.join(minecraftDir, subDir), { recursive: true });
      });
      console.log('.minecraft目录创建成功:', minecraftDir);
    } catch (error) {
      console.error('创建.minecraft目录失败:', error);
      // 如果在安装目录无法创建，回退到用户目录
      return path.join(app.getPath('userData'), '.minecraft');
    }
  }
  
  return minecraftDir;
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
    },
    // 添加以下配置来处理GPU问题
    backgroundColor: '#ffffff',
    show: false, // 先不显示窗口，等待内容加载完毕
    frame: false // 无边框窗口
  });
  
  // 防止GPU进程崩溃导致主窗口关闭
  app.on('render-process-gone', (event, webContents, details) => {
    console.log('渲染进程崩溃:', details);
    // 尝试重新加载窗口而不是关闭应用
    if (webContents === mainWindow.webContents) {
      console.log('主窗口渲染进程崩溃，尝试重新加载...');
      mainWindow.reload();
    }
  });
  
  // 窗口内容加载完毕后再显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
  appDataPath = ensureAppDataDir();
  
  // 创建.minecraft目录
  const minecraftDir = createMinecraftDir();
  
  // 初始化配置管理器
  const configPath = path.join(appDataPath, 'config.json');
  configManager = new ConfigManager(configPath);
  
  // 自动搜索Java并设置默认路径
  const javaPaths = autoSearchJava();
  if (javaPaths.length > 0 && !configManager.get('javaPath')) {
    configManager.set('javaPath', javaPaths[0].path);
    configManager.saveConfig();
    console.log('自动设置Java路径:', javaPaths[0].path);
  }
  
  // 设置默认游戏目录为创建的.minecraft
  if (!configManager.get('gameDir')) {
    configManager.set('gameDir', minecraftDir);
    configManager.saveConfig();
    console.log('设置默认游戏目录:', minecraftDir);
  }
  
  // 初始化账户管理器
  const accountsPath = path.join(appDataPath, 'accounts.json');
  accountManager = new AccountManager(accountsPath, configManager);
  
  // 初始化版本管理器（启用版本隔离）
  const gameDir = configManager.get('gameDir', getDefaultGameDir());
  versionManager = initVersionManager();
  
  // 初始化下载管理器
  const downloadSource = configManager.get('downloadSource', 'official');
  const maxConcurrentDownloads = configManager.get('maxConcurrentDownloads', 3);
  downloadManager = new DownloadManager({
    defaultSource: downloadSource,
    maxConcurrentDownloads: maxConcurrentDownloads
  });
  
  // 初始化游戏启动器
  gameLauncher = new GameLauncher(configManager, versionManager, accountManager);
  
  // 初始化P2P房间管理器
  p2pRoomManager = new P2PRoomManager(configManager);
  
  // 创建窗口
  const window = createWindow();

  // 激活应用
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // P2P房间相关IPC处理
  function setupP2PRoomIpcListeners() {
    // 创建房间
    ipcMain.handle('p2p-create-room', (event, options) => {
      const currentAccount = accountManager.getCurrentAccount();
      const roomOptions = {
        ...options,
        hostId: currentAccount?.uuid || 'local',
        hostUsername: currentAccount?.displayName || currentAccount?.username || 'Local User',
        hostAddress: '127.0.0.1' // 这里后续可以扩展为获取本地IP
      };
      return p2pRoomManager.createRoom(roomOptions);
    });

    // 加入房间
    ipcMain.handle('p2p-join-room', (event, options) => {
      const { roomId } = options;
      const currentAccount = accountManager.getCurrentAccount();
      const joinOptions = {
        ...options,
        playerId: currentAccount?.uuid || 'local',
        username: currentAccount?.displayName || currentAccount?.username || 'Guest'
      };
      return p2pRoomManager.joinRoom(roomId, joinOptions);
    });

    // 离开房间
    ipcMain.handle('p2p-leave-room', (event, options) => {
      const { roomId } = options;
      const currentAccount = accountManager.getCurrentAccount();
      const playerId = currentAccount?.uuid || 'local';
      return p2pRoomManager.leaveRoom(roomId, playerId);
    });

    // 获取房间列表
    ipcMain.handle('p2p-get-rooms', () => {
      console.log('[P2P Debug] 获取房间列表');
      return p2pRoomManager.getRooms();
    });

    // 获取房间详情
    ipcMain.handle('p2p-get-room-details', (event, roomId) => {
      return p2pRoomManager.getRoomDetails(roomId);
    });

    // 获取我的房间列表
    ipcMain.handle('p2p-get-my-rooms', () => {
      return p2pRoomManager.getMyRooms();
    });

    // 发送房间消息
    ipcMain.handle('p2p-send-message', (event, options) => {
      const { message, roomId } = options;
      return p2pRoomManager.sendRoomMessage(roomId, message);
    });

    // 设置房间状态
    ipcMain.handle('p2p-set-room-status', (event, roomId, status) => {
      return p2pRoomManager.setRoomStatus(roomId, status);
    });

    // 关闭房间
    ipcMain.handle('p2p-close-room', (event, roomId) => {
      return p2pRoomManager.closeRoom(roomId);
    });

    // 启动房间服务器
    ipcMain.handle('p2p-start-room-server', (event, roomId, options) => {
      return p2pRoomManager.startRoomServer(roomId, options);
    });

    // 停止房间服务器
    ipcMain.handle('p2p-stop-room-server', (event, roomId) => {
      return p2pRoomManager.stopRoomServer(roomId);
    });

    // 监听房间事件并转发给渲染进程
    p2pRoomManager.on('roomCreated', (room) => {
      mainWindow?.webContents.send('p2p-room-created', room);
    });

    p2pRoomManager.on('playerJoined', (data) => {
      // 发送玩家加入事件
      mainWindow?.webContents.send('p2p-player-joined', data);
      // 更新玩家列表
      mainWindow?.webContents.send('p2p-player-list-updated', { players: data.room?.players || [] });
    });

    p2pRoomManager.on('playerLeft', (data) => {
      mainWindow?.webContents.send('p2p-player-left', data);
      // 更新玩家列表
      mainWindow?.webContents.send('p2p-player-list-updated', { players: data.room?.players || [] });
    });

    p2pRoomManager.on('roomClosed', (data) => {
      mainWindow?.webContents.send('p2p-room-closed', data);
    });

    p2pRoomManager.on('roomStatusChanged', (data) => {
      mainWindow?.webContents.send('p2p-room-status-changed', data);
    });

    p2pRoomManager.on('roomMessage', (message) => {
      mainWindow?.webContents.send('p2p-room-message', message);
    });

    p2pRoomManager.on('error', (error) => {
      mainWindow?.webContents.send('p2p-room-error', error);
    });
    
    // 添加缺失的事件处理
    p2pRoomManager.on('playerListUpdated', (data) => {
      mainWindow?.webContents.send('p2p-player-list-updated', data);
    });
    
    p2pRoomManager.on('serverStarted', (data) => {
      mainWindow?.webContents.send('p2p-server-started', data);
    });
    
    p2pRoomManager.on('serverStopped', (data) => {
      mainWindow?.webContents.send('p2p-server-stopped', data);
    });
    
    // P2P连接相关事件
    p2pRoomManager.on('peerConnected', (data) => {
      mainWindow?.webContents.send('p2p-peer-connected', data);
    });
    
    p2pRoomManager.on('peerDisconnected', (data) => {
      mainWindow?.webContents.send('p2p-peer-disconnected', data);
    });
    
    p2pRoomManager.on('peerError', (data) => {
      console.log('[P2P Debug] 连接错误:', data);
      mainWindow?.webContents.send('p2p-peer-error', data);
    });
    
    // 为了帮助调试，添加一些简单的房间管理API
    
    // 测试P2P连接的简单方法
    ipcMain.handle('p2p-test-connection', () => {
      console.log('[P2P Debug] 测试P2P连接功能');
      return { success: true, message: 'P2P连接功能已初始化' };
    });
  }
  
  // 设置IPC监听器
  setupIpcListeners(window);
  
  // 设置P2P房间IPC监听器
  setupP2PRoomIpcListeners();
  
  // 监听渲染进程消息，用于下载进度更新等
  ipcMain.on('renderer-ready', () => {
    // 渲染进程准备就绪，可以发送初始数据
    console.log('渲染进程已准备就绪');
  });
});

// 设置IPC监听器
function setupIpcListeners(window) {
  // 获取应用数据路径
  ipcMain.handle('get-app-data-path', () => {
    return getAppDataPath();
  });
  
  // 获取自动搜索的Java路径列表
  ipcMain.handle('get-java-paths', async () => {
    try {
      const javaPaths = autoSearchJava();
      return javaPaths.map(j => ({
        path: j.path,
        version: extractJavaVersionDisplay(j.version)
      }));
    } catch (error) {
      console.error('获取Java路径列表失败:', error);
      return [];
    }
  });
  
  // 获取版本的Mod列表
  ipcMain.handle('get-version-mods', async (event, versionId) => {
    try {
      return await versionManager.getVersionMods(versionId);
    } catch (error) {
      console.error(`获取版本 ${versionId} 的Mod列表失败:`, error);
      return [];
    }
  });
  
  // 获取版本的资源包列表
  ipcMain.handle('get-version-resource-packs', async (event, versionId) => {
    try {
      return await versionManager.getVersionResourcePacks(versionId);
    } catch (error) {
      console.error(`获取版本 ${versionId} 的资源包列表失败:`, error);
      return [];
    }
  });
  
  // 检查版本是否已安装Mod加载器
  ipcMain.handle('check-mod-loader', async (event, versionId, loaderType) => {
    try {
      return await versionManager.hasModLoader(versionId, loaderType);
    } catch (error) {
      console.error(`检查版本 ${versionId} 的Mod加载器失败:`, error);
      return false;
    }
  });
  
  // 获取游戏目录
  ipcMain.handle('get-game-dir', (event) => {
    return configManager.get('gameDir', getDefaultGameDir());
  });

  // 设置游戏目录
  ipcMain.handle('set-game-dir', (event, gameDir) => {
    try {
      configManager.set('gameDir', gameDir);
      configManager.saveConfig();
      // 更新版本管理器的目录
      versionManager = new VersionManager(gameDir, true);
      return { success: true };
    } catch (error) {
      console.error('设置游戏目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取可用版本列表
  ipcMain.handle('get-version-list', async (event, options = {}) => {
    try {
      const source = options.source || configManager.get('downloadSource', 'official');
      downloadManager.setDownloadSource(source);
      
      const versionList = await downloadManager.getVersionManifest();
      return versionList;
    } catch (error) {
      console.error('获取版本列表失败:', error);
      return [];
    }
  });

  // 下载游戏版本
  ipcMain.handle('download-version', async (event, versionId, options = {}) => {
    try {
      const gameDir = configManager.get('gameDir', getDefaultGameDir());
      const versionDir = path.join(gameDir, 'versions', versionId);
      const source = options.source || configManager.get('downloadSource', 'official');
      
      downloadManager.setDownloadSource(source);
      
      // 创建下载任务
      const downloadId = `download-${Date.now()}`;
      
      // 发送进度更新事件
      const progressCallback = (progress) => {
        mainWindow?.webContents.send('download-progress', {
          id: downloadId,
          versionId,
          progress
        });
      };
      
      const result = await downloadManager.downloadVersion(versionId, versionDir, progressCallback);
      
      if (result.success) {
        // 下载完成后，安装Mod加载器（如果有）
        if (options.modLoader) {
          await installModLoader(versionId, options.modLoader, options.modLoaderVersion);
        }
        
        // 刷新版本列表
        mainWindow?.webContents.send('versions-updated');
      }
      
      return result;
    } catch (error) {
      console.error('下载版本失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 安装Mod加载器
  async function installModLoader(versionId, loaderType, loaderVersion) {
    try {
      // 这里需要实现Mod加载器安装逻辑
      console.log(`安装${loaderType} ${loaderVersion}到版本${versionId}`);
      // 实际实现时需要调用相应的API或工具来安装Mod加载器
      return { success: true };
    } catch (error) {
      console.error('安装Mod加载器失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 保存下载设置
  ipcMain.handle('save-download-options', (event, options) => {
    try {
      if (options.downloadSource) {
        configManager.set('downloadSource', options.downloadSource);
      }
      if (options.maxConcurrentDownloads) {
        configManager.set('maxConcurrentDownloads', parseInt(options.maxConcurrentDownloads));
      }
      configManager.saveConfig();
      
      // 更新下载管理器设置
      downloadManager.setDownloadSource(configManager.get('downloadSource'));
      return { success: true };
    } catch (error) {
      console.error('保存下载选项失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取下载设置
  ipcMain.handle('get-download-options', () => {
    return {
      downloadSource: configManager.get('downloadSource', 'official'),
      maxConcurrentDownloads: configManager.get('maxConcurrentDownloads', 3)
    };
  });

  // 取消下载
  ipcMain.handle('cancel-download', (event, downloadId) => {
    try {
      // 实现取消下载的逻辑
      console.log('取消下载:', downloadId);
      return { success: true };
    } catch (error) {
      console.error('取消下载失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取已安装版本列表
  ipcMain.handle('get-installed-versions', async () => {
    try {
      const versions = await versionManager.getInstalledVersions();
      return versions;
    } catch (error) {
      console.error('获取已安装版本失败:', error);
      return [];
    }
  });

  // 删除版本
  ipcMain.handle('delete-version', async (event, versionId) => {
    try {
      const result = await versionManager.deleteVersion(versionId);
      if (result.success) {
        // 刷新版本列表
        mainWindow?.webContents.send('versions-updated');
      }
      return result;
    } catch (error) {
      console.error('删除版本失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 验证版本
  ipcMain.handle('verify-version', async (event, versionId) => {
    try {
      // 发送进度更新事件
      const progressCallback = (progress) => {
        mainWindow?.webContents.send('verify-progress', {
          versionId,
          progress
        });
      };
      
      const result = await versionManager.verifyVersion(versionId, progressCallback);
      return result;
    } catch (error) {
      console.error('验证版本失败:', error);
      return { success: false, error: error.message };
    }
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
  
  // 其他相关代码

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
  
  // 窗口控制相关IPC
  ipcMain.on('window-min', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.on('window-max', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.restore();
      } else {
        mainWindow.maximize();
      }
    }
  });
  
  ipcMain.on('window-close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
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
  
  // 关闭P2P房间管理器
  if (p2pRoomManager) {
    p2pRoomManager.shutdown();
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