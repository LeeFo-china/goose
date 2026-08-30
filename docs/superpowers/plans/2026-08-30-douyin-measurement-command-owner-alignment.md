# Douyin Measurement Command Owner Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复生产环境抖音量房预约命令因函数 owner 与 `marketing_leads` 表 owner 不一致而被守卫误拦截的问题。

**Architecture:** 新增 forward-only migration，动态读取表 owner，并将明确列举的抖音线索写命令函数 owner 对齐到该角色。保留现有触发器和权限边界，通过静态 contract、catalog 检查和事务回滚 RPC smoke 验证。

**Tech Stack:** PostgreSQL 15、Supabase migrations、Bun test、GitHub Actions

---

### Task 1: Migration Contract

**Files:**
- Create: `apps/api/src/services/douyin-miniapp/measurement-command-owner-migration-contract.test.ts`
- Create: `supabase/migrations/20260830110000_align_douyin_measurement_command_owners.sql`

- [ ] **Step 1: Write the failing contract test**

测试必须读取新 migration，并断言：动态读取 `marketing_leads` owner；逐个检查
目标函数存在且为 `SECURITY DEFINER`；使用 `ALTER FUNCTION ... OWNER TO`；
不修改表 owner、守卫逻辑、授权或业务数据。

- [ ] **Step 2: Run the contract test and verify RED**

Run: `cd apps/api && bun test src/services/douyin-miniapp/measurement-command-owner-migration-contract.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the minimal migration**

使用 `DO $block$`、`to_regprocedure` 和 `pg_proc.prosecdef` 完成失败关闭的 owner
对齐；事务设置 `lock_timeout=5s`、`statement_timeout=30s`。

- [ ] **Step 4: Run focused contracts and verify GREEN**

Run: `cd apps/api && bun test src/services/douyin-miniapp/measurement-command-owner-migration-contract.test.ts src/services/douyin-miniapp/appointment-migration-contract.test.ts src/services/douyin-miniapp/appointment-ownership-migration-contract.test.ts`

Expected: all tests pass.

### Task 2: Development Database Proof

**Files:**
- Verify: `supabase/migrations/20260830110000_align_douyin_measurement_command_owners.sql`

- [ ] **Step 1: Run development migration plan**

确认只待执行 `20260830110000`。

- [ ] **Step 2: Apply migration and verify history**

应用后确认 Local/Remote 对齐，函数 owner 全部等于 `marketing_leads` owner，
`service_role` 仍只有命令执行权限。

- [ ] **Step 3: Run rollback-only appointment smoke**

在事务内准备隔离 fixture、调用 `submit_douyin_measurement_appointment`、断言
返回 `data` 且创建线索和预约，然后 `ROLLBACK` 并验证零残留。

### Task 3: Integration And Release

**Files:**
- Modify only files introduced in Task 1 and the approved docs.

- [ ] **Step 1: Run API checks**

Run: `bun run api:check`

Expected: typecheck, build and file-size checks pass.

- [ ] **Step 2: Commit, push, review and squash merge**

Commit: `fix(douyin): 修复量房命令所有者不一致`

- [ ] **Step 3: Verify development deployment**

确认合并提交的开发构建和 Auto dev deploy 成功，公网 API 返回 200。

### Task 4: Production Migration And Smoke

**Files:**
- Apply: `supabase/migrations/20260830110000_align_douyin_measurement_command_owners.sql`

- [ ] **Step 1: Run production migration plan and backup**

确认 pending 仅包含本 migration，并保留自动备份路径。应用前按设计文档采集
8 个函数的 `proowner`、`proacl` 和逐函数 `rollback_sql`，保存为发布证据。

- [ ] **Step 2: Apply production migration**

应用后再次运行 plan，要求 `pending_count=0`。

- [ ] **Step 3: Run production catalog and rollback-only RPC smoke**

验证所有目标命令 owner 与表 owner 一致，合法命令成功，直接写守卫仍拒绝，
诊断 fixture 回滚后零残留。

- [ ] **Step 4: Deploy production API candidate if affected**

本修复仅含 migration 和测试文档；若 affected-services 判定 API 无镜像变化，
无需重启 API。仍需验证 `https://api.goodcms.cn/` 返回 200。

- [ ] **Step 5: Confirm resubmission readiness**

核对版本 `0.1.9` 保持 `audit_rejected`，生产量房链路通过后允许租户重新提审。
