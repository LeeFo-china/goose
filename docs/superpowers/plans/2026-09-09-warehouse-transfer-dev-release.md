# D1 开发 apply 与兼容发布 Implementation Plan

> **For agentic workers:** Use executing-plans; independent review via requesting-code-review. 用户已委托本任务内确认，按当前隔离工作区执行，不新建工作区、不操作 main／Orange／生产。

**Goal:** 安全应用 D1 migration 并开发发布，完成后进入已确认的调拨 API 批次。

**Architecture:** 复用受保护的 migrate-dev-database / release-dev 工作流，冻结分支引用；API 接受明确的新设置布尔字段但暂不查询新列，先向前兼容再增加 schema。调拨开关保持关闭，不授予实际员工权限。

**Tech Stack:** Bun、Zod、Supabase CLI、GitHub Actions、PostgreSQL 17。

## 发布前发现与设计取舍

D1 新列即使为 false，也会由现有 rollout RPC 的 `to_jsonb(v_setting)` 返回；platform/tenant SettingsSchema 当前 `.strict()` 不识别该字段。直接 apply 会出现“数据库写入成功但 API 解析失败”，因此原顺序不安全。

选择先部署最小兼容 API，再 apply，再完整 API/Admin 发布。备选修改旧 SQL 输出或停服迁移会引入额外数据库契约变化／停机，本次不采用。兼容修复为两个 schema 增加 `warehouse_transfers_enabled: z.boolean().optional()`；保留 strict，对旧 schema 缺字段保持兼容，不在 apply 前 select 不存在的新列，不开放开关。

桥接分支基于已具备 601 条迁移的 `6f5e5ef5`，只 cherry-pick 兼容补丁；D1 正式候选包含已审查新 migration 和同一补丁。使用现有 worktree 切换短期桥接分支，不删除／移除 D1 文件历史，不移动 C 冻结发布分支。

## Task 1：兼容修复

- [ ] 在 `apps/api/src/repositories/platform-supplier-settings.regression.test.ts` 先增加新列 false/true 的成功 RPC 回包解析、旧回包、错误类型及未知字段拒绝测试；直接验证两个真实 schema。
- [ ] 从 apps/api 执行 `bun test src/repositories/platform-supplier-settings.regression.test.ts`，观察新字段触发明确红灯。
- [ ] 仅修改 `platform-supplier-records.ts` 与 `tenant-suppliers-mappers.ts` 的 SettingsSchema：`warehouse_transfers_enabled: z.boolean().optional(),`。不改现有 SELECT／开关入参／权限。
- [ ] 重跑该测试及 `bun run check`；独立审查；提交补丁。

## Task 2：桥接开发 API

- [ ] 切至基于 `6f5e5ef5` 的新冻结 release 分支，cherry-pick 已验证兼容补丁，确认完整 migration 集与当前开发 601 条逐项相同。
- [ ] 推送新冻结分支，执行 `gh workflow run release-dev.yml --ref <冻结分支> -f service=api -f operation=release`，核对 run headSha，等待成功。
- [ ] 用 hostname 守卫确认只连接 `ubuntu@43.165.126.30` / `VM-0-11-ubuntu`。核对 API 容器运行 revision、健康、HTTP 鉴权；不输出环境文件或凭据。

## Task 3：D1 apply 与开发发布

- [ ] 切回 feature，冻结正式 release 引用。Supabase CLI migration list、工作流 plan 核对唯一差集 `20260908185501` 及文件 SHA-256；如存在额外版本立即停下调查，不 repair 历史。
- [ ] 只读检查新对象不重名、现有流水来源兼容、锁等待、磁盘／内存；备份开发数据库并验证归档可读。记录受影响业务表计数／摘要，不创建业务单据。
- [ ] 通过既有 workflow `mode=apply` / `confirm_dev_project_ref=fclnkyatvfvmzgzdqlba` 应用；再次 `supabase migration list` 和 `verify-migration-history.mjs` 确认 602 条对齐。
- [ ] 只读核对新表为空、开关全 false、权限未分配、函数 ACL、原事实摘要保持。失败通过前向修复，不手工修改数据库。
- [ ] 执行正式 `release-dev.yml`，仅 `service=api,admin`，核对镜像 revision、健康、HTTP，保留冻结候选和证据。只有开关关闭且无调拨事实才允许回退兼容镜像；不回到不识别新设置字段的旧 API。

## Task 4：下一批

- [ ] 发布完成后细化并执行调拨 API repository/service/controller、严格返回契约与错误映射。来源兼容及开关写入需 migration 时创建独立新文件，不修改已 apply 文件；管理端 UI 保持下一独立批次。
- [ ] 复用现有领退料的身份、RPC 注入与 Fastify smoke 模式，先红后绿。必要时生成限定的新表／RPC 类型，禁止复制改写全库类型。
- [ ] 测试和独立审查后提交、推送 feature；未经新一轮明确开发发布流程，不把下一批本地实现称作已经上线。

LightRAG 本次仍返回 502；规则依据当前仓库设计、真实 RPC 和既有发布证据，不依赖不可用的知识库结果。
