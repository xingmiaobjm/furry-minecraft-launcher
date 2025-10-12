// P2P连接配置文件
export const p2pConfig = {
  // 中央服务器配置
  centralServer: {
    url: process.env.REACT_APP_CENTRAL_SERVER_URL || 'http://localhost:3000',
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
    url: process.env.REACT_APP_THIRD_PARTY_SERVER_URL || 'http://localhost:3001',
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
    },
    // 可以添加自定义TURN服务器
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'your-username',
    //   credential: 'your-credential'
    // }
  ],
  
  // P2P连接参数
  peerConfig: {
    // 是否启用信令服务器转发（用于对称NAT穿透）
    useSignalingRelay: true,
    // 是否启用trickle ICE（渐进式ICE候选项）
    trickle: false,
    // 是否自动重连
    autoReconnect: true,
    // 重连最大尝试次数
    maxReconnectAttempts: 5,
    // 重连间隔（毫秒）
    reconnectInterval: 2000,
    // ICE收集超时（毫秒）
    iceGatheringTimeout: 10000,
    // ICE连接超时（毫秒）
    iceConnectionTimeout: 15000,
    // 连接检查间隔（心跳，毫秒）
    heartbeatInterval: 30000,
    // 连接超时阈值（毫秒）
    connectionTimeout: 60000,
    // 数据通道配置
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
    // NAT类型优先级（从最容易穿透到最难）
    natTypePriority: ['full-cone', 'restricted', 'port-restricted', 'symmetric', 'unknown']
  },
  
  // 数据传输配置
  dataTransfer: {
    // 消息类型定义
    messageTypes: {
      // 系统消息
      SYSTEM: {
        PING: 'ping',
        PONG: 'pong',
        HEARTBEAT: 'heartbeat',
        ERROR: 'error',
        STATUS: 'status',
        NAT_TYPE: 'nat_type'
      },
      // 房间消息
      ROOM: {
        CREATE: 'room_create',
        JOIN: 'room_join',
        LEAVE: 'room_leave',
        UPDATE: 'room_update',
        LIST: 'room_list',
        START: 'room_start',
        END: 'room_end'
      },
      // 游戏消息
      GAME: {
        STATE_SYNC: 'game_state_sync',
        ACTION: 'game_action',
        EVENT: 'game_event',
        CHAT: 'game_chat'
      },
      // 文件传输消息
      FILE: {
        TRANSFER_REQUEST: 'file_transfer_request',
        TRANSFER_RESPONSE: 'file_transfer_response',
        CHUNK: 'file_chunk',
        COMPLETE: 'file_complete',
        CANCEL: 'file_cancel'
      }
    },
    // 消息优先级配置
    priorities: {
      // 最高优先级：游戏操作指令
      HIGH: ['game_action', 'game_state_sync'],
      // 中等优先级：房间控制和聊天
      MEDIUM: ['room_update', 'game_chat', 'ping', 'pong'],
      // 低优先级：文件传输
      LOW: ['file_chunk', 'file_complete', 'file_transfer_request']
    },
    // 数据分片配置
    chunking: {
      enabled: true,
      maxChunkSize: 16384, // 16KB
      chunkTimeout: 5000,
      maxConcurrentTransfers: 3
    },
    // 消息缓存配置
    messageCache: {
      enabled: true,
      maxCacheSize: 100,
      cacheTimeout: 300000 // 5分钟
    }
  },
  
  // 性能优化配置
  performance: {
    // 带宽限制（字节/秒）
    bandwidthLimit: {
      upload: 1000000, // 1MB/s
      download: 5000000 // 5MB/s
    },
    // 帧率限制（用于状态同步）
    syncFrameRate: 30,
    // 压缩配置
    compression: {
      enabled: true,
      threshold: 1024, // 超过1KB的数据才压缩
      level: 1 // 压缩级别（1-9，1最快，9最小）
    },
    // 延迟抖动补偿
    jitterBuffer: {
      enabled: true,
      size: 50 // 缓冲大小（毫秒）
    }
  },
  
  // 安全配置
  security: {
    // 连接加密
    encryption: {
      enabled: true,
      useWebRTCDefault: true,
      customEncryption: false,
      encryptionAlgorithm: 'AES-256-GCM' // 如果使用自定义加密
    },
    // 身份验证
    auth: {
      required: true,
      tokenExpiry: 86400000, // 24小时
      refreshTokenExpiry: 604800000 // 7天
    },
    // 流量控制
    rateLimiting: {
      messagesPerSecond: 100,
      maxConnectionsPerUser: 10,
      maxRoomsPerUser: 5,
      joinRoomCooldown: 60000 // 1分钟内最多加入3次
    },
    // 防止DDoS
    antiDDoS: {
      enabled: true,
      maxRequestsPerIP: 100,
      blockDuration: 300000 // 5分钟
    }
  },
  
  // 错误处理配置
  errorHandling: {
    // 自动处理的错误类型
    autoHandle: [
      'ERR_CONNECTION_LOST',
      'ERR_ICE_CONNECTION_FAILED',
      'ERR_SIGNALING_TIMEOUT',
      'ERR_PEER_DISCONNECTED'
    ],
    // 重试策略
    retry: {
      // 指数退避
      exponentialBackoff: true,
      // 初始重试延迟（毫秒）
      initialDelay: 1000,
      // 最大重试延迟（毫秒）
      maxDelay: 30000,
      // 重试因子
      factor: 2
    }
  },
  
  // 调试配置
  debug: {
    enabled: process.env.NODE_ENV !== 'production',
    level: 'info', // 'debug', 'info', 'warn', 'error'
    logConnections: true,
    logMessages: false,
    logICE: false,
    logSignaling: false,
    logPerformance: false
  },
  
  // 适配配置
  compatibility: {
    // 浏览器兼容性检测
    browserDetection: true,
    // 最低支持的浏览器版本
    minBrowserVersions: {
      chrome: '80',
      firefox: '75',
      edge: '80',
      safari: '14'
    },
    // 操作系统适配
    osSupport: ['windows', 'macos', 'linux'],
    // WebRTC特性检测
    featureDetection: true
  },
  
  // 默认超时配置
  timeouts: {
    // 连接建立超时
    connect: 15000,
    // 信令服务器响应超时
    signaling: 10000,
    // 数据传输超时
    dataTransfer: 30000,
    // 房间操作超时
    roomOperation: 5000,
    // API请求超时
    apiRequest: 8000
  }
};

// 根据环境变量覆盖配置
export const getP2PConfig = () => {
  const config = { ...p2pConfig };
  
  // 从环境变量加载STUN/TURN服务器
  if (process.env.REACT_APP_STUN_SERVERS) {
    try {
      const stunServers = JSON.parse(process.env.REACT_APP_STUN_SERVERS);
      config.iceServers = [...stunServers, ...config.iceServers];
    } catch (e) {
      console.error('Failed to parse STUN_SERVERS environment variable:', e);
    }
  }
  
  if (process.env.REACT_APP_TURN_SERVER) {
    try {
      const turnServer = JSON.parse(process.env.REACT_APP_TURN_SERVER);
      config.iceServers.push(turnServer);
    } catch (e) {
      console.error('Failed to parse TURN_SERVER environment variable:', e);
    }
  }
  
  // 从环境变量加载服务器URL
  if (process.env.REACT_APP_CENTRAL_SERVER_URL) {
    config.centralServer.url = process.env.REACT_APP_CENTRAL_SERVER_URL;
  }
  
  if (process.env.REACT_APP_THIRD_PARTY_SERVER_URL) {
    config.thirdPartyServer.url = process.env.REACT_APP_THIRD_PARTY_SERVER_URL;
  }
  
  // 从环境变量加载调试设置
  if (process.env.REACT_APP_P2P_DEBUG) {
    config.debug.enabled = process.env.REACT_APP_P2P_DEBUG === 'true';
  }
  
  if (process.env.REACT_APP_P2P_DEBUG_LEVEL) {
    config.debug.level = process.env.REACT_APP_P2P_DEBUG_LEVEL;
  }
  
  return config;
};

// 导出配置实例
const config = getP2PConfig();

export default config;