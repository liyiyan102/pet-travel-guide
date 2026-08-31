# ============================================
# Pet Travel Agent - 阿里云部署 Dockerfile
# 基础镜像: Node.js 18 LTS
# ============================================

FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=/app/uploads

# 安装系统依赖（图片处理相关）
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# 先复制package文件，利用Docker缓存层
COPY package.json ./

# 安装依赖（仅生产依赖）
RUN npm install --omit=dev && npm cache clean --force

# 复制应用代码
COPY . .

# 创建上传目录
RUN mkdir -p ${UPLOAD_DIR} && chown -R node:node /app

# 切换到非root用户
USER node

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "server.js"]
