const EventEmitter = require('events');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const SimplePeer = require('simple-peer');

class P2PRoomManager extends EventEmitter {
  constructor(configManager) {
    super();
    this.configManager = configManager;
    this.rooms = new Map(); // 房间ID -> 房间对象
    this.myRooms = new Map(); // 我创建或加入的房间
    this.currentRoom = null; // 当前活动的房间
    this.connections = new Map(); // roomId -> Map(playerId -> peer connection)
    this.signalingServer = null; // 信令服务器连接
    
    // 获取配置目录或使用默认路径
    const configDir = configManager.configPath 
      ? path.dirname(configManager.configPath) 
      : path.join(process.env.APPDATA || (process.platform === 'darwin' 
          ? path.join(process.env.HOME, 'Library', 'Application Support') 
          : path.join(process.env.HOME, '.config')), 'FurryMinecraftLauncher');
    
    this.roomDataPath = path.join(configDir, 'room_data.json');
    
    // 初始化房间数据（使用同步方法避免异步初始化问题）
    this.initRoomDataSync();
    
    // 初始化连接管理
    this.initConnections();
  }
  
  /**
   * 初始化房间数据，确保文件存在且格式正确（同步版本）
   */
  initRoomDataSync() {
    try {
      // 检查文件是否存在
      if (fs.pathExistsSync(this.roomDataPath)) {
        try {
          // 尝试读取文件内容
          const content = fs.readFileSync(this.roomDataPath, 'utf8');
          // 尝试解析JSON
          JSON.parse(content);
          console.log('房间数据文件格式正确');
        } catch (error) {
          console.error('房间数据文件损坏，将创建新文件:', error);
          // 创建一个空的房间数据文件
          fs.writeJsonSync(this.roomDataPath, { rooms: [], myRooms: [] });
        }
      } else {
        console.log('房间数据文件不存在，将创建新文件');
        // 确保目录存在
        fs.ensureDirSync(path.dirname(this.roomDataPath));
        // 创建空文件
        fs.writeJsonSync(this.roomDataPath, { rooms: [], myRooms: [] });
      }
      
      // 加载房间数据
      this.loadRoomDataSync();
    } catch (error) {
      console.error('初始化房间数据失败:', error);
    }
  }
  
  /**
   * 初始化房间数据，确保文件存在且格式正确（异步版本，供外部调用）
   */
  async initRoomData() {
    try {
      // 检查文件是否存在
      if (await fs.pathExists(this.roomDataPath)) {
        try {
          // 尝试读取文件内容
          const content = await fs.readFile(this.roomDataPath, 'utf8');
          // 尝试解析JSON
          JSON.parse(content);
          console.log('房间数据文件格式正确');
        } catch (error) {
          console.error('房间数据文件损坏，将创建新文件:', error);
          // 创建一个空的房间数据文件
          await fs.writeJson(this.roomDataPath, { rooms: [], myRooms: [] });
        }
      } else {
        console.log('房间数据文件不存在，将创建新文件');
        // 确保目录存在
        await fs.ensureDir(path.dirname(this.roomDataPath));
        // 创建空文件
        await fs.writeJson(this.roomDataPath, { rooms: [], myRooms: [] });
      }
      
      // 加载房间数据
      await this.loadRoomData();
    } catch (error) {
      console.error('初始化房间数据失败:', error);
    }
  }
  
  /**
   * 初始化P2P连接管理
   */
  initConnections() {
    this.connections = new Map();
    
    // 模拟一个简单的信令服务，在实际环境中应该连接到真实的信令服务器
    this.signalingServer = {
      // 模拟信令服务的方法
      joinRoom: (roomId, playerInfo) => {
        console.log(`模拟信令: 玩家 ${playerInfo.username} 加入房间 ${roomId}`);
        // 在实际应用中，这里应该连接到WebSocket服务器
      },
      leaveRoom: (roomId, playerId) => {
        console.log(`模拟信令: 玩家 ${playerId} 离开房间 ${roomId}`);
      },
      sendSignal: (targetId, signal) => {
        console.log(`模拟信令: 发送信号到 ${targetId}`);
        // 在实际应用中，这里应该通过WebSocket发送信号
      }
    };
  }
  
  /**
   * 创建P2P连接
   * @param {string} roomId 房间ID
   * @param {Object} playerInfo 玩家信息
   * @param {boolean} isInitiator 是否是发起者
   * @returns {Object} Peer连接
   */
  createPeerConnection(roomId, playerInfo, isInitiator = false) {
    const peer = new SimplePeer({
      initiator: isInitiator,
      trickle: false, // 关闭trickle ICE以简化连接过程
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }, // 使用Google的STUN服务器
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });
    
    // 处理ICE候选
    peer.on('signal', (data) => {
      console.log(`发送ICE候选到玩家 ${playerInfo.id}`);
      // 在实际应用中，这里应该通过信令服务器发送信号
      
      // 模拟信令过程
      if (this.connections.has(roomId) && this.connections.get(roomId).has(playerInfo.id)) {
        const targetPeer = this.connections.get(roomId).get(playerInfo.id);
        if (targetPeer && targetPeer.processSignal) {
          targetPeer.processSignal(data);
        }
      }
    });
    
    // 连接建立
    peer.on('connect', () => {
      console.log(`与玩家 ${playerInfo.id} 的P2P连接已建立`);
      this._triggerPeerConnected(roomId, playerInfo.id, playerInfo);
    });
    
    // 接收数据
    peer.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handlePeerMessage(roomId, playerInfo.id, message);
      } catch (error) {
        console.error('解析P2P消息失败:', error);
      }
    });
    
    // 处理错误
    peer.on('error', (error) => {
      console.error(`P2P连接错误 (${playerInfo.id}):`, error);
      this._triggerPeerError(roomId, playerInfo.id, error.message);
    });
    
    // 连接关闭
    peer.on('close', () => {
      console.log(`与玩家 ${playerInfo.id} 的P2P连接已关闭`);
      this._triggerPeerDisconnected(roomId, playerInfo.id);
      this.cleanupPeerConnection(roomId, playerInfo.id);
    });
    
    // 添加处理信号的方法
    peer.processSignal = (signal) => {
      peer.signal(signal);
    };
    
    // 初始化房间连接映射
    if (!this.connections.has(roomId)) {
      this.connections.set(roomId, new Map());
    }
    
    // 保存连接
    this.connections.get(roomId).set(playerInfo.id, peer);
    
    return peer;
  }
  
  /**
   * 清理P2P连接
   * @param {string} roomId 房间ID
   * @param {string} playerId 玩家ID
   */
  cleanupPeerConnection(roomId, playerId) {
    if (this.connections.has(roomId)) {
      const roomConnections = this.connections.get(roomId);
      if (roomConnections.has(playerId)) {
        const peer = roomConnections.get(playerId);
        peer.destroy();
        roomConnections.delete(playerId);
      }
      
      // 如果房间没有连接了，清理房间连接映射
      if (roomConnections.size === 0) {
        this.connections.delete(roomId);
      }
    }
  }
  
  /**
   * 处理来自对等点的消息
   * @param {string} roomId 房间ID
   * @param {string} senderId 发送者ID
   * @param {Object} message 消息内容
   */
  handlePeerMessage(roomId, senderId, message) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    switch (message.type) {
      case 'chat':
        // 转发聊天消息
        this.emit('roomMessage', {
          id: message.id,
          roomId,
          senderId,
          senderUsername: message.username,
          content: message.content,
          timestamp: message.timestamp
        });
        break;
      case 'playerList':
        // 更新玩家列表
        this.emit('playerListUpdated', { roomId, players: message.players });
        break;
      case 'roomStatus':
        // 更新房间状态
        room.status = message.status;
        this.emit('roomStatusChanged', { room, status: message.status });
        break;
      default:
        console.log(`收到未知类型的P2P消息: ${message.type}`);
    }
  }
  
  /**
   * 向房间内所有其他玩家广播消息
   * @param {string} roomId 房间ID
   * @param {Object} message 消息内容
   */
  broadcastToRoom(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room || !this.connections.has(roomId)) return;
    
    const roomConnections = this.connections.get(roomId);
    const messageStr = JSON.stringify(message);
    
    // 向所有连接的玩家发送消息
    roomConnections.forEach((peer, playerId) => {
      if (peer && peer.connected) {
        peer.write(messageStr);
      }
    });
  }
  
  // 触发P2P连接事件
  _triggerPeerConnected(roomId, peerId, peerInfo) {
    this.emit('peerConnected', { roomId, peerId, peerInfo });
  }
  
  _triggerPeerDisconnected(roomId, peerId) {
    this.emit('peerDisconnected', { roomId, peerId });
  }
  
  _triggerPeerError(roomId, peerId, error) {
    this.emit('peerError', { roomId, peerId, error });
  }

  /**
   * 创建一个新的P2P房间
   * @param {Object} options 房间选项
   * @returns {Object} 房间信息
   */
  createRoom(options = {}) {
    // 生成唯一的房间ID
    const roomId = crypto.randomBytes(16).toString('hex');
    const roomName = options.name || `房间 ${roomId.substring(0, 8)}`;
    const hostId = options.hostId || 'local';
    const hostUsername = options.hostUsername || 'Local User';
    
    // 创建房间对象
    const room = {
      id: roomId,
      name: roomName || '',
      hostId: hostId || '',
      hostUsername: hostUsername || '',
      hostAddress: options.hostAddress || '127.0.0.1',
      hostPort: options.hostPort || 25565, // 默认Minecraft服务器端口
      players: [{
        id: hostId,
        username: hostUsername,
        isHost: true
      }],
      maxPlayers: options.maxPlayers || 8,
      gameVersion: options.gameVersion || '',
      description: options.description || '',
      createdAt: new Date().toISOString(),
      isPrivate: !!options.password,
      passwordHash: options.password ? this.hashPassword(options.password) : null,
      status: 'waiting', // waiting, playing, closed
      serverInfo: options.serverInfo || null,
      // 添加P2P连接相关属性
      connections: {}
    };
    
    // 保存房间
    this.rooms.set(roomId, room);
    this.myRooms.set(roomId, room);
    this.currentRoom = room;
    
    // 加入信令服务中的房间
    if (this.signalingServer) {
      this.signalingServer.joinRoom(roomId, {
        id: hostId,
        username: hostUsername,
        isHost: true
      });
    }
    
    // 保存房间数据
    this.saveRoomData();
    
    // 初始化P2P连接
    if (!this.connections.has(roomId)) {
      this.connections.set(roomId, new Map());
    }
    
    // 触发事件
    this.emit('roomCreated', room);
    
    return room;
  }

  /**
   * 加入一个现有的房间
   * @param {string} roomId 房间ID
   * @param {Object} options 加入选项
   * @returns {Object} 加入结果
   */
  joinRoom(roomId, options = {}) {
    const room = this.rooms.get(roomId);
    
    if (!room) {
      return { success: false, error: '房间不存在' };
    }
    
    if (room.status === 'closed') {
      return { success: false, error: '房间已关闭' };
    }
    
    if (room.players.length >= room.maxPlayers) {
      return { success: false, error: '房间已满' };
    }
    
    // 验证密码
    if (room.isPrivate) {
      if (!options.password || !this.verifyPassword(options.password, room.passwordHash)) {
        return { success: false, error: '密码错误' };
      }
    }
    
    // 检查玩家是否已在房间中
    const playerId = options.playerId || 'local';
    if (room.players.some(p => p.id === playerId)) {
      return { success: false, error: '你已经在房间中' };
    }
    
    // 添加玩家
    const player = {
      id: playerId,
      username: options.username || 'Guest',
      isHost: false
    };
    
    room.players.push(player);
    this.myRooms.set(roomId, room);
    
    // 加入信令服务中的房间
    if (this.signalingServer) {
      this.signalingServer.joinRoom(roomId, player);
    }
    
    // 尝试与房间中的其他玩家建立P2P连接
    this.establishPeerConnections(roomId, player);
    
    // 保存房间数据
    this.saveRoomData();
    
    // 向房间广播新玩家加入的消息
    this.broadcastToRoom(roomId, {
      type: 'playerJoined',
      player: player,
      timestamp: new Date().toISOString()
    });
    
    // 更新玩家列表
    this.broadcastToRoom(roomId, {
      type: 'playerList',
      players: room.players,
      timestamp: new Date().toISOString()
    });
    
    // 触发事件
    this.emit('playerJoined', { roomId: room.id, player, room });
    
    return { success: true, room };
  }
  
  /**
   * 为新加入的玩家建立P2P连接
   * @param {string} roomId 房间ID
   * @param {Object} newPlayer 新玩家信息
   */
  establishPeerConnections(roomId, newPlayer) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    // 为房间中的每个现有玩家创建P2P连接
    room.players.forEach(player => {
      // 跳过自己
      if (player.id === newPlayer.id) return;
      
      try {
        // 只有非主机玩家发起连接
        if (!newPlayer.isHost) {
          this.createPeerConnection(roomId, player, true);
          console.log(`尝试与玩家 ${player.id} 建立P2P连接`);
        }
      } catch (error) {
        console.error(`创建P2P连接失败 (${player.id}):`, error);
      }
    });
  }

  /**
   * 离开房间
   * @param {string} roomId 房间ID
   * @param {string} playerId 玩家ID
   * @returns {boolean} 是否成功离开
   */
  leaveRoom(roomId, playerId = 'local') {
    const room = this.rooms.get(roomId);
    
    if (!room) {
      return false;
    }
    
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    
    if (playerIndex === -1) {
      return false;
    }
    
    const isHost = room.players[playerIndex].isHost;
    const leavingPlayer = room.players[playerIndex];
    
    // 从信令服务中离开房间
    if (this.signalingServer) {
      this.signalingServer.leaveRoom(roomId, playerId);
    }
    
    // 清理P2P连接
    this.cleanupPeerConnection(roomId, playerId);
    
    // 移除玩家
      room.players.splice(playerIndex, 1);
      
      // 如果是房主离开，房间关闭
      if (isHost) {
        room.status = 'closed';
        
        // 广播房间关闭消息
        this.broadcastToRoom(roomId, {
          type: 'roomClosed',
          reason: 'hostLeft',
          timestamp: new Date().toISOString()
        });
        
        // 清理所有连接
        if (this.connections.has(roomId)) {
          const roomConnections = this.connections.get(roomId);
          roomConnections.forEach((peer, id) => {
            if (peer) peer.destroy();
          });
          this.connections.delete(roomId);
        }
        
        this.emit('roomClosed', { roomId: room.id, room, reason: 'hostLeft' });
      } else {
        // 广播玩家离开消息
        this.broadcastToRoom(roomId, {
          type: 'playerLeft',
          player: leavingPlayer,
          timestamp: new Date().toISOString()
        });
        
        // 更新玩家列表
        this.broadcastToRoom(roomId, {
          type: 'playerList',
          players: room.players,
          timestamp: new Date().toISOString()
        });
        
        this.emit('playerLeft', { roomId: room.id, player: leavingPlayer, room });
    }
    
    // 从我的房间列表中移除
    if (this.currentRoom?.id === roomId && !room.players.some(p => p.id === playerId)) {
      this.currentRoom = null;
    }
    
    if (!room.players.some(p => p.id === playerId)) {
      this.myRooms.delete(roomId);
    }
    
    // 保存房间数据
    this.saveRoomData();
    
    return true;
  }

  /**
   * 获取房间列表
   * @returns {Array} 房间列表
   */
  getRooms() {
    return Array.from(this.rooms.values())
      .filter(room => room.status !== 'closed')
      .map(room => ({
        id: room.id,
        name: room.name,
        hostUsername: room.hostUsername,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        gameVersion: room.gameVersion,
        description: room.description,
        isPrivate: room.isPrivate,
        status: room.status
      }));
  }

  /**
   * 获取房间详情
   * @param {string} roomId 房间ID
   * @returns {Object|null} 房间详情
   */
  getRoomDetails(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    return {
      ...room,
      // 不返回密码哈希等敏感信息
      passwordHash: undefined
    };
  }

  /**
   * 设置房间状态
   * @param {string} roomId 房间ID
   * @param {string} status 新状态
   * @returns {boolean} 是否成功设置
   */
  setRoomStatus(roomId, status) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    // 检查是否是房主
    const isHost = room.players.some(p => p.id === 'local' && p.isHost);
    if (!isHost) return false;
    
    room.status = status;
    this.saveRoomData();
    
    this.emit('roomStatusChanged', { roomId: room.id, room, status });
    
    return true;
  }

  /**
   * 关闭房间
   * @param {string} roomId 房间ID
   * @returns {boolean} 是否成功关闭
   */
  closeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    // 检查是否是房主
    const isHost = room.players.some(p => p.id === 'local' && p.isHost);
    if (!isHost) return false;
    
    room.status = 'closed';
    
    // 通知所有玩家
      this.emit('roomClosed', { roomId: room.id, room, reason: 'hostClosed' });
    
    // 从我的房间列表中移除
    if (this.currentRoom?.id === roomId) {
      this.currentRoom = null;
    }
    
    this.myRooms.delete(roomId);
    
    // 保存房间数据
    this.saveRoomData();
    
    return true;
  }

  /**
   * 获取我的房间列表
   * @returns {Array} 我的房间列表
   */
  getMyRooms() {
    return Array.from(this.myRooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      hostUsername: room.hostUsername,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      gameVersion: room.gameVersion,
      status: room.status,
      isHost: room.players.some(p => p.id === 'local' && p.isHost)
    }));
  }

  /**
   * 向房间发送消息
   * @param {string} roomId 房间ID
   * @param {string} message 消息内容
   * @returns {boolean} 是否发送成功
   */
  sendRoomMessage(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    // 检查玩家是否在房间中
    const player = room.players.find(p => p.id === 'local');
    if (!player) return false;
    
    const chatMessage = {
      id: crypto.randomBytes(8).toString('hex'),
      roomId,
      senderId: player.id,
      senderUsername: player.username,
      content: message,
      timestamp: new Date().toISOString()
    };
    
    // 通过P2P网络广播消息
    this.broadcastToRoom(roomId, {
      type: 'chat',
      id: chatMessage.id,
      username: player.username,
      content: message,
      timestamp: chatMessage.timestamp
    });
    
    // 触发本地事件
    this.emit('roomMessage', { roomId, message: chatMessage });
    
    return true;
  }

  /**
   * 启动房间的Minecraft服务器
   * @param {string} roomId 房间ID
   * @param {Object} options 服务器选项
   * @returns {Object} 启动结果
   */
  startRoomServer(roomId, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }
    
    // 检查是否是房主
    const isHost = room.players.some(p => p.id === 'local' && p.isHost);
    if (!isHost) {
      return { success: false, error: '只有房主可以启动服务器' };
    }
    
    // 这里应该集成GameLauncher或启动外部服务器进程
    // 暂时返回模拟的服务器信息
    const serverInfo = {
      host: room.hostAddress,
      port: room.hostPort,
      version: options.version || room.gameVersion,
      startedAt: new Date().toISOString()
    };
    
    room.serverInfo = serverInfo;
    room.status = 'playing';
    
    this.saveRoomData();
    this.emit('serverStarted', { roomId: room.id, room, serverInfo });
    
    return { success: true, serverInfo };
  }

  /**
   * 停止房间的Minecraft服务器
   * @param {string} roomId 房间ID
   * @returns {boolean} 是否成功停止
   */
  stopRoomServer(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    // 检查是否是房主
    const isHost = room.players.some(p => p.id === 'local' && p.isHost);
    if (!isHost) return false;
    
    // 这里应该停止服务器进程
    room.serverInfo = null;
    room.status = 'waiting';
    
    this.saveRoomData();
    this.emit('serverStopped', { roomId: room.id, room });
    
    return true;
  }

  /**
   * 密码哈希函数
   * @param {string} password 原始密码
   * @returns {string} 哈希后的密码
   */
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * 验证密码
   * @param {string} password 原始密码
   * @param {string} hash 哈希后的密码
   * @returns {boolean} 密码是否正确
   */
  verifyPassword(password, hash) {
    return this.hashPassword(password) === hash;
  }

  /**
   * 保存房间数据到文件
   */
  async saveRoomData() {
    try {
      const data = {
        rooms: Array.from(this.rooms.values()),
        myRooms: Array.from(this.myRooms.keys()),
        savedAt: new Date().toISOString()
      };
      
      await fs.ensureDir(path.dirname(this.roomDataPath));
      await fs.writeJson(this.roomDataPath, data);
    } catch (error) {
      console.error('保存房间数据失败:', error);
    }
  }

  /**
   * 从文件加载房间数据（同步版本）
   */
  loadRoomDataSync() {
    try {
      if (fs.pathExistsSync(this.roomDataPath)) {
        try {
          const data = fs.readJsonSync(this.roomDataPath);
          
          // 加载房间
          if (data.rooms) {
            data.rooms.forEach(room => {
              // 过滤掉已关闭的房间
              if (room.status !== 'closed') {
                this.rooms.set(room.id, room);
              }
            });
          }
          
          // 恢复我的房间引用
          if (data.myRooms) {
            data.myRooms.forEach(roomId => {
              const room = this.rooms.get(roomId);
              if (room) {
                this.myRooms.set(roomId, room);
              }
            });
          }
          
          console.log('房间数据加载成功（同步）');
        } catch (jsonError) {
          console.error('房间数据文件格式错误，将创建新文件:', jsonError);
          // 创建一个空的房间数据文件
          fs.writeJsonSync(this.roomDataPath, { rooms: [], myRooms: [] });
        }
      }
    } catch (error) {
      console.error('加载房间数据失败:', error);
    }
  }
  
  /**
   * 从文件加载房间数据（异步版本）
   */
  async loadRoomData() {
    try {
      if (await fs.pathExists(this.roomDataPath)) {
        try {
          const data = await fs.readJson(this.roomDataPath);
          
          // 加载房间
          if (data.rooms) {
            data.rooms.forEach(room => {
              // 过滤掉已关闭的房间
              if (room.status !== 'closed') {
                this.rooms.set(room.id, room);
              }
            });
          }
          
          // 恢复我的房间引用
          if (data.myRooms) {
            data.myRooms.forEach(roomId => {
              const room = this.rooms.get(roomId);
              if (room) {
                this.myRooms.set(roomId, room);
              }
            });
          }
          
          console.log('房间数据加载成功（异步）');
        } catch (jsonError) {
          console.error('房间数据文件格式错误，将创建新文件:', jsonError);
          // 创建一个空的房间数据文件
          await fs.writeJson(this.roomDataPath, { rooms: [], myRooms: [] });
        }
      }
    } catch (error) {
      console.error('加载房间数据失败:', error);
    }
  }

  /**
   * 关闭P2P房间管理器
   * 清理资源并保存数据
   */
  async shutdown() {
    try {
      // 保存当前房间数据
      await this.saveRoomData();
      
      // 关闭所有P2P连接
      for (const [roomId, connections] of this.connections.entries()) {
        if (connections && typeof connections.forEach === 'function') {
          for (const [playerId, peer] of connections.entries()) {
            if (peer) {
              peer.destroy();
            }
          }
        }
      }
      this.connections.clear();
      
      // 关闭所有我创建的房间
      for (const [roomId, room] of this.myRooms.entries()) {
        const isHost = room.players.some(p => p.id === 'local' && p.isHost);
        if (isHost && room.status !== 'closed') {
          room.status = 'closed';
          this.emit('roomClosed', { roomId: room.id, room, reason: 'launcherShutdown' });
        }
      }
      
      // 清空房间数据
      this.rooms.clear();
      this.myRooms.clear();
      this.currentRoom = null;
      
      // 移除所有事件监听器
      this.removeAllListeners();
    } catch (error) {
      console.error('关闭P2P房间管理器失败:', error);
    }
  }
}

module.exports = P2PRoomManager;