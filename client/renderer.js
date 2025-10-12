// 渲染进程主脚本

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化应用
    await initializeApp();
    
    // 设置导航
    setupNavigation();
    
    // 初始化仪表盘
    await initializeDashboard();
    
    // 设置快速启动事件
    setupQuickLaunch();
    
    // 设置通知系统
    setupNotificationSystem();
    
    // 通知主进程渲染器已准备就绪
    window.electronAPI.rendererReady();
});

// 应用初始化
async function initializeApp() {
    try {
        // 获取系统信息
        const systemInfo = await window.electronAPI.system.getInfo();
        console.log('系统信息:', systemInfo);
        
        // 加载账户信息
        await loadAccountInfo();
        
        // 加载已安装的版本
        await loadInstalledVersions();
        
        // 加载Java路径
        await loadJavaPaths();
        
        // 初始化资源使用图表
        initResourceChart();
    } catch (error) {
        showError('应用初始化失败', error.message);
    }
}

// 加载账户信息
async function loadAccountInfo() {
    try {
        const currentAccount = await window.electronAPI.account.getCurrent();
        if (currentAccount) {
            document.getElementById('username').textContent = currentAccount.username;
            // 设置头像
            const avatarUrl = `https://api.dicebear.com/7.x/micah/svg?seed=${currentAccount.username}`;
            document.getElementById('avatar').src = avatarUrl;
        } else {
            document.getElementById('username').textContent = '未登录';
        }
    } catch (error) {
        console.error('加载账户信息失败:', error);
    }
}

// 加载已安装的版本
async function loadInstalledVersions() {
    try {
        const versions = await window.electronAPI.version.getInstalled();
        const versionCount = document.getElementById('installed-versions-count');
        const versionSelect = document.getElementById('quick-version-select');
        
        versionCount.textContent = versions.length;
        
        // 清空现有选项
        versionSelect.innerHTML = '';
        
        if (versions.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '请先下载或安装版本';
            versionSelect.appendChild(option);
        } else {
            versions.forEach(version => {
                const option = document.createElement('option');
                option.value = version.id;
                option.textContent = version.name || version.id;
                versionSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('加载已安装版本失败:', error);
    }
}

// 加载Java路径
async function loadJavaPaths() {
    try {
        const javaPaths = await window.electronAPI.system.getJavaPaths();
        const javaSelect = document.getElementById('quick-java-select');
        
        // 添加自动选择选项
        const autoOption = document.createElement('option');
        autoOption.value = '';
        autoOption.textContent = '自动选择';
        javaSelect.appendChild(autoOption);
        
        // 添加检测到的Java路径
        javaPaths.forEach((javaPath, index) => {
            const option = document.createElement('option');
            option.value = javaPath.path;
            option.textContent = `${javaPath.version} (${javaPath.arch})`;
            javaSelect.appendChild(option);
        });
    } catch (error) {
        console.error('加载Java路径失败:', error);
    }
}

// 设置导航
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 更新活动链接样式
            navLinks.forEach(l => l.classList.remove('bg-primary/20', 'text-primary'));
            e.currentTarget.classList.add('bg-primary/20', 'text-primary');
            
            // 获取目标ID
            const targetId = e.currentTarget.getAttribute('href').substring(1);
            
            // 加载对应的页面
            loadPage(targetId);
        });
    });
}

// 加载页面内容
async function loadPage(pageId) {
    try {
        showLoading('正在加载页面...');
        
        // 根据页面ID加载不同内容
        switch (pageId) {
            case 'dashboard':
                await initializeDashboard();
                break;
            case 'versions':
                await initializeVersionsPage();
                break;
            case 'mods':
                await initializeModsPage();
                break;
            case 'resource-packs':
                await initializeResourcePacksPage();
                break;
            case 'p2p':
                await initializeP2PPage();
                break;
            case 'settings':
                await initializeSettingsPage();
                break;
            default:
                await initializeDashboard();
        }
    } catch (error) {
        showError('页面加载失败', error.message);
    } finally {
        hideLoading();
    }
}

// 初始化仪表盘
async function initializeDashboard() {
    // 这里可以添加仪表盘特定的初始化逻辑
    console.log('初始化仪表盘');
    
    // 更新统计信息
    updateDashboardStats();
}

// 更新仪表盘统计信息
async function updateDashboardStats() {
    try {
        // 获取已安装版本数
        const versions = await window.electronAPI.version.getInstalled();
        document.getElementById('installed-versions-count').textContent = versions.length;
        
        // 获取游戏时长（模拟数据）
        document.getElementById('play-time').textContent = '0h 0m';
        
        // 获取存储空间使用情况（模拟数据）
        document.getElementById('storage-usage').textContent = '0 GB';
        
        // 获取模组数量（模拟数据）
        document.getElementById('mods-count').textContent = '0';
    } catch (error) {
        console.error('更新仪表盘统计失败:', error);
    }
}

// 设置快速启动
function setupQuickLaunch() {
    const launchBtn = document.getElementById('quick-launch-btn');
    
    launchBtn.addEventListener('click', async () => {
        const versionId = document.getElementById('quick-version-select').value;
        const javaPath = document.getElementById('quick-java-select').value;
        
        if (!versionId) {
            showNotification('错误', '请选择一个游戏版本', 'error');
            return;
        }
        
        try {
            showLoading('正在启动游戏...');
            
            // 准备启动选项
            const launchOptions = {
                versionId,
                javaPath: javaPath || undefined,
                memory: 4096, // 默认4GB内存
                // 可以从设置中获取更多选项
            };
            
            // 启动游戏
            await window.electronAPI.game.launch(launchOptions);
            showNotification('成功', '游戏已开始启动', 'success');
        } catch (error) {
            showError('启动失败', error.message);
        } finally {
            hideLoading();
        }
    });
}

// 初始化资源使用图表
function initResourceChart() {
    const ctx = document.getElementById('resource-chart').getContext('2d');
    
    // 创建图表
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 30}, (_, i) => i),
            datasets: [
                {
                    label: 'CPU 使用率',
                    data: Array.from({length: 30}, () => Math.random() * 100),
                    borderColor: '#7289DA',
                    backgroundColor: 'rgba(114, 137, 218, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '内存 使用率',
                    data: Array.from({length: 30}, () => Math.random() * 100),
                    borderColor: '#43B581',
                    backgroundColor: 'rgba(67, 181, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#99AAB5'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(44, 47, 51, 0.9)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#99AAB5',
                    borderColor: 'rgba(153, 170, 181, 0.2)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(153, 170, 181, 0.1)'
                    },
                    ticks: {
                        color: '#99AAB5'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(153, 170, 181, 0.1)'
                    },
                    ticks: {
                        color: '#99AAB5',
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });
    
    // 模拟实时更新
    setInterval(() => {
        chart.data.datasets[0].data.shift();
        chart.data.datasets[0].data.push(Math.random() * 100);
        
        chart.data.datasets[1].data.shift();
        chart.data.datasets[1].data.push(Math.random() * 100);
        
        chart.update();
    }, 2000);
}

// 设置通知系统
function setupNotificationSystem() {
    // 监听下载进度
    window.electronAPI.onDownloadProgress((progress) => {
        console.log('下载进度:', progress);
    });
    
    // 监听验证进度
    window.electronAPI.onVerifyProgress((progress) => {
        console.log('验证进度:', progress);
    });
    
    // 监听版本更新
    window.electronAPI.onVersionsUpdated((versions) => {
        console.log('版本已更新:', versions);
        showNotification('更新', '游戏版本列表已更新', 'info');
    });
}

// 初始化版本页面（占位函数）
async function initializeVersionsPage() {
    // 这里将在后续实现
    console.log('初始化版本页面');
}

// 初始化模组页面（占位函数）
async function initializeModsPage() {
    // 这里将在后续实现
    console.log('初始化模组页面');
}

// 初始化资源包页面（占位函数）
async function initializeResourcePacksPage() {
    // 这里将在后续实现
    console.log('初始化资源包页面');
}

// 初始化P2P页面（占位函数）
async function initializeP2PPage() {
    // 这里将在后续实现
    console.log('初始化P2P页面');
    
    // 设置P2P事件监听
    setupP2PEvents();
}

// 设置P2P事件监听
function setupP2PEvents() {
    // 房间创建成功
    window.electronAPI.p2p.on.roomCreated((room) => {
        showNotification('成功', `房间 ${room.name} 已创建`, 'success');
    });
    
    // 玩家加入
    window.electronAPI.p2p.on.playerJoined((player, roomId) => {
        showNotification('玩家加入', `${player.username} 加入了房间`, 'info');
    });
    
    // 玩家离开
    window.electronAPI.p2p.on.playerLeft((player, roomId) => {
        showNotification('玩家离开', `${player.username} 离开了房间`, 'info');
    });
    
    // 房间关闭
    window.electronAPI.p2p.on.roomClosed((roomId, reason) => {
        showNotification('房间关闭', `房间已关闭: ${reason || '未知原因'}`, 'warning');
    });
    
    // 房间消息
    window.electronAPI.p2p.on.roomMessage((message, roomId) => {
        console.log('收到房间消息:', message);
    });
    
    // 错误处理
    window.electronAPI.p2p.on.error((error) => {
        showError('P2P错误', error.message);
    });
}

// 初始化设置页面（占位函数）
async function initializeSettingsPage() {
    // 这里将在后续实现
    console.log('初始化设置页面');
}

// 显示加载指示器
function showLoading(text = '正在加载...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    
    loadingText.textContent = text;
    loadingOverlay.classList.remove('hidden');
}

// 隐藏加载指示器
function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.add('hidden');
}

// 显示通知
function showNotification(title, message, type = 'info') {
    const notificationsContainer = document.getElementById('notifications');
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'bg-dark border border-secondary/20 rounded-lg p-4 shadow-lg transform transition-all duration-300 opacity-0 translate-y-2';
    
    // 设置通知类型样式
    let iconClass = 'fa-info-circle';
    let borderColor = 'border-primary';
    
    switch (type) {
        case 'success':
            iconClass = 'fa-check-circle';
            borderColor = 'border-success';
            break;
        case 'error':
            iconClass = 'fa-exclamation-circle';
            borderColor = 'border-error';
            break;
        case 'warning':
            iconClass = 'fa-exclamation-triangle';
            borderColor = 'border-warning';
            break;
    }
    
    notification.classList.add(borderColor);
    
    // 设置通知内容
    notification.innerHTML = `
        <div class="flex items-start gap-3">
            <i class="fa ${iconClass} text-2xl ${type === 'success' ? 'text-success' : type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-primary'}"></i>
            <div class="flex-1">
                <h4 class="font-semibold">${title}</h4>
                <p class="text-sm text-secondary">${message}</p>
            </div>
            <button class="text-secondary hover:text-light transition-colors">
                <i class="fa fa-times"></i>
            </button>
        </div>
    `;
    
    // 添加到容器
    notificationsContainer.appendChild(notification);
    
    // 显示通知
    setTimeout(() => {
        notification.classList.remove('opacity-0', 'translate-y-2');
    }, 10);
    
    // 关闭按钮事件
    const closeBtn = notification.querySelector('button');
    closeBtn.addEventListener('click', () => {
        closeNotification(notification);
    });
    
    // 自动关闭
    setTimeout(() => {
        closeNotification(notification);
    }, 5000);
}

// 关闭通知
function closeNotification(notification) {
    notification.classList.add('opacity-0', 'translate-y-2');
    
    setTimeout(() => {
        notification.remove();
    }, 300);
}

// 显示错误
function showError(title, message) {
    showNotification(title, message, 'error');
}

// 工具函数
function formatBytes(bytes, decimals = 2) {
    return window.utils?.formatBytes ? window.utils.formatBytes(bytes, decimals) : `${bytes} B`;
}

function formatTime(seconds) {
    return window.utils?.formatTime ? window.utils.formatTime(seconds) : `${seconds}s`;
}

// 导出一些全局方法供其他脚本使用
window.fml = {
    showNotification,
    showError,
    showLoading,
    hideLoading,
    formatBytes,
    formatTime,
    loadPage
};