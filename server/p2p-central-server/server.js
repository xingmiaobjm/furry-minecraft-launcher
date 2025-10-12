const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const shortid = require('shortid');
const path = require('path');
require('dotenv').config();

// 导入数据库配置和模型
const { sequelize, testConnection, syncModels } = require('./config/database');
const { User, Room, Stat } = require('./models');
const { Op } = require('sequelize');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // 生产环境应该使用环境变量

// 中间件
app.use(cors());
app.use(express.json());

// 配置静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 初始化数据库
async function initDatabase() {
  try {
    // 先测试数据库连接
    console.log('正在测试数据库连接...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('无法连接到MySQL数据库，请检查配置和服务状态');
    }
    
    // 同步数据库模型
    console.log('正在同步数据库模型...');
    await syncModels();
    
    // 检查统计信息是否存在
    console.log('正在初始化统计信息...');
    let stat = await Stat.findOne();
    if (!stat) {
      // 创建初始统计记录
      stat = await Stat.create({
        totalUsers: await User.count(),
        totalRooms: await Room.count(),
        activeUsers: await User.count({ where: { onlineStatus: 'online' } }),
        activeRooms: await Room.count({ where: { status: ['waiting', 'playing'] } })
      });
    }
    
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error.message);
    throw error;
  }
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

// 根路径路由
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Furry Minecraft Launcher - 中央服务器</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
        h1 { color: #2c3e50; }
        p { color: #555; }
        .endpoint { background: #f8f9fa; padding: 20px; margin: 20px auto; max-width: 600px; border-radius: 8px; }
        code { background: #eee; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>Furry Minecraft Launcher - 中央服务器</h1>
      <p>服务器运行正常。请使用以下API端点进行交互。</p>
      
      <div class="endpoint">
        <h2>API 端点</h2>
        <p>健康检查: <code>GET /api/health</code></p>
        <p>管理面板: <code>http://localhost:" + PORT + "/admin-vue</code></p>
      </div>
    </body>
    </html>
  `);
});

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
    const stat = await Stat.findOne();
    res.json({
      stats: stat || {
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
    const users = await User.findAll({
      attributes: {
        exclude: ['password']
      }
    });
    res.json({
      users
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '服务器错误', message: error.message });
  }
});

// 路由 - 获取房间列表
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Room.findAll();
    res.json({
      rooms
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
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已被使用' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建新用户
    const newUser = await User.create({
      id: shortid.generate(),
      username,
      email,
      password: hashedPassword,
      deviceInfo: {},
      clientVersion: 'admin-created',
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
    });

    // 更新统计信息
    const stat = await Stat.findOne();
    if (stat) {
      stat.totalUsers = await User.count();
      await stat.save();
    }

    // 返回用户信息（不包含密码）
    const userResponse = newUser.toJSON();
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
    const result = await User.destroy({ where: { id: userId } });
    
    if (result === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 更新统计信息
    const stat = await Stat.findOne();
    if (stat) {
      stat.totalUsers = await User.count();
      await stat.save();
    }
    
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
    const existingUser = await User.findOne({
      where: {
        [sequelize.Op.or]: [{ username }, { email }]
      }
    });
    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已被使用' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建新用户
    const newUser = await User.create({
      id: shortid.generate(),
      username,
      email,
      password: hashedPassword,
      deviceInfo: deviceInfo || {},
      clientVersion: clientVersion || 'unknown',
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
    });

    // 更新统计信息
    const stat = await Stat.findOne();
    if (stat) {
      stat.totalUsers = await User.count();
      stat.activeUsers = await User.count({ where: { onlineStatus: 'online' } });
      await stat.save();
    }

    // 生成令牌
    const token = generateToken(newUser);

    // 返回用户信息（不包含密码）
    const userResponse = newUser.toJSON();
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
    const user = await User.findOne({
      where: {
        email: email
      }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 更新用户信息
    await user.update({
      lastLogin: new Date(),
      onlineStatus: 'online',
      deviceInfo: deviceInfo ? { ...user.deviceInfo, ...deviceInfo } : user.deviceInfo,
      clientVersion: clientVersion || user.clientVersion
    });

    // 生成令牌
    const token = generateToken(user);

    // 返回用户信息（不包含密码）
    const userResponse = user.toJSON();
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
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const userResponse = user.toJSON();
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
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 允许更新的字段
    const { username, email, deviceInfo, clientVersion, userSettings } = req.body;
    
    // 更新用户信息
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (deviceInfo) updateData.deviceInfo = deviceInfo;
    if (clientVersion) updateData.clientVersion = clientVersion;
    if (userSettings) updateData.userSettings = { ...user.userSettings, ...userSettings };

    await user.update(updateData);

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json(userResponse);
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
    const newRoom = await Room.create({
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
    });

    // 更新用户统计信息
    const user = await User.findByPk(req.user.userId);
    if (user) {
      const stats = user.statistics || { totalRoomsCreated: 0, totalRoomsJoined: 0, totalPlayTime: 0 };
      stats.totalRoomsCreated = (stats.totalRoomsCreated || 0) + 1;
      await user.update({ statistics: stats });
    }

    // 更新统计信息
    const stat = await Stat.findOne();
    if (stat) {
      stat.activeRooms = await Room.count({ where: { status: ['waiting', 'playing'] } });
      await stat.save();
    }

    res.status(201).json({
      message: '房间记录创建成功',
      room: newRoom.toJSON()
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

    // 构建查询条件
    const where = {
      [sequelize.Op.or]: [
        { isPrivate: false },
        { hostId: req.user.userId }
      ]
    };

    if (status) {
      where.status = status;
    }

    if (gameVersion) {
      where.gameVersion = { [sequelize.Op.like]: `%${gameVersion}%` };
    }

    // 查询房间
    const rooms = await Room.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
    
    const roomList = rooms.map(room => room.toJSON());

    res.json(roomList);
  } catch (error) {
    console.error('获取房间列表错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 更新房间状态
app.put('/api/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findOne({
      where: {
        id: req.params.roomId,
        hostId: req.user.userId
      }
    });

    if (!room) {
      return res.status(404).json({ error: '房间不存在或您没有权限修改' });
    }

    // 只允许更新特定字段
    const updateData = {
      updatedAt: new Date() // 自动更新最后活动时间
    };
    
    const allowedUpdates = ['status', 'currentPlayers'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    await room.update(updateData);

    res.json({
      message: '房间状态更新成功',
      room: room.toJSON()
    });
  } catch (error) {
    console.error('更新房间状态错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 路由 - 删除房间记录
app.delete('/api/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const result = await Room.destroy({
      where: {
        id: req.params.roomId,
        hostId: req.user.userId
      }
    });

    if (result === 0) {
      return res.status(404).json({ error: '房间不存在或您没有权限删除' });
    }

    // 更新统计信息
    const stat = await Stat.findOne();
    if (stat) {
      stat.activeRooms = await Room.count({ where: { status: ['waiting', 'playing'] } });
      await stat.save();
    }

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

    // 删除过期房间
    const removedCount = await Room.destroy({
      where: {
        updatedAt: { [sequelize.Op.lt]: expirationTime }
      }
    });

    if (removedCount > 0) {
      console.log(`清理了 ${removedCount} 个过期房间`);
      
      // 更新统计信息
      const stat = await Stat.findOne();
      if (stat) {
        stat.activeRooms = await Room.count({ where: { status: ['waiting', 'playing'] } });
        await stat.save();
      }
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