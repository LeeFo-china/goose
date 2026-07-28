# 品牌技术支持文案原样返回 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留 `support_text` 响应字段，但让它严格等于当前有效品牌的 `display_name`。

**Architecture:** 继续由 `buildSupportText` 作为唯一响应文案构造入口，将其从固定后缀拼接改为原样返回。有效品牌服务、平台回退和路由响应结构均保持不变，仅更新行为断言与交接示例。

**Tech Stack:** Bun、TypeScript、Fastify、Bun Test

---

### Task 1: 以测试锁定原样返回契约

**Files:**
- Modify: `apps/api/src/services/branding-contracts.test.ts`
- Modify: `apps/api/src/services/effective-branding.test.ts`
- Modify: `apps/api/src/services/effective-branding-platform.test.ts`
- Modify: `apps/api/src/controllers/branding/routes.test.ts`
- Modify: `apps/api/src/services/branding-contracts.ts`

- [ ] **Step 1: 将契约测试改为期望原始名称**

```ts
expect(buildSupportText("晴天装饰")).toBe("晴天装饰");
```

同时将平台、租户和回退夹具中的期望值分别改为 `"字节跳动"`、
`"晴天装饰"`、`"平台品牌"` 和 `"租户品牌"`。

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
cd apps/api
bun test src/services/branding-contracts.test.ts \
  src/services/effective-branding.test.ts \
  src/services/effective-branding-platform.test.ts \
  src/controllers/branding/routes.test.ts
```

Expected: FAIL，实际值仍包含 `提供技术支持`。

- [ ] **Step 3: 编写最小实现**

```ts
export function buildSupportText(displayName: string): string {
  return displayName;
}
```

- [ ] **Step 4: 再次运行测试并确认 GREEN**

Run 同 Step 2。

Expected: 所有相关测试 PASS，0 fail。

### Task 2: 更新契约文档并验证交付

**Files:**
- Modify: `docs/miniprogram/2026-07-27-tenant-support-branding-batch-a-handoff.md`

- [ ] **Step 1: 更新所有响应示例与规则说明**

将示例中的：

```json
{ "display_name": "晴天装饰", "support_text": "晴天装饰提供技术支持" }
```

改为：

```json
{ "display_name": "晴天装饰", "support_text": "晴天装饰" }
```

并明确 `support_text` 为兼容字段，其值必须原样等于 `display_name`。

- [ ] **Step 2: 运行完整最小验证**

```bash
cd apps/api
bun run check
cd ../..
bun scripts/check-api-file-size.ts
git diff --check
```

Expected: TypeScript、构建、文件大小和 diff 检查全部退出码 0。

- [ ] **Step 3: 提交**

```bash
git add apps/api/src/services/branding-contracts.ts \
  apps/api/src/services/branding-contracts.test.ts \
  apps/api/src/services/effective-branding.test.ts \
  apps/api/src/services/effective-branding-platform.test.ts \
  apps/api/src/controllers/branding/routes.test.ts \
  docs/miniprogram/2026-07-27-tenant-support-branding-batch-a-handoff.md \
  docs/superpowers/plans/2026-07-28-branding-support-text-verbatim.md
git commit -m "fix(branding): 品牌文案按输入原样返回"
```

- [ ] **Step 4: 推送、部署 dev 并 smoke**

推送 `feature/tenant-support-branding-batch-a`，发布 dev API。分别使用匿名请求和
有权益租户账号请求 `GET https://api-dev.goodcms.cn/branding/effective`。

Expected:

```text
support_text === display_name
```

且平台回退、租户来源、Logo、version 和 tenant_id 仍符合原契约。
