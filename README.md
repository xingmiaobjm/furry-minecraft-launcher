# Furry Minecraft Launcher

# 注意，本仓库内的资产尚未开发完全，请勿使用！

一款新一代跨平台Minecraft启动器。由Furry开发，具有Furry风格的界面设计，及极简设计语言。
<<<<<<< HEAD
=======

本项目主体分为两个部分：
1. 启动器（Furry Minecraft Launcher）为客户端启动器
2. 服务器（Furry Minecraft Server）为P2P服务器，用于多人游戏房间的数据交换，链接客户端启动器与游戏房间。可第三方部署
>>>>>>> 9f797c5bff6371242f00854a76799160e9079f9e

## 特点

- 🎮 支持多版本Minecraft游戏启动
- 📥 内置游戏版本下载功能（支持多个下载源）
- 📦 迭代式错误分析
- 🌐 多人游戏房间系统，基于P2P（furry minecraft online联机）
- 🎨 可自定义极简主义界面
- 💾 完全本地化
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

## 技术栈

- Electron - 跨平台桌面应用框架
- Node.js - JavaScript运行时
- HTML/CSS/JavaScript - 前端界面

## 许可证

<<<<<<< HEAD
基于MIT（见[license](license)）
=======
基于MIT（见[license](license)）
>>>>>>> 9f797c5bff6371242f00854a76799160e9079f9e
