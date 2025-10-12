/**
 * 启动器常量配置
 */

module.exports = {
    // 应用版本信息
    APP: {
        NAME: 'Furry Minecraft Launcher',
        VERSION: '1.0.0',
        AUTHORS: ['星眇'],
        DESCRIPTION: 'Furry风格的Minecraft启动器，支持多版本管理和P2P联机',
        GITHUB: 'https://github.com/xingmiaobjm/furry-minecraft-launcher'
    },
    
    // 默认路径配置
    PATHS: {
        // 各平台默认游戏目录
        DEFAULT_GAME_DIR: {
            win32: '\\.minecraft',
            darwin: '/Library/Application Support/minecraft',
            linux: '/.minecraft'
        },
        
        // Java搜索路径
        JAVA_SEARCH_PATHS: {
            win32: [
                'C:\\Program Files\\Java',
                'C:\\Program Files (x86)\\Java',
                process.env.JAVA_HOME
            ],
            darwin: [
                '/Library/Java/JavaVirtualMachines',
                process.env.JAVA_HOME
            ],
            linux: [
                '/usr/lib/jvm',
                '/usr/java',
                process.env.JAVA_HOME
            ]
        },
        
        // 资源文件夹名称
        RESOURCE_DIRS: {
            MODS: 'mods',
            RESOURCE_PACKS: 'resourcepacks',
            SHADER_PACKS: 'shaderpacks',
            SAVES: 'saves',
            LOGS: 'logs',
            JOURNEYMAP: 'journeymap',
            OPTIFINE: 'config/optifine'
        }
    },
    
    // Minecraft相关常量
    MINECRAFT: {
        // 最小推荐内存（MB）
        MIN_RECOMMENDED_MEMORY: 1024,
        // 最大推荐内存（MB）
        MAX_RECOMMENDED_MEMORY: 8192,
        // 默认JVM参数
        DEFAULT_JVM_ARGS: [
            '-XX:+UseG1GC',
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Dfml.ignoreInvalidMinecraftCertificates=true',
            '-Dfml.ignorePatchDiscrepancies=true'
        ],
        // 支持的Mod加载器
        MOD_LOADERS: ['vanilla', 'fabric', 'forge', 'quilt'],
        // 支持的游戏版本类型
        VERSION_TYPES: ['release', 'snapshot', 'old_beta', 'old_alpha'],
        // Minecraft官方API
        API: {
            VERSIONS_MANIFEST: 'https://piston-meta.mojang.com/mc/game/version_manifest.json',
            ASSETS_INDEX: 'https://resources.download.minecraft.net',
            LIBRARIES: 'https://libraries.minecraft.net',
            AUTH_SERVER: 'https://authserver.mojang.com',
            SESSION_SERVER: 'https://sessionserver.mojang.com'
        }
    },
    
    // P2P网络常量
    P2P: {
        // 默认端口配置
        DEFAULT_PORTS: {
            CENTRAL_SERVER: 8080,
            THIRD_PARTY_SERVER: 8081,
            STUN_SERVER: 3478,
            TURN_SERVER: 3478
        },
        
        // 连接超时设置
        TIMEOUTS: {
            CONNECTION: 10000, // 10秒
            HANDSHAKE: 5000,  // 5秒
            HEARTBEAT: 30000  // 30秒
        },
        
        // 最大房间数量
        MAX_ROOMS: 100,
        // 每个房间最大玩家数
        MAX_PLAYERS_PER_ROOM: 16,
        // 信令类型
        SIGNAL_TYPES: {
            JOIN_ROOM: 'join_room',
            LEAVE_ROOM: 'leave_room',
            OFFER: 'offer',
            ANSWER: 'answer',
            ICE_CANDIDATE: 'ice_candidate',
            ROOM_UPDATE: 'room_update',
            ERROR: 'error',
            HEARTBEAT: 'heartbeat'
        },
        
        // STUN/TURN服务器配置
        STUN_SERVERS: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ],
        
        TURN_SERVERS: []
    },
    
    // 下载相关配置
    DOWNLOAD: {
        // 区块大小（字节）
        CHUNK_SIZE: 1024 * 1024, // 1MB
        // 重试间隔（毫秒）
        RETRY_INTERVAL: 2000,
        // 临时文件后缀
        TEMP_FILE_SUFFIX: '.downloading',
        // 镜像站点
        MIRRORS: {
            OFFICIAL: 'https://download.mojang.com',
            BMCLAPI: 'https://bmclapi2.bangbang93.com',
            MCBUGFIX: 'https://download.mcbbs.net',
            MCBBS: 'https://bmclapi.bangbang93.com'
        },
        // 下载优先级
        MIRROR_PRIORITY: ['BMCLAPI', 'MCBUGFIX', 'MCBBS', 'OFFICIAL']
    },
    
    // 窗口配置
    WINDOW: {
        // 最小窗口尺寸
        MIN_SIZE: { width: 800, height: 600 },
        // 默认窗口尺寸
        DEFAULT_SIZE: { width: 1024, height: 600 },
        // 窗口标题栏高度
        TITLE_BAR_HEIGHT: 32,
        // 窗口阴影
        SHADOW: {
            blur: 20,
            color: '#000000',
            opacity: 0.3
        }
    },
    
    // 缓存配置
    CACHE: {
        // 缓存过期时间（毫秒）
        EXPIRE_TIME: {
            VERSIONS: 24 * 60 * 60 * 1000, // 24小时
            AUTH_TOKEN: 24 * 60 * 60 * 1000, // 24小时
            NEWS: 1 * 60 * 60 * 1000, // 1小时
            MOD_INFO: 12 * 60 * 60 * 1000 // 12小时
        },
        // 最大缓存大小（MB）
        MAX_SIZE: 512
    },
    
    // 日志配置
    LOGGER: {
        // 日志级别
        LEVELS: {
            ERROR: 'error',
            WARN: 'warn',
            INFO: 'info',
            DEBUG: 'debug',
            TRACE: 'trace'
        },
        // 日志文件大小限制（MB）
        MAX_FILE_SIZE: 10,
        // 保留的日志文件数量
        MAX_FILES: 5
    },
    
    // 主题配置
    THEME: {
        // 支持的主题
        THEMES: ['dark', 'light', 'furry', 'neon'],
        // 默认主题
        DEFAULT: 'dark',
        // 颜色方案
        COLORS: {
            dark: {
                primary: '#6c5ce7',
                secondary: '#a29bfe',
                accent: '#fd79a8',
                background: '#1e1e2f',
                card: '#2d2d44',
                border: '#3d3d5c',
                text: '#ffffff',
                textSecondary: '#b2bec3',
                success: '#00b894',
                warning: '#fdcb6e',
                error: '#e17055',
                info: '#0984e3'
            },
            light: {
                primary: '#6c5ce7',
                secondary: '#a29bfe',
                accent: '#fd79a8',
                background: '#f5f6fa',
                card: '#ffffff',
                border: '#dfe6e9',
                text: '#2d3436',
                textSecondary: '#636e72',
                success: '#00b894',
                warning: '#fdcb6e',
                error: '#e17055',
                info: '#0984e3'
            }
        }
    },
    
    // 语言配置
    LANGUAGE: {
        // 支持的语言
        LANGUAGES: ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'],
        // 默认语言
        DEFAULT: 'zh-CN'
    },
    
    // 性能监控配置
    PERFORMANCE: {
        // CPU使用率警告阈值
        CPU_WARNING_THRESHOLD: 80,
        // 内存使用率警告阈值
        MEMORY_WARNING_THRESHOLD: 85,
        // 监控间隔（毫秒）
        MONITOR_INTERVAL: 5000
    },
    
    // 安全配置
    SECURITY: {
        // 密码最小长度
        MIN_PASSWORD_LENGTH: 6,
        // 密码强度要求
        PASSWORD_REQUIREMENTS: {
            lowercase: true,
            uppercase: false,
            numbers: true,
            specialChars: false
        },
        // 登录尝试限制
        LOGIN_ATTEMPTS_LIMIT: 5,
        // 锁定时间（分钟）
        LOCKOUT_TIME: 15
    }
};