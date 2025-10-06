const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

class GameLauncher {
  constructor(configManager, versionManager, accountManager) {
    this.configManager = configManager;
    this.versionManager = versionManager;
    this.accountManager = accountManager;
    this.gameProcess = null;
    this.launchOptions = {};
  }

  /**
   * 启动游戏
   * @param {Object} options 启动选项
   * @returns {Promise<Object>} 启动结果
   */
  async launchGame(options = {}) {
    try {
      // 合并选项
      this.launchOptions = { ...this.getDefaultLaunchOptions(), ...options };
      
      // 获取版本信息
      const versionId = this.launchOptions.versionId;
      const versionInfo = await this.versionManager.getVersionInfo(versionId);
      if (!versionInfo) {
        throw new Error(`版本 ${versionId} 不存在`);
      }
      
      // 如果启用了版本隔离，使用隔离目录
      if (versionInfo.isolatedDirs) {
        // 确保隔离目录存在
        await this.versionManager.ensureVersionIsolatedDirs(versionId);
        
        // 设置游戏工作目录为隔离目录
        this.launchOptions.originalGameDir = this.launchOptions.gameDir; // 保存原始游戏目录
        this.launchOptions.gameDir = versionInfo.isolatedDirs.root;
        
        // 创建必要的符号链接到共享资源
        await this.createSharedResourceLinks(versionInfo.isolatedDirs, this.launchOptions.originalGameDir);
      }
      
      // 验证启动环境
      await this.validateLaunchEnvironment();
      
      // 获取启动参数
      const launchArgs = await this.buildLaunchArguments();
      
      // 创建游戏进程
      const gameProcess = this.createGameProcess(launchArgs);
      
      return {
        success: true,
        process: gameProcess,
        pid: gameProcess.pid
      };
    } catch (error) {
      console.error('启动游戏失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 创建共享资源的符号链接
   * @param {Object} isolatedDirs 隔离目录信息
   * @param {string} originalGameDir 原始游戏目录
   */
  async createSharedResourceLinks(isolatedDirs, originalGameDir) {
    try {
      // 需要共享的目录列表
      const sharedDirs = ['assets', 'libraries'];
      
      for (const dir of sharedDirs) {
        const originalPath = path.join(originalGameDir, dir);
        const linkPath = path.join(isolatedDirs.root, dir);
        
        // 如果目标链接不存在且原始目录存在，创建符号链接
        if (!await fs.pathExists(linkPath) && await fs.pathExists(originalPath)) {
          try {
            if (process.platform === 'win32') {
              // Windows系统使用mklink命令
              const { execSync } = require('child_process');
              execSync(`mklink /D "${linkPath}" "${originalPath}"`, { stdio: 'inherit' });
            } else {
              // Unix系统使用fs.symlink
              await fs.symlink(originalPath, linkPath, 'dir');
            }
            console.log(`创建符号链接: ${linkPath} -> ${originalPath}`);
          } catch (linkError) {
            console.warn(`创建符号链接失败，复制目录代替: ${linkError.message}`);
            // 如果符号链接创建失败，复制目录
            await fs.copy(originalPath, linkPath, { overwrite: false });
          }
        }
      }
    } catch (error) {
      console.error('创建共享资源链接失败:', error);
    }
  }

  /**
   * 获取默认启动选项
   * @returns {Object} 默认启动选项
   */
  getDefaultLaunchOptions() {
    const defaultGameDir = this.configManager.get('gameDir');
    
    return {
      versionId: this.configManager.get('selectedVersion'),
      gameDir: defaultGameDir,
      originalGameDir: defaultGameDir, // 保存原始游戏目录用于版本隔离
      javaPath: this.configManager.get('javaPath'),
      javaArgs: this.configManager.get('javaArgs', '-Xmx2G'),
      resolution: this.configManager.get('resolution', { width: 854, height: 480 }),
      fullscreen: this.configManager.get('fullscreen', false),
      server: null, // 服务器地址
      serverPort: 25565, // 默认服务器端口
      username: null, // 如果未提供，将使用当前账户
      uuid: null, // 如果未提供，将使用当前账户
      accessToken: null, // 如果未提供，将使用当前账户（在线模式）
      offlineMode: false // 是否以离线模式启动
    };
  }

  /**
   * 验证启动环境
   */
  async validateLaunchEnvironment() {
    // 验证Java路径
    const javaPath = this.launchOptions.javaPath;
    if (!javaPath || !fs.existsSync(javaPath)) {
      throw new Error('Java路径无效或未找到Java');
    }
    
    // 验证游戏目录
    const gameDir = this.launchOptions.gameDir;
    if (!gameDir || !fs.existsSync(gameDir)) {
      throw new Error('游戏目录无效或不存在');
    }
    
    // 验证版本
    const versionId = this.launchOptions.versionId;
    if (!versionId) {
      throw new Error('未选择游戏版本');
    }
    
    const versionInfo = await this.versionManager.getVersionInfo(versionId);
    if (!versionInfo) {
      throw new Error(`找不到版本: ${versionId}`);
    }
    
    // 验证账户信息
    this.prepareAccountInfo();
  }

  /**
   * 准备账户信息
   */
  prepareAccountInfo() {
    const { username, uuid, accessToken, offlineMode } = this.launchOptions;
    
    // 如果未提供账户信息，使用当前账户
    if (!username || !uuid) {
      const currentAccount = this.accountManager.getCurrentAccount();
      
      if (!currentAccount) {
        throw new Error('未登录账户');
      }
      
      this.launchOptions.username = currentAccount.displayName || currentAccount.username;
      this.launchOptions.uuid = currentAccount.uuid;
      
      if (currentAccount.offlineMode || offlineMode) {
        this.launchOptions.offlineMode = true;
        this.launchOptions.accessToken = '0'; // 离线模式使用0作为token
      } else {
        this.launchOptions.accessToken = currentAccount.accessToken;
      }
    }
    
    // 离线模式特殊处理
    if (this.launchOptions.offlineMode) {
      this.launchOptions.accessToken = '0'; // 离线模式token
      
      // 如果没有提供UUID，为离线账户生成一个
      if (!this.launchOptions.uuid) {
        const md5 = crypto.createHash('md5').update(`OfflinePlayer:${this.launchOptions.username}`).digest('hex');
        this.launchOptions.uuid = `${md5.substring(0, 8)}-${md5.substring(8, 12)}-${md5.substring(12, 16)}-${md5.substring(16, 20)}-${md5.substring(20)}`;
      }
    }
  }

  /**
   * 构建启动参数
   * @returns {Promise<Array>} 启动参数数组
   */
  async buildLaunchArguments() {
    const { javaPath, javaArgs, versionId, gameDir, resolution, fullscreen } = this.launchOptions;
    
    // 获取版本信息
    const versionInfo = await this.versionManager.getVersionInfo(versionId);
    if (!versionInfo) {
      throw new Error(`无法获取版本信息: ${versionId}`);
    }
    
    // 准备目录路径
    const nativesDir = path.join(gameDir, 'versions', versionId, `${versionId}-natives`);
    const librariesDir = path.join(gameDir, 'libraries');
    const assetsDir = path.join(gameDir, 'assets');
    
    // 创建natives目录
    await fs.ensureDir(nativesDir);
    
    // 构建类路径
    const classPath = await this.buildClassPath(versionInfo, librariesDir, versionId, gameDir);
    
    // 构建JVM参数
    const jvmArgs = this.buildJvmArguments(javaArgs, nativesDir, gameDir);
    
    // 构建游戏参数
    const gameArgs = await this.buildGameArguments(versionInfo, {
      versionId,
      gameDir,
      assetsDir,
      resolution,
      fullscreen
    });
    
    // 组合所有参数
    const args = [
      ...jvmArgs,
      versionInfo.mainClass,
      ...gameArgs
    ];
    
    return args;
  }

  /**
   * 构建类路径
   * @param {Object} versionInfo 版本信息
   * @param {string} librariesDir 库目录
   * @param {string} versionId 版本ID
   * @param {string} gameDir 游戏目录
   * @returns {Promise<string>} 类路径字符串
   */
  async buildClassPath(versionInfo, librariesDir, versionId, gameDir) {
    const separator = process.platform === 'win32' ? ';' : ':';
    const classPath = [];
    
    // 使用原始游戏目录查找库文件，确保即使在隔离模式下也能找到共享库
    const actualLibrariesDir = this.launchOptions.originalGameDir ? 
      path.join(this.launchOptions.originalGameDir, 'libraries') : librariesDir;
    
    // 添加库文件到类路径
    if (versionInfo.libraries) {
      for (const library of versionInfo.libraries) {
        // 检查库规则
        if (library.rules) {
          const applies = this.checkLibraryRules(library.rules);
          if (!applies) continue;
        }
        
        // 添加库到类路径
        if (library.downloads && library.downloads.artifact) {
          const libPath = library.downloads.artifact.path;
          const fullPath = path.join(actualLibrariesDir, libPath);
          
          if (await fs.pathExists(fullPath)) {
            classPath.push(fullPath);
          }
        }
      }
    }
    
    // 使用原始游戏目录查找版本JAR文件
    const versionsBaseDir = this.launchOptions.originalGameDir ? 
      path.join(this.launchOptions.originalGameDir, 'versions') : path.join(gameDir, 'versions');
    
    // 添加游戏JAR到类路径
    const gameJarPath = path.join(versionsBaseDir, versionId, `${versionId}.jar`);
    if (await fs.pathExists(gameJarPath)) {
      classPath.push(gameJarPath);
    } else {
      throw new Error(`找不到游戏JAR文件: ${gameJarPath}`);
    }
    
    return classPath.join(separator);
  }

  /**
   * 检查库规则
   * @param {Array} rules 规则数组
   * @returns {boolean} 是否适用
   */
  checkLibraryRules(rules) {
    let applies = true;
    
    for (const rule of rules) {
      if (rule.action === 'allow') {
        applies = true;
        if (rule.os) {
          const currentOs = process.platform === 'win32' ? 'windows' : 
                           process.platform === 'darwin' ? 'osx' : 
                           'linux';
          applies = rule.os.name === currentOs;
        }
      } else if (rule.action === 'disallow') {
        if (rule.os) {
          const currentOs = process.platform === 'win32' ? 'windows' : 
                           process.platform === 'darwin' ? 'osx' : 
                           'linux';
          if (rule.os.name === currentOs) {
            return false;
          }
        }
      }
    }
    
    return applies;
  }

  /**
   * 构建JVM参数
   * @param {string} javaArgs 用户自定义JVM参数
   * @param {string} nativesDir 原生库目录
   * @param {string} gameDir 游戏目录
   * @returns {Array} JVM参数数组
   */
  buildJvmArguments(javaArgs, nativesDir, gameDir) {
    const args = [];
    
    // 添加用户自定义参数
    if (javaArgs) {
      args.push(...javaArgs.split(/\s+/));
    }
    
    // 添加必要的JVM参数
    args.push('-Djava.library.path=' + nativesDir);
    args.push('-Dminecraft.client.jar=' + gameDir);
    
    // 添加DPI感知参数（Windows）
    if (process.platform === 'win32') {
      args.push('-Dsun.java2d.dpiaware=true');
      args.push('-Dsun.java2d.ddscale=true');
    }
    
    return args;
  }

  /**
   * 构建游戏参数
   * @param {Object} versionInfo 版本信息
   * @param {Object} options 游戏选项
   * @returns {Promise<Array>} 游戏参数数组
   */
  async buildGameArguments(versionInfo, options) {
    const { versionId, gameDir, resolution, fullscreen } = options;
    const args = [];
    
    // 使用原始游戏目录的assets文件夹
    const assetsDir = this.launchOptions.originalGameDir ? 
      path.join(this.launchOptions.originalGameDir, 'assets') : path.join(gameDir, 'assets');
    
    // 基础游戏参数
    args.push('--username', this.launchOptions.username);
    args.push('--version', versionId);
    args.push('--gameDir', gameDir);
    args.push('--assetsDir', assetsDir);
    args.push('--assetIndex', versionInfo.assetIndex?.id || versionId);
    args.push('--uuid', this.launchOptions.uuid);
    args.push('--accessToken', this.launchOptions.accessToken);
    args.push('--userType', this.launchOptions.offlineMode ? 'legacy' : 'mojang');
    
    // 添加分辨率参数
    args.push('--width', resolution.width.toString());
    args.push('--height', resolution.height.toString());
    
    // 全屏参数
    if (fullscreen) {
      args.push('--fullscreen');
    }
    
    // 服务器参数（如果提供）
    if (this.launchOptions.server) {
      args.push('--server', this.launchOptions.server);
      args.push('--port', this.launchOptions.serverPort.toString());
    }
    
    return args;
  }

  /**
   * 创建游戏进程
   * @param {Array} args 启动参数
   * @returns {ChildProcess} 游戏进程
   */
  createGameProcess(args) {
    const { javaPath, gameDir } = this.launchOptions;
    
    // 创建进程
    this.gameProcess = spawn(javaPath, args, {
      cwd: gameDir,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    
    // 处理输出
    this.gameProcess.stdout.on('data', (data) => {
      console.log(`游戏输出: ${data}`);
    });
    
    this.gameProcess.stderr.on('data', (data) => {
      console.error(`游戏错误: ${data}`);
    });
    
    // 处理退出
    this.gameProcess.on('close', (code) => {
      console.log(`游戏进程退出，退出码: ${code}`);
      this.gameProcess = null;
    });
    
    // 处理错误
    this.gameProcess.on('error', (error) => {
      console.error(`游戏进程错误: ${error}`);
      this.gameProcess = null;
    });
    
    return this.gameProcess;
  }

  /**
   * 停止游戏进程
   */
  stopGame() {
    if (this.gameProcess) {
      try {
        // 尝试优雅关闭
        if (process.platform === 'win32') {
          // Windows下使用taskkill以优雅关闭
          require('child_process').execSync(`taskkill /pid ${this.gameProcess.pid} /t /f`);
        } else {
          // Unix-like系统使用SIGTERM
          this.gameProcess.kill('SIGTERM');
          
          // 如果进程没有在5秒内退出，强制终止
          setTimeout(() => {
            if (this.gameProcess && !this.gameProcess.killed) {
              this.gameProcess.kill('SIGKILL');
            }
          }, 5000);
        }
        
        this.gameProcess = null;
        console.log('游戏已停止');
        return true;
      } catch (error) {
        console.error('停止游戏失败:', error);
        return false;
      }
    }
    return false;
  }

  /**
   * 检查游戏是否正在运行
   * @returns {boolean} 是否正在运行
   */
  isGameRunning() {
    return this.gameProcess !== null && !this.gameProcess.killed;
  }

  /**
   * 获取游戏进程ID
   * @returns {number|null} 进程ID
   */
  getGamePid() {
    return this.gameProcess ? this.gameProcess.pid : null;
  }

  /**
   * 获取当前启动选项
   * @returns {Object} 启动选项
   */
  getLaunchOptions() {
    return { ...this.launchOptions };
  }

  /**
   * 提取原生库文件
   * @param {Object} versionInfo 版本信息
   * @param {string} librariesDir 库目录
   * @param {string} nativesDir 原生库目录
   */
  async extractNatives(versionInfo, librariesDir, nativesDir) {
    // 清空natives目录
    await fs.emptyDir(nativesDir);
    
    if (versionInfo.libraries) {
      for (const library of versionInfo.libraries) {
        // 只处理有原生库的库文件
        if (!library.natives || !library.downloads || !library.downloads.classifiers) {
          continue;
        }
        
        // 获取当前系统对应的原生库
        const nativeKey = process.platform === 'win32' ? 'windows' : 
                          process.platform === 'darwin' ? 'osx' : 
                          'linux';
        
        const nativeClassifier = library.natives[nativeKey];
        if (!nativeClassifier) continue;
        
        // 检查规则
        if (library.rules) {
          const applies = this.checkLibraryRules(library.rules);
          if (!applies) continue;
        }
        
        // 提取原生库
        const nativeLib = library.downloads.classifiers[nativeClassifier];
        if (nativeLib) {
          const libPath = path.join(librariesDir, nativeLib.path);
          
          if (await fs.pathExists(libPath)) {
            // 这里应该实现解压功能，但为了简化，暂时跳过
            console.log(`应提取原生库: ${libPath} 到 ${nativesDir}`);
          }
        }
      }
    }
  }

  /**
   * 验证游戏文件完整性
   * @param {string} versionId 版本ID
   * @returns {Promise<Object>} 验证结果
   */
  async verifyGameFiles(versionId) {
    const { gameDir } = this.launchOptions;
    
    try {
      // 获取版本信息
      const versionInfo = await this.versionManager.getVersionInfo(versionId);
      if (!versionInfo) {
        return { success: false, error: `找不到版本信息: ${versionId}` };
      }
      
      // 验证游戏JAR
      const jarPath = path.join(gameDir, 'versions', versionId, `${versionId}.jar`);
      if (!await fs.pathExists(jarPath)) {
        return { success: false, error: `游戏JAR不存在: ${jarPath}` };
      }
      
      // 验证版本JSON
      const jsonPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
      if (!await fs.pathExists(jsonPath)) {
        return { success: false, error: `版本JSON不存在: ${jsonPath}` };
      }
      
      // 验证库文件（简化版）
      const missingLibraries = [];
      if (versionInfo.libraries) {
        for (const library of versionInfo.libraries) {
          if (library.downloads && library.downloads.artifact) {
            const libPath = path.join(gameDir, 'libraries', library.downloads.artifact.path);
            if (!await fs.pathExists(libPath)) {
              missingLibraries.push(library.downloads.artifact.path);
            }
          }
        }
      }
      
      return {
        success: true,
        missingLibraries,
        hasMissingFiles: missingLibraries.length > 0
      };
    } catch (error) {
      console.error('验证游戏文件失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = GameLauncher;