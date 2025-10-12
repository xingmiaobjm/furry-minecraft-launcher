const Store = require('electron-store');
const path = require('path');
const fs = require('fs-extra');

class ConfigManager {
    constructor(configPath) {
        this.configPath = configPath;
        this.defaultConfig = {
            // 启动器基本配置
            launcher: {
                language: 'zh-CN',
                theme: 'dark',
                autoUpdate: true,
                proxy: {
                    enabled: false,
                    url: '',
                    port: 0
                }
            },
            // 游戏设置
            game: {
                javaPath: '',
                memory: {
                    min: 1024,
                    max: 2048
                },
                jvmArgs: [],
                gameDir: '',
                fullscreen: false,
                resolution: {
                    width: 854,
                    height: 480
                }
            },
            // P2P设置
            p2p: {
                centralServer: {
                    url: 'ws://localhost:8080',
                    enabled: true
                },
                thirdPartyServer: {
                    url: 'ws://localhost:8081',
                    enabled: false
                },
                roomSettings: {
                    maxConnections: 8,
                    autoConnect: true
                }
            },
            // 下载设置
            download: {
                maxSpeed: 0, // 0 表示不限制
                maxConcurrent: 5,
                retryTimes: 3,
                timeout: 30000,
                useMirror: true,
                mirrorList: [
                    'https://download.mojang.com',
                    'https://bmclapi2.bangbang93.com'
                ]
            },
            // UI设置
            ui: {
                windowPosition: { x: null, y: null },
                windowSize: { width: 1024, height: 600 },
                windowMaximized: false,
                showNotifications: true,
                sidebarCollapsed: false,
                lastPage: 'home'
            }
        };
        
        // 初始化存储
        this.store = new Store({
            name: 'config',
            cwd: configPath,
            defaults: this.defaultConfig
        });
    }

    /**
     * 获取配置项
     * @param {string} key - 配置键名，支持点表示法，如 'launcher.language'
     * @returns {*} 配置值
     */
    get(key) {
        try {
            if (key) {
                return this.store.get(key);
            }
            return this.store.store;
        } catch (error) {
            console.error('获取配置失败:', error);
            return undefined;
        }
    }

    /**
     * 设置配置项
     * @param {string|object} key - 配置键名或配置对象
     * @param {*} value - 配置值（当key为字符串时）
     */
    set(key, value) {
        try {
            if (typeof key === 'object') {
                this.store.set(key);
            } else {
                this.store.set(key, value);
            }
        } catch (error) {
            console.error('设置配置失败:', error);
            throw new Error('保存配置失败');
        }
    }

    /**
     * 保存配置到文件
     */
    save() {
        try {
            this.store.save();
        } catch (error) {
            console.error('保存配置失败:', error);
            throw new Error('保存配置失败');
        }
    }

    /**
     * 重置配置到默认值
     * @param {string} [key] - 可选，指定要重置的配置键
     */
    reset(key) {
        try {
            if (key) {
                // 重置特定配置项
                const keys = key.split('.');
                let defaultValue = this.defaultConfig;
                
                for (const k of keys) {
                    if (defaultValue && typeof defaultValue === 'object') {
                        defaultValue = defaultValue[k];
                    } else {
                        defaultValue = undefined;
                        break;
                    }
                }
                
                if (defaultValue !== undefined) {
                    this.store.set(key, defaultValue);
                }
            } else {
                // 重置所有配置
                this.store.clear();
                this.store.set(this.defaultConfig);
            }
        } catch (error) {
            console.error('重置配置失败:', error);
            throw new Error('重置配置失败');
        }
    }

    /**
     * 导出配置到文件
     * @param {string} exportPath - 导出路径
     * @returns {Promise<boolean>}
     */
    async exportConfig(exportPath) {
        try {
            const configData = JSON.stringify(this.store.store, null, 2);
            await fs.writeFile(exportPath, configData, 'utf8');
            return true;
        } catch (error) {
            console.error('导出配置失败:', error);
            throw new Error('导出配置失败');
        }
    }

    /**
     * 从文件导入配置
     * @param {string} importPath - 导入路径
     * @returns {Promise<boolean>}
     */
    async importConfig(importPath) {
        try {
            const configData = await fs.readFile(importPath, 'utf8');
            const parsedConfig = JSON.parse(configData);
            
            // 验证配置结构
            if (typeof parsedConfig === 'object') {
                // 合并导入的配置，而不是完全替换
                this._mergeConfig(parsedConfig);
                return true;
            }
            throw new Error('无效的配置文件格式');
        } catch (error) {
            console.error('导入配置失败:', error);
            throw new Error(`导入配置失败: ${error.message}`);
        }
    }

    /**
     * 合并配置（递归）
     * @private
     * @param {object} newConfig - 新配置
     */
    _mergeConfig(newConfig) {
        const mergeDeep = (target, source) => {
            Object.keys(source).forEach(key => {
                if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
                    mergeDeep(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            });
        };
        
        const currentConfig = this.store.store;
        mergeDeep(currentConfig, newConfig);
        
        // 保存合并后的配置
        this.store.clear();
        this.store.set(currentConfig);
    }

    /**
     * 检查配置是否存在
     * @param {string} key - 配置键名
     * @returns {boolean}
     */
    has(key) {
        return this.store.has(key);
    }

    /**
     * 删除配置项
     * @param {string} key - 配置键名
     */
    delete(key) {
        this.store.delete(key);
    }

    /**
     * 验证当前配置的完整性
     * @returns {object} 验证结果
     */
    validate() {
        const errors = [];
        const warnings = [];
        
        // 检查必要的配置项
        if (!this.get('game.gameDir')) {
            warnings.push('游戏目录未设置');
        }
        
        // 检查Java路径
        if (!this.get('game.javaPath')) {
            warnings.push('Java路径未设置');
        } else if (!fs.existsSync(this.get('game.javaPath'))) {
            errors.push('Java路径不存在');
        }
        
        // 检查内存设置
        const minMem = this.get('game.memory.min');
        const maxMem = this.get('game.memory.max');
        if (minMem < 512) {
            warnings.push('最小内存设置过低');
        }
        if (maxMem < minMem) {
            errors.push('最大内存不能小于最小内存');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * 获取配置文件路径
     * @returns {string}
     */
    getConfigFilePath() {
        return path.join(this.configPath, 'config.json');
    }

    /**
     * 监听配置变化
     * @param {function} callback - 回调函数
     * @returns {function} 取消监听的函数
     */
    watch(callback) {
        const unwatch = this.store.onDidChange('*', (newValue, oldValue) => {
            callback(newValue, oldValue);
        });
        
        return unwatch;
    }
}

module.exports = ConfigManager;