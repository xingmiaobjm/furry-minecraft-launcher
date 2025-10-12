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