# Vercel + Neon 部署教程

> 从零开始，把 Gemini RSS Translator 部署到 Vercel，使用 Neon PostgreSQL 数据库。
> 全程免费，无需服务器，预计 20 分钟完成。

---

## 你需要准备什么

- 一个 **GitHub 账号**（没有的话去 [github.com](https://github.com) 注册）
- 一个浏览器（推荐 Chrome / Edge）
- 不需要安装任何软件，全部在网页上操作

---

## 第一步：Fork 项目到你的 GitHub

1. 打开项目仓库页面
2. 点击右上角的 **Fork** 按钮
3. 在弹出页面直接点 **Create fork**
4. 等待几秒，你的 GitHub 里就有了一份项目副本

---

## 第二步：创建 Neon 数据库

Neon 是一个免费的云数据库服务，我们用它来存储订阅源和文章历史。

### 2.1 注册 Neon

1. 打开 [neon.tech](https://neon.tech)
2. 点击 **Sign Up**（可以直接用 GitHub 账号登录）
3. 登录后会进入控制台

### 2.2 创建数据库

1. 点击 **Create Project**（新建项目）
2. **Project name**：随便填，比如 `rss-app`
3. **Region**：选离你最近的区域
   - 中国用户推荐选 **Singapore**（新加坡）
   - 美国用户选 **US East** 或 **US West**
4. 点击 **Create Project**

### 2.3 复制连接字符串

创建完成后，页面会显示一个连接字符串，长得像这样：

```
postgresql://username:password@ep-xxx-xxx-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**把它完整复制下来，后面要用。**

> 提示：如果找不到了，在 Neon 控制台左侧点 **Dashboard** → 看到 **Connection Details** 面板 → 点复制按钮。

---

## 第三步：创建数据库表

数据库创建好了，但里面还没有表。我们需要手动创建。

1. 在 Neon 控制台左侧点击 **SQL Editor**
2. 把下面的 SQL 全部复制粘贴进去
3. 点击 **Run** 执行

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

看到 **"Query executed successfully"** 就说明成功了。

---

## 第四步：部署到 Vercel

### 4.1 注册 Vercel

1. 打开 [vercel.com](https://vercel.com)
2. 点击 **Sign Up**，选择 **Continue with GitHub**（用 GitHub 账号登录）
3. 授权 Vercel 访问你的 GitHub

### 4.2 导入项目

1. 登录后点击 **Add New...** → **Project**
2. 在列表中找到你 Fork 的仓库，点击 **Import**
3. 进入配置页面

### 4.3 配置环境变量

这是最关键的一步。在 **Environment Variables** 区域：

点 **Add** 添加以下变量（一个一个添加）：

| Name（名称） | Value（值） | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://username:password@...` | 第二步复制的 Neon 连接字符串 |
| `ADMIN_SECRET` | 你自己设一个密码 | 管理后台密码，比如 `MySecretPass123!` |

> **安全提示**：`ADMIN_SECRET` 请设一个强密码，不要用 `123456` 这种。

### 4.4 点击部署

1. 其他设置保持默认即可
2. 点击 **Deploy**
3. 等待 1-2 分钟，看到 **Congratulations!** 就是成功了

### 4.5 拿到你的网址

部署完成后，Vercel 会给你一个网址，比如：

```
https://gemini-rss-app-xxxxx.vercel.app
```

点击它就能打开你的 RSS 阅读器了！

---

## 第五步：开始使用

### 5.1 配置 AI 功能

1. 打开你的网站
2. 点击左下角的 **设置** 按钮
3. 添加 API 提供商（支持 OpenAI 兼容接口 / Gemini）
4. 填入你的 API Key 和端点地址
5. 为翻译、总结、分析任务分配模型

> API Key 只保存在你的浏览器里，不会上传到服务器。

### 5.2 管理订阅源

1. 在设置中输入你设置的 `ADMIN_SECRET`
2. 进入管理面板，可以添加 / 删除 / 排序 RSS 订阅源

---

## 常见问题

### 页面打开是白屏？

- 等几秒再刷新，Neon 数据库首次连接需要 "冷启动"
- 检查 Vercel 控制台的 **Deployments** 页面是否有报错

### 提示 "Database connection error"？

- 检查 `DATABASE_URL` 是否正确粘贴了完整的连接字符串
- 确认连接字符串末尾有 `?sslmode=require`

### 管理后台进不去？

- 确认 `ADMIN_SECRET` 环境变量已正确设置
- 在 Vercel Dashboard → Settings → Environment Variables 查看

### 想更换域名？

- 在 Vercel Dashboard → Settings → Domains 中添加你自己的域名
- Vercel 会自动配置 HTTPS 证书

---

## 费用说明

| 服务 | 免费额度 | 适合场景 |
|------|---------|---------|
| **Vercel** | 100 GB 带宽/月，无限次函数调用 | 个人使用完全够 |
| **Neon** | 0.5 GB 存储，5 分钟无活动后休眠 | 几千篇文章没问题 |

个人使用通常 **完全免费**。

---

## 后续更新

当项目有新版本时：

1. 打开你 Fork 的 GitHub 仓库
2. 点击 **Sync fork** → **Update branch**
3. Vercel 会自动重新部署

---

> 遇到问题？在 GitHub 仓库的 [Issues](../../issues) 页面提交反馈。
