const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// 创建Express应用和HTTP服务器
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const STUN_SERVER_URLS = process.env.STUN_SERVER_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
const TURN_SERVER_URLS = process.env.TURN_SERVER_URLS || '';
const TURN_SERVER_USERNAME = process.env.TURN_SERVER_USERNAME || '';
const TURN_SERVER_CREDENTIAL = process.env.TURN_SERVER_CREDENTIAL || '';
const CENTRAL_SERVER_URL = process.env.CENTRAL_SERVER_URL || 'http://localhost:3000';

// 中间件
app.use(cors());
app.use(express.json());

// 初始化数据库
const dbPath = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, {
  rooms: [],
  connections: [],
  serverStats: {
    totalRooms: 0,
    activeRooms: 0,
    totalConnections: 0,
    natTypes: {
      'full-cone': 0,
      'restricted': 0,
      'port-restricted': 0,
      'symmetric': 0,
      'unknown': 0
    },
    startTime: new Date().toISOString()
  }
});

// 初始化数据库结构
async function initDatabase() {
  await db.read();
  
  // 确保数据结构完整
  if (!db.data) {
    db.data = {
      rooms: [],
      connections: [],
      serverStats: {
        totalRooms: 0,
        activeRooms: 0,
        totalConnections: 0,
        natTypes: {
          'full-cone': 0,
          'restricted': 0,
          'port-restricted': 0,
          'symmetric': 0,
          'unknown': 0
        },
        startTime: new Date().toISOString()
      }
    };
  }
  
  // 确保必要的字段存在
  if (!db.data.rooms) db.data.rooms = [];
  if (!db.data.connections) db.data.connections = [];
  if (!db.data.serverStats) {
    db.data.serverStats = {
      totalRooms: 0,
      activeRooms: 0,
      totalConnections: 0,
      natTypes: {
        'full-cone': 0,
        'restricted': 0,
        'port-restricted': 0,
        'symmetric': 0,
        'unknown': 0
      },
      startTime: new Date().toISOString()
    };
  }
  
  // 更新统计信息
  db.data.serverStats.totalRooms = db.data.rooms.length;
  db.data.serverStats.activeRooms = db.data.rooms.filter(room => room.status === 'active' || room.status === 'playing').length;
  
  await db.write();
  console.log('数据库初始化完成');
}

// 房间管理类
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { host, clients, roomInfo }
    this.clientToRoom = new Map(); // clientId -> roomId
    this.clientConnections = new Map(); // clientId -> websocket
  }

  // 创建房间
  createRoom(clientId, roomInfo) {
    const roomId = uuidv4().substring(0, 8); // 生成短房间码
    
    const room = {
      id: roomId,
      host: clientId,
      clients: new Set([clientId]),
      roomInfo: {
        ...roomInfo,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        status: 'waiting',
        currentPlayers: 1
      }
    };

    this.rooms.set(roomId, room);
    this.clientToRoom.set(clientId, roomId);

    // 记录到数据库
    this.saveRoomToDatabase(room);

    return roomId;
  }

  // 加入房间
  joinRoom(clientId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.clients.size >= room.roomInfo.maxPlayers) {
      return { success: false, error: '房间已满' };
    }

    room.clients.add(clientId);
    this.clientToRoom.set(clientId, roomId);
    room.roomInfo.currentPlayers = room.clients.size;
    room.roomInfo.lastActivity = new Date().toISOString();
    
    if (room.roomInfo.currentPlayers > 1) {
      room.roomInfo.status = 'playing';
    }

    this.saveRoomToDatabase(room);

    // 通知房间内所有成员
    this.broadcastToRoom(roomId, {
      type: 'player_joined',
      clientId: clientId,
      playerCount: room.clients.size
    });

    return { success: true, room: room.roomInfo };
  }

  // 离开房间
  leaveRoom(clientId) {
    const roomId = this.clientToRoom.get(clientId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.delete(clientId);
    this.clientToRoom.delete(clientId);
    
    if (room.clients.size === 0) {
      // 房间无人，自动销毁
      this.rooms.delete(roomId);
      this.removeRoomFromDatabase(roomId);
      return { destroyed: true };
    } else {
      // 更新房间信息
      room.roomInfo.currentPlayers = room.clients.size;
      room.roomInfo.lastActivity = new Date().toISOString();
      
      // 如果房主离开，选择新的房主
      if (clientId === room.host) {
        const newHost = Array.from(room.clients)[0];
        room.host = newHost;
        room.roomInfo.hostChanged = true;
        room.roomInfo.newHostId = newHost;
      }

      this.saveRoomToDatabase(room);

      // 通知房间内所有成员
      this.broadcastToRoom(roomId, {
        type: 'player_left',
        clientId: clientId,
        playerCount: room.clients.size,
        newHost: clientId === room.host ? room.host : null
      });

      return { destroyed: false, roomId };
    }
  }

  // 保存房间信息到数据库
  async saveRoomToDatabase(room) {
    const dbRoom = {
      id: room.id,
      host: room.host,
      clients: Array.from(room.clients),
      roomInfo: room.roomInfo
    };

    const existingIndex = db.data.rooms.findIndex(r => r.id === room.id);
    if (existingIndex >= 0) {
      db.data.rooms[existingIndex] = dbRoom;
    } else {
      db.data.rooms.push(dbRoom);
    }

    // 更新服务器统计
    db.data.serverStats.activeRooms = this.rooms.size;
    
    try {
      await db.write();
    } catch (error) {
      console.error('保存房间到数据库失败:', error);
    }
  }

  // 从数据库删除房间
  async removeRoomFromDatabase(roomId) {
    db.data.rooms = db.data.rooms.filter(r => r.id !== roomId);
    db.data.serverStats.activeRooms = this.rooms.size;
    
    try {
      await db.write();
    } catch (error) {
      console.error('从数据库删除房间失败:', error);
    }
  }

  // 广播消息到房间
  broadcastToRoom(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageString = JSON.stringify(message);
    room.clients.forEach(clientId => {
      const ws = this.clientConnections.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageString);
      }
    });
  }

  // 保存客户端连接
  saveClientConnection(clientId, ws) {
    this.clientConnections.set(clientId, ws);
  }

  // 移除客户端连接
  removeClientConnection(clientId) {
    this.clientConnections.delete(clientId);
  }

  // 获取房间信息
  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.roomInfo : null;
  }

  // 获取房间内所有客户端ID
  getRoomClients(roomId) {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.clients) : [];
  }
}

// 创建房间管理器实例
const roomManager = new RoomManager();

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  let clientId = null;
  let userId = null;
  let username = null;
  let clientInfo = null;
  
  // 客户端连接建立
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('收到消息:', data.type, data);
      
      switch (data.type) {
        // 处理客户端认证和初始化
        case 'connect':
          // 初始化连接
          clientId = uuidv4();
          userId = data.userId || clientId; // 使用客户端提供的userId或生成新的
          username = data.username || '匿名用户';
          
          clientInfo = {
            clientId,
            userId,
            username,
            natType: null,
            publicIp: req.socket.remoteAddress,
            connectedAt: new Date().toISOString()
          };

          // 保存连接信息
          roomManager.saveClientConnection(clientId, ws);
          
          // 记录到数据库
          db.data.connections.push({
            ...clientInfo,
            userAgent: req.headers['user-agent']
          });
          db.data.serverStats.totalConnections++;
          await db.write();

          // 返回连接信息和用户认证成功消息
          ws.send(JSON.stringify({
            type: 'userAuthenticated',
            data: {
              userId,
              username,
              clientId,
              stunServers: STUN_SERVER_URLS.split(',').map(url => ({ urls: url.trim() })),
              turnServers: TURN_SERVER_URLS ? [{ 
                urls: TURN_SERVER_URLS.split(',').map(url => url.trim()),
                username: TURN_SERVER_USERNAME,
                credential: TURN_SERVER_CREDENTIAL
              }] : []
            }
          }));
          
          // 如果有之前的房间，尝试重连
          if (data.lastJoinedRoom) {
            const roomId = data.lastJoinedRoom;
            const joinResult = roomManager.joinRoom(clientId, roomId);
            if (joinResult.success) {
              const room = joinResult.room;
              // 获取房间信息，包含玩家列表
              ws.send(JSON.stringify({
                type: 'roomJoined',
                data: {
                  id: roomId,
                  name: room.name,
                  maxPlayers: room.maxPlayers,
                  players: roomManager.getRoomClients(roomId).map(id => ({
                    id: id === room.host ? userId : `peer_${id}`,
                    username: id === room.host ? username : `玩家${id.substring(0, 4)}`,
                    isOwner: id === room.host
                  })),
                  createdAt: room.createdAt,
                  lastActivity: room.lastActivity
                }
              }));
            }
          }
          
          break;
          
        // 客户端创建房间
        case 'createRoom':
          if (!clientId) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: '未认证的连接', operation: 'createRoom' }
            }));
            break;
          }
          
          const roomData = data.data;
          const newRoomId = roomManager.createRoom(clientId, {
            name: roomData.name || '未命名房间',
            description: roomData.description || '',
            maxPlayers: roomData.maxPlayers || 10,
            isPrivate: !!roomData.isPrivate,
            passwordProtected: !!roomData.password,
            password: roomData.password, // 在实际生产环境中应该加密存储
            gameVersion: roomData.gameVersion || 'unknown'
          });
          
          // 通知中央服务器
          try {
            await axios.post(`${CENTRAL_SERVER_URL}/api/rooms`, {
              roomName: roomData.name || '未命名房间',
              hostAddress: clientInfo.publicIp,
              hostId: userId,
              hostUsername: username,
              maxPlayers: roomData.maxPlayers || 10,
              gameVersion: roomData.gameVersion || 'unknown',
              isPrivate: !!roomData.isPrivate
            });
          } catch (error) {
            console.warn('通知中央服务器失败:', error.message);
          }
          
          // 获取创建的房间信息
          const createdRoomInfo = roomManager.getRoomInfo(newRoomId);
          
          // 返回给创建者
          ws.send(JSON.stringify({
            type: 'roomCreated',
            data: {
              id: newRoomId,
              name: createdRoomInfo.name,
              description: createdRoomInfo.description || '',
              owner: userId,
              passwordProtected: createdRoomInfo.passwordProtected,
              maxPlayers: createdRoomInfo.maxPlayers,
              players: [{ 
                id: userId, 
                username,
                isOwner: true 
              }],
              createdAt: createdRoomInfo.createdAt,
              isPrivate: createdRoomInfo.isPrivate
            }
          }));
          
          break;
          
        // 客户端加入房间
        case 'joinRoom':
          if (!clientId) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: '未认证的连接', operation: 'joinRoom' }
            }));
            break;
          }
          
          const joinRoomId = data.data.roomId;
          const joinPassword = data.data.password;
          
          // 获取房间信息进行密码验证
          const roomToJoin = roomManager.getRoomInfo(joinRoomId);
          if (!roomToJoin) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: '房间不存在', operation: 'joinRoom' }
            }));
            break;
          }
          
          // 密码验证
          if (roomToJoin.passwordProtected && joinPassword !== roomToJoin.password) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: '密码错误', operation: 'joinRoom' }
            }));
            break;
          }
          
          // 加入房间
          const joinResult = roomManager.joinRoom(clientId, joinRoomId);
          
          if (joinResult.success) {
            // 获取房间内所有客户端
            const roomClients = roomManager.getRoomClients(joinRoomId);
            const hostClientId = roomToJoin.host;
            
            // 构建玩家列表
            const players = roomClients.map(id => ({
              id: id === hostClientId ? userId : `peer_${id}`,
              username: id === hostClientId ? username : `玩家${id.substring(0, 4)}`,
              isOwner: id === hostClientId
            }));
            
            // 向加入者发送成功消息
            ws.send(JSON.stringify({
              type: 'roomJoined',
              data: {
                id: joinRoomId,
                name: roomToJoin.name,
                description: roomToJoin.description || '',
                owner: hostClientId,
                maxPlayers: roomToJoin.maxPlayers,
                players: players,
                createdAt: roomToJoin.createdAt,
                isPrivate: roomToJoin.isPrivate
              }
            }));
            
            // 通知房间内其他成员有新玩家加入
            roomClients.forEach(id => {
              if (id !== clientId) {
                const targetWs = roomManager.clientConnections.get(id);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                  targetWs.send(JSON.stringify({
                    type: 'userJoined',
                    data: {
                      roomId: joinRoomId,
                      user: {
                        id: userId,
                        username,
                        isOwner: false
                      }
                    }
                  }));
                }
              }
            });
            
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: joinResult.error || '加入房间失败', operation: 'joinRoom' }
            }));
          }
          break;
          
        // 客户端离开房间
        case 'leaveRoom':
          if (!clientId) break;
          
          const leaveRoomId = data.data.roomId;
          const leaveResult = roomManager.leaveRoom(clientId);
          
          ws.send(JSON.stringify({
            type: 'roomLeft',
            data: {
              roomId: leaveRoomId,
              destroyed: leaveResult.destroyed
            }
          }));
          
          // 如果房间未被销毁，通知其他成员
          if (!leaveResult.destroyed && leaveResult.roomId) {
            const roomClients = roomManager.getRoomClients(leaveResult.roomId);
            roomClients.forEach(id => {
              const targetWs = roomManager.clientConnections.get(id);
              if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify({
                  type: 'userLeft',
                  data: {
                    roomId: leaveResult.roomId,
                    userId: userId
                  }
                }));
              }
            });
          }
          break;
          
        // 获取房间列表
        case 'getRoomList':
          // 返回房间列表，不包括私有房间
          const publicRooms = db.data.rooms
            .filter(room => !room.roomInfo.isPrivate)
            .map(room => ({
              id: room.id,
              name: room.roomInfo.name,
              hostUsername: room.roomInfo.hostUsername || '房主',
              currentPlayers: room.roomInfo.currentPlayers,
              maxPlayers: room.roomInfo.maxPlayers,
              isPrivate: room.roomInfo.isPrivate,
              passwordProtected: room.roomInfo.passwordProtected,
              createdAt: room.roomInfo.createdAt
            }));
          
          ws.send(JSON.stringify({
            type: 'roomList',
            data: publicRooms
          }));
          break;
          
        // P2P信令处理 - Offer
        case 'offer':
          if (!clientId) break;
          
          const offerData = data.data;
          const targetClientId = offerData.to;
          const targetWs = roomManager.clientConnections.get(targetClientId);
          
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'offer',
              data: {
                roomId: offerData.roomId,
                from: clientId,
                userId: userId,
                offer: offerData.offer
              }
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: '目标用户不在线' }
            }));
          }
          break;
          
        // P2P信令处理 - Answer
        case 'answer':
          if (!clientId) break;
          
          const answerData = data.data;
          const targetClientIdForAnswer = answerData.to;
          const targetWsForAnswer = roomManager.clientConnections.get(targetClientIdForAnswer);
          
          if (targetWsForAnswer && targetWsForAnswer.readyState === WebSocket.OPEN) {
            targetWsForAnswer.send(JSON.stringify({
              type: 'answer',
              data: {
                roomId: answerData.roomId,
                from: clientId,
                userId: userId,
                answer: answerData.answer
              }
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: '目标用户不在线' }
            }));
          }
          break;
          
        // P2P信令处理 - ICE候选
        case 'ice-candidate':
        case 'iceCandidate':
          if (!clientId) break;
          
          const iceData = data.data;
          const targetClientIdForIce = iceData.to;
          const targetWsForIce = roomManager.clientConnections.get(targetClientIdForIce);
          
          if (targetWsForIce && targetWsForIce.readyState === WebSocket.OPEN) {
            targetWsForIce.send(JSON.stringify({
              type: 'ice-candidate',
              data: {
                roomId: iceData.roomId,
                from: clientId,
                userId: userId,
                candidate: iceData.candidate
              }
            }));
          }
          break;
          
        // NAT类型检测结果
        case 'nat_detect_result':
          if (data.natType) {
            clientInfo.natType = data.natType;
            
            // 确保natStats对象存在
            if (!db.data.natStats) {
              db.data.natStats = {
                'full-cone': 0,
                'restricted': 0,
                'port-restricted': 0,
                'symmetric': 0,
                'unknown': 0
              };
            }
            
            // 更新NAT统计
            if (db.data.natStats[data.natType] !== undefined) {
              db.data.natStats[data.natType]++;
            } else {
              db.data.natStats.unknown = (db.data.natStats.unknown || 0) + 1;
            }
            
            await db.write();
          }
          break;
      }
    } catch (error) {
      console.error('处理WebSocket消息错误:', error);
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: '服务器处理消息时发生错误' }
        }));
      }
    }
  });

  // 客户端断开连接
  ws.on('close', async () => {
    if (clientId) {
      // 从所有房间中移除
      const leaveResult = roomManager.leaveRoom(clientId);
      roomManager.removeClientConnection(clientId);
      
      console.log(`客户端断开连接: ${clientId}`);
      
      // 如果用户在房间中，通知其他用户该用户离开
      if (!leaveResult.destroyed && leaveResult.roomId && userId) {
        const roomClients = roomManager.getRoomClients(leaveResult.roomId);
        roomClients.forEach(id => {
          const targetWs = roomManager.clientConnections.get(id);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'userLeft',
              data: {
                roomId: leaveResult.roomId,
                userId: userId
              }
            }));
          }
        });
      }
    }
  });

  // 错误处理
  ws.on('error', (error) => {
    console.error('WebSocket错误:', error);
  });
});

// REST API路由

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    stats: {
      activeRooms: roomManager.rooms.size,
      activeConnections: wss.clients.size,
      uptime: process.uptime()
    }
  });
});

// 获取STUN/TURN服务器配置
app.get('/api/stun-turn-config', (req, res) => {
  res.json({
    iceServers: [
      ...STUN_SERVER_URLS.split(',').map(url => ({ urls: url.trim() })),
      ...(TURN_SERVER_URLS ? [{ 
        urls: TURN_SERVER_URLS.split(',').map(url => url.trim()),
        username: TURN_SERVER_USERNAME,
        credential: TURN_SERVER_CREDENTIAL
      }] : [])
    ]
  });
});

// 获取服务器统计信息
app.get('/api/stats', async (req, res) => {
  await db.read();
  res.json({
    serverStats: db.data.serverStats,
    natStats: db.data.natStats,
    activeRooms: roomManager.rooms.size,
    activeConnections: wss.clients.size,
    uptime: process.uptime()
  });
});

// 房间信息查询
app.get('/api/rooms/:roomId', (req, res) => {
  const roomInfo = roomManager.getRoomInfo(req.params.roomId);
  if (roomInfo) {
    res.json(roomInfo);
  } else {
    res.status(404).json({ error: '房间不存在' });
  }
});

// 清理过期房间的定时任务
async function cleanupExpiredRooms() {
  try {
    const now = new Date();
    const expirationTime = new Date(now - 1 * 60 * 60 * 1000); // 1小时前

    const initialLength = db.data.rooms.length;
    db.data.rooms = db.data.rooms.filter(
      room => new Date(room.roomInfo.lastActivity) > expirationTime
    );

    const removedCount = initialLength - db.data.rooms.length;
    if (removedCount > 0) {
      console.log(`清理了 ${removedCount} 个过期房间记录`);
      await db.write();
    }
  } catch (error) {
    console.error('清理过期房间错误:', error);
  }
}

// 启动服务器
async function startServer() {
  await initDatabase();
  
  // 每30分钟清理一次过期房间
  setInterval(cleanupExpiredRooms, 30 * 60 * 1000);
  
  // 每小时更新服务器运行时间
  setInterval(async () => {
    db.data.serverStats.uptime = process.uptime();
    try {
      await db.write();
    } catch (error) {
      console.error('更新服务器统计失败:', error);
    }
  }, 60 * 60 * 1000);
  
  server.listen(PORT, () => {
    console.log(`第三方P2P服务器运行在 http://localhost:${PORT}`);
    console.log(`WebSocket服务运行在 ws://localhost:${PORT}`);
    console.log('功能说明:');
    console.log('- 提供P2P信令服务');
    console.log('- 支持STUN服务器配置，用于NAT穿透');
    console.log('- 支持TURN服务器配置，作为备用中继');
    console.log('- 提供房间管理和节点匹配');
    console.log('- 记录NAT类型和连接成功率统计');
  });
}

startServer().catch(console.error);