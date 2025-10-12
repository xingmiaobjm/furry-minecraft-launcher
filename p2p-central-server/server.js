const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const shortid = require('shortid');
const path = require('path');

// 创建Express应用
const app = express();
const PORT = 3000;
const JWT_SECRET = 'your_jwt_secret_key'; // 生产环境应该使用环境变量

// 中间件
app.use(cors());
app.use(express.json());

// 配置静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 初始化数据库
const dbPath = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, {
  users: [],
  rooms: [],
  stats: {
    totalUsers: 0,
    totalRooms: 0,
    activeUsers: 0,
    activeRooms: 0
  }
});

// 初始化数据库结构
async function initDatabase() {
  await db.read();
  // 确保数据结构完整
  db.data ||= {
    users: [],
    rooms: [],
    stats: {
      totalUsers: 0,
      totalRooms: 0,
      activeUsers: 0,
      activeRooms: 0
    }
  };
  
  // 确保stats对象存在且字段完整
  if (!db.data.stats) {
    db.data.stats = {
      totalUsers: 0,
      totalRooms: 0,
      activeUsers: 0,
      activeRooms: 0
    };
  }
  
  // 更新统计信息
  db.data.stats.totalUsers = db.data.users?.length || 0;
  db.data.stats.totalRooms = db.data.rooms?.length || 0;
  
  await db.write();
  console.log('数据库初始化完成');
}

// 认证中间件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '无效的认证令牌' });
    }
    req.user = user;
    next();
  });
}

// 生成JWT令牌
function generateToken(user) {
  return jwt.sign(
    { 
      userId: user.id, 
      username: user.username,
      email: user.email
    }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
}

// 路由 - 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '中央服务器运行正常'
  });
});

// 路由 - 获取统计信息
app.get('/api/stats', async (req, res) => {
  try {
    await db.read();
    res.json({
      stats: db.data.stats || {
        totalUsers: 0,
        totalRooms: 0,
        activeUsers: 0,
        activeRooms: 0
      }
    });
  } catch (error) {
    console.error('获取统计信息错误:', error);
    res.status(500).json({ error: '服务器错误', message: error.message });
  }
});

// 路由 - 获取用户列表
app.get('/api/users', async (req, res) => {
  try {
    await db.read();
    res.json({
      users: db.data.users || []
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '服务器错误', message: error.message });
  }
});

// 路由 - 获取房间列表
app.get('/api/rooms', async (req, res) => {
  try {
    await db.read();
    res.json({
      rooms: db.data.rooms || []
    });
  } catch (error) {
    console.error('获取房间列表错误:', error);
    res.status(500).json({ error: '服务器错误', message: error.message });
  }
});

// 路由 - 管理员创建用户（用于管理面板）
app.post('/api/admin/users', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 验证必填字段
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱和密码是必填项' });
    }

    // 检查用户是否已存在
    const existingUser = db.data.users.find(
      u => u.username === username || u.email === email
    );
    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已被使用' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建新用户
    const newUser = {
      id: shortid.generate(),
      username,
      email,
      password: hashedPassword,
      deviceInfo: {},
      clientVersion: 'admin-created',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      onlineStatus: 'offline',
      userSettings: {
        theme: 'default',
        language: 'zh-CN',
        notificationsEnabled: true
      },
      statistics: {
        totalRoomsCreated: 0,
        totalRoomsJoined: 0,
        totalPlayTime: 0
      }
    };

    db.data.users.push(newUser);
    await db.write();

    // 更新统计信息
    db.data.stats.totalUsers = db.data.users.length;
    await db.write();

    // 返回用户信息（不包含密码）
    const userResponse = { ...newUser };
    delete userResponse.password;

    res.status(201).json({
      message: '用户创建成功',
      user: userResponse
    });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({ error: '服务器错误', message: error.message });
  }
});

// 路由 - 管理员删除用户
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 查找并删除用户
    const initialLength = db.data.users.length;
    db.data.users = db.data.users.filter(user => user.id !== userId);
    
    if (db.data.users.length === initialLength) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    await db.write();
    
    // 更新统计信息
    db.data.stats.totalUsers = db.data.users.length;
    await db.write();
    
    res.json({ message: '用户删除成功' });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({ error: '服务器错误', message: error.message });
  }
});

// 路由 - 健康检查（已合并）
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Vue管理面板路由
app.get('/admin-vue', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-panel-vue.html'));
});

// 路由 - 用户注册
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, email, password, deviceInfo, clientVersion } = req.body;

    // 验证必填字段
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱和密码是必填项' });
    }

    // 检查用户是否已存在
    const existingUser = db.data.users.find(
      u => u.username === username || u.email === email
    );
    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已被使用' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建新用户
    const newUser = {
      id: shortid.generate(),
      username,
      email,
      password: hashedPassword,
      deviceInfo: deviceInfo || {},
      clientVersion: clientVersion || 'unknown',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      onlineStatus: 'online',
      userSettings: {
        theme: 'default',
        language: 'zh-CN',
        notificationsEnabled: true
      },
      statistics: {
        totalRoomsCreated: 0,
        totalRoomsJoined: 0,
        totalPlayTime: 0
      }
    };

    db.data.users.push(newUser);
    await db.write();

    // 生成令牌
    const token = generateToken(newUser);

    // 返回用户信息（不包含密码）
    const userResponse = { ...newUser };
    delete userResponse.password;

    res.status(201).json({
      message: '注册成功',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 用户登录
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password, deviceInfo, clientVersion } = req.body;

    // 查找用户
    const user = db.data.users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 验证密码
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 更新用户信息
    user.lastLogin = new Date().toISOString();
    user.onlineStatus = 'online';
    if (deviceInfo) {
      user.deviceInfo = { ...user.deviceInfo, ...deviceInfo };
    }
    if (clientVersion) {
      user.clientVersion = clientVersion;
    }

    await db.write();

    // 生成令牌
    const token = generateToken(user);

    // 返回用户信息（不包含密码）
    const userResponse = { ...user };
    delete userResponse.password;

    res.json({
      message: '登录成功',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 获取用户信息
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const user = db.data.users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const userResponse = { ...user };
    delete userResponse.password;

    res.json(userResponse);
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 更新用户信息
app.put('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const userIndex = db.data.users.findIndex(u => u.id === req.user.userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 只允许更新特定字段
    const allowedUpdates = [
      'username', 'deviceInfo', 'clientVersion', 
      'userSettings', 'statistics'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        db.data.users[userIndex][field] = req.body[field];
      }
    });

    await db.write();

    const userResponse = { ...db.data.users[userIndex] };
    delete userResponse.password;

    res.json({
      message: '用户信息更新成功',
      user: userResponse
    });
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 创建房间记录
app.post('/api/rooms', authenticateToken, async (req, res) => {
  try {
    const { roomName, hostAddress, hostPort, maxPlayers, gameVersion, isPrivate } = req.body;

    // 验证必填字段
    if (!roomName || !hostAddress || !hostPort) {
      return res.status(400).json({ error: '房间名称、主机地址和端口是必填项' });
    }

    // 创建房间记录
    const newRoom = {
      id: shortid.generate(),
      name: roomName,
      hostId: req.user.userId,
      hostUsername: req.user.username,
      hostAddress,
      hostPort,
      maxPlayers: maxPlayers || 8,
      currentPlayers: 1,
      gameVersion: gameVersion || 'unknown',
      isPrivate: !!isPrivate,
      status: 'waiting', // waiting, playing, closed
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    db.data.rooms.push(newRoom);

    // 更新用户统计信息
    const user = db.data.users.find(u => u.id === req.user.userId);
    if (user) {
      user.statistics.totalRoomsCreated = (user.statistics.totalRoomsCreated || 0) + 1;
    }

    await db.write();

    res.status(201).json({
      message: '房间记录创建成功',
      room: newRoom
    });
  } catch (error) {
    console.error('创建房间记录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 获取房间列表
app.get('/api/rooms', authenticateToken, async (req, res) => {
  try {
    const { status, gameVersion } = req.query;

    let rooms = db.data.rooms;

    // 过滤房间
    if (status) {
      rooms = rooms.filter(room => room.status === status);
    }

    if (gameVersion) {
      rooms = rooms.filter(room => room.gameVersion.includes(gameVersion));
    }

    // 只返回非私密或用户是房主的房间
    rooms = rooms.filter(room => 
      !room.isPrivate || room.hostId === req.user.userId
    );

    // 按最后活动时间排序
    rooms.sort((a, b) => 
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );

    res.json(rooms);
  } catch (error) {
    console.error('获取房间列表错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 更新房间状态
app.put('/api/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const roomIndex = db.data.rooms.findIndex(
      room => room.id === req.params.roomId && room.hostId === req.user.userId
    );

    if (roomIndex === -1) {
      return res.status(404).json({ error: '房间不存在或您没有权限修改' });
    }

    // 只允许更新特定字段
    const allowedUpdates = ['status', 'currentPlayers', 'lastActivity'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        db.data.rooms[roomIndex][field] = req.body[field];
      }
    });

    // 更新最后活动时间
    db.data.rooms[roomIndex].lastActivity = new Date().toISOString();

    await db.write();

    res.json({
      message: '房间状态更新成功',
      room: db.data.rooms[roomIndex]
    });
  } catch (error) {
    console.error('更新房间状态错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 删除房间记录
app.delete('/api/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const roomIndex = db.data.rooms.findIndex(
      room => room.id === req.params.roomId && room.hostId === req.user.userId
    );

    if (roomIndex === -1) {
      return res.status(404).json({ error: '房间不存在或您没有权限删除' });
    }

    db.data.rooms.splice(roomIndex, 1);
    await db.write();

    res.json({ message: '房间记录删除成功' });
  } catch (error) {
    console.error('删除房间记录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 清理过期房间的定时任务
async function cleanupExpiredRooms() {
  try {
    const now = new Date();
    const expirationTime = new Date(now - 24 * 60 * 60 * 1000); // 24小时前

    const initialLength = db.data.rooms.length;
    db.data.rooms = db.data.rooms.filter(
      room => new Date(room.lastActivity) > expirationTime
    );

    const removedCount = initialLength - db.data.rooms.length;
    if (removedCount > 0) {
      console.log(`清理了 ${removedCount} 个过期房间`);
      await db.write();
    }
  } catch (error) {
    console.error('清理过期房间错误:', error);
  }
}

// 启动服务器
async function startServer() {
  await initDatabase();
  
  // 每小时清理一次过期房间
  setInterval(cleanupExpiredRooms, 60 * 60 * 1000);
  
  app.listen(PORT, () => {
    console.log(`中央服务器运行在 http://localhost:${PORT}`);
    console.log('功能说明:');
    console.log('- 提供用户注册、登录和信息管理');
    console.log('- 记录和管理P2P房间地址信息');
    console.log('- 仅作为地址簿，不参与P2P通信');
    console.log('- 支持详细的用户信息记录和统计');
  });
}

startServer().catch(console.error);