# Pet Travel Agent 阿里云部署指南

## 快速开始

### 1. 环境准备

```bash
# 进入项目目录
cd 旅行攻略

# 复制环境变量配置
cp .env.example .env

# 编辑.env，填入智谱API Key
vim .env
```

### 2. 本地测试运行

```bash
# 方式一：使用部署脚本（推荐）
chmod +x deploy.sh
./deploy.sh --local

# 方式二：手动Docker
docker build -t pet-travel-agent .
docker run -p 3000:3000 --env-file .env pet-travel-agent

# 方式三：直接Node.js运行（需要Node 16+）
npm install
npm start
```

### 3. 验证服务

```bash
# 健康检查
curl http://localhost:3000/health

# 测试对话API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "userId": "test"}'
```

---

## 部署到阿里云ECS

### 方式一：Docker部署（推荐）

#### 步骤1：构建并推送镜像

```bash
# 登录阿里云容器镜像服务（ACR）
docker login --username=your_username registry.cn-hangzhou.aliyuncs.com

# 构建镜像
docker build -t registry.cn-hangzhou.aliyuncs.com/your_namespace/pet-travel-agent:latest .

# 推送镜像
docker push registry.cn-hangzhou.aliyuncs.com/your_namespace/pet-travel-agent:latest
```

#### 步骤2：在ECS上拉取运行

```bash
# SSH连接到ECS服务器
ssh root@your_ecs_ip

# 拉取镜像
docker pull registry.cn-hangzhou.aliyuncs.com/your_namespace/pet-travel-agent:latest

# 创建环境变量文件
cat > /opt/pet-agent/.env << 'EOF'
ZHIPU_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=production
EOF

# 运行容器
docker run -d \
  --name pet-travel-agent \
  --restart always \
  -p 80:3000 \
  --env-file /opt/pet-agent/.env \
  -v /data/pet-agent/uploads:/app/uploads \
  registry.cn-hangzhou.aliyuncs.com/your_namespace/pet-travel-agent:latest
```

### 方式二：传统部署（无Docker）

```bash
# 1. 安装Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 2. 上传代码到ECS
scp -r ./ root@your_ecs_ip:/opt/pet-agent/

# 3. 安装依赖
cd /opt/pet-agent
npm install --production

# 4. 配置环境变量
cp .env.example .env
vim .env  # 填入API Key

# 5. 使用PM2管理进程
npm install -g pm2
pm2 start server.js --name pet-agent
pm2 save
pm2 startup

# 6. 配置Nginx反向代理（可选）
sudo yum install -y nginx
sudo cp nginx.conf /etc/nginx/nginx.conf
sudo systemctl restart nginx
```

### 方式三：使用阿里云函数计算(FC)

```yaml
# s.yaml (Serverless Devs配置)
edition: 3.0.0
name: pet-travel-agent
access: default
vars:
  region: cn-hangzhou
  service:
    name: pet-agent-service

services:
  pet-agent:
    component: fc3
    props:
      functionName: petAgent
      runtime: nodejs18
      cpu: 1
      memorySize: 512
      diskSize: 512
      instanceConcurrency: 10
      timeout: 120
      handler: index.handler
      code: ./
      environmentVariables:
        ZHIPU_API_KEY: ${env.ZHIPU_API_KEY}
      triggers:
        - triggerName: httpTrigger
          triggerType: http
          triggerConfig:
            authType: anonymous
            methods:
              - GET
              - POST
              - PUT
              - DELETE
```

---

## API接口文档

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/status` | GET | 服务状态 |
| `/api/chat` | POST | 文本对话 |
| `/api/chat/upload` | POST | 带图片对话 |
| `/api/chat/stream` | POST | 流式对话(SSE) |
| `/api/upload` | POST | 单独上传图片 |
| `/api/reset` | POST | 重置会话 |

### 对话请求示例

```bash
# 文本对话
POST /api/chat
Content-Type: application/json

{
  "message": "帮我规划杭州3天带狗旅行",
  "userId": "user_123",
  "sessionId": "session_456"
}

# 响应
{
  "success": true,
  "data": {
    "reply": "好的！我来帮你规划杭州3天带狗之旅...",
    "intent": "generate_itinerary",
    "suggestions": ["查看完整行程", "修改目的地"],
    "metadata": { ... }
  }
}
```

### 带图片请求示例

```bash
# multipart/form-data格式
POST /api/chat/upload
Content-Type: multipart/form-data

message=这是什么品种？
images=@dog_photo.jpg
userId=user_123
```

---

## 阿里云安全组配置

确保以下端口已开放：

| 端口 | 用途 | 来源 |
|------|------|------|
| 80 | HTTP访问 | 0.0.0.0/0 |
| 443 | HTTPS访问 | 0.0.0.0/0 |
| 22 | SSH管理 | 你的IP |

**建议**：
- 仅开放必要端口
- 使用HTTPS（申请免费SSL证书）
- 配置防火墙规则限制来源IP

---

## 监控与运维

### 查看日志

```bash
# Docker日志
docker logs -f pet-travel-agent

# PM2日志
pm2 logs pet-agent

# 应用日志文件
tail -f /opt/pet-agent/logs/app.log
```

### 性能监控

```bash
# 容器资源使用
docker stats pet-travel-agent

# PM2监控
pm2 monit
```

### 自动更新

```bash
# 一键更新脚本
#!/bin/bash
cd /opt/pet-agent
git pull origin main
docker compose down
docker compose up -d --build
echo "更新完成！"
```

---

## 常见问题

### Q: 连接超时怎么办？

检查安全组是否开放对应端口，以及防火墙设置。

### Q: 图片上传失败？

确认 `uploads` 目录有写入权限，检查Nginx的 `client_max_body_size` 设置。

### Q: 如何配置域名？

1. 在域名解析中添加A记录指向ECS IP
2. 申请SSL证书（可用Let's Encrypt免费证书）
3. 修改nginx.conf启用HTTPS配置

### Q: 如何扩容？

- **水平扩展**：使用负载均衡(SLB) + 多实例
- **垂直升级**：升级ECS规格
- **Serverless**：迁移到函数计算FC自动弹性伸缩

---

## 费用估算（阿里云）

| 资源 | 规格 | 月费用参考 |
|------|------|-----------|
| ECS | 2核4G | ~100元 |
| 对象存储OSS | 100GB | ~10元 |
| 域名 | .com | ~50元/年 |
| SSL证书 | 免费证书 | 0元 |
| **合计** | | **~160元/月** |
