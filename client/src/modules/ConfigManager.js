const fs = require('fs-extra');
const path = require('path');

class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = this.getDefaultConfig();
    this.loadConfig();
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置对象
   */
  getDefaultConfig() {
    return {
      // 游戏设置
      gameDir: this.getDefaultGameDir(),
      javaPath: this.findJava(),
      javaArgs: '-Xmx2G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
      resolution: {
        width: 854,
        height: 480
      },
      fullscreen: false,
      maximized: false,
      
      // 启动器设置
      theme: 'light',
      language: 'zh_CN',
      autoLogin: false,
      rememberAccount: true,
      
      // 下载设置
      downloadSource: 'official', // 'official', 'bmclapi', 'mcbbs'
      maxConcurrentDownloads: 3,
      autoCleanup: false,
      
      // 账户信息（不会包含敏感信息）
      accounts: [],
      
      // 多人游戏设置
      servers: [],
      
      // 其他设置
      logLevel: 'info',
      enableAnalytics: false,
      
      // 版本设置
      selectedVersion: null
    };
  }

  /**
   * 获取默认游戏目录
   * @returns {string} 默认游戏目录路径
   */
  getDefaultGameDir() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    
    switch (process.platform) {
      case 'win32':
        return path.join(homeDir, '.minecraft');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'minecraft');
      case 'linux':
        return path.join(homeDir, '.minecraft');
      default:
        return path.join(homeDir, '.minecraft');
    }
  }

  /**
   * 尝试查找Java路径
   * @returns {string|null} Java路径或null
   */
  findJava() {
    const possiblePaths = [];
    
    switch (process.platform) {
      case 'win32':
        // Windows可能的Java路径
        possiblePaths.push(
          path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'),
          'C:\\Program Files\\Java\\jdk1.8.0_xx\\bin\\javaw.exe',
          'C:\\Program Files\\Java\\jre1.8.0_xx\\bin\\javaw.exe',
          'C:\\Program Files\\Java\\jdk11\\bin\\javaw.exe',
          'C:\\Program Files\\Java\\jdk17\\bin\\javaw.exe'
        );
        break;
      case 'darwin':
        // macOS可能的Java路径
        possiblePaths.push(
          '/usr/bin/java',
          '/Library/Java/JavaVirtualMachines/jdk1.8.0_xx.jdk/Contents/Home/bin/java',
          '/Library/Java/JavaVirtualMachines/adoptopenjdk-8.jdk/Contents/Home/bin/java'
        );
        break;
      case 'linux':
        // Linux可能的Java路径
        possiblePaths.push(
          '/usr/bin/java',
          '/usr/lib/jvm/java-8-openjdk-amd64/bin/java',
          '/usr/lib/jvm/java-11-openjdk-amd64/bin/java',
          '/usr/lib/jvm/java-17-openjdk-amd64/bin/java'
        );
        break;
    }
    
    // 检查路径是否存在
    for (const javaPath of possiblePaths) {
      if (fs.existsSync(javaPath)) {
        return javaPath;
      }
    }
    
    return null;
  }

  /**
   * 加载配置
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readJsonSync(this.configPath);
        // 合并配置，保留默认值
        this.config = { ...this.getDefaultConfig(), ...configData };
        console.log('配置加载成功');
      } else {
        console.log('配置文件不存在，使用默认配置');
        this.saveConfig();
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      console.log('使用默认配置');
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * 保存配置
   */
  saveConfig() {
    try {
      // 确保目录存在
      fs.ensureDirSync(path.dirname(this.configPath));
      
      // 保存配置
      fs.writeJsonSync(this.configPath, this.config, { spaces: 2 });
      console.log('配置保存成功');
      return true;
    } catch (error) {
      console.error('保存配置失败:', error);
      return false;
    }
  }

  /**
   * 获取配置项
   * @param {string} key 配置键
   * @param {*} defaultValue 默认值
   * @returns {*} 配置值
   */
  get(key, defaultValue = null) {
    // 支持点表示法访问嵌套属性
    if (key.includes('.')) {
      const keys = key.split('.');
      let value = this.config;
      
      for (const k of keys) {
        if (value === undefined || value === null || !Object.prototype.hasOwnProperty.call(value, k)) {
          return defaultValue;
        }
        value = value[k];
      }
      
      return value !== undefined ? value : defaultValue;
    }
    
    return Object.prototype.hasOwnProperty.call(this.config, key) ? 
           this.config[key] : defaultValue;
  }

  /**
   * 设置配置项
   * @param {string} key 配置键
   * @param {*} value 配置值
   * @returns {boolean} 是否设置成功
   */
  set(key, value) {
    try {
      // 支持点表示法设置嵌套属性
      if (key.includes('.')) {
        const keys = key.split('.');
        let obj = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (!obj[k]) {
            obj[k] = {};
          }
          obj = obj[k];
        }
        
        obj[keys[keys.length - 1]] = value;
      } else {
        this.config[key] = value;
      }
      
      return true;
    } catch (error) {
      console.error('设置配置失败:', error);
      return false;
    }
  }

  /**
   * 检查配置项是否存在
   * @param {string} key 配置键
   * @returns {boolean} 是否存在
   */
  has(key) {
    if (key.includes('.')) {
      const keys = key.split('.');
      let value = this.config;
      
      for (const k of keys) {
        if (value === undefined || value === null || !Object.prototype.hasOwnProperty.call(value, k)) {
          return false;
        }
        value = value[k];
      }
      
      return true;
    }
    
    return Object.prototype.hasOwnProperty.call(this.config, key);
  }

  /**
   * 删除配置项
   * @param {string} key 配置键
   * @returns {boolean} 是否删除成功
   */
  remove(key) {
    try {
      if (key.includes('.')) {
        const keys = key.split('.');
        let obj = this.config;
        let parent = null;
        let lastKey = null;
        
        for (const k of keys) {
          if (obj === undefined || obj === null || !Object.prototype.hasOwnProperty.call(obj, k)) {
            return false;
          }
          parent = obj;
          lastKey = k;
          obj = obj[k];
        }
        
        if (parent && lastKey) {
          delete parent[lastKey];
        }
      } else {
        delete this.config[key];
      }
      
      return true;
    } catch (error) {
      console.error('删除配置失败:', error);
      return false;
    }
  }

  /**
   * 重置配置到默认值
   */
  reset() {
    this.config = this.getDefaultConfig();
    this.saveConfig();
    console.log('配置已重置为默认值');
  }

  /**
   * 获取完整配置对象
   * @returns {Object} 配置对象
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 更新配置对象
   * @param {Object} newConfig 新配置对象
   */
  update(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 添加账户信息
   * @param {Object} account 账户对象
   */
  addAccount(account) {
    // 不存储敏感信息
    const safeAccount = {
      uuid: account.uuid,
      username: account.username,
      displayName: account.displayName || account.username,
      type: account.type || 'mojang',
      lastLogin: Date.now()
    };
    
    // 检查是否已存在该账户
    const existingIndex = this.config.accounts.findIndex(a => a.uuid === safeAccount.uuid);
    
    if (existingIndex >= 0) {
      // 更新现有账户
      this.config.accounts[existingIndex] = safeAccount;
    } else {
      // 添加新账户
      this.config.accounts.push(safeAccount);
    }
    
    this.saveConfig();
  }

  /**
   * 移除账户
   * @param {string} uuid 账户UUID
   */
  removeAccount(uuid) {
    this.config.accounts = this.config.accounts.filter(account => account.uuid !== uuid);
    this.saveConfig();
  }

  /**
   * 添加服务器
   * @param {Object} server 服务器对象
   */
  addServer(server) {
    // 检查是否已存在同名服务器
    const existingIndex = this.config.servers.findIndex(s => s.name === server.name);
    
    if (existingIndex >= 0) {
      // 更新现有服务器
      this.config.servers[existingIndex] = server;
    } else {
      // 添加新服务器
      this.config.servers.push(server);
    }
    
    this.saveConfig();
  }

  /**
   * 移除服务器
   * @param {string} serverName 服务器名称
   */
  removeServer(serverName) {
    this.config.servers = this.config.servers.filter(server => server.name !== serverName);
    this.saveConfig();
  }

  /**
   * 设置选中的游戏版本
   * @param {string} versionId 版本ID
   */
  setSelectedVersion(versionId) {
    this.config.selectedVersion = versionId;
    this.saveConfig();
  }

  /**
   * 验证配置有效性
   * @returns {Object} 验证结果
   */
  validate() {
    const issues = [];
    
    // 验证游戏目录
    if (!this.config.gameDir || !fs.existsSync(this.config.gameDir)) {
      issues.push('游戏目录不存在或无效');
    }
    
    // 验证Java路径
    if (!this.config.javaPath || !fs.existsSync(this.config.javaPath)) {
      issues.push('Java路径不存在或无效');
    }
    
    // 验证分辨率
    if (this.config.resolution.width < 640 || this.config.resolution.height < 480) {
      issues.push('分辨率过低，可能导致游戏显示异常');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
}

module.exports = ConfigManager;