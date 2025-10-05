const fs = require('fs-extra');
const path = require('path');

class VersionManager {
  constructor(versionsDir) {
    this.versionsDir = versionsDir;
    // 确保版本目录存在
    fs.ensureDirSync(this.versionsDir);
  }

  /**
   * 获取所有已安装的游戏版本
   * @returns {Promise<Array>} 版本信息列表
   */
  async getInstalledVersions() {
    try {
      const versionFolders = await fs.readdir(this.versionsDir);
      const versions = [];

      for (const folder of versionFolders) {
        const versionPath = path.join(this.versionsDir, folder);
        const stats = await fs.stat(versionPath);

        if (stats.isDirectory()) {
          const jsonPath = path.join(versionPath, `${folder}.json`);
          const jarPath = path.join(versionPath, `${folder}.jar`);

          if (await fs.pathExists(jsonPath) && await fs.pathExists(jarPath)) {
            try {
              const versionData = await fs.readJson(jsonPath);
              versions.push({
                id: folder,
                type: versionData.type || 'unknown',
                releaseTime: versionData.releaseTime,
                jsonPath,
                jarPath
              });
            } catch (error) {
              console.error(`解析版本 ${folder} 的JSON文件失败:`, error);
            }
          }
        }
      }

      // 按发布时间降序排序（最新版本在前）
      return versions.sort((a, b) => {
        return new Date(b.releaseTime) - new Date(a.releaseTime);
      });
    } catch (error) {
      console.error('获取已安装版本失败:', error);
      return [];
    }
  }

  /**
   * 检查特定版本是否已安装
   * @param {string} versionId 版本ID
   * @returns {Promise<boolean>} 是否已安装
   */
  async isVersionInstalled(versionId) {
    const versionPath = path.join(this.versionsDir, versionId);
    const jsonPath = path.join(versionPath, `${versionId}.json`);
    const jarPath = path.join(versionPath, `${versionId}.jar`);

    return await fs.pathExists(jsonPath) && await fs.pathExists(jarPath);
  }

  /**
   * 获取版本的详细信息
   * @param {string} versionId 版本ID
   * @returns {Promise<Object|null>} 版本详细信息
   */
  async getVersionInfo(versionId) {
    try {
      const jsonPath = path.join(this.versionsDir, versionId, `${versionId}.json`);
      
      if (!await fs.pathExists(jsonPath)) {
        return null;
      }

      const versionData = await fs.readJson(jsonPath);
      
      // 解析完整的版本信息，包括依赖链
      const fullInfo = await this.resolveVersionDependencies(versionData);
      
      return {
        id: versionId,
        type: versionData.type || 'unknown',
        releaseTime: versionData.releaseTime,
        minecraftArguments: versionData.minecraftArguments || versionData.arguments?.game || [],
        mainClass: versionData.mainClass,
        libraries: fullInfo.libraries,
        assets: versionData.assets,
        downloads: versionData.downloads,
        fullInfo
      };
    } catch (error) {
      console.error(`获取版本 ${versionId} 信息失败:`, error);
      return null;
    }
  }

  /**
   * 解析版本的依赖链
   * @param {Object} versionData 版本数据
   * @returns {Promise<Object>} 解析后的完整版本信息
   */
  async resolveVersionDependencies(versionData) {
    let libraries = versionData.libraries || [];
    let assetIndex = versionData.assetIndex;
    let mainClass = versionData.mainClass;
    let minecraftArguments = versionData.minecraftArguments || versionData.arguments;
    
    // 如果有继承的版本，递归解析依赖
    if (versionData.inheritsFrom) {
      const parentInfo = await this.getVersionInfo(versionData.inheritsFrom);
      if (parentInfo && parentInfo.fullInfo) {
        // 合并库文件（子版本优先）
        const parentLibs = parentInfo.fullInfo.libraries || [];
        const parentLibNames = parentLibs.map(lib => lib.name);
        
        libraries = [...libraries, ...parentLibs.filter(lib => {
          return !libraries.some(l => l.name === lib.name);
        })];
        
        // 使用父版本的资源索引（如果子版本没有指定）
        if (!assetIndex && parentInfo.fullInfo.assetIndex) {
          assetIndex = parentInfo.fullInfo.assetIndex;
        }
        
        // 使用父版本的主类（如果子版本没有指定）
        if (!mainClass && parentInfo.fullInfo.mainClass) {
          mainClass = parentInfo.fullInfo.mainClass;
        }
        
        // 使用父版本的参数（如果子版本没有指定）
        if (!minecraftArguments && parentInfo.fullInfo.minecraftArguments) {
          minecraftArguments = parentInfo.fullInfo.minecraftArguments;
        }
      }
    }
    
    return {
      libraries,
      assetIndex,
      mainClass,
      minecraftArguments
    };
  }

  /**
   * 卸载指定版本
   * @param {string} versionId 版本ID
   * @returns {Promise<boolean>} 是否卸载成功
   */
  async uninstallVersion(versionId) {
    try {
      const versionPath = path.join(this.versionsDir, versionId);
      
      if (!await fs.pathExists(versionPath)) {
        return false;
      }
      
      await fs.remove(versionPath);
      return true;
    } catch (error) {
      console.error(`卸载版本 ${versionId} 失败:`, error);
      return false;
    }
  }

  /**
   * 创建空的版本文件夹结构（用于下载新版本）
   * @param {string} versionId 版本ID
   * @returns {Promise<string>} 版本文件夹路径
   */
  async createVersionDirectory(versionId) {
    const versionPath = path.join(this.versionsDir, versionId);
    await fs.ensureDir(versionPath);
    return versionPath;
  }
};

module.exports = VersionManager;