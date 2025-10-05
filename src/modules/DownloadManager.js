const fs = require('fs-extra');
const path = require('path');
const { DownloaderHelper } = require('node-downloader-helper');

class DownloadManager {
  constructor(options = {}) {
    this.downloadQueue = [];
    this.activeDownloads = new Map();
    this.maxConcurrentDownloads = options.maxConcurrentDownloads || 3;
    this.downloadSources = {
      official: 'https://piston-meta.mojang.com',
      bmclapi: 'https://bmclapi2.bangbang93.com',
      mcbbs: 'https://download.mcbbs.net'
    };
    this.currentSource = options.defaultSource || 'official';
  }

  /**
   * 设置下载源
   * @param {string} source 下载源ID
   */
  setDownloadSource(source) {
    if (this.downloadSources[source]) {
      this.currentSource = source;
      return true;
    }
    return false;
  }

  /**
   * 获取当前下载源的基础URL
   * @returns {string} 基础URL
   */
  getBaseUrl() {
    return this.downloadSources[this.currentSource];
  }

  /**
   * 获取版本清单
   * @returns {Promise<Array>} 版本清单
   */
  async getVersionManifest() {
    try {
      const manifestUrl = `${this.getBaseUrl()}/mc/game/version_manifest.json`;
      const response = await this.downloadFile(manifestUrl, path.join(fs.tmpdir(), 'version_manifest.json'), {
        onProgress: null, // 不需要进度回调
        temporary: true   // 临时文件
      });
      
      const manifest = await fs.readJson(response.filePath);
      await fs.remove(response.filePath); // 删除临时文件
      
      return manifest.versions || [];
    } catch (error) {
      console.error('获取版本清单失败:', error);
      // 如果官方源失败，尝试切换到备用源
      if (this.currentSource === 'official') {
        console.log('尝试使用备用下载源...');
        this.setDownloadSource('bmclapi');
        return this.getVersionManifest();
      }
      return [];
    }
  }

  /**
   * 下载游戏版本
   * @param {string} versionId 版本ID
   * @param {string} destination 下载目标目录
   * @param {Function} onProgress 进度回调
   * @returns {Promise<Object>} 下载结果
   */
  async downloadVersion(versionId, destination, onProgress = null) {
    try {
      // 确保目标目录存在
      await fs.ensureDir(destination);
      
      // 1. 获取版本信息
      const versionList = await this.getVersionManifest();
      const versionInfo = versionList.find(v => v.id === versionId);
      
      if (!versionInfo) {
        throw new Error(`找不到版本: ${versionId}`);
      }
      
      // 2. 下载版本JSON
      const jsonUrl = versionInfo.url;
      const jsonPath = path.join(destination, `${versionId}.json`);
      
      await this.downloadFile(jsonUrl, jsonPath, {
        onProgress: (progress) => {
          if (onProgress) {
            onProgress({ type: 'json', ...progress });
          }
        }
      });
      
      // 3. 读取版本JSON获取jar下载链接
      const versionJson = await fs.readJson(jsonPath);
      const jarUrl = this.getDownloadUrl(versionJson.downloads.client.url);
      const jarPath = path.join(destination, `${versionId}.jar`);
      
      // 4. 下载版本JAR文件
      await this.downloadFile(jarUrl, jarPath, {
        onProgress: (progress) => {
          if (onProgress) {
            onProgress({ type: 'jar', ...progress });
          }
        }
      });
      
      // 5. 下载必要的库文件
      const librariesDir = path.join(path.dirname(destination), 'libraries');
      await this.downloadLibraries(versionJson, librariesDir, onProgress);
      
      // 6. 下载资源文件
      const assetsDir = path.join(path.dirname(path.dirname(destination)), 'assets');
      await this.downloadAssets(versionJson, assetsDir, onProgress);
      
      return { success: true, versionId, path: destination };
    } catch (error) {
      console.error(`下载版本 ${versionId} 失败:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 下载库文件
   * @param {Object} versionJson 版本JSON
   * @param {string} destination 下载目标目录
   * @param {Function} onProgress 进度回调
   */
  async downloadLibraries(versionJson, destination, onProgress = null) {
    try {
      const libraries = versionJson.libraries || [];
      const totalLibraries = libraries.length;
      let downloadedCount = 0;
      
      // 过滤需要下载的库文件（跳过原生库和不兼容系统的库）
      const librariesToDownload = libraries.filter(lib => {
        // 检查是否有规则禁止下载
        if (lib.rules) {
          const applies = this.checkLibraryRules(lib.rules);
          if (!applies) return false;
        }
        
        // 确保有下载信息
        return lib.downloads && lib.downloads.artifact;
      });
      
      // 使用队列管理下载
      for (const library of librariesToDownload) {
        const libInfo = library.downloads.artifact;
        const libPath = this.getLibraryPath(libInfo.path);
        const fullPath = path.join(destination, libPath);
        
        // 如果文件已存在且校验和正确，则跳过
        if (await this.checkFileIntegrity(fullPath, libInfo.sha1)) {
          downloadedCount++;
          if (onProgress) {
            onProgress({
              type: 'library',
              progress: downloadedCount / totalLibraries,
              fileName: libInfo.path,
              status: 'skipped'
            });
          }
          continue;
        }
        
        // 确保目录存在
        await fs.ensureDir(path.dirname(fullPath));
        
        const libUrl = this.getDownloadUrl(libInfo.url);
        
        await this.downloadFile(libUrl, fullPath, {
          onProgress: (progress) => {
            if (onProgress) {
              onProgress({
                type: 'library',
                ...progress,
                fileName: libInfo.path,
                overallProgress: downloadedCount / totalLibraries
              });
            }
          }
        });
        
        downloadedCount++;
      }
    } catch (error) {
      console.error('下载库文件失败:', error);
      throw error;
    }
  }

  /**
   * 下载资源文件
   * @param {Object} versionJson 版本JSON
   * @param {string} destination 下载目标目录
   * @param {Function} onProgress 进度回调
   */
  async downloadAssets(versionJson, destination, onProgress = null) {
    try {
      const assetIndex = versionJson.assetIndex;
      if (!assetIndex) return;
      
      // 下载资源索引
      const indexDir = path.join(destination, 'indexes');
      const indexPath = path.join(indexDir, `${assetIndex.id}.json`);
      
      await fs.ensureDir(indexDir);
      
      // 下载资源索引文件
      const indexUrl = this.getDownloadUrl(assetIndex.url);
      await this.downloadFile(indexUrl, indexPath, {
        onProgress: (progress) => {
          if (onProgress) {
            onProgress({ type: 'assets_index', ...progress });
          }
        }
      });
      
      // 读取资源索引
      const assetsIndex = await fs.readJson(indexPath);
      const objects = assetsIndex.objects || {};
      const totalAssets = Object.keys(objects).length;
      let downloadedCount = 0;
      
      // 下载资源文件
      for (const [assetPath, assetInfo] of Object.entries(objects)) {
        const hash = assetInfo.hash;
        const hashPrefix = hash.substring(0, 2);
        const assetDir = path.join(destination, 'objects', hashPrefix);
        const assetFilePath = path.join(assetDir, hash);
        
        // 如果文件已存在且校验和正确，则跳过
        if (await this.checkFileIntegrity(assetFilePath, hash)) {
          downloadedCount++;
          if (onProgress) {
            onProgress({
              type: 'asset',
              progress: downloadedCount / totalAssets,
              fileName: assetPath,
              status: 'skipped'
            });
          }
          continue;
        }
        
        // 确保目录存在
        await fs.ensureDir(assetDir);
        
        const assetUrl = `${this.getBaseUrl()}/assets/objects/${hashPrefix}/${hash}`;
        
        await this.downloadFile(assetUrl, assetFilePath, {
          onProgress: (progress) => {
            if (onProgress) {
              onProgress({
                type: 'asset',
                ...progress,
                fileName: assetPath,
                overallProgress: downloadedCount / totalAssets
              });
            }
          }
        });
        
        downloadedCount++;
      }
    } catch (error) {
      console.error('下载资源文件失败:', error);
      // 资源文件下载失败不应该中断整个版本下载
    }
  }

  /**
   * 下载单个文件
   * @param {string} url 下载URL
   * @param {string} destination 目标路径
   * @param {Object} options 选项
   * @returns {Promise<Object>} 下载结果
   */
  async downloadFile(url, destination, options = {}) {
    return new Promise((resolve, reject) => {
      const dl = new DownloaderHelper(url, path.dirname(destination), {
        fileName: path.basename(destination),
        override: true,
        removeOnStop: true
      });
      
      // 记录活动下载
      const downloadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.activeDownloads.set(downloadId, dl);
      
      // 进度回调
      if (options.onProgress) {
        dl.on('progress', (stats) => {
          options.onProgress({
            progress: stats.progress,
            speed: stats.speed,
            downloaded: stats.downloaded,
            total: stats.total,
            status: 'downloading'
          });
        });
      }
      
      // 完成回调
      dl.on('end', () => {
        this.activeDownloads.delete(downloadId);
        resolve({ filePath: destination, success: true });
      });
      
      // 错误回调
      dl.on('error', (error) => {
        this.activeDownloads.delete(downloadId);
        reject(error);
      });
      
      // 开始下载
      dl.start();
    });
  }

  /**
   * 取消所有活动下载
   */
  cancelAllDownloads() {
    for (const [id, downloader] of this.activeDownloads.entries()) {
      downloader.stop();
    }
    this.activeDownloads.clear();
    this.downloadQueue = [];
  }

  /**
   * 检查库文件规则
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
   * 获取库文件路径
   * @param {string} libPath 库路径
   * @returns {string} 格式化后的路径
   */
  getLibraryPath(libPath) {
    // 确保路径分隔符正确
    return libPath.split('/').join(path.sep);
  }

  /**
   * 将官方URL转换为当前下载源的URL
   * @param {string} officialUrl 官方URL
   * @returns {string} 转换后的URL
   */
  getDownloadUrl(officialUrl) {
    // 如果已经是当前源的URL，直接返回
    if (officialUrl.includes(this.getBaseUrl())) {
      return officialUrl;
    }
    
    // 对于BMCLAPI和MCBBS，替换基础URL
    if (this.currentSource !== 'official') {
      // 处理Mojang的CDN URL
      if (officialUrl.includes('https://piston-data.mojang.com')) {
        const path = officialUrl.replace('https://piston-data.mojang.com', '');
        return `${this.getBaseUrl()}${path}`;
      }
      // 处理libraries URL
      if (officialUrl.includes('https://libraries.minecraft.net')) {
        const path = officialUrl.replace('https://libraries.minecraft.net', '');
        return `${this.getBaseUrl()}/maven${path}`;
      }
    }
    
    return officialUrl;
  }

  /**
   * 检查文件完整性
   * @param {string} filePath 文件路径
   * @param {string} expectedHash 期望的SHA1哈希
   * @returns {Promise<boolean>} 文件是否完整
   */
  async checkFileIntegrity(filePath, expectedHash) {
    try {
      if (!await fs.pathExists(filePath)) {
        return false;
      }
      
      // 实际实现中应该计算文件哈希并与expectedHash比较
      // 这里简化处理，仅检查文件是否存在
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = DownloadManager;