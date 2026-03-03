# Cloudflare Pages 部署说明

## 部署方式

本项目使用 **GitHub Actions + Direct Upload** 方式部署到 Cloudflare Pages，而不是 Cloudflare 的原生 Git 集成。

### 为什么选择 Direct Upload？

Cloudflare 的原生 Git 集成无法在构建时动态注入 D1/KV 资源 ID。我们的 `wrangler.toml` 中的 D1 和 KV ID 是空的（为了安全不提交到代码库），需要在 CI 流程中从 GitHub Secrets 注入。

## Production vs Preview

### 配置 Production Branch

Cloudflare Pages 通过 **Production branch** 设置来自动判断部署类型：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → 选择你的项目（`gemini-rss-app`）
3. 点击 **Settings** → **Builds & deployments**
4. 在 **Production branch** 中设置为 `main`
5. 保存设置

**配置后的行为：**
- 推送到 `main` 分支 → **Production** 部署
- 推送到其他分支 → **Preview** 部署

### 当前 Workflow 配置

GitHub Actions workflow (`.github/workflows/deploy-cloudflare.yml`) 会：
- 监听所有分支的推送
- 传递分支名称和 commit hash 给 Cloudflare
- Cloudflare 根据 Production branch 设置自动判断部署类型

### 如何更改 Production 分支

**方法 1：在 Cloudflare Dashboard 中更改**（推荐）
1. Workers & Pages → 项目 → Settings → Builds & deployments
2. 修改 **Production branch** 设置
3. 保存

**方法 2：修改 Workflow（不推荐）**
如果你想限制只有特定分支触发部署，可以修改 `.github/workflows/deploy-cloudflare.yml` 中的 `on.push.branches`。

## Git 信息追踪

虽然使用 Direct Upload 方式，Cloudflare Dashboard 会显示 "No Git connection"，但我们通过以下参数传递 Git 信息：

- `--branch`: 分支名称
- `--commit-hash`: 提交 SHA
- `--commit-message`: 提交信息

这样在 Cloudflare 的部署历史中仍然可以看到每次部署对应的 Git 信息。

## 如果想要 Git 集成

如果你希望在 Cloudflare Dashboard 中显示 Git connection，有两个选择：

### 选项 1：使用 Cloudflare 原生 Git 集成（不推荐）

1. 在 Cloudflare Dashboard 中连接 GitHub 仓库
2. 将 D1/KV ID 直接写入 `wrangler.toml`（安全风险）
3. 删除 GitHub Actions workflow

**缺点**：D1/KV ID 会暴露在代码库中

### 选项 2：混合方式（复杂）

1. 在 Cloudflare Dashboard 中连接 GitHub 仓库（仅用于显示）
2. 禁用 Cloudflare 的自动构建
3. 继续使用 GitHub Actions 进行实际部署

**缺点**：配置复杂，可能导致混淆

### 推荐方式（当前）

继续使用 Direct Upload + GitHub Actions，接受 "No Git connection" 的显示。这是最安全和可维护的方式。

## 部署流程

1. 推送代码到 GitHub
2. GitHub Actions 触发
3. 构建项目 (`npm run build`)
4. 从 GitHub Secrets 注入 D1/KV ID
5. 使用 wrangler 部署到 Cloudflare Pages
6. 根据分支决定是 production 还是 preview

## 所需的 GitHub Secrets

| Secret | 用途 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `D1_DATABASE_ID` | D1 数据库 ID |
| `KV_NAMESPACE_ID` | KV 命名空间 ID |

## 故障排查

### 部署显示为 Preview 而不是 Production

检查：
1. 是否推送到了正确的 production 分支
2. workflow 中的分支名称是否匹配
3. `--production` 标志是否正确添加

### 部署失败

检查：
1. GitHub Secrets 是否正确配置
2. Cloudflare API Token 是否有足够的权限
3. D1/KV 资源是否存在
