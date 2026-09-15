# Douyin Measurement Standalone Phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让免费量房页使用与客户登录页相同的抖音手机号授权，并移除线索组件 ID 依赖。

**Architecture:** 保留现有手机号授权 code 到后端换号的安全链路，只简化运行配置与 UI。新 migration 向前替换租户配置 RPC 和约束，应用层同步收窄契约。

**Tech Stack:** Bun、TypeScript、抖音原生小程序、Fastify、Next.js、Zod、Supabase PostgreSQL。

---

### Task 1: 收窄运行配置与量房表单契约

**Files:**
- Modify: `packages/domain/src/douyin-miniapp.ts`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/api/content-validation.ts`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ts`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttml`
- Test: `apps/douyin-mini/src/api/bootstrap.test.ts`
- Test: `apps/douyin-mini/src/pages/lead/lead-page.test.ts`
- Test: `apps/douyin-mini/src/pages/lead/form-model.test.ts`

- [x] 写失败测试：官方手机号运行配置不含 `clue_component_id` 仍可解析；量房模板不含线索组件属性，按钮复用 `getPhoneNumber`。
- [x] 运行目标测试，确认因旧组件 ID 必填和旧模板属性失败。
- [x] 删除客户端与 Domain 的组件 ID 依赖，保持短信兜底与既有 code 提交路径。
- [x] 重跑目标测试并确认通过。

### Task 2: 简化管理端与 API 配置契约

**Files:**
- Modify: `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.test.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-types.ts`
- Modify: `apps/api/src/schema/tenant-douyin-miniapp.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.ts`
- Modify: `apps/api/src/repositories/tenant-douyin-miniapp-lead-capture.ts`
- Test: `apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.test.ts`
- Test: `apps/api/src/repositories/tenant-douyin-miniapp-lead-capture.test.ts`

- [x] 写失败测试：开关请求与响应不含组件 ID，开启只需要当前 AppID 和 CAS 时间。
- [x] 运行目标测试，确认旧 schema、UI 和 RPC 参数导致失败。
- [x] 移除表单输入与 API 组件 ID 字段，保留权限、授权状态和 CAS 防并发覆盖。
- [x] 重跑 API/Admin 目标测试并确认通过。

### Task 3: 向前迁移数据库契约

**Files:**
- Create: `supabase/migrations/20260915090000_remove_douyin_clue_component_dependency.sql`
- Create: `apps/api/src/services/tenant-douyin-miniapp/standalone-phone-migration-contract.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/clue-config-migration-contract.test.ts`

- [x] 写失败 migration 契约测试：新 RPC 为五参数、官方运行配置不写组件 ID、旧约束被移除、权限仅授予 service role。
- [x] 运行契约测试，确认 migration 尚不存在而失败。
- [x] 编写事务 migration：锁表、清理运行配置、移除旧约束、替换 RPC 签名与权限；保留历史列。
- [x] 重跑 migration 契约测试并确认通过。

### Task 4: 完整验证与提交

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-douyin-measurement-standalone-phone-design.md`
- Modify: `docs/superpowers/plans/2026-09-15-douyin-measurement-standalone-phone.md`

- [x] 运行 Douyin mini、Domain、API 和 Admin 受影响测试。
- [x] 运行四个包的最小静态检查与构建。
- [x] 用 `git diff --check`、迁移版本唯一性和 schema/RPC 检索核验边界。
- [x] 更新清单、提交 Conventional Commit，并报告尚未执行的远端 migration、模板上传与发布步骤。
