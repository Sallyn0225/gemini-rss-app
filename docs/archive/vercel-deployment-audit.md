# Vercel 部署就绪性审计报告

**审计专家**：Kilo Code (Technical Leader)
**日期**：2026-01-11
**项目**：Gemini RSS Translator

## 1. 构建性能优化 (Build Performance)

### 1.1 依赖项分析
- **现状**：项目使用了 Vite 6 和 React 19，依赖项相对精简。
- **优化建议**：
    - `undici` 在 Node.js 18+ 中已不再是必需，React 19 环境下建议优先使用原生 `fetch`。
    - 检查 `package-lock.json` 或 `pnpm-lock.yaml` 是否存在冗余版本（需在 Code 模式下执行 `npm dedupe`）。

### 1.2 构建脚本
- **现状**：已配置 `"vercel-build": "vite build"`。
- **优化建议**：
    - 确保构建缓存有效。Vite 默认缓存良好，但在 Vercel 上可以增加 `CI=true` 环境变量以减少非必要的日志输出。

---

## 2. 运行成本与效率 (Runtime Cost & Efficiency)

### 2.1 Serverless vs Edge Runtime
- **现状**：所有 API 运行在 Node.js Serverless 运行时。
- **分析**：
    - `api/media/proxy.ts` 和 `api/feed.ts` 依赖 Node.js 原生模块 `dns` 和 `net` 进行 SSRF 防护。
    - **限制**：Edge Runtime 不支持 `dns.lookup`。
- **优化建议**：
    - 保持 Serverless 运行时以维持高强度的 SSRF 防护（DNS 重新绑定攻击防护）。
    - 为 `api/feed.ts` 增加更激进的边缘缓存（`s-maxage`），减少函数调用次数。

### 2.2 冷启动优化
- **现状**：数据库连接使用 `@neondatabase/serverless`。
- **优化建议**：
    - 确保数据库连接在函数外部初始化（已实现），利用连接池复用。

---

## 3. Vercel 配置最佳实践 (Vercel Best Practices)

### 3.1 响应头与安全
- **现状**：`vercel.json` 缺少安全响应头配置。
- **优化建议**：
    - 添加 `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` 等。
    - 配置 `cleanUrls: true` 和 `trailingSlash: false`。

### 3.2 路由重写
- **现状**：路由配置较为繁琐。
- **优化建议**：
    - 简化 `vercel.json` 中的正则匹配，利用 Vercel 的自动文件系统路由。

---

## 4. 潜在缺陷排查 (Potential Defects)

### 4.1 环境一致性
- **现状**：`package.json` 未指定 Node.js 版本。
- **风险**：Vercel 默认可能使用 Node.js 20，而本地开发环境可能不同。
- **优化建议**：添加 `"engines": { "node": ">=22" }`。

### 4.2 环境变量
- **现状**：代码中引用了 `ADMIN_SECRET`, `GEMINI_API_KEY` 等。
- **风险**：未检查生产环境是否存在这些变量。
- **优化建议**：在构建脚本中添加环境变量校验步骤。

---

## 5. 改进方案实施计划

### 5.1 配置文件更新
- 修改 `package.json` 增加 `engines`。
- 增强 `vercel.json` 的安全与缓存配置。

### 5.2 代码层优化
- 优化 `api/feed.ts` 的缓存策略。
- 统一 `lib/http.ts` 中的 fetch 调用。
