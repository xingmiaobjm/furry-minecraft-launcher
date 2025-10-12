# Furry Minecraft Launcher P2P 服务器指南

## 简介

本文档详细介绍了Furry Minecraft Launcher中的P2P联机服务器组件，包括中央服务器和第三方部署服务器的安装、配置和使用方法。

## 服务器架构

### 1. 中央服务器 (p2p-central-server)

负责用户认证、房间管理和数据统计，具备以下功能：
<<<<<<< HEAD
- 用户注册、登录和信息管理
- 房间创建、查询和状态管理
- Web管理面板用于监控
- 用户统计（归属地、使用量）
- 哈希加密保护用户数据
=======

- 用户注册、登录和信息管理
- 房间创建、查询和状态管理
- Web管理面板用于监控
- 用户统计（归属地, 使用量, 活跃用户数, 活跃房间数）
- 哈希加密
>>>>>>> 9f797c5bff6371242f00854a76799160e9079f9e

### 2. 第三方部署服务器 (p2p-third-party-server)

负责P2P信令转发和STUN/TURN服务，具备以下功能：
- WebSocket实时通信
- 房间信令转发
- NAT穿透支持
- 连接状态监控
- 性能统计

## 安装和配置

### 前置要求

- Node.js v14+ 或更高版本
- npm 或 yarn 包管理器

### 中央服务器安装

1. 进入中央服务器目录：
```bash
cd p2p-central-server
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
   - 复制 `.env.example` 为 `.env`
   - 根据需要修改配置参数
   - 重点配置：JWT_SECRET、数据库路径、端口等

4. 启动服务器：
```bash
npm start
```

### 第三方部署服务器安装

1. 进入第三方服务器目录：
```bash
cd p2p-third-party-server
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
   - 复制 `.env.example` 为 `.env`
   - 修改 `CENTRAL_SERVER_URL` 指向中央服务器
   - 配置 STUN/TURN 服务器信息

4. 启动服务器：
```bash
npm start
```

## 环境变量配置说明

### 中央服务器 (.env)

- `PORT`: 服务器端口，默认 3000
- `DB_PATH`: 数据库文件路径
- `JWT_SECRET`: JWT 密钥，请确保安全性
- `JWT_EXPIRES_IN`: JWT 过期时间
- `SALT_ROUNDS`: 密码哈希的盐值轮数
- `MAX_ROOMS_PER_HOUR`: 每小时最大创建房间数限制
- `MAX_JOIN_ATTEMPTS_PER_MINUTE`: 每分钟最大加入房间尝试次数
- `STUN_SERVERS`: STUN 服务器列表
- `TURN_SERVERS`: TURN 服务器列表

### 第三方部署服务器 (.env)

- `PORT`: 服务器端口，默认 3001
- `CENTRAL_SERVER_URL`: 中央服务器地址
- `MAX_ROOMS`: 最大房间数量
- `MAX_PLAYERS_PER_ROOM`: 每个房间最大玩家数
- `ROOM_TIMEOUT`: 房间超时时间（毫秒）
- `ENABLE_METRICS`: 是否启用性能监控

## Web 管理面板

中央服务器内置Web管理面板，可通过以下地址访问：
```
http://[服务器IP]:3000/admin
```

### 面板功能

- **用户管理**：查看、搜索和管理所有用户
- **房间管理**：查看和关闭活跃房间
- **统计分析**：查看用户活动统计和地区分布
- **服务器设置**：管理服务器配置和安全设置

### 面板特性

- 响应式设计，支持移动端访问
- 实时数据刷新
- 用户详情查看
- 分页和搜索功能
- 数据可视化展示

## API 接口说明

### 中央服务器 API

#### 用户相关

- `POST /api/users/register`: 用户注册
- `POST /api/users/login`: 用户登录
- `GET /api/users/me`: 获取当前用户信息
- `PUT /api/users/me`: 更新用户信息
- `GET /api/users/stats`: 获取用户统计信息

#### 房间相关

- `POST /api/rooms/create`: 创建房间
- `GET /api/rooms/:roomId`: 获取房间信息
- `GET /api/rooms`: 获取房间列表
- `PUT /api/rooms/:roomId`: 更新房间信息
- `DELETE /api/rooms/:roomId`: 删除房间

### 第三方服务器 API

- WebSocket 连接：`ws://[服务器IP]:3001/ws`
- 信令消息格式：JSON
- 支持的消息类型：join, leave, offer, answer, ice-candidate

## 安全注意事项

1. **JWT 密钥安全**：务必修改默认的 JWT_SECRET 为强密钥
2. **CORS 配置**：生产环境中应严格限制跨域访问
3. **TURN 服务器凭证**：保护好 TURN 服务器的用户名和密码
4. **限流防护**：合理设置用户操作频率限制，防止恶意请求
5. **日志敏感信息**：确保日志中不包含敏感数据

## 性能优化建议

1. **数据库选择**：生产环境建议使用 MongoDB 或 PostgreSQL
2. **负载均衡**：对于高并发场景，可部署多个第三方服务器实例
3. **缓存策略**：添加 Redis 缓存常用数据
4. **STUN/TURN 服务**：使用高质量的 STUN/TURN 服务以提高连接成功率
5. **监控告警**：配置服务器资源监控和异常告警

## 常见问题排查

### 连接失败

1. 检查中央服务器和第三方服务器是否正常运行
2. 验证客户端配置的服务器地址是否正确
3. 检查防火墙是否允许相关端口通信
4. 确认 STUN/TURN 服务器配置正确且可访问

### 用户登录问题

1. 检查 JWT 密钥配置是否一致
2. 验证数据库连接和用户数据是否正常
3. 查看服务器日志中的错误信息

### WebSocket 连接断开

1. 检查网络稳定性
2. 调整心跳间隔和超时设置
3. 增加重连机制的重试次数

## 开发说明

### 本地开发

1. 中央服务器：`npm run dev`
2. 第三方服务器：`npm run dev`

### 构建和部署

```bash
# 构建中央服务器
cd p2p-central-server
npm run build

# 部署生产环境
NODE_ENV=production node dist/server.js
```

## 技术栈

- **Node.js**：运行环境
- **Express**：Web 框架
- **WebSocket**：实时通信
- **LowDB**：轻量级数据库（开发环境）
- **JWT**：用户认证
- **bcrypt**：密码加密
- **CORS**：跨域支持
- **dotenv**：环境变量管理

## 许可证

MIT License