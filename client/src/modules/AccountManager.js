<<<<<<< HEAD
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');

class AccountManager {
  constructor(accountsPath, configManager) {
    this.accountsPath = accountsPath;
    this.configManager = configManager;
    this.accounts = [];
    this.currentAccount = null;
    this.loadAccounts();
  }

  /**
   * 加载账户信息
   */
  loadAccounts() {
    try {
      if (fs.existsSync(this.accountsPath)) {
        // 加载加密的账户数据
        const encryptedData = fs.readFileSync(this.accountsPath, 'utf8');
        const decryptedData = this.decrypt(encryptedData);
        this.accounts = JSON.parse(decryptedData);
        console.log(`成功加载 ${this.accounts.length} 个账户`);
      }
    } catch (error) {
      console.error('加载账户失败:', error);
      this.accounts = [];
    }
  }

  /**
   * 保存账户信息
   */
  saveAccounts() {
    try {
      // 确保目录存在
      fs.ensureDirSync(path.dirname(this.accountsPath));
      
      // 加密并保存账户数据
      const dataToSave = JSON.stringify(this.accounts, null, 2);
      const encryptedData = this.encrypt(dataToSave);
      fs.writeFileSync(this.accountsPath, encryptedData, 'utf8');
      
      // 同时更新配置中的安全账户信息（不包含凭据）
      if (this.configManager) {
        const safeAccounts = this.accounts.map(account => ({
          uuid: account.uuid,
          username: account.username,
          displayName: account.displayName || account.username,
          type: account.type || 'mojang',
          lastLogin: account.lastLogin
        }));
        this.configManager.set('accounts', safeAccounts);
      }
      
      console.log('账户信息已保存');
      return true;
    } catch (error) {
      console.error('保存账户失败:', error);
      return false;
    }
  }

  /**
   * 加密数据
   * @param {string} data 原始数据
   * @returns {string} 加密后的数据
   */
  encrypt(data) {
    // 简单的加密实现，实际应用中应使用更安全的加密方法
    // 注意：在生产环境中，应该使用密钥管理系统存储密钥
    const key = crypto.scryptSync('FurryMinecraftLauncher', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return `${iv.toString('base64')}:${encrypted}`;
  }

  /**
   * 解密数据
   * @param {string} encryptedData 加密数据
   * @returns {string} 解密后的数据
   */
  decrypt(encryptedData) {
    try {
      const [ivStr, encrypted] = encryptedData.split(':');
      const iv = Buffer.from(ivStr, 'base64');
      const key = crypto.scryptSync('FurryMinecraftLauncher', 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('解密账户数据失败:', error);
      throw new Error('无法解密账户数据');
    }
  }

  /**
   * 在线登录Mojang账户
   * @param {string} username 用户名/邮箱
   * @param {string} password 密码
   * @returns {Promise<Object>} 登录结果
   */
  async loginMojang(username, password) {
    try {
      const response = await this.makeAuthRequest({
        agent: {
          name: 'Minecraft',
          version: 1
        },
        username,
        password,
        requestUser: true
      });
      
      if (response.error) {
        throw new Error(response.errorMessage || '登录失败');
      }
      
      const account = {
        type: 'mojang',
        username: response.user.username,
        displayName: response.selectedProfile.name,
        uuid: response.selectedProfile.id,
        accessToken: response.accessToken,
        clientToken: response.clientToken,
        userProperties: response.user.properties || [],
        lastLogin: Date.now(),
        expiresAt: this.calculateExpiration(response.expiresIn)
      };
      
      // 添加或更新账户
      this.addOrUpdateAccount(account);
      this.currentAccount = account;
      
      return { success: true, account };
    } catch (error) {
      console.error('Mojang登录失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 创建离线账户
   * @param {string} username 用户名
   * @returns {Object} 账户对象
   */
  createOfflineAccount(username) {
    // 为离线账户生成UUID
    const md5 = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
    const uuid = `${md5.substring(0, 8)}-${md5.substring(8, 12)}-${md5.substring(12, 16)}-${md5.substring(16, 20)}-${md5.substring(20)}`;
    
    const account = {
      type: 'offline',
      username,
      displayName: username,
      uuid,
      offlineMode: true,
      lastLogin: Date.now()
    };
    
    // 添加或更新账户
    this.addOrUpdateAccount(account);
    this.currentAccount = account;
    
    return { success: true, account };
  }

  /**
   * 执行身份验证请求
   * @param {Object} payload 请求数据
   * @returns {Promise<Object>} 响应数据
   */
  makeAuthRequest(payload) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'authserver.mojang.com',
        port: 443,
        path: '/authenticate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error('解析响应失败'));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * 刷新访问令牌
   * @param {string} accessToken 访问令牌
   * @param {string} clientToken 客户端令牌
   * @returns {Promise<Object>} 刷新结果
   */
  async refreshToken(accessToken, clientToken) {
    try {
      const response = await this.makeRefreshRequest({
        accessToken,
        clientToken,
        requestUser: true
      });
      
      if (response.error) {
        throw new Error(response.errorMessage || '刷新令牌失败');
      }
      
      return {
        accessToken: response.accessToken,
        clientToken: response.clientToken,
        expiresAt: this.calculateExpiration(response.expiresIn)
      };
    } catch (error) {
      console.error('刷新令牌失败:', error);
      return null;
    }
  }

  /**
   * 执行刷新令牌请求
   * @param {Object} payload 请求数据
   * @returns {Promise<Object>} 响应数据
   */
  makeRefreshRequest(payload) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'authserver.mojang.com',
        port: 443,
        path: '/refresh',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error('解析响应失败'));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * 计算令牌过期时间
   * @param {number} expiresIn 过期时间（秒）
   * @returns {number} 过期时间戳
   */
  calculateExpiration(expiresIn) {
    return Date.now() + (expiresIn || 3600) * 1000; // 默认1小时
  }

  /**
   * 添加或更新账户
   * @param {Object} account 账户对象
   */
  addOrUpdateAccount(account) {
    const index = this.accounts.findIndex(a => a.uuid === account.uuid);
    
    if (index >= 0) {
      // 更新现有账户
      this.accounts[index] = { ...this.accounts[index], ...account };
    } else {
      // 添加新账户
      this.accounts.push(account);
    }
    
    this.saveAccounts();
  }

  /**
   * 获取所有账户
   * @returns {Array} 账户列表
   */
  getAllAccounts() {
    return this.accounts.map(account => ({
      uuid: account.uuid,
      username: account.username,
      displayName: account.displayName || account.username,
      type: account.type || 'mojang',
      lastLogin: account.lastLogin,
      offlineMode: account.offlineMode
    }));
  }

  /**
   * 获取当前选中的账户
   * @returns {Object|null} 当前账户
   */
  getCurrentAccount() {
    return this.currentAccount;
  }

  /**
   * 切换账户
   * @param {string} uuid 账户UUID
   * @returns {boolean} 是否切换成功
   */
  switchAccount(uuid) {
    const account = this.accounts.find(a => a.uuid === uuid);
    
    if (!account) {
      return false;
    }
    
    // 对于在线账户，检查令牌是否过期，如需要则刷新
    if (account.type !== 'offline') {
      if (this.isTokenExpired(account)) {
        // 令牌已过期，需要重新登录
        return false;
      }
    }
    
    this.currentAccount = account;
    account.lastLogin = Date.now();
    this.saveAccounts();
    
    return true;
  }

  /**
   * 检查令牌是否过期
   * @param {Object} account 账户对象
   * @returns {boolean} 是否已过期
   */
  isTokenExpired(account) {
    if (!account.expiresAt) return true;
    
    // 提前5分钟视为过期
    const bufferTime = 5 * 60 * 1000;
    return Date.now() + bufferTime >= account.expiresAt;
  }

  /**
   * 登出当前账户
   */
  logout() {
    this.currentAccount = null;
    console.log('已登出当前账户');
  }

  /**
   * 删除账户
   * @param {string} uuid 账户UUID
   * @returns {boolean} 是否删除成功
   */
  deleteAccount(uuid) {
    const initialLength = this.accounts.length;
    this.accounts = this.accounts.filter(account => account.uuid !== uuid);
    
    // 如果删除的是当前账户，登出
    if (this.currentAccount && this.currentAccount.uuid === uuid) {
      this.currentAccount = null;
    }
    
    // 更新配置中的账户列表
    if (this.configManager) {
      const safeAccounts = this.accounts.map(account => ({
        uuid: account.uuid,
        username: account.username,
        displayName: account.displayName || account.username,
        type: account.type || 'mojang',
        lastLogin: account.lastLogin
      }));
      this.configManager.set('accounts', safeAccounts);
    }
    
    this.saveAccounts();
    return this.accounts.length < initialLength;
  }

  /**
   * 验证账户是否有效
   * @param {Object} account 账户对象
   * @returns {Promise<boolean>} 是否有效
   */
  async validateAccount(account) {
    if (account.type === 'offline') {
      return true; // 离线账户始终有效
    }
    
    try {
      // 如果令牌已过期，尝试刷新
      if (this.isTokenExpired(account)) {
        const refreshed = await this.refreshToken(account.accessToken, account.clientToken);
        if (refreshed) {
          // 更新账户信息
          account.accessToken = refreshed.accessToken;
          account.clientToken = refreshed.clientToken;
          account.expiresAt = refreshed.expiresAt;
          this.saveAccounts();
          return true;
        }
        return false;
      }
      
      // 验证令牌
      return await this.validateToken(account.accessToken, account.clientToken);
    } catch (error) {
      console.error('验证账户失败:', error);
      return false;
    }
  }

  /**
   * 验证令牌
   * @param {string} accessToken 访问令牌
   * @param {string} clientToken 客户端令牌
   * @returns {Promise<boolean>} 是否有效
   */
  validateToken(accessToken, clientToken) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'authserver.mojang.com',
        port: 443,
        path: '/validate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        // 204表示成功，其他表示失败
        resolve(res.statusCode === 204);
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(JSON.stringify({ accessToken, clientToken }));
      req.end();
    });
  }

  /**
   * 使令牌失效
   * @param {string} accessToken 访问令牌
   * @param {string} clientToken 客户端令牌
   * @returns {Promise<boolean>} 是否成功
   */
  async invalidateToken(accessToken, clientToken) {
    try {
      const success = await this.makeInvalidateRequest({
        accessToken,
        clientToken
      });
      
      return success;
    } catch (error) {
      console.error('使令牌失效失败:', error);
      return false;
    }
  }

  /**
   * 执行使令牌失效请求
   * @param {Object} payload 请求数据
   * @returns {Promise<boolean>} 是否成功
   */
  makeInvalidateRequest(payload) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'authserver.mojang.com',
        port: 443,
        path: '/invalidate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        // 204表示成功
        resolve(res.statusCode === 204);
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(JSON.stringify(payload));
      req.end();
    });
  }
}

module.exports = AccountManager;
=======
const Store = require('electron-store');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const constants = require('../config/constants');

class AccountManager {
    constructor(dataPath) {
        this.dataPath = dataPath;
        this.accountsPath = path.join(dataPath, 'accounts');
        
        // 确保账户目录存在
        fs.ensureDirSync(this.accountsPath);
        
        // 初始化账户存储
        this.store = new Store({
            name: 'accounts',
            cwd: dataPath
        });
        
        // 当前选中的账户
        this.currentAccount = null;
        
        // 加载账户数据
        this.loadAccounts();
    }

    /**
     * 加载所有账户
     */
    loadAccounts() {
        try {
            const accounts = this.store.get('accounts', []);
            const currentAccountId = this.store.get('currentAccountId', null);
            
            // 查找当前选中的账户
            if (currentAccountId) {
                this.currentAccount = accounts.find(acc => acc.id === currentAccountId);
            }
            
            return accounts;
        } catch (error) {
            console.error('加载账户失败:', error);
            return [];
        }
    }

    /**
     * 获取所有账户
     * @returns {Array} 账户列表
     */
    getAllAccounts() {
        return this.store.get('accounts', []);
    }

    /**
     * 获取当前账户
     * @returns {Object|null} 当前账户
     */
    getCurrentAccount() {
        return this.currentAccount;
    }

    /**
     * 登录Mojang账户
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {Promise<Object>} 登录结果
     */
    async loginMojang(username, password) {
        try {
            // 调用Mojang认证API
            const response = await axios.post(
                constants.MINECRAFT.API.AUTH_SERVER + '/authenticate',
                {
                    agent: {
                        name: 'Minecraft',
                        version: 1
                    },
                    username,
                    password,
                    requestUser: true
                },
                {
                    timeout: 15000
                }
            );
            
            const { accessToken, clientToken, selectedProfile, user } = response.data;
            
            // 创建账户对象
            const account = {
                id: crypto.randomUUID(),
                type: 'mojang',
                username: selectedProfile.name,
                uuid: selectedProfile.id,
                accessToken,
                clientToken,
                user: {
                    id: user.id,
                    email: user.username
                },
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                validated: true
            };
            
            // 保存账户
            await this.addAccount(account);
            
            return {
                success: true,
                account
            };
        } catch (error) {
            console.error('Mojang登录失败:', error);
            let errorMessage = '登录失败，请检查用户名和密码';
            
            if (error.response) {
                if (error.response.status === 403) {
                    errorMessage = '账户已被禁止或密码错误次数过多';
                } else if (error.response.data && error.response.data.errorMessage) {
                    errorMessage = error.response.data.errorMessage;
                }
            }
            
            return {
                success: false,
                message: errorMessage
            };
        }
    }

    /**
     * 添加离线账户
     * @param {string} username - 用户名
     * @returns {Object} 账户对象
     */
    addOfflineAccount(username) {
        try {
            // 生成离线UUID
            const offlineUuid = this.generateOfflineUuid(username);
            
            const account = {
                id: crypto.randomUUID(),
                type: 'offline',
                username,
                uuid: offlineUuid,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                validated: true
            };
            
            this.addAccount(account);
            return account;
        } catch (error) {
            console.error('添加离线账户失败:', error);
            throw new Error('添加账户失败');
        }
    }

    /**
     * 添加账户
     * @param {Object} account - 账户对象
     */
    addAccount(account) {
        try {
            const accounts = this.getAllAccounts();
            
            // 检查是否已存在同名账户
            const existingIndex = accounts.findIndex(
                acc => acc.username === account.username && acc.type === account.type
            );
            
            if (existingIndex !== -1) {
                // 更新现有账户
                accounts[existingIndex] = { ...accounts[existingIndex], ...account };
            } else {
                // 添加新账户
                accounts.push(account);
            }
            
            // 保存账户列表
            this.store.set('accounts', accounts);
            
            // 设置为当前账户
            this.selectAccount(account.id);
            
            return true;
        } catch (error) {
            console.error('保存账户失败:', error);
            throw new Error('保存账户失败');
        }
    }

    /**
     * 选择账户
     * @param {string} accountId - 账户ID
     * @returns {boolean} 是否选择成功
     */
    selectAccount(accountId) {
        try {
            const accounts = this.getAllAccounts();
            const account = accounts.find(acc => acc.id === accountId);
            
            if (account) {
                this.currentAccount = account;
                this.store.set('currentAccountId', accountId);
                
                // 更新最后登录时间
                account.lastLogin = new Date().toISOString();
                this.store.set('accounts', accounts);
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('选择账户失败:', error);
            return false;
        }
    }

    /**
     * 删除账户
     * @param {string} accountId - 账户ID
     * @returns {boolean} 是否删除成功
     */
    deleteAccount(accountId) {
        try {
            let accounts = this.getAllAccounts();
            accounts = accounts.filter(acc => acc.id !== accountId);
            
            this.store.set('accounts', accounts);
            
            // 如果删除的是当前账户，清除当前账户
            if (this.currentAccount && this.currentAccount.id === accountId) {
                this.currentAccount = null;
                this.store.delete('currentAccountId');
                
                // 如果还有其他账户，选择第一个
                if (accounts.length > 0) {
                    this.selectAccount(accounts[0].id);
                }
            }
            
            return true;
        } catch (error) {
            console.error('删除账户失败:', error);
            return false;
        }
    }

    /**
     * 刷新Mojang账户令牌
     * @param {string} accountId - 账户ID
     * @returns {Promise<boolean>} 是否刷新成功
     */
    async refreshToken(accountId) {
        try {
            const accounts = this.getAllAccounts();
            const account = accounts.find(acc => acc.id === accountId && acc.type === 'mojang');
            
            if (!account) {
                throw new Error('未找到有效的Mojang账户');
            }
            
            // 调用刷新令牌API
            const response = await axios.post(
                constants.MINECRAFT.API.AUTH_SERVER + '/refresh',
                {
                    accessToken: account.accessToken,
                    clientToken: account.clientToken,
                    requestUser: true
                },
                {
                    timeout: 15000
                }
            );
            
            // 更新账户信息
            account.accessToken = response.data.accessToken;
            account.clientToken = response.data.clientToken;
            if (response.data.user) {
                account.user = response.data.user;
            }
            account.lastLogin = new Date().toISOString();
            
            // 保存更新后的账户
            this.store.set('accounts', accounts);
            
            // 如果是当前账户，更新当前账户
            if (this.currentAccount && this.currentAccount.id === accountId) {
                this.currentAccount = account;
            }
            
            return true;
        } catch (error) {
            console.error('刷新令牌失败:', error);
            return false;
        }
    }

    /**
     * 验证账户令牌是否有效
     * @param {string} accountId - 账户ID
     * @returns {Promise<boolean>} 是否有效
     */
    async validateAccount(accountId) {
        try {
            const accounts = this.getAllAccounts();
            const account = accounts.find(acc => acc.id === accountId && acc.type === 'mojang');
            
            if (!account) {
                return false;
            }
            
            // 调用验证API
            await axios.post(
                constants.MINECRAFT.API.AUTH_SERVER + '/validate',
                {
                    accessToken: account.accessToken,
                    clientToken: account.clientToken
                },
                {
                    timeout: 15000
                }
            );
            
            account.validated = true;
            this.store.set('accounts', accounts);
            
            return true;
        } catch (error) {
            console.error('验证账户失败:', error);
            
            // 标记账户为无效
            const accounts = this.getAllAccounts();
            const account = accounts.find(acc => acc.id === accountId);
            if (account) {
                account.validated = false;
                this.store.set('accounts', accounts);
            }
            
            return false;
        }
    }

    /**
     * 注销账户（使令牌失效）
     * @param {string} accountId - 账户ID
     * @returns {Promise<boolean>} 是否注销成功
     */
    async invalidateAccount(accountId) {
        try {
            const accounts = this.getAllAccounts();
            const account = accounts.find(acc => acc.id === accountId && acc.type === 'mojang');
            
            if (!account) {
                return false;
            }
            
            // 调用注销API
            await axios.post(
                constants.MINECRAFT.API.AUTH_SERVER + '/invalidate',
                {
                    accessToken: account.accessToken,
                    clientToken: account.clientToken
                },
                {
                    timeout: 15000
                }
            );
            
            // 移除令牌信息
            delete account.accessToken;
            delete account.clientToken;
            account.validated = false;
            
            this.store.set('accounts', accounts);
            
            return true;
        } catch (error) {
            console.error('注销账户失败:', error);
            return false;
        }
    }

    /**
     * 生成离线UUID
     * @param {string} username - 用户名
     * @returns {string} UUID
     */
    generateOfflineUuid(username) {
        const data = `OfflinePlayer:${username}`;
        const hash = crypto.createHash('md5').update(data).digest('hex');
        
        // 格式化UUID
        return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20)}`;
    }

    /**
     * 导出账户数据
     * @param {string} exportPath - 导出路径
     * @returns {Promise<boolean>}
     */
    async exportAccounts(exportPath) {
        try {
            const accountsData = {
                accounts: this.getAllAccounts(),
                currentAccountId: this.store.get('currentAccountId', null),
                exportDate: new Date().toISOString()
            };
            
            await fs.writeFile(exportPath, JSON.stringify(accountsData, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('导出账户失败:', error);
            throw new Error('导出账户失败');
        }
    }

    /**
     * 导入账户数据
     * @param {string} importPath - 导入路径
     * @returns {Promise<boolean>}
     */
    async importAccounts(importPath) {
        try {
            const accountsData = await fs.readJson(importPath, 'utf8');
            
            if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
                // 合并账户
                const currentAccounts = this.getAllAccounts();
                const importedAccounts = accountsData.accounts;
                
                // 去重
                const mergedAccounts = [...currentAccounts];
                importedAccounts.forEach(importedAcc => {
                    const existingIndex = mergedAccounts.findIndex(
                        acc => acc.username === importedAcc.username && acc.type === importedAcc.type
                    );
                    
                    if (existingIndex !== -1) {
                        // 更新现有账户
                        mergedAccounts[existingIndex] = { ...mergedAccounts[existingIndex], ...importedAcc };
                    } else {
                        // 添加新账户
                        mergedAccounts.push(importedAcc);
                    }
                });
                
                // 保存合并后的账户
                this.store.set('accounts', mergedAccounts);
                
                // 恢复当前账户
                if (accountsData.currentAccountId) {
                    this.selectAccount(accountsData.currentAccountId);
                }
                
                return true;
            }
            
            throw new Error('无效的账户数据格式');
        } catch (error) {
            console.error('导入账户失败:', error);
            throw new Error(`导入账户失败: ${error.message}`);
        }
    }

    /**
     * 获取账户皮肤URL
     * @param {string} uuid - 玩家UUID
     * @returns {string} 皮肤URL
     */
    getSkinUrl(uuid) {
        return `${constants.MINECRAFT.API.SESSION_SERVER}/session/minecraft/profile/${uuid}`;
    }
}
>>>>>>> 9f797c5bff6371242f00854a76799160e9079f9e
