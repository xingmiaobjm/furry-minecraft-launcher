import React, { useState, useEffect, useRef } from 'react';
import SimplePeer from 'simple-peer';
import axios from 'axios';
import io from 'socket.io-client';

const P2PConnect = ({ onConnectionEstablished, onConnectionStatusChange }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [roomId, setRoomId] = useState('');
  const [rooms, setRooms] = useState([]);
  const [joinedRoom, setJoinedRoom] = useState(null);
  const [peers, setPeers] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [statusMessage, setStatusMessage] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [natStatus, setNatStatus] = useState('unknown');
  
  const socketRef = useRef(null);
  const peerInstancesRef = useRef({});
  const myIdRef = useRef(null);
  const centralServerUrl = 'http://localhost:3000';
  const thirdPartyServerUrl = 'http://localhost:3001';
  const stunServers = [{
    urls: ['stun:stun.l.google.com:19302']
  }];
  
  // 登录处理
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setStatusMessage('正在登录...');
      const response = await axios.post(`${centralServerUrl}/api/users/login`, {
        username,
        password
      });
      
      localStorage.setItem('token', response.data.token);
      setUserInfo(response.data.user);
      setIsLoggedIn(true);
      setStatusMessage('登录成功！');
      
      // 登录后加载房间列表
      loadRooms();
    } catch (error) {
      setStatusMessage('登录失败: ' + (error.response?.data?.message || error.message));
    }
  };
  
  // 注册处理
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      setStatusMessage('正在注册...');
      await axios.post(`${centralServerUrl}/api/users/register`, {
        username,
        password
      });
      setStatusMessage('注册成功，请登录！');
    } catch (error) {
      setStatusMessage('注册失败: ' + (error.response?.data?.message || error.message));
    }
  };
  
  // 加载房间列表
  const loadRooms = async () => {
    try {
      const response = await axios.get(`${centralServerUrl}/api/rooms`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setRooms(response.data.rooms);
    } catch (error) {
      setStatusMessage('加载房间列表失败');
      console.error('Failed to load rooms:', error);
    }
  };
  
  // 创建房间
  const createRoom = async () => {
    try {
      setIsCreatingRoom(true);
      setStatusMessage('正在创建房间...');
      
      // 首先检查NAT类型
      await checkNATType();
      
      // 向中央服务器创建房间
      const response = await axios.post(`${centralServerUrl}/api/rooms/create`, {
        name: roomName,
        maxPlayers: parseInt(maxPlayers)
      }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      const { room } = response.data;
      setRoomId(room.id);
      
      // 连接到第三方信令服务器
      connectToSignalingServer(room.id);
      
      setJoinedRoom(room);
      setConnectionStatus('connected');
      setStatusMessage(`房间创建成功！房间ID: ${room.id}`);
      
      // 通知上层组件连接已建立
      if (onConnectionEstablished) {
        onConnectionEstablished({
          roomId: room.id,
          isHost: true,
          natType: natStatus
        });
      }
    } catch (error) {
      setStatusMessage('创建房间失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsCreatingRoom(false);
    }
  };
  
  // 加入房间
  const joinRoom = async () => {
    try {
      setIsJoiningRoom(true);
      setStatusMessage('正在加入房间...');
      
      // 首先检查NAT类型
      await checkNATType();
      
      // 向中央服务器验证房间
      const response = await axios.get(`${centralServerUrl}/api/rooms/${roomId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      const { room } = response.data;
      
      // 连接到第三方信令服务器
      connectToSignalingServer(room.id);
      
      setJoinedRoom(room);
      setConnectionStatus('connecting');
      setStatusMessage('正在连接到房间...');
    } catch (error) {
      setStatusMessage('加入房间失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsJoiningRoom(false);
    }
  };
  
  // 检查NAT类型
  const checkNATType = async () => {
    setStatusMessage('正在检测网络类型...');
    
    try {
      // 创建临时RTCPeerConnection来检测NAT类型
      const pc = new RTCPeerConnection({ iceServers: stunServers });
      
      // 添加一个数据通道
      pc.createDataChannel('test');
      
      // 创建offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // 监听ICE候选
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateType = event.candidate.type;
          
          if (candidateType === 'host') {
            setNatStatus('full-cone'); // 简化判断，实际需要更复杂的逻辑
          } else if (candidateType === 'srflx') {
            setNatStatus('symmetric');
          }
          
          // 停止检查
          setTimeout(() => {
            pc.close();
          }, 2000);
        }
      };
      
      // 模拟检测结果，实际应用中需要更复杂的检测逻辑
      setTimeout(() => {
        setNatStatus('restricted');
        setStatusMessage(`网络类型检测完成: ${getNatTypeText(natStatus)}`);
      }, 1500);
    } catch (error) {
      setNatStatus('unknown');
      setStatusMessage('网络类型检测失败');
      console.error('Failed to check NAT type:', error);
    }
  };
  
  // 连接到信令服务器
  const connectToSignalingServer = (roomId) => {
    // 断开旧的连接
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    // 创建新的WebSocket连接
    socketRef.current = io(thirdPartyServerUrl);
    
    socketRef.current.on('connect', () => {
      console.log('Connected to signaling server');
      myIdRef.current = socketRef.current.id;
      
      // 加入房间
      socketRef.current.emit('join-room', {
        roomId,
        userId: userInfo.id,
        username: userInfo.username
      });
    });
    
    socketRef.current.on('user-joined', (user) => {
      console.log('User joined:', user);
      setStatusMessage(`${user.username} 加入了房间`);
      
      // 如果是房主，创建P2P连接
      if (joinedRoom.hostId === userInfo.id) {
        initiatePeerConnection(user.id, user.username);
      }
    });
    
    socketRef.current.on('offer', (data) => {
      console.log('Received offer from:', data.from);
      handleIncomingOffer(data);
    });
    
    socketRef.current.on('answer', (data) => {
      console.log('Received answer from:', data.from);
      handleAnswer(data);
    });
    
    socketRef.current.on('ice-candidate', (data) => {
      console.log('Received ICE candidate from:', data.from);
      handleIceCandidate(data);
    });
    
    socketRef.current.on('user-left', (user) => {
      console.log('User left:', user);
      setStatusMessage(`${user.username} 离开了房间`);
      
      // 清理离开用户的P2P连接
      if (peerInstancesRef.current[user.id]) {
        peerInstancesRef.current[user.id].destroy();
        delete peerInstancesRef.current[user.id];
        
        setPeers(prev => {
          const newPeers = { ...prev };
          delete newPeers[user.id];
          return newPeers;
        });
      }
    });
    
    socketRef.current.on('room-info', (roomInfo) => {
      console.log('Room info updated:', roomInfo);
      setJoinedRoom(roomInfo);
    });
    
    socketRef.current.on('error', (error) => {
      console.error('Signaling server error:', error);
      setStatusMessage('信令服务器连接错误');
    });
    
    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      setConnectionStatus('disconnected');
      setStatusMessage('与信令服务器断开连接');
    });
  };
  
  // 初始化P2P连接
  const initiatePeerConnection = (peerId, peerUsername) => {
    setStatusMessage(`正在与 ${peerUsername} 建立P2P连接...`);
    
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      config: {
        iceServers: stunServers
      }
    });
    
    peer.on('signal', (data) => {
      // 发送offer到信令服务器
      socketRef.current.emit('signal', {
        type: 'offer',
        target: peerId,
        data
      });
    });
    
    peer.on('connect', () => {
      console.log('P2P connection established with:', peerId);
      setStatusMessage(`与 ${peerUsername} 连接成功！`);
      
      setPeers(prev => ({
        ...prev,
        [peerId]: {
          id: peerId,
          username: peerUsername,
          connected: true
        }
      }));
      
      // 更新连接状态
      setConnectionStatus('connected');
      if (onConnectionStatusChange) {
        onConnectionStatusChange('connected');
      }
    });
    
    peer.on('data', (data) => {
      handlePeerData(peerId, data);
    });
    
    peer.on('error', (err) => {
      console.error('P2P error with', peerId, ':', err);
      setStatusMessage(`与 ${peerUsername} 连接失败: ${err.message}`);
    });
    
    peer.on('close', () => {
      console.log('P2P connection closed with:', peerId);
      setStatusMessage(`${peerUsername} 断开了P2P连接`);
      
      delete peerInstancesRef.current[peerId];
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[peerId];
        return newPeers;
      });
    });
    
    // 保存peer实例
    peerInstancesRef.current[peerId] = peer;
  };
  
  // 处理传入的offer
  const handleIncomingOffer = (data) => {
    const { from, data: offerData } = data;
    
    setStatusMessage('正在响应P2P连接请求...');
    
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      config: {
        iceServers: stunServers
      }
    });
    
    peer.signal(offerData);
    
    peer.on('signal', (answer) => {
      // 发送answer到信令服务器
      socketRef.current.emit('signal', {
        type: 'answer',
        target: from,
        data: answer
      });
    });
    
    peer.on('connect', () => {
      console.log('P2P connection established with:', from);
      setStatusMessage(`P2P连接已建立！`);
      
      setPeers(prev => ({
        ...prev,
        [from]: {
          id: from,
          username: rooms.find(r => r.id === joinedRoom?.id)?.players.find(p => p.id === from)?.username || `玩家${from.slice(0, 4)}`,
          connected: true
        }
      }));
      
      // 更新连接状态
      setConnectionStatus('connected');
      if (onConnectionStatusChange) {
        onConnectionStatusChange('connected');
      }
      
      // 通知上层组件连接已建立
      if (onConnectionEstablished) {
        onConnectionEstablished({
          roomId: joinedRoom.id,
          isHost: false,
          natType: natStatus
        });
      }
    });
    
    peer.on('data', (data) => {
      handlePeerData(from, data);
    });
    
    peer.on('error', (err) => {
      console.error('P2P error with', from, ':', err);
      setStatusMessage(`P2P连接失败: ${err.message}`);
    });
    
    peer.on('close', () => {
      console.log('P2P connection closed with:', from);
      
      delete peerInstancesRef.current[from];
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[from];
        return newPeers;
      });
    });
    
    // 保存peer实例
    peerInstancesRef.current[from] = peer;
  };
  
  // 处理answer
  const handleAnswer = (data) => {
    const { from, data: answerData } = data;
    
    if (peerInstancesRef.current[from]) {
      peerInstancesRef.current[from].signal(answerData);
    }
  };
  
  // 处理ICE候选
  const handleIceCandidate = (data) => {
    const { from, data: candidateData } = data;
    
    if (peerInstancesRef.current[from]) {
      peerInstancesRef.current[from].signal(candidateData);
    }
  };
  
  // 处理收到的P2P数据
  const handlePeerData = (peerId, data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received P2P data from', peerId, ':', message);
      
      // 处理不同类型的消息
      switch (message.type) {
        case 'game-state':
          // 处理游戏状态同步
          break;
        case 'chat':
          // 处理聊天消息
          break;
        case 'ping':
          // 响应心跳包
          sendP2PMessage(peerId, { type: 'pong', timestamp: Date.now() });
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse P2P data:', error);
    }
  };
  
  // 发送P2P消息
  const sendP2PMessage = (peerId, message) => {
    if (peerInstancesRef.current[peerId]) {
      peerInstancesRef.current[peerId].send(JSON.stringify(message));
    }
  };
  
  // 广播消息到所有连接的对等点
  const broadcastMessage = (message) => {
    Object.keys(peerInstancesRef.current).forEach(peerId => {
      sendP2PMessage(peerId, message);
    });
  };
  
  // 离开房间
  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room', {
        roomId: joinedRoom?.id,
        userId: userInfo?.id
      });
      socketRef.current.disconnect();
    }
    
    // 清理所有P2P连接
    Object.values(peerInstancesRef.current).forEach(peer => {
      peer.destroy();
    });
    
    peerInstancesRef.current = {};
    setPeers({});
    setJoinedRoom(null);
    setRoomId('');
    setConnectionStatus('disconnected');
    setStatusMessage('已离开房间');
    
    if (onConnectionStatusChange) {
      onConnectionStatusChange('disconnected');
    }
  };
  
  // 退出登录
  const logout = () => {
    leaveRoom();
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setUserInfo(null);
    setUsername('');
    setPassword('');
    setStatusMessage('已退出登录');
  };
  
  // 获取NAT类型的可读文本
  const getNatTypeText = (type) => {
    const types = {
      'full-cone': '全锥形NAT',
      'restricted': '地址受限NAT',
      'port-restricted': '端口受限NAT',
      'symmetric': '对称NAT',
      'unknown': '未知'
    };
    return types[type] || type;
  };
  
  // 获取连接状态的可读文本
  const getConnectionStatusText = (status) => {
    const statuses = {
      'disconnected': '已断开',
      'connecting': '连接中',
      'connected': '已连接',
      'error': '连接错误'
    };
    return statuses[status] || status;
  };
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      Object.values(peerInstancesRef.current).forEach(peer => {
        peer.destroy();
      });
    };
  }, []);
  
  // 定期发送心跳包保持连接
  useEffect(() => {
    let heartbeatInterval;
    
    if (connectionStatus === 'connected') {
      heartbeatInterval = setInterval(() => {
        broadcastMessage({ type: 'ping', timestamp: Date.now() });
      }, 30000); // 每30秒发送一次心跳
    }
    
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [connectionStatus]);
  
  // 自动刷新房间列表
  useEffect(() => {
    let roomInterval;
    
    if (isLoggedIn && !joinedRoom) {
      roomInterval = setInterval(loadRooms, 5000); // 每5秒刷新一次
    }
    
    return () => {
      if (roomInterval) {
        clearInterval(roomInterval);
      }
    };
  }, [isLoggedIn, joinedRoom]);
  
  // 渲染登录/注册表单
  if (!isLoggedIn) {
    return (
      <div className="p2p-connect-container">
        <h2>P2P联机功能</h2>
        
        <div className="auth-forms">
          <form onSubmit={handleLogin} className="login-form">
            <h3>登录</h3>
            <div className="form-group">
              <label>用户名:</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>密码:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit">登录</button>
          </form>
          
          <form onSubmit={handleRegister} className="register-form">
            <h3>注册</h3>
            <div className="form-group">
              <label>用户名:</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>密码:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit">注册</button>
          </form>
        </div>
        
        {statusMessage && <div className="status-message">{statusMessage}</div>}
      </div>
    );
  }
  
  // 渲染房间创建/加入界面
  if (!joinedRoom) {
    return (
      <div className="p2p-connect-container">
        <div className="user-info">
          <span>欢迎, {userInfo.username}</span>
          <button onClick={logout}>退出</button>
        </div>
        
        <h2>P2P联机功能</h2>
        
        <div className="connection-status">
          <span>网络类型: {getNatTypeText(natStatus)}</span>
          <span>连接状态: {getConnectionStatusText(connectionStatus)}</span>
        </div>
        
        <div className="room-actions">
          <div className="create-room">
            <h3>创建房间</h3>
            <div className="form-group">
              <label>房间名称:</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="输入房间名称"
              />
            </div>
            <div className="form-group">
              <label>最大玩家数:</label>
              <input
                type="number"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                min="2"
                max="10"
                defaultValue="4"
              />
            </div>
            <button onClick={createRoom} disabled={isCreatingRoom}>创建房间</button>
          </div>
          
          <div className="join-room">
            <h3>加入房间</h3>
            <div className="form-group">
              <label>房间ID:</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="输入房间ID"
              />
            </div>
            <button onClick={joinRoom} disabled={isJoiningRoom}>加入房间</button>
          </div>
        </div>
        
        <div className="active-rooms">
          <h3>活跃房间</h3>
          <button onClick={loadRooms}>刷新列表</button>
          <div className="rooms-list">
            {rooms.length > 0 ? (
              rooms.map(room => (
                <div key={room.id} className="room-item">
                  <div className="room-info">
                    <h4>{room.name}</h4>
                    <p>房主: {room.hostUsername}</p>
                    <p>玩家: {room.currentPlayers}/{room.maxPlayers}</p>
                  </div>
                  <button onClick={() => {
                    setRoomId(room.id);
                    // 可以直接自动加入
                    // joinRoom();
                  }}>加入</button>
                </div>
              ))
            ) : (
              <p>暂无活跃房间</p>
            )}
          </div>
        </div>
        
        {statusMessage && <div className="status-message">{statusMessage}</div>}
      </div>
    );
  }
  
  // 渲染房间内界面
  return (
    <div className="p2p-connect-container">
      <div className="user-info">
        <span>欢迎, {userInfo.username}</span>
        <button onClick={logout}>退出</button>
      </div>
      
      <h2>房间: {joinedRoom.name}</h2>
      
      <div className="room-status">
        <span>房间ID: {joinedRoom.id}</span>
        <span>状态: {joinedRoom.status === 'waiting' ? '等待中' : '游戏中'}</span>
        <span>玩家: {joinedRoom.currentPlayers}/{joinedRoom.maxPlayers}</span>
        <span>网络类型: {getNatTypeText(natStatus)}</span>
        <span>连接状态: {getConnectionStatusText(connectionStatus)}</span>
      </div>
      
      <div className="room-actions">
        <button onClick={leaveRoom}>离开房间</button>
        {joinedRoom.hostId === userInfo.id && (
          <button onClick={() => {
            // 开始游戏逻辑
            broadcastMessage({ type: 'game-start', timestamp: Date.now() });
            setStatusMessage('游戏已开始！');
          }}>开始游戏</button>
        )}
      </div>
      
      <div className="players-list">
        <h3>玩家列表</h3>
        {joinedRoom.players && joinedRoom.players.length > 0 ? (
          <ul>
            {joinedRoom.players.map(player => (
              <li key={player.id} className={player.id === joinedRoom.hostId ? 'host' : ''}>
                {player.username} {player.id === joinedRoom.hostId && '(房主)'}
                {peers[player.id] && peers[player.id].connected && ' ✅'}
              </li>
            ))}
          </ul>
        ) : (
          <p>加载中...</p>
        )}
      </div>
      
      {statusMessage && <div className="status-message">{statusMessage}</div>}
      
      {/* 这里可以添加聊天功能、游戏控制等其他UI元素 */}
    </div>
  );
};

export default P2PConnect;

// 样式参考（实际应用中应该使用CSS模块或styled-components）
/*
.p2p-connect-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.auth-forms {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
}

.form-group input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 10px 15px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.status-message {
  margin-top: 20px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
}

.user-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.connection-status {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  font-size: 0.9rem;
}

.room-actions {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
}

.create-room, .join-room {
  flex: 1;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.active-rooms {
  margin-top: 30px;
}

.rooms-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 6px;
}

.room-info h4 {
  margin-bottom: 5px;
}

.room-info p {
  margin: 0;
  font-size: 0.9rem;
  color: #666;
}

.room-status {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
  font-size: 0.9rem;
}

.players-list ul {
  list-style: none;
  padding: 0;
}

.players-list li {
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.players-list li.host {
  font-weight: bold;
  color: #667eea;
}
*/