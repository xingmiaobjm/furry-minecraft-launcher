const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 用户模型
const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => require('shortid').generate()
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50]
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  deviceInfo: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  clientVersion: {
    type: DataTypes.STRING,
    defaultValue: 'unknown'
  },
  onlineStatus: {
    type: DataTypes.ENUM('online', 'offline', 'away'),
    defaultValue: 'offline'
  },
  userSettings: {
    type: DataTypes.JSON,
    defaultValue: {
      theme: 'default',
      language: 'zh-CN',
      notificationsEnabled: true
    }
  },
  statistics: {
    type: DataTypes.JSON,
    defaultValue: {
      totalRoomsCreated: 0,
      totalRoomsJoined: 0,
      totalPlayTime: 0
    }
  },
  lastLogin: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
    tableName: 'users' // 暂时移除索引定义，避免同步时的字段顺序问题
  });

// 房间模型
const Room = sequelize.define('Room', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => require('shortid').generate()
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  hostId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  hostUsername: {
    type: DataTypes.STRING,
    allowNull: false
  },
  hostAddress: {
    type: DataTypes.STRING,
    allowNull: false
  },
  hostPort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 65535
    }
  },
  maxPlayers: {
    type: DataTypes.INTEGER,
    defaultValue: 8,
    validate: {
      min: 1,
      max: 100
    }
  },
  currentPlayers: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 0
    }
  },
  gameVersion: {
    type: DataTypes.STRING,
    defaultValue: 'unknown'
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('waiting', 'playing', 'closed'),
    defaultValue: 'waiting'
  },
  lastActivity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
    tableName: 'rooms' // 暂时移除索引定义，避免同步时的字段顺序问题
  });

// 统计模型
const Stat = sequelize.define('Stat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  totalUsers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalRooms: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  activeUsers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  activeRooms: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'stats'
});

// 定义模型关联关系
User.hasMany(Room, { foreignKey: 'hostId', as: 'rooms' });
Room.belongsTo(User, { foreignKey: 'hostId', as: 'host' });

module.exports = {
  User,
  Room,
  Stat,
  sequelize // 导出sequelize实例，确保模型加载时能正确同步
};