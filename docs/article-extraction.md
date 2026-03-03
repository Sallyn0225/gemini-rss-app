# 文章全文提取功能

## 功能说明

当 RSS feed 中的文章只包含摘要时，用户可以点击"展开全文"按钮，从原网站提取完整文章内容，无需跳转到外部网站。

## 技术实现

### 后端

- **提取引擎**: Mozilla Readability + linkedom
- **安全机制**:
  - 域名白名单（只允许从 feed 源域名提取）
  - SSRF 防护
  - 大小限制（5MB）
  - 速率限制（10 次/分钟/IP）
  - 超时控制（20 秒）

### 前端

- **缓存策略**: IndexedDB 缓存 24 小时
- **优雅降级**: 提取失败时自动显示 RSS 内容
- **用户体验**: 加载动画、错误提示

## API 端点

```
GET /api/article/extract?url={articleUrl}
```

**响应格式**:

```json
{
  "success": true,
  "data": {
    "title": "文章标题",
    "content": "<p>HTML 内容</p>",
    "textContent": "纯文本内容",
    "excerpt": "摘要",
    "byline": "作者",
    "siteName": "网站名称",
    "length": 1234
  }
}
```

**失败响应**:

```json
{
  "success": false,
  "error": "错误信息",
  "fallback": "use_rss_content"
}
```

## 环境变量

### Vercel

```env
ARTICLE_EXTRACT_MAX_BYTES=5242880  # 5MB
```

### Cloudflare

在 `wrangler.toml` 中添加：

```toml
[vars]
ARTICLE_EXTRACT_MAX_BYTES = "5242880"
```

## 测试

### 后端测试

```bash
# 启动开发服务器
npm run dev

# 测试提取功能
node test-article-extract.js https://sspai.com/post/106570
```

### 前端测试

1. 打开应用
2. 选择一个只有摘要的文章（如 sspai.com 的文章）
3. 点击"展开全文"按钮
4. 验证内容是否正确显示

## 边界情况

- **付费墙**: 自动降级到 RSS 内容
- **JavaScript 渲染**: 无法提取，显示 RSS 内容
- **反爬虫**: 接受失败，显示 RSS 内容
- **超时**: 20 秒后返回错误
- **非白名单域名**: 返回 403 错误

## 文件清单

### 新建文件

- `server/utils/readability.ts` - Readability 包装器
- `server/handlers/article-extract.ts` - 核心处理器
- `api/article/extract.ts` - Vercel 包装器
- `functions/api/article/extract.ts` - Cloudflare 包装器
- `src/services/articleService.ts` - 前端 API 客户端
- `test-article-extract.js` - 测试脚本

### 修改文件

- `types.ts` - 添加类型定义
- `components/ArticleReader.tsx` - 集成提取功能
- `server/env.ts` - 添加环境变量类型
- `package.json` - 添加依赖

## 性能指标

- **HTML 大小限制**: 5MB
- **平均提取时间**: 2-5 秒
- **内存占用**: ~10MB/次
- **速率限制**: 10 次/分钟/IP
- **缓存 TTL**: 24 小时

## 未来增强

- [ ] 多策略提取（Readability 失败时尝试其他提取器）
- [ ] PDF 支持
- [ ] 视频字幕提取
- [ ] 自动翻译提取的内容
- [ ] 阅读时间估算
