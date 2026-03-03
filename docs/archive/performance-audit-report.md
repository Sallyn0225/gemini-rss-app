# Gemini RSS Translator 性能审计与优化报告

**审计专家**：Kilo Code (Senior Architect & Performance Expert)
**日期**：2026-01-11

## 1. 关键渲染路径 (Critical Rendering Path)

### 1.1 外部 Importmap 延迟
- **问题**：`index.html` 依赖 `aistudiocdn.com` 加载 React。如果 CDN 响应慢或连接受限，首屏将长时间白屏。
- **优化方案**：
    - 移除 `importmap`，回归 Vite 标准打包模式，将依赖本地化。
    - 在 `index.html` 中添加 `<link rel="modulepreload">` 预加载核心 JS。
- **Web 指标提升**：**LCP ↓ 300ms-800ms**。

## 2. JavaScript 执行效率 (JS Execution)

### 2.1 高频事件阻塞
- **问题**：`App.tsx` 中的 `handleTouchMove` 同步更新 `pullDistance`。
- **优化方案**：
    - 使用 `requestAnimationFrame` 包装 `setPullDistance`。
    - 或者：利用 CSS `transform: translateY(var(--pull-distance))`，仅在 JS 中更新 CSS 变量，避免 React 渲染循环。
- **Web 指标提升**：**INP ↓ (交互延迟显著降低)**。

### 2.2 同步 DOM 解析
- **问题**：`rssService.ts` 中的 `parseXML` 在主线程解析大段 XML。
- **优化方案**：
    - 考虑将 XML 解析逻辑移至 Web Worker。
    - 优化 `extractImageFromHtml` 的正则，减少对 `DOMParser` 的依赖。
- **Web 指标提升**：**TBT (Total Blocking Time) ↓**。

## 3. 框架层面优化 (Framework Optimizations)

### 3.1 状态爆炸与组件重绘
- **问题**：`App.tsx` 过于庞大，状态未隔离。
- **优化方案**：
    - **状态下放**：将 `pullDistance`, `isRefreshing` 等状态移入 `ArticleList` 内部。
    - **虚拟列表**：在 `ArticleList` 中引入 `react-window` 或 `@tanstack/react-virtual` 处理长列表。
- **Web 指标提升**：**CLS (Cumulative Layout Shift) 稳定性提升**，内存占用降低。

## 4. 存储性能 (Storage Performance)

### 4.1 LocalStorage 阻塞
- **问题**：`read_articles` 存储在 `localStorage`，同步 JSON 解析耗时。
- **优化方案**：
    - 迁移至 **IndexedDB**。
    - 示例代码：
      ```typescript
      import { get, set } from 'idb-keyval';
      // 异步读取
      const readIds = await get('read_articles');
      ```
- **Web 指标提升**：**FCP (First Contentful Paint) 稳定性提升**。

---

## 实施路线图

1. **Phase 1 (基础修复)**：本地化依赖，优化 `index.html`。
2. **Phase 2 (交互优化)**：重构 `App.tsx` 状态，优化 touch 事件。
3. **Phase 3 (架构升级)**：引入 IndexedDB，实现虚拟滚动。
