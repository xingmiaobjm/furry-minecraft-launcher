const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 配置
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// 存储房间信息
const rooms = new Map();
// 存储客户端连接
const clients = new Map();

// 创建HTTP服务器
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            rooms: rooms.size,
            clients: clients.size
        }));
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 日志函数
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

// 错误日志
function errorLog(message, error) {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error);
}

// 广播消息给房间内所有玩家
function broadcastToRoom(roomId, message, excludeClient = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const jsonMessage = JSON.stringify(message);
    
    room.players.forEach(player => {
        if (player.client !== excludeClient && player.client.readyState === WebSocket.OPEN) {
            player.client.send(jsonMessage);
        }
    });
}

// 发送消息给指定客户端
function sendToClient(client, message) {
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
    }
}

// 处理客户端连接
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    clients.set(clientId, {
        id: clientId,
        client: ws,
        playerInfo: null,
        roomId: null,
        connectedAt: new Date()
    });
    
    log(`客户端连接: ${clientId} 来自 ${req.socket.remoteAddress}`);
    
    // 发送连接确认
    sendToClient(ws, {
        type: 'connected',
        clientId,
        message: '已成功连接到中央服务器'
    });
    
    // 处理消息
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(clientId, data);
        } catch (error) {
            errorLog('消息解析失败', error);
            sendToClient(ws, {
                type: 'error',
                message: '消息格式错误'
            });
        }
    });
    
    // 处理连接关闭
    ws.on('close', () => {
        handleDisconnect(clientId);
    });
    
    // 处理错误
    ws.on('error', (error) => {
        errorLog(`客户端错误: ${clientId}`, error);
    });
});

// 处理客户端消息
function handleMessage(clientId, data) {
    const client = clients.get(clientId);
    if (!client) return;
    
    switch (data.type) {
        case 'register':
            handleRegister(client, data);
            break;
        case 'create_room':
            handleCreateRoom(client, data);
            break;
        case 'join_room':
            handleJoinRoom(client, data);
            break;
        case 'leave_room':
            handleLeaveRoom(client);
            break;
        case 'close_room':
            handleCloseRoom(client);
            break;
        case 'room_message':
            handleRoomMessage(client, data);
            break;
        case 'get_rooms':
            handleGetRooms(client);
            break;
        case 'get_room_details':
            handleGetRoomDetails(client, data);
            break;
        case 'set_room_status':
            handleSetRoomStatus(client, data);
            break;
        case 'update_player_info':
            handleUpdatePlayerInfo(client, data);
            break;
        case 'p2p_signal':
            handleP2PSignal(client, data);
            break;
        default:
            log(`未知消息类型: ${data.type} 来自 ${clientId}`);
    }
}

// 处理玩家注册
function handleRegister(client, data) {
    client.playerInfo = {
        username: data.username || 'Player',
        uuid: data.uuid || uuidv4(),
        avatar: data.avatar || '',
        status: 'online',
        gameVersion: data.gameVersion || null
    };
    
    sendToClient(client.client, {
        type: 'registered',
        playerInfo: client.playerInfo
    });
    
    log(`玩家注册: ${client.playerInfo.username} (${clientId})`);
}

// 处理创建房间
function handleCreateRoom(client, data) {
    if (!client.playerInfo) {
        sendToClient(client.client, {
            type: 'error',
            message: '请先注册玩家信息'
        });
        return;
    }
    
    // 如果已在房间中，先离开
    if (client.roomId) {
        handleLeaveRoom(client);
    }
    
    const roomId = uuidv4();
    const room = {
        id: roomId,
        name: data.name || `房间 #${Math.floor(Math.random() * 1000)}`,
        description: data.description || '',
        host: clientId,
        password: data.password || null,
        maxPlayers: data.maxPlayers || 8,
        gameVersion: data.gameVersion || 'latest',
        mods: data.mods || [],
        resourcePacks: data.resourcePacks || [],
        status: 'open', // open, closed, in_game
        players: [{
            clientId: client.id,
            client: client.client,
            playerInfo: client.playerInfo
        }],
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    rooms.set(roomId, room);
    client.roomId = roomId;
    
    // 发送房间创建成功消息
    sendToClient(client.client, {
        type: 'room_created',
        room: {
            ...room,
            players: room.players.map(p => ({ id: p.clientId, playerInfo: p.playerInfo }))
        }
    });
    
    log(`创建房间: ${room.name} (${roomId}) 由 ${client.playerInfo.username} 主持`);
    
    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 处理加入房间
function handleJoinRoom(client, data) {
    if (!client.playerInfo) {
        sendToClient(client.client, {
            type: 'error',
            message: '请先注册玩家信息'
        });
        return;
    }
    
    const room = rooms.get(data.roomId);
    if (!room) {
        sendToClient(client.client, {
            type: 'error',
            message: '房间不存在'
        });
        return;
    }
    
    // 检查房间是否已满
    if (room.players.length >= room.maxPlayers) {
        sendToClient(client.client, {
            type: 'error',
            message: '房间已满'
        });
        return;
    }
    
    // 检查密码
    if (room.password && room.password !== data.password) {
        sendToClient(client.client, {
            type: 'error',
            message: '密码错误'
        });
        return;
    }
    
    // 检查玩家是否已在房间中
    if (room.players.some(p => p.clientId === client.id)) {
        sendToClient(client.client, {
            type: 'error',
            message: '您已在房间中'
        });
        return;
    }
    
    // 如果已在其他房间中，先离开
    if (client.roomId) {
        handleLeaveRoom(client);
    }
    
    // 添加玩家到房间
    room.players.push({
        clientId: client.id,
        client: client.client,
        playerInfo: client.playerInfo
    });
    room.updatedAt = new Date();
    
    client.roomId = data.roomId;
    
    // 发送加入成功消息给当前玩家
    sendToClient(client.client, {
        type: 'room_joined',
        room: {
            ...room,
            players: room.players.map(p => ({ id: p.clientId, playerInfo: p.playerInfo }))
        }
    });
    
    // 广播玩家加入消息给房间内其他玩家
    const playerInfo = client.playerInfo;
    broadcastToRoom(room.id, {
        type: 'player_joined',
        player: { id: client.id, playerInfo },
        roomId: room.id
    }, client.client);
    
    log(`${client.playerInfo.username} 加入房间: ${room.name} (${room.id})`);
    
    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 处理离开房间
function handleLeaveRoom(client) {
    if (!client.roomId) return;
    
    const room = rooms.get(client.roomId);
    if (!room) {
        client.roomId = null;
        return;
    }
    
    const playerIndex = room.players.findIndex(p => p.clientId === client.id);
    if (playerIndex === -1) {
        client.roomId = null;
        return;
    }
    
    const leavingPlayer = room.players[playerIndex];
    
    // 如果是房主离开，关闭房间
    if (room.host === client.id) {
        handleCloseRoom(client, true);
        return;
    }
    
    // 移除玩家
    room.players.splice(playerIndex, 1);
    room.updatedAt = new Date();
    
    // 如果房间空了，删除房间
    if (room.players.length === 0) {
        rooms.delete(room.id);
        log(`房间已删除（空）: ${room.name} (${room.id})`);
    }
    
    client.roomId = null;
    
    // 发送离开成功消息
    sendToClient(client.client, {
        type: 'room_left',
        roomId: room.id
    });
    
    // 广播玩家离开消息给房间内其他玩家
    broadcastToRoom(room.id, {
        type: 'player_left',
        player: { id: leavingPlayer.clientId, playerInfo: leavingPlayer.playerInfo },
        roomId: room.id
    });
    
    log(`${leavingPlayer.playerInfo.username} 离开房间: ${room.name} (${room.id})`);
    
    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 处理关闭房间
function handleCloseRoom(client, isHostLeaving = false) {
    if (!client.roomId) return;
    
    const room = rooms.get(client.roomId);
    if (!room) return;
    
    // 检查是否是房主
    if (room.host !== client.id && !isHostLeaving) {
        sendToClient(client.client, {
            type: 'error',
            message: '只有房主可以关闭房间'
        });
        return;
    }
    
    const roomId = room.id;
    const roomName = room.name;
    
    // 通知所有玩家房间关闭
    const closeReason = isHostLeaving ? '房主已离开' : '房间已关闭';
    broadcastToRoom(roomId, {
        type: 'room_closed',
        roomId,
        reason: closeReason
    });
    
    // 重置玩家房间状态
    room.players.forEach(player => {
        const pClient = clients.get(player.clientId);
        if (pClient) {
            pClient.roomId = null;
        }
    });
    
    // 删除房间
    rooms.delete(roomId);
    
    // 重置当前客户端房间状态
    client.roomId = null;
    
    log(`房间关闭: ${roomName} (${roomId}) 由 ${isHostLeaving ? '系统（房主离开）' : client.playerInfo?.username || '未知'}`);
    
    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 处理房间消息
function handleRoomMessage(client, data) {
    if (!client.roomId) {
        sendToClient(client.client, {
            type: 'error',
            message: '您不在任何房间中'
        });
        return;
    }
    
    const room = rooms.get(client.roomId);
    if (!room) return;
    
    const messageData = {
        type: 'room_message',
        roomId: client.roomId,
        sender: {
            id: client.id,
            playerInfo: client.playerInfo
        },
        content: data.content,
        messageType: data.messageType || 'chat',
        timestamp: new Date()
    };
    
    // 广播消息给房间内所有玩家
    broadcastToRoom(client.roomId, messageData);
    
    log(`房间消息 [${room.name}]: ${client.playerInfo.username}: ${data.content}`);
}

// 处理获取房间列表
function handleGetRooms(client) {
    const roomList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        description: room.description,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        gameVersion: room.gameVersion,
        status: room.status,
        hasPassword: !!room.password,
        hostName: room.players.find(p => p.clientId === room.host)?.playerInfo?.username || '未知'
    }));
    
    sendToClient(client.client, {
        type: 'room_list',
        rooms: roomList
    });
}

// 处理获取房间详情
function handleGetRoomDetails(client, data) {
    const room = rooms.get(data.roomId);
    if (!room) {
        sendToClient(client.client, {
            type: 'error',
            message: '房间不存在'
        });
        return;
    }
    
    // 如果房间有密码且不是房间内的玩家，不返回完整信息
    const isInRoom = room.players.some(p => p.clientId === client.id);
    const isPasswordProtected = !!room.password;
    
    if (isPasswordProtected && !isInRoom) {
        sendToClient(client.client, {
            type: 'error',
            message: '需要密码才能查看房间详情'
        });
        return;
    }
    
    sendToClient(client.client, {
        type: 'room_details',
        room: {
            id: room.id,
            name: room.name,
            description: room.description,
            host: room.host,
            hostName: room.players.find(p => p.clientId === room.host)?.playerInfo?.username || '未知',
            maxPlayers: room.maxPlayers,
            gameVersion: room.gameVersion,
            mods: room.mods,
            resourcePacks: room.resourcePacks,
            status: room.status,
            hasPassword: isPasswordProtected,
            players: room.players.map(p => ({
                id: p.clientId,
                playerInfo: p.playerInfo
            })),
            createdAt: room.createdAt,
            updatedAt: room.updatedAt
        }
    });
}

// 处理设置房间状态
function handleSetRoomStatus(client, data) {
    if (!client.roomId) {
        sendToClient(client.client, {
            type: 'error',
            message: '您不在任何房间中'
        });
        return;
    }
    
    const room = rooms.get(client.roomId);
    if (!room) return;
    
    // 检查是否是房主
    if (room.host !== client.id) {
        sendToClient(client.client, {
            type: 'error',
            message: '只有房主可以设置房间状态'
        });
        return;
    }
    
    const validStatuses = ['open', 'closed', 'in_game'];
    if (!validStatuses.includes(data.status)) {
        sendToClient(client.client, {
            type: 'error',
            message: '无效的房间状态'
        });
        return;
    }
    
    room.status = data.status;
    room.updatedAt = new Date();
    
    // 广播状态更新
    broadcastToRoom(room.id, {
        type: 'room_status_changed',
        roomId: room.id,
        status: room.status
    });
    
    log(`房间状态更新: ${room.name} (${room.id}) -> ${room.status} 由 ${client.playerInfo.username}`);
    
    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 处理更新玩家信息
function handleUpdatePlayerInfo(client, data) {
    if (!client.playerInfo) return;
    
    // 更新玩家信息
    Object.assign(client.playerInfo, data.playerInfo);
    
    // 如果在房间中，通知其他玩家
    if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room) {
            const player = room.players.find(p => p.clientId === client.id);
            if (player) {
                player.playerInfo = client.playerInfo;
            }
            
            broadcastToRoom(client.roomId, {
                type: 'player_info_updated',
                player: { id: client.id, playerInfo: client.playerInfo },
                roomId: client.roomId
            }, client.client);
        }
    }
    
    // 发送确认消息
    sendToClient(client.client, {
        type: 'player_info_updated',
        playerInfo: client.playerInfo
    });
}

// 处理P2P信令
function handleP2PSignal(client, data) {
    const targetClient = clients.get(data.targetId);
    if (!targetClient) {
        sendToClient(client.client, {
            type: 'error',
            message: '目标用户不存在'
        });
        return;
    }
    
    // 确保两个用户在同一个房间
    if (client.roomId !== targetClient.roomId) {
        sendToClient(client.client, {
            type: 'error',
            message: '目标用户不在同一个房间'
        });
        return;
    }
    
    // 转发信令
    sendToClient(targetClient.client, {
        type: 'p2p_signal',
        senderId: client.id,
        signal: data.signal
    });
}

// 处理客户端断开连接
function handleDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;
    
    log(`客户端断开: ${clientId}${client.playerInfo ? ` (${client.playerInfo.username})` : ''}`);
    
    // 如果在房间中，离开房间
    if (client.roomId) {
        handleLeaveRoom(client);
    }
    
    // 移除客户端
    clients.delete(clientId);
}

// 广播房间列表更新
function broadcastRoomListUpdate() {
    const roomList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        description: room.description,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        gameVersion: room.gameVersion,
        status: room.status,
        hasPassword: !!room.password,
        hostName: room.players.find(p => p.clientId === room.host)?.playerInfo?.username || '未知'
    }));
    
    const updateMessage = JSON.stringify({
        type: 'room_list_updated',
        rooms: roomList
    });
    
    clients.forEach(client => {
        if (client.client.readyState === WebSocket.OPEN) {
            client.client.send(updateMessage);
        }
    });
}

// 定期清理过期房间（超过24小时没有更新的房间）
function cleanupExpiredRooms() {
    const now = new Date();
    const expiryTime = 24 * 60 * 60 * 1000; // 24小时
    
    rooms.forEach((room, roomId) => {
        if (now - room.updatedAt > expiryTime) {
            log(`清理过期房间: ${room.name} (${roomId})`);
            handleCloseRoom({ roomId }, true);
        }
    });
}

// 启动服务器
server.listen(PORT, HOST, () => {
    log(`P2P中央服务器启动在 ${HOST}:${PORT}`);
    log(`健康检查: http://${HOST}:${PORT}/health`);
    
    // 启动定期清理任务（每小时执行一次）
    setInterval(cleanupExpiredRooms, 60 * 60 * 1000);
    
    // 初始清理
    cleanupExpiredRooms();
});

// 处理进程信号
process.on('SIGINT', () => {
    log('接收到终止信号，正在关闭服务器...');
    
    // 通知所有客户端服务器关闭
    const shutdownMessage = JSON.stringify({
        type: 'server_shutdown',
        message: '服务器正在关闭，请稍后再试'
    });
    
    clients.forEach(client => {
        if (client.client.readyState === WebSocket.OPEN) {
            client.client.send(shutdownMessage);
        }
    });
    
    // 关闭所有房间
    rooms.forEach((room, roomId) => {
        handleCloseRoom({ roomId }, true);
    });
    
    // 关闭服务器
    server.close(() => {
        log('服务器已关闭');
        process.exit(0);
    });
});

// 导出服务器对象供测试使用
module.exports = { server, wss, rooms, clients };