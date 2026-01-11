# 项目文档更新与补充计划

经过对当前项目文档的审计，发现了一些不一致之处以及可以改进的地方。以下是详细的修改计划：

## 1. 修复脚本名称不一致
- **MIGRATION.md**: 将 `scripts/migrate-to-neon.js` 统一修改为 `scripts/migrate-to-neon.cjs`。
- **REFACTORING_SUMMARY.md**: 将 `scripts/migrate-to-neon.js` 统一修改为 `scripts/migrate-to-neon.cjs`。

## 2. 完善 `metadata.json`
- **现状**: 描述较为简单。
- **修改**: 强化“女声优情报”与“多媒体企划”的定位，增加关于 AI 翻译与分类的核心功能描述。

## 3. 更新 `README.md`
- **同步**: 确保本地运行步骤中的脚本名称与实际一致。
- **补充**: 在“核心功能”部分增加关于“日历筛选”和“活跃度统计”的详细说明。

## 4. 验证 `AGENTS.md`
- **结构**: 确认 `STRUCTURE` 部分列出的目录（如 `services/`, `lib/`）与实际文件系统完全一致。
- **规范**: 强调 `ANTI-PATTERNS` 中关于 `ADMIN_SECRET` 和 `API Key` 的安全规范。

## 5. 补充 `DEVELOPMENT.md` (可选建议)
- 虽然用户未明确要求，但建议增加一个简单的开发指南，说明如何本地调试 Vercel Functions。

---

### 待执行的 Todo 列表 (切换至 Code 模式后执行)

- [ ] 修改 `MIGRATION.md` 中的脚本后缀名
- [ ] 修改 `REFACTORING_SUMMARY.md` 中的脚本后缀名
- [ ] 更新 `metadata.json` 的名称与描述
- [ ] 检查并微调 `README.md` 中的部署说明
- [ ] 确保 `AGENTS.md` 中的项目结构图是最新的

您是否同意此计划？如果同意，我将切换到 **Code** 模式开始实施。