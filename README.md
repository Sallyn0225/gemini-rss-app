<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Gemini RSS Translator

一个面向多媒体企划 / 女声优情报的 **RSS 聚合 + AI 翻译与总结** Web 应用。支持文章全文提取与增强的安全防护，为国内外部署提供弹性体验。

- 支持订阅多个 RSS 源（官方账号、企划情报、活动信息等）
- 前端内置阅读体验：列表视图 + 日历筛选 + 活跃度统计
- 可配置自有大模型 API（OpenAI 兼容 / OpenAI Responses / Gemini / Anthropic）完成翻译、日总结、分类打标签
- 支持文章全文提取（客户端 Readability 解析，无需跳转外部网站）
- 不内置任何 API Key，所有密钥仅保存在浏览器本地

---

## 部署方式

本项目支持两种 Serverless 部署方式，功能完全一致，选择任意一种即可：

| | Vercel + Neon | Cloudflare Pages + D1 |
|---|---|---|
| **数据库** | Neon PostgreSQL | D1 (SQLite)，可 fallback Neon |
| **冷启动** | ~1 秒 | ~0 毫秒 |
| **免费存储** | 0.5 GB | 5 GB |
| **适合场景** | 快速上手，纯网页操作 | 更低延迟，更大免费额度，GitHub push 自动部署 |
| **部署教程** | [Vercel 部署教程](docs/deploy-vercel.md) | [Cloudflare Pages 部署教程](docs/deploy-cloudflare.md) |

> 两份教程都是小白友好的，从注册账号开始手把手教你，不需要任何编程经验。

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
  - 后端 SSRF 防护、域名白名单、限流

- **文章全文提取**：
  - 点击展开即可阅读完整文章，无需跳转到外部网站
  - 三层提取策略：RSS 全文 → 客户端 CORS 代理 + Readability → 服务端回退
  - IndexedDB 缓存（24 小时），重复打开秒加载

---

## 核心功能

| 模块 | 能力 | 说明 |
| --- | --- | --- |
| 文章全文提取 | 三层客户端优先策略 | Tier 1: RSS content 全文 → Tier 2: CORS 代理 + 浏览器端 Readability → Tier 3: 服务端回退 |
| 安全防护 | SSRF / 白名单 / 限流 / 大小限制 | 针对内网访问、域名来源、请求频次、文件体积均设有硬限制 |
| AI 工作流 | 翻译 / 分析 / 总结 | 用户可为「翻译」「日总结」「内容分析」分别指定模型与 API 端点 |

---

## 本地开发

### 环境要求

- Node.js 20+（推荐当前 LTS）

### 启动

```bash
npm install
npm run dev
```

前端会在 `http://localhost:3000` 启动。

> 前端可直接开发和预览 UI，后端 API 需要完整运行环境。本地测试完整功能有两种方式：

```bash
# Vercel 方式
npm i -g vercel && vercel dev

# Cloudflare 方式
npm run preview:cf
```

---

## AI 设置

1. 打开网站，点击左下角 **设置**
2. 添加 API 提供商（OpenAI 兼容 / OpenAI Responses / Gemini / Anthropic）
3. 分别为「翻译」「总结」「分析」任务指定模型

所有 API Key 保存在浏览器 `localStorage`，不会上传到服务器。

> 没有 API Key？推荐去[硅基流动](https://siliconflow.cn/)或[魔搭社区](https://modelscope.cn/)获取免费的。

---

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/feed?id=feedId` | GET | 抓取 RSS 内容 |
| `/api/feeds/list` | GET | 公开订阅源列表 |
| `/api/feeds/summary` | GET | 每个订阅源的文章总数 |
| `/api/feeds/add` | POST | 添加订阅源（需 `ADMIN_SECRET`） |
| `/api/feeds/delete` | POST | 删除订阅源（需 `ADMIN_SECRET`） |
| `/api/feeds/reorder` | POST | 排序订阅源（需 `ADMIN_SECRET`） |
| `/api/history/get?id=X` | GET | 查询文章历史 |
| `/api/history/upsert` | POST | 同步文章历史 |
| `/api/article/extract?url=X` | GET | 文章全文提取（域名白名单 + Readability，支持 `mode=raw` 返回原始 HTML） |

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [Vercel 部署教程](docs/deploy-vercel.md) | 小白友好，纯网页操作，20 分钟完成 |
| [Cloudflare Pages 部署教程](docs/deploy-cloudflare.md) | 小白友好，需要命令行，支持 GitHub Actions 自动部署 |
| [Cloudflare 部署说明](docs/cloudflare-deployment.md) | Cloudflare Pages 的 CI/CD 流程、Production/Preview 配置详解 |
| [Docker → Vercel 迁移指南](docs/migration-docker-to-vercel.md) | 从旧版 Docker 部署迁移到 Vercel |
| [重构记录](docs/refactoring-summary.md) | Docker/Node.js → Serverless 架构的重构历史 |

---

## License

本项目使用 [MIT License](./LICENSE) 开源。欢迎自由使用、修改与部署，请在再分发时保留版权与许可证声明。
