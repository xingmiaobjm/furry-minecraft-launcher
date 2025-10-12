/**
 * Vue管理面板功能演示脚本
 * 这个脚本演示了Vue管理面板的所有核心功能
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// 演示用户数据
const demoUsers = [
    {
        username: '演示用户1',
        email: 'demo1@example.com',
        password: 'demo123'
    },
    {
        username: '演示用户2',
        email: 'demo2@example.com',
        password: 'demo456'
    }
];

// 演示房间数据
const demoRooms = [
    {
        name: '快乐生存服务器',
        hostId: 'user1',
        maxPlayers: 8,
        status: 'waiting'
    },
    {
        name: '极限挑战房间',
        hostId: 'user2',
        maxPlayers: 4,
        status: 'playing'
    }
];

// 工具函数
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    const colors = {
        info: '\x1b[36m',    // 青色
        success: '\x1b[32m', // 绿色
        error: '\x1b[31m',   // 红色
        warning: '\x1b[33m', // 黄色
        reset: '\x1b[0m'
    };
    
    const color = colors[type] || colors.info;
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// API调用函数
async function getUsers() {
    try {
        const response = await axios.get(`${API_BASE}/users`);
        return response.data.users;
    } catch (error) {
        log(`获取用户列表失败: ${error.message}`, 'error');
        return [];
    }
}

async function createUser(userData) {
    try {
        const response = await axios.post(`${API_BASE}/admin/users`, userData);
        log(`✅ 用户创建成功: ${response.data.user.username} (ID: ${response.data.user.id})`, 'success');
        return response.data.user;
    } catch (error) {
        log(`❌ 用户创建失败: ${error.response?.data?.error || error.message}`, 'error');
        return null;
    }
}

async function deleteUser(userId) {
    try {
        const response = await axios.delete(`${API_BASE}/admin/users/${userId}`);
        log(`🗑️ 用户删除成功: ${userId}`, 'success');
        return true;
    } catch (error) {
        log(`❌ 用户删除失败: ${error.response?.data?.error || error.message}`, 'error');
        return false;
    }
}

async function getRooms() {
    try {
        const response = await axios.get(`${API_BASE}/rooms`);
        return response.data.rooms;
    } catch (error) {
        log(`获取房间列表失败: ${error.message}`, 'error');
        return [];
    }
}

async function getStats() {
    try {
        const response = await axios.get(`${API_BASE}/stats`);
        return response.data;
    } catch (error) {
        log(`获取统计数据失败: ${error.message}`, 'error');
        return null;
    }
}

// 演示函数
async function demonstrateUserManagement() {
    log('🎯 开始用户管理功能演示', 'info');
    
    // 显示当前用户
    log('📋 当前用户列表:', 'info');
    const currentUsers = await getUsers();
    currentUsers.forEach(user => {
        log(`   - ${user.username} (${user.email}) - ${user.onlineStatus === 'online' ? '🟢 在线' : '🔴 离线'}`, 'info');
    });
    
    if (currentUsers.length === 0) {
        log('当前没有用户，将创建演示用户', 'warning');
        
        // 创建演示用户
        log('➕ 创建演示用户...', 'info');
        for (const userData of demoUsers) {
            await createUser(userData);
            await delay(1000);
        }
        
        // 显示新创建的用户
        log('📋 新创建的用户:', 'info');
        const newUsers = await getUsers();
        newUsers.forEach(user => {
            log(`   - ${user.username} (${user.email}) - ID: ${user.id}`, 'info');
        });
        
        return newUsers;
    }
    
    return currentUsers;
}

async function demonstrateRoomManagement() {
    log('🏠 开始房间管理功能演示', 'info');
    
    const rooms = await getRooms();
    log(`📊 当前房间数量: ${rooms.length}`, 'info');
    
    rooms.forEach(room => {
        log(`   - ${room.name} (${room.currentPlayers}/${room.maxPlayers}) - ${getRoomStatusText(room.status)}`, 'info');
    });
    
    return rooms;
}

async function demonstrateStatistics() {
    log('📈 开始统计功能演示', 'info');
    
    const stats = await getStats();
    if (stats) {
        log(`📊 服务器统计:`, 'info');
        log(`   - 总用户数: ${stats.totalUsers}`, 'info');
        log(`   - 在线用户数: ${stats.onlineUsers}`, 'info');
        log(`   - 总房间数: ${stats.totalRooms}`, 'info');
        log(`   - 活跃房间数: ${stats.activeRooms}`, 'info');
    }
    
    return stats;
}

async function demonstrateCleanup(users) {
    log('🧹 开始清理演示数据', 'warning');
    
    // 删除演示用户
    const demoUserIds = users.filter(user => 
        user.username.includes('演示用户') || 
        user.email.includes('demo')
    ).map(user => user.id);
    
    if (demoUserIds.length > 0) {
        log(`找到 ${demoUserIds.length} 个演示用户，准备删除...`, 'warning');
        for (const userId of demoUserIds) {
            await deleteUser(userId);
            await delay(500);
        }
    } else {
        log('没有找到演示用户需要清理', 'info');
    }
}

function getRoomStatusText(status) {
    const statusMap = {
        waiting: '⏳ 等待中',
        playing: '🎮 游戏中',
        closed: '🔒 已关闭'
    };
    return statusMap[status] || status;
}

// 主演示函数
async function runDemo() {
    log('🚀 开始Vue管理面板功能演示', 'info');
    log('=====================================', 'info');
    
    try {
        // 演示用户管理
        const users = await demonstrateUserManagement();
        await delay(2000);
        
        // 演示房间管理
        await demonstrateRoomManagement();
        await delay(2000);
        
        // 演示统计功能
        await demonstrateStatistics();
        await delay(2000);
        
        // 询问是否清理数据
        log('演示完成！', 'success');
        log('=====================================', 'info');
        
        // 注意：在实际环境中，这里应该有用户输入确认
        // 为了安全起见，我们默认不自动清理数据
        log('💡 提示: 演示数据已保留，如需清理请手动运行清理脚本', 'warning');
        
    } catch (error) {
        log(`演示过程中发生错误: ${error.message}`, 'error');
    }
}

// 运行演示
if (require.main === module) {
    runDemo().then(() => {
        log('✨ 演示脚本执行完成', 'success');
        process.exit(0);
    }).catch(error => {
        log(`❌ 演示脚本执行失败: ${error.message}`, 'error');
        process.exit(1);
    });
}

module.exports = {
    runDemo,
    createUser,
    deleteUser,
    getUsers,
    getRooms,
    getStats
};