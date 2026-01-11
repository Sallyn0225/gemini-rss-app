<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Gemini RSS Translator

一个面向多媒体企划 / 女声优情报的 **RSS 聚合 + AI 翻译与总结** Web 应用。最新版本引入双 URL 媒体架构与增强的安全防护，为国内外部署提供弹性体验。

- 支持订阅多个 RSS 源（官方账号、企划情报、活动信息等）
- 前端内置阅读体验：列表视图 + 日历筛选 + 活跃度统计
- 可配置自有大模型 API（OpenAI 兼容 / Gemini）完成翻译、日总结、分类打标签
- 双代理模式（代理图片 / 直接加载）适配不同网络环境
- 不内置任何 API Key，所有密钥仅保存在浏览器本地

> 本仓库是一个可本地运行 / 自部署的前端 + Serverless 后端项目（Vercel Functions + Neon），不依赖 Google AI Studio 环境。

---

## 功能概览

- **RSS 订阅与阅读**：
  - 后台配置 RSS 源 ID 与 URL
  - 列表 / 网格双模式阅读，移动端支持下拉刷新与一键回顶
  - 自动合并历史记录（分页 200 条），支持按日筛选

- **按天筛选与总结**：
  - 日历选择任意日期查看更新
  - 一键调用 AI 生成当日总结

- **AI 翻译与分类**：
  - 多语言翻译（默认简体中文）
  - 内容自动分类（官方公告 / 媒体宣发 / 线下活动 / 社区互动 / 转发）

- **订阅源管理（后台）**：
  - 通过 `ADMIN_SECRET` 访问的管理界面
  - 多级目录（`企划/角色/声优`）与拖拽排序
  - 支持批量导入 / 导出及订阅源可视化管理

- **隐私与安全**：
  - API Key 均保存在浏览器 `localStorage`
  - 后端新增 SSRF 防护、域名白名单、限流、媒体大小限制等机制

---

## 核心功能 🌟

| 模块 | 能力 | 说明 |
| --- | --- | --- |
| 双 URL 媒体架构 | `original` + `proxied` 双地址 | 后端为每条媒体生成原始 URL 与 `/api/media/proxy` 代理 URL，前端按用户策略自动选择 |
| 代理模式切换 | `none` / `all` | 用户可在前端设置中选择：直接加载 / 代理图片，搭配上游代理实现双重代理 |
| 富媒体处理 | 内容内嵌图片替换 | 富文本 `content` 中的 `<img>` 会结合代理模式自动替换为合适的 URL |
| 安全防护 | SSRF / 白名单 / 限流 / 大小限制 | `/api/media/proxy` 针对内网访问、域名来源、请求频次、文件体积均设有硬限制 |
| 快速阅读体验 | 动效 + 智能分页 | Framer Motion 动画、瀑布流样式、智能缓存与分页渲染 |
| AI 工作流 | 翻译 / 分析 / 总结 | 用户可为「翻译」「日总结」「内容分析」分别指定模型与 API 端点 |

---

## 本地运行

### 1. 环境准备

- Node.js（建议 20+，推荐当前 LTS）

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

> 实际部署时，多数情况下会直接在前端「设置」中配置自己的 OpenAI 兼容 / Gemini / 反代 API。`GEMINI_API_KEY` 仅作兜底。

### 4. 启动开发服务器

```bash
npm run dev
```

默认会在 `http://localhost:5173`（Vite 默认端口）启动前端。纯前端开发可直接跨域调用接口，生产环境请使用 Vercel + Neon 部署。

---

## Serverless 部署（Vercel + Neon）🚀 **推荐**

本项目已完成 Serverless 架构重构，支持零运维部署到 Vercel + Neon PostgreSQL。

### 优势

- ✅ **零服务器维护**：无需管理 Docker 容器或 VPS
- ✅ **全球 CDN 加速**：Vercel 边缘网络自动优化访问速度
- ✅ **按需付费**：Neon 和 Vercel 均提供免费额度，超出才计费
- ✅ **自动扩容**：流量高峰自动扩展，无需手动干预
- ✅ **HTTPS 默认启用**：自动 SSL 证书配置

### 部署步骤

#### 1. 准备 Neon 数据库

1. 访问 [Neon.tech](https://neon.tech) 创建免费账号
2. 创建新项目和数据库
3. 复制连接字符串（格式：`postgresql://user:password@host.neon.tech/dbname?sslmode=require`）

#### 2. 数据迁移（如果从 Docker/本地迁移）

如果你已有本地 `data/feeds.json` 和 `data/history.db`：

```bash
# 设置环境变量
export DATABASE_URL="your-neon-connection-string"

# 运行迁移脚本
node scripts/migrate-to-neon.cjs
```

如果是全新部署，可跳过此步骤。

#### 3. 部署到 Vercel

方式一：通过 GitHub（推荐）

1. 将代码推送到 GitHub 仓库
2. 访问 [Vercel Dashboard](https://vercel.com/new)
3. 导入你的 GitHub 仓库
4. 配置环境变量：
   - `DATABASE_URL`: 你的 Neon 连接字符串
   - `ADMIN_SECRET`: 设置管理后台密码
   - `MEDIA_PROXY_MAX_BYTES`: (可选) 媒体大小限制
5. 点击 Deploy

方式二：通过 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel

# 配置环境变量（在 Vercel Dashboard 或通过 CLI）
vercel env add DATABASE_URL
vercel env add ADMIN_SECRET

# 生产部署
vercel --prod
```

#### 4. 初始化数据库表结构

部署完成后，需要创建数据库表：

```bash
# 使用 Drizzle Kit 生成并推送表结构
npx drizzle-kit push
```

或者手动在 Neon SQL Editor 中执行：

```sql
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  is_sub BOOLEAN DEFAULT false NOT NULL,
  custom_title TEXT DEFAULT '',
  allowed_media_hosts TEXT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE history (
  id SERIAL PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT,
  link TEXT,
  title TEXT,
  pub_date TEXT,
  content TEXT,
  description TEXT,
  thumbnail TEXT,
  author TEXT,
  enclosure TEXT,
  feed_title TEXT,
  last_updated TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_history_feed_id_pub_date ON history (feed_id, pub_date);
CREATE UNIQUE INDEX idx_history_feed_id_guid ON history (feed_id, guid);
CREATE UNIQUE INDEX idx_history_feed_id_link ON history (feed_id, link);
```

#### 5. 访问你的应用

- 前端：`https://your-project.vercel.app`
- API: `https://your-project.vercel.app/api/feeds/list`

### 架构说明

| 组件 | 技术栈 | 说明 |
| --- | --- | --- |
| 前端 | React + Vite | 静态托管在 Vercel CDN |
| API | Vercel Functions | Serverless 函数，自动扩展 |
| 数据库 | Neon PostgreSQL | Serverless 数据库，按需计费 |
| ORM | Drizzle ORM | 轻量级，Serverless 友好 |

### 注意事项

- ⚠️ Vercel 免费版函数执行时间限制为 10 秒，Hobby 版为 10 秒，Pro 版为 60 秒
- ⚠️ 大型媒体文件代理可能会超时，建议前端设置为「不代理」模式
- ⚠️ Neon 免费版有存储限制（0.5 GB），超出需升级套餐

---

## 安全说明 🔒


- ✅ **SSRF 防护**：所有代理请求在发起前会解析真实 IP，并拒绝访问内网 / 回环地址。
- ✅ **DNS 重绑定攻击防护**：解析并验证目标 IP 不是私有地址，使用原始 hostname 发起请求以保持 CDN 兼容性。
- ✅ **域名白名单**：仅允许出现在订阅配置或自动推断列表中的媒体域名进入代理。
- ✅ **体积限制**：媒体代理对 Content-Length 与实际传输字节提供双重大小检测，超过阈值直接中断。
- ✅ **协议约束**：仅允许 `http` / `https` 协议，拒绝 `ftp://`、`file://` 等危险协议。
- ✅ **Admin Secret**：后台管理接口需携带 `ADMIN_SECRET`，建议结合 SSH 隧道或反向代理进一步加固。
- ✅ **前端存储隔离**：所有 API Key 存储在浏览器 `localStorage`，不会上传至服务器。

---

## API 接口 📡

### `/api/media/proxy`

- **Query 参数**：
  - `url`：必填，目标媒体资源的完整 URL，仅支持 `http` / `https`

- **行为**：
  1. 验证域名是否在白名单中，检查协议是否合法。
  2. 解析目标 IP 并验证不是私有地址（SSRF 防护）。
  3. 使用原始 hostname 发起请求以保持 CDN 兼容性。
  4. 流式转发响应体，按配置注入 `Cache-Control`、`Access-Control-Allow-Origin` 等头。
  5. 若超过大小限制返回 `413`，若命中内网地址返回 `403`。

- **典型响应**：
  - 200：成功代理媒体
  - 403：域名未在白名单 / 解析到内网
  - 413：文件大小超出限制
  - 502 / 504：上游错误或超时

### 其他接口

- `/api/feed?id=feedId`：根据订阅配置抓取 RSS 内容

- `/api/feeds/list/admin`、`/api/feeds/add` 等：订阅源管理（需 `ADMIN_SECRET`）
- `/api/history/upsert`、`/api/history/get`：历史记录同步与查询

---

## AI 设置

- 在前端点击左下角「设置」：
  - 添加 API 提供商（OpenAI 兼容 / Gemini / 反代）
  - 分别为「翻译」「总结」「分析」任务指定模型
  - 配置代理模式、界面偏好等

- 所有配置均保存在浏览器 `localStorage`：
  - 不会写入代码仓库
  - 不会通过接口上传

> 请勿将包含 API Key 的 `.env.local` 或浏览器导出的配置文件提交到公开仓库。

---

## 开发说明

- **前端**：React 19 + TypeScript + Vite，使用 Framer Motion / Recharts 构建交互与图表
- **后端**：Vercel Functions + Neon PostgreSQL，负责 RSS / 媒体代理、订阅源管理、历史存储

你可以根据业务需求自由扩展 UI、AI 工作流与订阅源结构。

---

## License

本项目使用 [MIT License](./LICENSE) 开源。欢迎自由使用、修改与部署，请在再分发时保留版权与许可证声明。

