// P2P连接配置文件 (CommonJS版本，供Electron主进程使用)
module.exports = {
  // 中央服务器配置
  centralServer: {
    url: process.env.CENTRAL_SERVER_URL || 'http://localhost:3000',
    apiEndpoints: {
      users: {
        register: '/api/users/register',
        login: '/api/users/login',
        profile: '/api/users/profile',
        stats: '/api/users/stats'
      },
      rooms: {
        list: '/api/rooms',
        create: '/api/rooms/create',
        get: '/api/rooms/:id',
        join: '/api/rooms/:id/join',
        leave: '/api/rooms/:id/leave',
        update: '/api/rooms/:id/update'
      }
    }
  },
  
  // 第三方服务器配置
  thirdPartyServer: {
    url: process.env.THIRD_PARTY_SERVER_URL || 'http://localhost:3001',
    socketEvents: {
      connect: 'connect',
      disconnect: 'disconnect',
      joinRoom: 'join-room',
      leaveRoom: 'leave-room',
      userJoined: 'user-joined',
      userLeft: 'user-left',
      roomInfo: 'room-info',
      signal: 'signal',
      offer: 'offer',
      answer: 'answer',
      iceCandidate: 'ice-candidate',
      error: 'error'
    }
  },
  
  // STUN/TURN服务器配置
  iceServers: [
    // 默认STUN服务器
    {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      username: '',
      credential: ''
    }
  ],
  
  // P2P连接参数
  peerConfig: {
    useSignalingRelay: true,
    trickle: false,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 2000,
    iceGatheringTimeout: 10000,
    iceConnectionTimeout: 15000,
    heartbeatInterval: 30000,
    connectionTimeout: 60000,
    dataChannel: {
      ordered: true,
      maxRetransmits: 10,
      id: 'p2p-game-channel'
    }
  },
  
  // 网络类型检测配置
  natDetection: {
    enabled: true,
    timeout: 5000,
    stunTimeout: 3000,
    natTypePriority: ['full-cone', 'restricted', 'port-restricted', 'symmetric', 'unknown']
  }
};