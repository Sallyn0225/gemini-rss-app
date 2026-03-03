# Cloudflare Pages 部署教程

> 从零开始，把 Gemini RSS Translator 部署到 Cloudflare Pages，使用 D1 (SQLite) 数据库。
> 全程免费，无需服务器，预计 30 分钟完成。

---

## 和 Vercel 方案的区别

| 对比项 | Vercel + Neon | Cloudflare Pages + D1 |
|--------|--------------|----------------------|
| 数据库 | Neon PostgreSQL（云端） | D1 SQLite（Cloudflare 内置） |
| 全球节点 | Vercel CDN | Cloudflare 300+ 节点 |
| 冷启动 | 有（~1 秒） | 几乎没有（~0 毫秒） |
| 免费额度 | 0.5 GB 存储 | 5 GB 存储 + 每日 5M 读 / 100K 写 |
| 适合场景 | 快速上手 | 追求更低延迟、更大免费额度 |

两种方案功能完全一致，选哪个都行。

---

## 你需要准备什么

- 一个 **GitHub 账号**（没有的话去 [github.com](https://github.com) 注册）
- 一台电脑（需要运行一些命令行操作）
- **Node.js 18+**（[下载地址](https://nodejs.org)，下载 LTS 版本，安装时一路下一步即可）

> 怎么确认 Node.js 装好了？打开终端（Windows 按 `Win+R` 输入 `cmd`，Mac 打开"终端"），输入 `node -v`，看到版本号就行。

---

## 第一步：Fork 项目到你的 GitHub

1. 打开项目仓库页面
2. 点击右上角的 **Fork** 按钮
3. 在弹出页面直接点 **Create fork**
4. 等待几秒，你的 GitHub 里就有了一份项目副本

---

## 第二步：把代码下载到本地

打开终端（命令行），执行以下命令：

```bash
# 把代码克隆到本地（把 "你的用户名" 换成你的 GitHub 用户名）
git clone https://github.com/你的用户名/gemini-rss-app.git

# 进入项目目录
cd gemini-rss-app

# 安装项目依赖
npm install
```

> 如果 `npm install` 很慢，可以先设置镜像：`npm config set registry https://registry.npmmirror.com`

---

## 第三步：安装和登录 Wrangler

Wrangler 是 Cloudflare 的命令行工具，用来管理你的项目。

```bash
# 全局安装 Wrangler
npm install -g wrangler

# 登录你的 Cloudflare 账号
wrangler login
```

执行 `wrangler login` 后会自动打开浏览器，点击 **Allow** 授权即可。

> 没有 Cloudflare 账号？去 [cloudflare.com](https://www.cloudflare.com) 免费注册一个。

---

## 第四步：创建 D1 数据库

D1 是 Cloudflare 内置的 SQLite 数据库，免费好用。

```bash
# 创建数据库
wrangler d1 create gemini-rss-db
```

执行后会输出类似这样的信息：

```
✅ Successfully created DB 'gemini-rss-db'

[[d1_databases]]
binding = "DB"
database_name = "gemini-rss-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**复制那个 `database_id`**（一长串字母数字），后面要用。

---

## 第五步：创建 KV 命名空间（用于限流）

```bash
wrangler kv namespace create RATE_LIMIT_KV
```

输出类似：

```
🌀 Creating namespace "RATE_LIMIT_KV"
✅ Success!
id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
```

**复制那个 `id`**，后面也要用。

---

## 第六步：配置 GitHub Secrets

项目使用 GitHub Actions 自动部署，D1 和 KV 的 ID 不需要写入代码，而是通过 GitHub Secrets 安全注入。

1. 打开你 Fork 的仓库页面
2. 点击 **Settings** → 左侧 **Secrets and variables** → **Actions**
3. 点击 **New repository secret**，依次添加以下 4 个 secret：

| Secret 名称 | 值 | 来源 |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 你的 Cloudflare 账户 ID | Cloudflare Dashboard 右侧栏 / Workers & Pages 概览页 |
| `CLOUDFLARE_API_TOKEN` | API 令牌 | [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → 使用 **Edit Cloudflare Workers** 模板，并添加 **Cloudflare Pages: Edit**、**D1: Edit**、**Workers KV Storage: Edit** 权限 |
| `D1_DATABASE_ID` | 第四步复制的 database_id | `wrangler d1 create` 的输出 |
| `KV_NAMESPACE_ID` | 第五步复制的 KV id | `wrangler kv namespace create` 的输出 |

> `wrangler.toml` 中的 ID 留空即可，GitHub Actions 会在部署时自动填充。

---

## 第七步：创建数据库表

### 7.1 生成迁移文件

```bash
npm run db:generate:d1
```

### 7.2 应用到远程数据库

```bash
npm run db:migrate:d1:remote
```

看到成功提示就行了。

> 如果想先在本地测试，可以先执行 `npm run db:migrate:d1:local`。

---

## 第八步：设置管理密码

管理后台需要密码保护。执行以下命令设置密钥：

```bash
# 设置管理密码（会提示你输入密码，输入时不会显示字符，这是正常的）
wrangler pages secret put ADMIN_SECRET --project-name=gemini-rss-app
```

输入你想要的管理密码，按回车确认。

> 首次执行此命令前需要先创建 Pages 项目：`wrangler pages project create gemini-rss-app`

> **可选**：如果你还想使用 Neon PostgreSQL 作为备用数据库（有 D1 的情况下不需要）：
> ```bash
> wrangler pages secret put DATABASE_URL --project-name=gemini-rss-app
> ```

---

## 第九步：部署

项目已配置 GitHub Actions 自动部署。只需把代码推送到 `main` 分支，即可自动构建并部署到 Cloudflare Pages。

```bash
# 推送代码，GitHub Actions 会自动部署
git push origin main
```

部署成功后，你的网站地址是：`https://gemini-rss-app.pages.dev`（或你自定义的项目名）。

> 可以在 GitHub 仓库的 **Actions** 标签页查看部署进度和日志。

> **想了解更多？** 查看 [Cloudflare 部署说明](cloudflare-deployment.md) 了解：
> - Production 和 Preview 部署的区别
> - 为什么显示 "No Git connection"
> - 如何更改 Production 分支
> - CI/CD 流程的详细说明

### 手动部署（备选）

如果你不想用自动部署，也可以在本地手动部署：

```bash
# 需要先在 wrangler.toml 中填入真实的 D1/KV ID
npm run deploy:cf
```

---

## 第十步：本地测试（可选）

部署前想在本地试试？

```bash
npm run preview:cf
```

这会在本地启动一个完整的 Cloudflare Pages 环境，包括数据库和 API。打开浏览器访问终端显示的地址即可。

---

## 第十一步：开始使用

### 配置 AI 功能

1. 打开你的网站
2. 点击左下角的 **设置** 按钮
3. 添加 API 提供商（支持 OpenAI 兼容接口 / Gemini）
4. 填入你的 API Key 和端点地址
5. 为翻译、总结、分析任务分配模型

> API Key 只保存在你的浏览器里，不会上传到服务器。

### 管理订阅源

1. 在设置中输入你设置的 `ADMIN_SECRET`
2. 进入管理面板，添加 / 删除 / 排序 RSS 订阅源

---

## 常见问题

### `wrangler login` 打不开浏览器？

手动复制终端显示的链接到浏览器中打开。

### `npm run db:generate:d1` 报错？

确保已经安装了依赖：`npm install`。

### 部署成功但页面是白屏？

- 检查浏览器控制台（按 F12）是否有错误
- 确认 D1 数据库绑定正确（在 Cloudflare Dashboard → Workers & Pages → 你的项目 → Settings → Functions 中查看）

### API 请求返回 500 错误？

- 在 Cloudflare Dashboard 查看 Workers 日志：Workers & Pages → 你的项目 → Logs
- 检查 `ADMIN_SECRET` 是否已设置：点 Settings → Environment variables

### 想更换域名？

1. 在 Cloudflare Dashboard 添加你的域名
2. 在 Workers & Pages → 你的项目 → Custom domains 中绑定

### 怎么更新版本？

如果你 Fork 了本项目，在 GitHub 上点击 **Sync fork** 同步上游代码，GitHub Actions 会自动重新部署。

或者手动同步：

```bash
git fetch upstream
git merge upstream/main
git push
```

推送后 GitHub Actions 会自动部署最新版本。

---

## 费用说明

| 服务 | 免费额度 | 超出后价格 |
|------|---------|-----------|
| **Cloudflare Pages** | 无限静态请求，每月 10 万次 Functions 调用 | $0.15 / 百万次 |
| **D1 数据库** | 5 GB 存储，每日 5M 读 + 100K 写 | 按量计费 |
| **KV** | 每日 100K 读 + 1K 写 | 按量计费 |

个人使用通常 **完全免费**，额度远比 Vercel + Neon 宽裕。

---

## 附录：项目文件结构说明

```
gemini-rss-app/
├── functions/           # Cloudflare Pages 函数（后端 API）
│   ├── _middleware.ts   # 统一的安全头和错误处理
│   └── api/             # API 路由
├── server/              # 共享后端逻辑（平台无关）
│   ├── db/              # 数据库层（D1 + Neon 双支持）
│   ├── handlers/        # 核心业务处理
│   └── ...
├── public/              # 静态资源（构建时复制到 dist/）
├── wrangler.toml        # Cloudflare 配置文件
└── dist/                # 构建输出（自动生成，不要手动修改）
```

---

> 遇到问题？在 GitHub 仓库的 [Issues](../../issues) 页面提交反馈。
