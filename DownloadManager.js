const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');

class DownloadManager {
  constructor() {
    this.downloadSource = 'official';
    this.downloadSources = {
      official: {
        baseUrl: 'https://piston-meta.mojang.com',
        assetBaseUrl: 'https://resources.download.minecraft.net',
        libraryBaseUrl: 'https://libraries.minecraft.net'
      },
      mcbbs: {
        baseUrl: 'https://bmclapi2.bangbang93.com',
        assetBaseUrl: 'https://bmclapi2.bangbang93.com/assets',
        libraryBaseUrl: 'https://bmclapi2.bangbang93.com/libraries'
      },
      mojang: {
        baseUrl: 'https://piston-meta.mojang.com',
        assetBaseUrl: 'https://resources.download.minecraft.net',
        libraryBaseUrl: 'https://libraries.minecraft.net'
      }
    };
    this.currentSource = this.downloadSources.official;
    this.activeDownloads = new Map();
  }

  // 设置下载源
  setDownloadSource(source) {
    if (this.downloadSources[source]) {
      this.downloadSource = source;
      this.currentSource = this.downloadSources[source];
      console.log(`设置下载源为: ${source}`);
    } else {
      console.warn(`无效的下载源: ${source}，使用默认源`);
    }
  }

  // 获取版本清单
  async getVersionManifest() {
    try {
      const manifestUrl = `${this.currentSource.baseUrl}/mc/game/version_manifest.json`;
      console.log(`获取版本清单: ${manifestUrl}`);
      
      const response = await axios.get(manifestUrl, {
        timeout: 30000,
        httpsAgent: new https.Agent({ keepAlive: true })
      });
      
      return response.data.versions || [];
    } catch (error) {
      console.error('获取版本清单失败:', error.message);
      throw new Error(`获取版本清单失败: ${error.message}`);
    }
  }

  // 下载游戏版本
  async downloadVersion(versionId, targetDir, progressCallback) {
    try {
      // 确保目标目录存在
      await fs.mkdir(targetDir, { recursive: true });
      
      // 获取版本详情
      const versionInfo = await this.getVersionInfo(versionId);
      
      // 保存版本json文件
      const versionJsonPath = path.join(targetDir, `${versionId}.json`);
      await fs.writeFile(versionJsonPath, JSON.stringify(versionInfo, null, 2));
      
      // 下载客户端jar
      if (versionInfo.downloads && versionInfo.downloads.client) {
        const clientUrl = versionInfo.downloads.client.url;
        const clientPath = path.join(targetDir, `${versionId}.jar`);
        
        await this.downloadFile(clientUrl, clientPath, (progress) => {
          progressCallback && progressCallback({ 
            type: 'client', 
            progress: progress * 0.5 // 客户端占50%
          });
        });
      }
      
      // 下载库文件
      const librariesDir = path.join(path.dirname(targetDir), 'libraries');
      await fs.mkdir(librariesDir, { recursive: true });
      
      if (versionInfo.libraries && Array.isArray(versionInfo.libraries)) {
        const totalLibraries = versionInfo.libraries.length;
        let completedLibraries = 0;
        
        // 并行下载库文件，但限制并发数
        const maxConcurrent = 3;
        const libraryChunks = [];
        
        for (let i = 0; i < totalLibraries; i += maxConcurrent) {
          libraryChunks.push(versionInfo.libraries.slice(i, i + maxConcurrent));
        }
        
        for (const chunk of libraryChunks) {
          await Promise.all(chunk.map(async (library) => {
            try {
              // 检查库是否需要下载（跳过原生库或不兼容的库）
              if (!this.shouldDownloadLibrary(library)) {
                completedLibraries++;
                progressCallback && progressCallback({ 
                  type: 'libraries', 
                  progress: 0.5 + (completedLibraries / totalLibraries) * 0.3 // 库文件占30%
                });
                return;
              }
              
              const libraryUrl = this.getLibraryUrl(library);
              const libraryPath = this.getLibraryPath(library, librariesDir);
              
              await this.downloadFile(libraryUrl, libraryPath);
              
              completedLibraries++;
              progressCallback && progressCallback({ 
                type: 'libraries', 
                progress: 0.5 + (completedLibraries / totalLibraries) * 0.3
              });
            } catch (err) {
              console.warn(`下载库失败: ${library.name}`, err.message);
              // 继续下载其他库，不中断整个过程
              completedLibraries++;
            }
          }));
        }
      }
      
      // 下载资源文件
      await this.downloadAssets(versionInfo, path.join(path.dirname(targetDir), 'assets'), (progress) => {
        progressCallback && progressCallback({ 
          type: 'assets', 
          progress: 0.8 + progress * 0.2 // 资源文件占20%
        });
      });
      
      return { success: true, message: '版本下载完成' };
    } catch (error) {
      console.error('下载版本失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  // 获取版本详情
  async getVersionInfo(versionId) {
    try {
      const manifest = await this.getVersionManifest();
      const version = manifest.find(v => v.id === versionId);
      
      if (!version) {
        throw new Error(`版本 ${versionId} 不存在`);
      }
      
      // 获取版本详情
      const response = await axios.get(version.url, {
        timeout: 30000
      });
      
      return response.data;
    } catch (error) {
      console.error('获取版本详情失败:', error.message);
      throw error;
    }
  }

  // 下载文件
  async downloadFile(url, filePath, progressCallback) {
    return new Promise((resolve, reject) => {
      const fileDir = path.dirname(filePath);
      fs.mkdir(fileDir, { recursive: true }).then(() => {
        const fileStream = fs.createWriteStream(filePath);
        
        // 替换URL为当前下载源的URL
        const adjustedUrl = this.adjustUrlForSource(url);
        
        const protocol = adjustedUrl.startsWith('https') ? https : http;
        
        const request = protocol.get(adjustedUrl, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`下载失败: ${response.statusCode}`));
            return;
          }
          
          const totalLength = parseInt(response.headers['content-length'], 10);
          let downloadedLength = 0;
          
          response.on('data', (chunk) => {
            downloadedLength += chunk.length;
            fileStream.write(chunk);
            
            if (totalLength && progressCallback) {
              const progress = downloadedLength / totalLength;
              progressCallback(progress);
            }
          });
          
          response.on('end', () => {
            fileStream.end();
            resolve();
          });
        });
        
        request.on('error', (error) => {
          fileStream.close();
          fs.unlink(filePath).catch(() => {});
          reject(error);
        });
        
        request.setTimeout(60000, () => {
          request.abort();
          reject(new Error('下载超时'));
        });
      }).catch(reject);
    });
  }

  // 调整URL为当前下载源的URL
  adjustUrlForSource(url) {
    if (url.includes('libraries.minecraft.net')) {
      return url.replace('https://libraries.minecraft.net', this.currentSource.libraryBaseUrl);
    } else if (url.includes('resources.download.minecraft.net')) {
      return url.replace('https://resources.download.minecraft.net', this.currentSource.assetBaseUrl);
    }
    // 对于客户端jar文件，可能需要特殊处理
    return url;
  }

  // 检查库是否需要下载
  shouldDownloadLibrary(library) {
    // 跳过有规则且不匹配当前系统的库
    if (library.rules) {
      const applies = library.rules.some(rule => {
        if (rule.action === 'allow') {
          if (rule.os && rule.os.name !== os.platform()) {
            return false;
          }
          return true;
        } else if (rule.action === 'disallow') {
          if (rule.os && rule.os.name === os.platform()) {
            return true; // 不允许
          }
        }
        return false;
      });
      if (!applies) {
        return false;
      }
    }
    
    // 只下载客户端需要的库
    return !library.downloads || library.downloads.artifact;
  }

  // 获取库文件的下载URL
  getLibraryUrl(library) {
    if (library.downloads && library.downloads.artifact) {
      return library.downloads.artifact.url;
    }
    
    // 构建默认的库URL
    const parts = library.name.split(':');
    const groupId = parts[0].replace(/\./g, '/');
    const artifactId = parts[1];
    const version = parts[2];
    
    return `${this.currentSource.libraryBaseUrl}/${groupId}/${artifactId}/${version}/${artifactId}-${version}.jar`;
  }

  // 获取库文件的本地路径
  getLibraryPath(library, librariesDir) {
    const parts = library.name.split(':');
    const groupId = parts[0].replace(/\./g, '/');
    const artifactId = parts[1];
    const version = parts[2];
    
    const fileName = library.downloads && library.downloads.artifact ? 
      path.basename(library.downloads.artifact.path) : 
      `${artifactId}-${version}.jar`;
    
    return path.join(librariesDir, groupId, artifactId, version, fileName);
  }

  // 下载资源文件
  async downloadAssets(versionInfo, assetsDir, progressCallback) {
    try {
      if (!versionInfo.assetIndex) {
        console.log('没有资源索引，跳过资源下载');
        progressCallback && progressCallback(1);
        return;
      }
      
      const objectsDir = path.join(assetsDir, 'objects');
      await fs.mkdir(objectsDir, { recursive: true });
      
      // 下载资源索引
      const assetIndexUrl = versionInfo.assetIndex.url;
      const assetIndexPath = path.join(assetsDir, 'indexes', `${versionInfo.assetIndex.id}.json`);
      await fs.mkdir(path.dirname(assetIndexPath), { recursive: true });
      
      await this.downloadFile(assetIndexUrl, assetIndexPath);
      
      // 读取资源索引
      const assetIndexContent = await fs.readFile(assetIndexPath, 'utf8');
      const assetIndex = JSON.parse(assetIndexContent);
      
      // 下载资源文件
      const objects = assetIndex.objects || {};
      const objectKeys = Object.keys(objects);
      const totalObjects = objectKeys.length;
      
      if (totalObjects === 0) {
        progressCallback && progressCallback(1);
        return;
      }
      
      let completedObjects = 0;
      const maxConcurrent = 5;
      const objectChunks = [];
      
      for (let i = 0; i < totalObjects; i += maxConcurrent) {
        objectChunks.push(objectKeys.slice(i, i + maxConcurrent));
      }
      
      for (const chunk of objectChunks) {
        await Promise.all(chunk.map(async (objectKey) => {
          try {
            const object = objects[objectKey];
            const hash = object.hash;
            const hashPrefix = hash.substring(0, 2);
            const objectPath = path.join(objectsDir, hashPrefix, hash);
            
            // 检查文件是否已存在
            try {
              await fs.access(objectPath);
              // 文件已存在，跳过
              completedObjects++;
              progressCallback && progressCallback(completedObjects / totalObjects);
              return;
            } catch {
              // 文件不存在，下载
            }
            
            const objectUrl = `${this.currentSource.assetBaseUrl}/${hashPrefix}/${hash}`;
            await fs.mkdir(path.dirname(objectPath), { recursive: true });
            await this.downloadFile(objectUrl, objectPath);
            
            completedObjects++;
            progressCallback && progressCallback(completedObjects / totalObjects);
          } catch (err) {
            console.warn(`下载资源失败: ${objectKey}`, err.message);
            completedObjects++;
          }
        }));
      }
    } catch (error) {
      console.error('下载资源失败:', error.message);
      throw error;
    }
  }

  // 取消下载
  cancelDownload(downloadId) {
    if (this.activeDownloads.has(downloadId)) {
      const download = this.activeDownloads.get(downloadId);
      if (download && download.abort) {
        download.abort();
      }
      this.activeDownloads.delete(downloadId);
      return true;
    }
    return false;
  }

  // 获取下载统计信息
  getDownloadStats() {
    return {
      activeDownloads: this.activeDownloads.size,
      downloadSource: this.downloadSource
    };
  }
}

module.exports = DownloadManager;