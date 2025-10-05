# Furry Minecraft Launcher

一个支持三端（Windows、macOS、Linux）的Minecraft启动器，带有Furry风格的界面设计。

## 特点

- 🎮 支持多版本Minecraft游戏启动
- 📥 内置游戏版本下载功能（支持多个下载源）
- 🌐 P2P多人游戏房间系统
- 🎨 可自定义的Furry风格界面
- 💾 完全支持离网使用
- 🖥️ 跨平台支持（Windows、macOS、Linux）

## 安装

### 从源码构建

1. 确保已安装Node.js和npm
2. 克隆仓库并安装依赖

```bash
npm install
```

3. 启动开发版本

```bash
npm start
```

4. 构建发布版本

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 离网使用说明

本启动器完全支持离网使用：

1. 所有图标资源都存储在本地`icons`文件夹中，可自行更改
2. 游戏文件下载后会缓存在本地，之后无需网络即可启动
3. 设置和配置都保存在本地文件系统中

## 图标资源

如需修改请将以下图标文件放入`icons`文件夹中：

- `icon.ico` - Windows应用图标
- `icon.icns` - macOS应用图标
- `icon.png` - Linux应用图标和其他通用图标

## 技术栈

- Electron - 跨平台桌面应用框架
- Node.js - JavaScript运行时
- HTML/CSS/JavaScript - 前端界面

## 许可证

基于MIT
版权所有 （C） 2025 星眇
特此免费授予获得本软件和相关文档文件（“furry minecraft launcher”）副本的任何人不受限制地处理本软件的许可，包括但不限于使用、复制、修改、合并、发布、分发、再许可和/或出售本软件副本的权利，并允许获得本软件的人这样做， 须符合以下条件：

上述版权声明和本许可声明应包含在本软件的所有副本或大部分内容中。

如参考本软件部分内容，请在您的软件的任意一个地方（用户可见）鸣谢“星眇”

您的参考程度分为两个等级：
1. 仅引用本软件的部分代码或部分名称，
2. 引用本软件的全部内容，例如“本软件基于furry minecraft launcher开发，具体代码可在[GitHub仓库](https://github.com/yourusername/furry-minecraft-launcher)查看”。

本软件按“原样”提供，不作任何明示或暗示的保证，包括但不限于适销性、特定用途适用性和不侵权的保证。在任何情况下，作者或版权所有者均不对因本软件或使用本软件或其他交易而引起、由之或与之相关的任何索赔、损害或其他责任承担责任，无论是在合同诉讼、侵权行为还是其他诉讼中。[1]