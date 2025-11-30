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
  - 支持滚动到底部自动加载更多历史记录（每页 200 条）
  - 移动端支持一键回顶按钮

- **按天筛选与总结**：
  - 使用日历选择某一天，查看当天所有更新
  - 一键调用 AI 生成当日总结

- **AI 翻译与分类**：
  - 支持多语言翻译（简体中文等）
  - 根据内容自动打标签（官方公告 / 媒体宣发 / 线下活动 / 社区互动 / 转发）

- **订阅源管理（后台）**：
  - 使用 Admin Secret 访问的简单管理界面
  - 新增 / 编辑 / 删除 / 排序订阅源
  - 支持通过「分类路径」为订阅源分组，形如 `企划/角色/声优`，会在管理界面中渲染为多级文件夹
  - 顶级文件夹 / 子文件夹 / 文件夹内的订阅源均支持拖拽排序，可通过拖拽手柄精细调整顺序

- **隐私与安全**：
  - API Key 仅保存在浏览器 `localStorage` 中，不会写入后台或代码仓库
  - 后端管理接口通过 `ADMIN_SECRET` 密钥保护，支持远程访问（推荐通过 SSH 隧道在本地浏览器访问管理界面）

---

## 本地运行

### 1. 环境准备

- Node.js（建议 20+，推荐使用当前 LTS 版本）

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
- 提供历史消息存储 API（基于 SQLite 的 `/api/history/upsert` 和 `/api/history/get`，支持分页与去重）
- 提供前端静态资源服务（构建后的 `dist/`）

### 1. 构建并启动

```bash
docker-compose up -d --build
```

默认行为：

- 使用 `network_mode: host`，容器内的 `127.0.0.1:7890` 会指向宿主机（便于使用 Clash 等代理）
- 将 `./data` 挂载到容器中的 `/app/data`，用于持久化：
  - `feeds.json`（订阅源配置）
  - `history.db`（SQLite 历史消息数据库）
  - 以及可能存在的 `history.json.bak` 备份文件

> 历史消息会存储在 SQLite 数据库 `data/history.db` 中，默认仅保留最近 60 天的记录。

#### 历史消息存储与迁移

- 旧版本使用 `data/history.json` 存储历史消息，新版本改为 `data/history.db`（SQLite）。
- 首次启动使用 SQLite 版本的后端时，如果存在 `data/history.json`：
  - 会自动读取旧文件中的历史数据并写入 `data/history.db`；
  - 将原文件重命名为 `history.json.bak` 作为备份。
- 历史记录默认保留最近 60 天，超过部分会在后台合并历史时自动清理。

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
    - `分类路径` 支持多级结构，使用 `/` 作为分隔符，例如：`iDOLM@STER Project/女声优`、`BanG Dream!/MyGO!!!!!`
    - 管理界面会根据分类路径自动生成「文件夹 / 子文件夹」树形结构，并支持展开 / 收起与拖拽排序

> 管理接口 `/api/feeds/list/all`、`/api/feeds/add`、`/api/feeds/delete`、`/api/feeds/reorder` 通过 `ADMIN_SECRET` 密钥保护，支持远程访问。推荐通过 SSH 隧道在本地浏览器中访问管理界面以增强安全。

#### 4. 通过 SSH 隧道访问管理界面（推荐）

当应用部署在远程服务器上时，建议使用 SSH 隧道进行安全的本地访问：

- **示例（Linux / macOS / WSL）**：

  ```bash
  ssh -L 3000:127.0.0.1:3000 user@your-server-ip
  ```

  然后在本机浏览器访问：`http://localhost:3000`

- **示例（Windows / XShell）**：
  - 在 XShell 连接属性中添加一个「本地隧道」：
    - 源主机：`localhost`，源端口：`3000`
    - 目标主机：`127.0.0.1`，目标端口：`3000`
  - 连接后，在本机浏览器访问：`http://localhost:3000`

这样：

- 普通用户访问 `http://服务器IP:3000` 只会看到阅读界面，无法访问订阅源管理接口；
- 管理员通过 SSH 隧道访问 `http://localhost:3000`，在「设置 → 订阅源管理」中输入 `ADMIN_SECRET` 后即可管理订阅源。

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

## 安全注意事项

- **管理接口访问控制**：
  - 管理接口通过 `ADMIN_SECRET` 密钥保护，支持远程访问；推荐通过 SSH 隧道在本地访问后台以增强安全；
  - 请为 `ADMIN_SECRET` 使用足够随机且复杂的强密码，并仅在服务器环境变量 / 私有配置文件中设置。

- **RSS 内容安全**：
  - 应用会渲染来自 RSS 的 HTML 内容，部署到公网时请优先使用可信的 RSS 源；
  - 不要在不可信的机器或浏览器环境下输入具有管理权限的密钥。

- **服务器与容器安全**：
  - 请自行保障云服务器的 SSH 登录安全（强密码 / SSH Key 登录 / 限制暴露端口等）；
  - 一旦宿主机被攻破，`ADMIN_SECRET`、订阅配置和历史记录等数据都有可能被访问。

---

## 开发说明

- 前端：
  - React + TypeScript
  - Vite 构建
  - UI 动画使用 Framer Motion
  - 图表使用 Recharts

- 后端：
  - 轻量 Node.js HTTP 服务器（无 Express）
  - 负责 RSS 代理、图片代理、订阅源配置，以及基于 SQLite 的历史消息存储与分页查询

你可以根据需要自由修改订阅源结构、UI 和 AI 调用逻辑。

---

## License

本项目使用 [MIT License](./LICENSE) 开源。

你可以自由地使用、修改和部署本项目，但请在再分发时保留版权和许可证声明。

