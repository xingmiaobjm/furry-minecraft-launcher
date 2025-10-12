const fs = require('fs-extra');
const path = require('path');

class VersionManager {
  constructor(versionsDir, enableIsolation = false) {
    this.versionsDir = versionsDir;
    this.enableIsolation = enableIsolation;
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
      
      // 获取版本隔离的目录信息
      const isolatedDirs = this.enableIsolation ? this.getVersionIsolatedDirs(versionId) : null;
      
      return {
        id: versionId,
        type: versionData.type || 'unknown',
        releaseTime: versionData.releaseTime,
        minecraftArguments: versionData.minecraftArguments || versionData.arguments?.game || [],
        mainClass: versionData.mainClass,
        libraries: fullInfo.libraries,
        assets: versionData.assets,
        downloads: versionData.downloads,
        fullInfo,
        isolatedDirs
      };
    } catch (error) {
      console.error(`获取版本 ${versionId} 信息失败:`, error);
      return null;
    }
  }

  /**
   * 获取版本隔离的目录结构
   * @param {string} versionId 版本ID
   * @returns {Object} 隔离目录信息
   */
  getVersionIsolatedDirs(versionId) {
    const baseDir = path.dirname(this.versionsDir);
    const isolatedDir = path.join(baseDir, 'versions', versionId, '.minecraft');
    
    return {
      root: isolatedDir,
      mods: path.join(isolatedDir, 'mods'),
      resourcepacks: path.join(isolatedDir, 'resourcepacks'),
      saves: path.join(isolatedDir, 'saves'),
      shaderpacks: path.join(isolatedDir, 'shaderpacks'),
      config: path.join(isolatedDir, 'config'),
      logs: path.join(isolatedDir, 'logs'),
      screenshots: path.join(isolatedDir, 'screenshots')
    };
  }

  /**
   * 确保版本隔离目录存在
   * @param {string} versionId 版本ID
   * @returns {Promise<Object>} 隔离目录信息
   */
  async ensureVersionIsolatedDirs(versionId) {
    if (!this.enableIsolation) {
      return null;
    }
    
    const dirs = this.getVersionIsolatedDirs(versionId);
    
    // 确保所有隔离目录存在
    for (const [key, dirPath] of Object.entries(dirs)) {
      await fs.ensureDir(dirPath);
    }
    
    return dirs;
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
    
    // 如果启用了版本隔离，创建隔离目录
    if (this.enableIsolation) {
      await this.ensureVersionIsolatedDirs(versionId);
    }
    
    return versionPath;
  }

  /**
   * 获取版本的Mod列表
   * @param {string} versionId 版本ID
   * @returns {Promise<Array>} Mod文件列表
   */
  async getVersionMods(versionId) {
    try {
      let modsDir;
      if (this.enableIsolation) {
        const dirs = this.getVersionIsolatedDirs(versionId);
        modsDir = dirs.mods;
      } else {
        modsDir = path.join(path.dirname(this.versionsDir), 'mods');
      }
      
      if (!await fs.pathExists(modsDir)) {
        return [];
      }
      
      const files = await fs.readdir(modsDir);
      const jarFiles = files.filter(file => file.endsWith('.jar'));
      
      // 使用Promise.all确保所有异步操作完成
      const modInfoList = await Promise.all(
        jarFiles.map(async file => {
          const filePath = path.join(modsDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size
          };
        })
      );
      
      return modInfoList;
    } catch (error) {
      console.error(`获取版本 ${versionId} 的Mod列表失败:`, error);
      return [];
    }
  }

  /**
   * 获取版本的资源包列表
   * @param {string} versionId 版本ID
   * @returns {Promise<Array>} 资源包文件列表
   */
  async getVersionResourcePacks(versionId) {
    try {
      let resourcepacksDir;
      if (this.enableIsolation) {
        const dirs = this.getVersionIsolatedDirs(versionId);
        resourcepacksDir = dirs.resourcepacks;
      } else {
        resourcepacksDir = path.join(path.dirname(this.versionsDir), 'resourcepacks');
      }
      
      if (!await fs.pathExists(resourcepacksDir)) {
        return [];
      }
      
      const files = await fs.readdir(resourcepacksDir);
      
      // 使用Promise.all确保所有异步操作完成
      const resourcePackInfoList = await Promise.all(
        files.map(async file => {
          const filePath = path.join(resourcepacksDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            isDirectory: stats.isDirectory()
          };
        })
      );
      
      return resourcePackInfoList;
    } catch (error) {
      console.error(`获取版本 ${versionId} 的资源包列表失败:`, error);
      return [];
    }
  }

  /**
   * 检查版本是否已安装指定的Mod加载器
   * @param {string} versionId 版本ID
   * @param {string} loaderType 加载器类型 (forge/fabric/quilt)
   * @returns {Promise<boolean>} 是否已安装
   */
  async hasModLoader(versionId, loaderType) {
    try {
      const mods = await this.getVersionMods(versionId);
      const loaderMods = mods.filter(mod => {
        const lowerName = mod.name.toLowerCase();
        switch (loaderType.toLowerCase()) {
          case 'forge':
            return lowerName.includes('forge') && lowerName.includes('universal');
          case 'fabric':
            return lowerName.includes('fabric-loader');
          case 'quilt':
            return lowerName.includes('quilt-loader');
          default:
            return false;
        }
      });
      return loaderMods.length > 0;
    } catch (error) {
      console.error(`检查版本 ${versionId} 的Mod加载器失败:`, error);
      return false;
    }
  }
};


module.exports = VersionManager;