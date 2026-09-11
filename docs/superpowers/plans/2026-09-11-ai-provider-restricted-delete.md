# AI Provider Restricted Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. 当前会话按用户“确认执行”连续完成，不重复询问批准。

**Goal:** 实施已确认的供应商受限删除，不连带删除关联数据或共用密钥。

**Architecture:** migration 将模型外键 CASCADE 改为 RESTRICT；controller/service/repository 实现版本化 DELETE；Admin 复用本地确认弹窗。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase/PostgreSQL、Next.js、现有 Radix/shadcn。

### Task 1: 数据库与后端

- [ ] 在 `apps/api/src/repositories/ai-config.test.ts`、`services/ai-config/provider-delete.test.ts`、`controllers/ai-config/provider-delete.test.ts` 先写失败测试：验证权限前置、严格参数、id/version 双过滤、23503→AI_PROVIDER_IN_USE、空结果→AI_CONFIG_VERSION_STALE、返回值与审计无密钥。
- [ ] 运行 `cd apps/api && bun test ./src/repositories/ai-config.test.ts ./src/services/ai-config/provider-delete.test.ts ./src/controllers/ai-config/provider-delete.test.ts`，确认因缺少删除链路失败。
- [ ] 新建 `supabase/migrations/20260911140000_restrict_ai_provider_model_delete.sql`：事务内 5s lock_timeout、60s statement_timeout，替换 `ai_models_provider_id_fkey` 为 `FOREIGN KEY(provider_id) REFERENCES public.ai_providers(id) ON DELETE RESTRICT`，不改变任何记录。
- [ ] 新增 `DeleteAiProviderPayloadSchema = z.object({expected_version:z.number().int().positive()}).strict()`；controller DELETE 鉴权后验证 params/body/空 query；service 复用管理权限和审计，返回 `{id,deleted:true}`；repository `.delete().eq('id',id).eq('version',expectedVersion).select('id,name').maybeSingle()`，固定映射错误。
- [ ] 运行聚焦测试与 `bun run api:typecheck`，增加本地隔离 PostgreSQL SQL 断言确认无关联可删、关联拒绝、模型/路由/目录保留以及并发保护。

### Task 2: Admin 删除交互

- [ ] 在 `components/platform-ai/ai-provider-delete.test.tsx` 与既有 E2E 增加失败先行覆盖：删除按钮、取消无请求、确认携带版本、关联冲突保留弹窗、成功清理表单/列表、末页回退、只读不展示。
- [ ] 新增聚焦 `ai-provider-delete.tsx`（AlertDialog 与请求状态）、`ai-provider-delete-state.ts`（请求/错误映射及分页计算），修改 `ai-model-routing-panel.tsx` 与 `ai-model-routing-sections.tsx` 接入删除及刷新；页面从已有 session permissions 推导管理权限并传入。
- [ ] DELETE 只发送 `{expected_version: provider.version}`，不默认猜版本；成功响应必须匹配目标 id 和 deleted=true。按钮用 ref 防双击，错误留在弹窗；成功回调独立于删除失败处理，刷新失败只提示刷新。
- [ ] 执行 `cd apps/admin && bun test ./components/platform-ai` 与 `pnpm --dir apps/admin check`；通过后运行扩展的 `playwright.ai-provider-secrets.config.ts` 浏览器测试。

### Task 3: 验收与交接

- [ ] 独立规格审查后进行质量审查，修复并复审。
- [ ] 重跑 API/Admin 聚焦测试、类型检查、API build、文件大小、git diff --check，记录实际 SQL/E2E 验证和未完成项。
- [ ] 提交本地代码与记录；不自动 push、迁移远端或发布，保留现有 release 分支与用户工作区。

## 执行结果

- [x] Task 1 数据库 migration、后端分层删除与失败先行测试完成，后端提交 `a7de486f0`。
- [x] Task 2 Admin 删除弹窗、权限/并发保护、状态清理及分页刷新完成。
- [x] Task 3 规格/质量独立审查通过；API 69 tests、Admin 102 tests、浏览器 11 tests、静态检查及 API 构建通过，代码和记录本地提交，不发布。
- [ ] 本地 PostgreSQL fixture/真实并发验证未运行：Docker daemon 不可用且无 PostgreSQL 工具；发布前补验。没有执行任何远端 migration。

实际后端测试按邻近实现落在 `repositories/ai-provider-delete.test.ts`、`services/ai-config/index.test.ts` 和 `controllers/ai-config/provider-delete.test.ts`。没有新增依赖或架构。详见 `docs/superpowers/specs/2026-09-11-ai-provider-restricted-delete-progress.md`；上面的原分解清单保留作方案记录，以本执行结果和证据说明实际状态。
