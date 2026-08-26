# Douyin Release Upload Response v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复生成体验版时合法发布 claim 响应被 API 判为格式无效的问题。

**Architecture:** 新增滚动兼容的 v2 SECURITY DEFINER RPC，完整返回当前发布记录字段；repository 切换到 v2，旧 RPC 保留到回滚窗口结束。严格解析边界保持不变。

**Tech Stack:** PostgreSQL/Supabase migrations、Bun、TypeScript、Zod、Fastify。

---

### Task 1: 锁定失败契约

**Files:**
- Modify: `apps/api/src/repositories/douyin-miniapp-releases.test.ts`
- Create: `apps/api/src/services/douyin-miniapp/release-upload-v2-migration-contract.test.ts`

- [ ] 新增 repository 测试，断言 RPC 名为 `get_or_create_and_claim_douyin_miniapp_release_upload_v2`，返回行包含 `latest_test_qr_url` 与 `audit_qr_url`。
- [ ] 新增 migration contract，断言 v2 函数返回完整字段、保留原锁和冲突语义、仅 service_role 可执行。
- [ ] 运行 focused tests，确认因 v2 RPC/migration 缺失而 RED。

### Task 2: 实现 forward migration 与 repository 切换

**Files:**
- Create: `supabase/migrations/20260826112000_add_douyin_release_upload_claim_v2.sql`
- Modify: `apps/api/src/repositories/douyin-miniapp-releases.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] 从现有 RPC 复制完整校验和锁语义到 v2，仅补齐两列返回值。
- [ ] 配置 SECURITY DEFINER、固定 search_path 和 service_role-only ACL。
- [ ] repository 改调 v2，保持现有严格 schema。
- [ ] 运行 focused tests，确认 GREEN。

### Task 3: 开发库与发布验证

**Files:**
- Verify only.

- [ ] dry-run 确认只包含 `20260826112000`。
- [ ] 应用开发库 migration，核对 migration list 与 catalog/ACL。
- [ ] 运行真实 v2 RPC 兼容 smoke，确认两个新字段存在。
- [ ] 运行 `bun run api:check` 与 `git diff --check`。
- [ ] 提交并推送，触发仅 API 的开发部署，等待成功并检查 API 健康状态。
