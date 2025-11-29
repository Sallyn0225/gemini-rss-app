<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Gemini RSS Translator

一个面向多媒体企划 / 女声优情报的 **RSS 聚合 + AI 翻译与总结** Web 应用。

- 支持订阅多个 RSS 源（如官方账号、企划情报、活动信息等）
- 前端内置阅读体验：列表视图 + 日历筛选 + 活跃度统计
- 调用你自己的大模型 API（OpenAI 兼容 / Gemini）完成：翻译、按日总结、分类打标签
- 不内置任何 API Key，所有密钥仅保存在浏览器本地

> 本仓库是一个可本地运行 / 自部署的前端 + 轻量 Node.js 后端项目，不依赖 Google AI Studio 环境。

---

## 功能概览

- **RSS 订阅与阅读**：
  - 通过后台配置 RSS 源 ID 和 URL
  - 左侧订阅列表 + 右侧文章卡片式阅读

- **按天筛选与总结**：
  - 使用日历选择某一天，查看当天所有更新
  - 一键调用 AI 生成当日总结

- **AI 翻译与分类**：
  - 支持多语言翻译（简体中文等）
  - 根据内容自动打标签（官方公告 / 媒体宣发 / 线下活动 / 社区互动 / 转发）

- **订阅源管理（后台）**：
  - 使用 Admin Secret 访问的简单管理界面
  - 新增 / 编辑 / 删除 / 排序订阅源

- **隐私与安全**：
  - API Key 仅保存在浏览器 `localStorage` 中，不会写入后台或代码仓库
  - 后端管理接口通过 `ADMIN_SECRET` 保护

---

## 本地运行

### 1. 环境准备

- Node.js（建议 18+）

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

在项目根目录创建 `.env.local`（不会被提交到 Git）：

```env
# 可选：若使用系统默认 Gemini SDK，可在此处填入
GEMINI_API_KEY=your-gemini-api-key-here
```

> 实际上，大部分情况下你会在前端「设置」里配置自己的 OpenAI 兼容 / Gemini / 反代 API，`GEMINI_API_KEY` 只是系统兜底用。

### 4. 启动开发服务器

```bash
npm run dev
```

默认会在 `http://localhost:5173`（Vite 默认端口）启动前端。

> 仅前端开发时，可以直接由浏览器跨域访问 RSS / AI 接口；生产部署请使用下文的 Node.js 后端 / Docker 方案。

---

## 使用 Docker 部署（推荐）

本仓库提供了一个简单的 `server.js` + `Dockerfile` + `docker-compose.yml`，用于：

- 代理 RSS 源（可通过本地 Clash 等代理访问）
- 代理图片地址，减轻跨域与直连问题
- 提供订阅源配置接口 `/api/feeds/*`
- 提供前端静态资源服务（构建后的 `dist/`）

### 1. 构建并启动

```bash
docker-compose up -d --build
```

默认行为：

- 使用 `network_mode: host`，容器内的 `127.0.0.1:7890` 会指向宿主机（便于使用 Clash 等代理）
- 将 `./data` 挂载到容器中的 `/app/data`，用于持久化 `feeds.json`

### 2. 管理密钥 `ADMIN_SECRET`

在实际部署时，请在你**自己的** `docker-compose.yml` 或环境中设置强密码：

```yaml
environment:
  - NODE_ENV=production
  - ADMIN_SECRET=your-strong-admin-password
```

公开仓库中的 `docker-compose.yml` 只包含注释示例，不会暴露你的真实密码。

### 3. 订阅源首次配置

- 首次启动时，如果 `data/feeds.json` 不存在，会初始化为空列表
- 访问前端页面，在「设置 → 订阅源管理」中：
  - 输入你部署时设置的 `ADMIN_SECRET`
  - 通过界面添加 RSS 源（ID、URL、分类等）

---

## AI 设置与安全说明

- 在前端点击左下角「设置」：
  - 添加 API 提供商（OpenAI 兼容 / Gemini）
  - 配置 Base URL 和 API Key
  - 为不同任务（总模型 / 翻译 / 总结 / 分析）选择模型

- 这些配置会存储在浏览器的 `localStorage` 中：
  - 不会写入代码仓库
  - 不会通过后端接口上传

> 请不要将包含自己 API Key 的 `.env.local`、浏览器导出的配置等文件提交到公开仓库。

---

## 开发说明

- 前端：
  - React + TypeScript
  - Vite 构建
  - UI 动画使用 Framer Motion
  - 图表使用 Recharts

- 后端：
  - 轻量 Node.js HTTP 服务器（无 Express）
  - 负责 RSS 代理、图片代理和订阅源配置

你可以根据需要自由修改订阅源结构、UI 和 AI 调用逻辑。

---

## License

本项目使用 [MIT License](./LICENSE) 开源。

你可以自由地使用、修改和部署本项目，但请在再分发时保留版权和许可证声明。

