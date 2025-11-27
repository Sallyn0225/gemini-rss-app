# ==========================================
# Stage 1: 构建阶段 (Builder)
# 用于编译 React 前端和准备服务端文件
# ==========================================
FROM node:18-alpine as builder
WORKDIR /app

# 1. 优先复制依赖描述文件，利用 Docker 缓存层加速 npm install
# 注意：您的项目需要一个 package.json 文件来定义依赖和构建脚本
COPY package*.json ./

# 2. 安装依赖
RUN npm install

# 3. 复制所有项目源代码 (包括 App.tsx, server.js 等)
COPY . .

# 4. 执行构建命令 (通常会打包前端代码到 dist 目录)
RUN npm run build


# ==========================================
# Stage 2: 生产运行阶段 (Production)
# 仅包含运行时所需的最小文件，体积极小
# ==========================================
FROM node:18-alpine
WORKDIR /app

# 1. 从构建阶段复制打包好的前端静态资源 (dist)
COPY --from=builder /app/dist ./dist

# 2. 从构建阶段复制服务端代码
COPY --from=builder /app/server.js ./server.js

# [已修正] 下面这行代码已被移除，因为它试图复制一个在构建阶段不存在的目录。
# 持久化数据应完全由 docker-compose.yml 中的 volumes 来管理。
# COPY --from=builder /app/data ./data

# 3. 暴露端口
EXPOSE 3000

# 4. 启动服务
CMD ["node", "server.js"]