# ==========================================
# Stage 1: 构建阶段 (Builder)
# 用于编译 React 前端和准备服务端文件
# ==========================================
FROM node:18-alpine as builder
WORKDIR /app

# 1. 优先复制依赖描述文件，利用 Docker 缓存层加速 npm install
COPY package*.json ./

# 2. 安装依赖
RUN npm install

# 3. 复制所有项目源代码 (包括 App.tsx, server.js 等)
COPY . .

# 4. 执行构建命令 (Vite 会打包前端代码到 dist 目录)
RUN npm run build


# ==========================================
# Stage 2: 生产运行阶段 (Production)
# 仅包含运行时所需的最小文件，体积极小
# ==========================================
FROM node:18-alpine
WORKDIR /app

# 1. 从构建阶段复制打包好的前端静态资源 (dist)
COPY --from=builder /app/dist ./dist

# 2. [关键] 从构建阶段复制最新的服务端代码 (server.js)
# 这确保了您本地修改的 RSS 映射逻辑会被正确应用到镜像中
COPY --from=builder /app/server.js ./server.js

# 注意：因为您的 server.js 只使用了 Node.js 原生模块 (http, fs, path, url)
# 所以这里不需要再运行 npm install，也不需要 node_modules 目录
# 这大大减小了镜像体积并提高了启动速度

# 3. 暴露端口 (对应 server.js 中的 PORT)
EXPOSE 3000

# 4. 启动服务
CMD ["node", "server.js"]
