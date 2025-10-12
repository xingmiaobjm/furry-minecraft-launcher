// P2P服务器启动脚本
// 用于同时启动中央服务器和第三方服务器

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// 获取平台相关的命令和分隔符
const isWindows = os.platform() === 'win32';
const cmd = isWindows ? 'cmd' : 'bash';
const cmdArgs = isWindows ? ['/c'] : ['-c'];

// 服务器目录 (更新后的路径，适应新的目录结构)
const centralServerDir = path.join(__dirname, 'server', 'p2p-central-server');
// 注意：第三方服务器有两个位置，优先使用server目录下的版本
let thirdPartyServerDir = path.join(__dirname, 'server', 'p2p-third-party-server');
// 如果server目录下没有第三方服务器，则使用根目录的版本（兼容性处理）
const fs = require('fs');
if (!fs.existsSync(path.join(thirdPartyServerDir, 'server.js'))) {
  thirdPartyServerDir = path.join(__dirname, 'p2p-third-party-server');
}

// 日志颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// 打印带颜色的日志
function logWithColor(text, color = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

// 启动服务器函数
function startServer(serverName, serverDir, startCommand) {
  return new Promise((resolve, reject) => {
    logWithColor(`\n=== 正在启动 ${serverName} ===`, 'cyan');
    
    // 在新终端中启动服务器
    const terminalCmd = isWindows 
      ? `start cmd.exe /k "cd /d ${serverDir} && ${startCommand}"`
      : `xterm -e "cd ${serverDir} && ${startCommand}"`;
    
    const serverProcess = spawn(cmd, [...cmdArgs, terminalCmd]);
    
    // 捕获错误
    serverProcess.on('error', (err) => {
      logWithColor(`启动 ${serverName} 时出错: ${err.message}`, 'red');
      reject(err);
    });
    
    // 等待一段时间，假设服务器启动
    setTimeout(() => {
      logWithColor(`${serverName} 已启动（假设）`, 'green');
      resolve();
    }, 3000);
  });
}

// 使用node直接启动服务器（备选方案）
function startServerDirectly(serverName, serverDir, startCommand) {
  return new Promise((resolve, reject) => {
    logWithColor(`\n=== 正在直接启动 ${serverName} ===`, 'cyan');
    
    // 分割命令
    const [cmdName, ...cmdParams] = startCommand.split(' ');
    
    // 启动服务器进程
    const serverProcess = spawn(cmdName, cmdParams, {
      cwd: serverDir,
      stdio: 'inherit' // 共享标准输入输出
    });
    
    // 监听服务器进程退出
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        logWithColor(`${serverName} 进程退出，退出码: ${code}`, 'red');
      }
    });
    
    // 监听错误
    serverProcess.on('error', (err) => {
      logWithColor(`启动 ${serverName} 时出错: ${err.message}`, 'red');
      reject(err);
    });
    
    // 等待一段时间，假设服务器启动
    setTimeout(() => {
      logWithColor(`${serverName} 已启动`, 'green');
      resolve(serverProcess);
    }, 3000);
  });
}

// 主函数
async function startAllServers() {
  try {
    logWithColor('=== P2P服务器启动脚本 ===', 'magenta');
    logWithColor('此脚本将启动中央服务器和第三方服务器', 'yellow');
    
    // 使用直接方式启动服务器（更可靠）
    // 注意：这里我们使用Promise.all来并行启动，但实际上这样会导致输出混在一起
    // 在实际使用时，你可能想要按顺序启动并在不同的终端中查看
    
    // 启动中央服务器
    const centralServerProcess = await startServerDirectly(
      '中央服务器 (p2p-central-server)', 
      centralServerDir, 
      'node server.js'
    );
    
    // 等待一点时间再启动第三方服务器
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 启动第三方服务器
    const thirdPartyServerProcess = await startServerDirectly(
      '第三方服务器 (p2p-third-party-server)', 
      thirdPartyServerDir, 
      'node server.js'
    );
    
    logWithColor('\n=== 所有服务器启动完成 ===', 'green');
    logWithColor('中央服务器地址: http://localhost:3000', 'blue');
    logWithColor('第三方服务器地址: http://localhost:3001', 'blue');
    logWithColor('管理面板: http://localhost:3000/admin-panel.html', 'blue');
    
    // 监听进程信号，优雅关闭服务器
    process.on('SIGINT', () => {
      logWithColor('\n=== 正在关闭服务器 ===', 'yellow');
      centralServerProcess.kill('SIGINT');
      thirdPartyServerProcess.kill('SIGINT');
      process.exit(0);
    });
    
  } catch (error) {
    logWithColor(`启动过程中发生错误: ${error.message}`, 'red');
    process.exit(1);
  }
}

// 启动脚本
if (require.main === module) {
  startAllServers();
} else {
  // 如果作为模块导入，导出启动函数
  module.exports = { startAllServers };
}