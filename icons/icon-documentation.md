# Furry Minecraft Launcher 图标文件引用文档

## 图标文件列表

| 文件名 | 路径 | 格式 | 用途 |
|-------|------|------|------|
| icon.svg | icons/icon.svg | SVG | 应用主图标，用于窗口标题栏和任务栏 |
| icon.ico | icons/icon.ico | ICO | Windows平台应用图标（待创建） |
| icon.icns | icons/icon.icns | ICNS | macOS平台应用图标（待创建） |
| icon.png | icons/icon.png | PNG | Linux平台和其他通用场景图标（待创建） |

## 图标规范

### 文件格式要求
- **SVG格式**：矢量图格式，用于缩放和多分辨率适配
- **ICO格式**：Windows专用图标格式，包含多种尺寸（16x16, 32x32, 48x48, 256x256, 512x512）
- **ICNS格式**：macOS专用图标格式
- **PNG格式**：透明背景位图，建议分辨率至少512x512

### 设计规范
- 图标设计结合了Furry元素（耳朵、面部特征）和Minecraft元素（草方块）
- 主色调：绿色（#7CFC00）、蓝色（#87CEEB）、棕色（#8B4513）
- 背景透明，避免使用纯色背景
- 线条清晰，保证在小尺寸下仍可辨识

## 引用方式

### 在代码中引用

#### 1. 主进程引用（main.js）
```javascript
const path = require('path');

// 设置窗口图标
const iconPath = path.join(__dirname, 'icons', 'icon.ico'); // Windows
// const iconPath = path.join(__dirname, 'icons', 'icon.icns'); // macOS
// const iconPath = path.join(__dirname, 'icons', 'icon.png'); // Linux

const mainWindow = new BrowserWindow({
  icon: iconPath,
  // 其他窗口配置...
});
```

#### 2. 打包配置引用（package.json）
```json
{
  "build": {
    "win": {
      "icon": "icons/icon.ico"
    },
    "mac": {
      "icon": "icons/icon.icns"
    },
    "linux": {
      "icon": "icons/icon.png"
    }
  }
}
```

#### 3. HTML中引用SVG图标
```html
<img src="../icons/icon.svg" alt="Furry Minecraft Launcher Logo" width="64" height="64">

<!-- 或者直接内联使用SVG代码 -->
```

## 图标生成指南

### 从SVG生成其他格式

#### 生成ICO文件
1. 使用在线工具如 [ICO Convert](https://icoconvert.com/) 或 [Convertio](https://convertio.co/zh/svg-ico/)
2. 选择多种尺寸：16x16, 32x32, 48x48, 256x256, 512x512
3. 保存为 `icons/icon.ico`

#### 生成ICNS文件
1. 在macOS上使用 `iconutil` 命令行工具
2. 或者使用在线转换工具如 [CloudConvert](https://cloudconvert.com/svg-to-icns)
3. 保存为 `icons/icon.icns`

#### 生成PNG文件
1. 使用SVG编辑器（如Inkscape）导出为PNG
2. 分辨率建议：512x512
3. 保存为 `icons/icon.png`

## 注意事项

1. **离网可用性**：所有图标文件必须存放在 `icons/` 目录下，确保软件在无网络环境下也能正常显示
2. **版本控制**：图标文件属于静态资源，应提交到版本控制系统
3. **版权声明**：图标设计遵循项目的MIT许可证
4. **更新流程**：更新图标时，需要同时更新所有格式的文件，保持一致性

## 兼容性

- Windows 7/8/10/11：使用ICO格式
- macOS：使用ICNS格式
- Linux：使用PNG格式
- Web界面：使用SVG格式以获得最佳显示效果

---

本文档最后更新时间：2024年10月