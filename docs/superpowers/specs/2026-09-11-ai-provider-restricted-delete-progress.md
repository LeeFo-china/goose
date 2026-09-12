# AI 供应商受限删除实施记录

日期：2026-09-11。状态：本地实现与可用验证完成；未 push、应用远端 migration 或发布，未删除真实供应商、读取真实密钥或修改 Orange。

## 实施结果

- 供应商列表增加删除入口，复用后台 Button/AlertDialog/StatusAlert；具有平台 AI 管理权限才展示删除。二次确认显示名称、不可恢复和共用密钥保留说明。
- DELETE `/platform/ai-config/providers/:id` 严格接受非空 JSON `{expected_version: 正整数}`，拒绝多余 query；平台身份和管理权限前置。
- Repository 单次按 id/version 删除，只读取返回 id/name；外键冲突固定映射 `AI_PROVIDER_IN_USE`，提示关联模型或目录记录存在，应改用停用；零行映射 `AI_CONFIG_VERSION_STALE`，包含已被其他人删除情形。HTTP 只返回 `{id,deleted:true}`。
- service 复用既有审计，记录删除后的供应商 id/name，无密钥或数据库错误 details。审计沿用现有 best-effort 机制，不是与 DELETE 同事务的审计保证。
- 新 migration `20260911140000_restrict_ai_provider_model_delete.sql` 将模型外键 CASCADE 改为 RESTRICT，保留数据/索引；现有目录批次/条目外键已为 RESTRICT。5s lock_timeout、60s statement_timeout、事务替换约束。
- 弹窗取消不请求，提交有 ref 防重复，进行中不能关闭，错误保留弹窗、关闭确认按钮并要求取消/刷新，不自动重试、不回显上游原始错误。
- 成功删除后清理编辑表单、对应未保存主/备用路由候选、列表和供应商选项；最后一页最后一条回退上一页；刷新失败单独提示，不把已确认删除当成失败。
- 供应商列表/选项使用请求序号丢弃删除前已开始的旧响应；已删除供应商的迟到模型候选响应不写回。

## 根因与失败先行证据

1. 原列表只有编辑，后端没有删除链路；表格渲染测试先因缺少“删除”失败。浏览器最小用例也在等待删除入口处失败，接入后通过。
2. 原 ai_models.provider_id 为 CASCADE，直接增加删除接口可能连带删除模型并清空路由绑定。新外键通过数据库原子约束拒绝关联删除，避免依赖先查询后删除的竞态判断。
3. 独立质量审查发现保存请求结束会刷新列表、卸载行内删除弹窗。浏览器用例先复现“保存期间删除仍 enabled”，后用 providerSaving 覆盖保存及列表刷新周期，禁用删除入口、确认按钮和 handler；用例通过，复审确认修复。

## 本轮验证

- API：`bun test ./src/services/ai-config ./src/controllers/ai-config ./src/schema/ai-config.test.ts ./src/repositories/ai-config.test.ts ./src/repositories/ai-provider-delete.test.ts` → 69 pass / 309 assertions。
- Admin：`bun test ./components/platform-ai ./components/settings './app/api/backend/[...path]/route.test.ts'` → 102 pass / 580 assertions。代理失败夹具有预期的模拟 offline 日志，无真实外部调用。
- `bun run api:typecheck`、`bun run api:build`（983 modules / 5.14MB）、API 文件大小检查通过。
- `pnpm --dir apps/admin check`（文件大小、Next typegen、TypeScript）通过；mock backend `node --check` 和 `git diff --check` 通过。
- `env -u NO_COLOR pnpm exec playwright test --config=playwright.ai-provider-secrets.config.ts` → 11 passed / 31.3s。覆盖取消、版本提交、表单及未保存主模型搜索清理、关联/版本冲突、窄屏、重复点击、只读、保存并发互斥、末页回退、刷新失败和原密钥功能回归。窄屏冲突截图已检查。
- 独立规格审查 PASS；质量审查没有 Critical/Important，保存/删除重叠问题修复后复审通过。迟到候选响应的保护经代码审查，尚无单独的延迟响应 E2E 用例。

## 尚未验证与发布门禁

本机 Docker daemon/socket 不可用，只有 default context，psql/initdb/pg_ctl 未安装。因此没有运行 PostgreSQL fixture 或真实双会话并发验证，不将静态 migration 测试和 HTTP mock 计为数据库执行证据。

`supabase/tests/ai_provider_restricted_delete.sql` 仅供隔离空数据库使用：导入实际 migration，断言三种 RESTRICT 外键、数据/索引保留、空供应商可删、版本不符零行、模型/目录批次/目录条目各自阻止删除，并附两种并发时序操作说明。它包含合成 DDL/DML，不可在应用数据库执行。

开发发布前应补齐隔离 PostgreSQL 执行与并发检查，核对唯一待应用 migration、备份、应用 migration，再执行 `supabase migration list` 确认 Local/Remote 对齐，最后发布固定版本 API/Admin。旧 CASCADE 约束存在时不能上线新 DELETE 接口。

回退应用或关闭 DELETE 入口时保留 RESTRICT；不重新开启级联删除、不手动修库或修改迁移历史。共用的 ARK_API_KEY 等配置与此前开发发布分支保持不变。

## 后续开发发布结果

用户随后授权“先 migration，在开发发布”。隔离 PostgreSQL fixture 与两种双会话并发检查已补齐并通过；唯一新 migration 经开发工作流成功应用，615 条 Local/Remote 完全对齐。API/Admin 已发布固定 SHA `372c980b5d44f3d48d53ac1173f2e2213ad832bf`，工作流及独立健康、revision/digest、未认证 DELETE 检查通过，未删除真实供应商。完整备份、迁移、验证和发布证据见 [开发发布记录](../../operations/evidence/2026-09-11-ai-provider-delete-dev-release.md)。上文“未发布/未执行 PG”保留为本地实施阶段的历史状态。
