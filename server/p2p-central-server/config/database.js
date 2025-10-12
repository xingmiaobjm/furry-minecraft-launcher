require('dotenv').config();
const { Sequelize } = require('sequelize');

// 数据库配置
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'furry_minecraft_launcher',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  dialect: 'mysql',
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

// 创建Sequelize实例
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool: config.pool,
    define: {
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      underscored: true,
      freezeTableName: true
    }
  }
);

// 测试数据库连接
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
}

// 同步数据库模型
async function syncModels() {
  try {
    // 确保所有模型都已加载
    require('../models');
    
    await sequelize.sync({
      alter: true // 自动更新表结构
    });
    console.log('数据库模型同步成功');
  } catch (error) {
    console.error('数据库模型同步失败:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  testConnection,
  syncModels
};