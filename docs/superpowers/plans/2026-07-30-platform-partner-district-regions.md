# 城市合伙人区县运营区域实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将城市合伙人的区域授权改为可校验、可审计、并发安全的区县级运营区域。

**Architecture:** 保留 `platform_partners.region_codes` 兼容现有匹配链路，新增独立区域规则服务统一校验行政区和冲突。数据库 migration 增加区域版本与触发器作为并发最终防线，Admin 使用共用级联多选器完成新建、审核和编辑。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase/PostgreSQL、Next.js、React、shadcn/Radix、Tailwind。

---

### Task 1: 区县规则服务

**Files:**
- Create: `apps/api/src/services/platform-partner-regions.ts`
- Create: `apps/api/src/services/platform-partner-regions.test.ts`
- Modify: `apps/api/src/repositories/administrative-areas.ts`
- Modify: `apps/api/src/repositories/platform-partners.ts`

- [ ] **Step 1: 写失败测试**

覆盖空区域、重复编码、城市级/无效编码、启用区域冲突和合法区县归一化：

```ts
await expect(service.assertAssignableDistricts([]))
  .rejects.toMatchObject({ code: "PLATFORM_PARTNER_REGION_REQUIRED" });
await expect(service.assertAssignableDistricts(["411500"]))
  .rejects.toMatchObject({ code: "PLATFORM_PARTNER_REGION_INVALID" });
await expect(service.assertAssignableDistricts(["411502"]))
  .rejects.toMatchObject({ code: "PLATFORM_PARTNER_REGION_CONFLICT" });
expect(await service.assertAssignableDistricts(["411503", "411503"]))
  .toEqual(["411503"]);
```

- [ ] **Step 2: 验证测试按预期失败**

Run: `cd apps/api && bun test src/services/platform-partner-regions.test.ts`

Expected: FAIL，原因是区域规则服务尚不存在。

- [ ] **Step 3: 实现最小规则与 repository 查询**

区域服务公开：

```ts
assertAssignableDistricts(
  regionCodes: readonly string[],
  options?: { excludePartnerId?: string },
): Promise<string[]>
```

行政区 repository 使用一次 `.in("adcode", codes)` 查询必要字段；合伙人 repository 使用
`.eq("status", "active").overlaps("region_codes", codes)` 查询首个冲突，排除当前合伙人。

- [ ] **Step 4: 验证转绿**

Run: `cd apps/api && bun test src/services/platform-partner-regions.test.ts`

Expected: PASS。

### Task 2: 区域版本与数据库最终约束

**Files:**
- Create: `supabase/migrations/20260730120000_enforce_platform_partner_district_regions.sql`
- Modify: `apps/api/src/services/platform-partners.test.ts`

- [ ] **Step 1: 写 migration 契约失败测试**

断言 migration 包含 `region_version`、区县主数据校验、advisory lock、启用区域重叠检查和 trigger。

- [ ] **Step 2: 验证测试按预期失败**

Run: `cd apps/api && bun test src/services/platform-partners.test.ts`

Expected: FAIL，原因是 migration 尚不存在。

- [ ] **Step 3: 编写 migration**

migration 只增加版本字段、检查约束、验证函数和触发器；不更新存量 `region_codes`。
触发器在新增记录、区域发生变化或状态切换为启用时要求区县级编码，并在启用状态下通过事务锁阻止并发区域重叠。

- [ ] **Step 4: 验证 migration 契约转绿**

Run: `cd apps/api && bun test src/services/platform-partners.test.ts`

Expected: PASS。

### Task 3: API 区域变更、审计和业务入口复用

**Files:**
- Modify: `apps/api/src/schema/platform-partners.ts`
- Modify: `apps/api/src/controllers/platform-partners/index.ts`
- Modify: `apps/api/src/controllers/platform-partners/routes.test.ts`
- Modify: `apps/api/src/services/platform-partners.ts`
- Modify: `apps/api/src/services/platform-partners.test.ts`
- Modify: `apps/api/src/services/platform-partner-applications.ts`
- Modify: `apps/api/src/services/platform-partner-applications.test.ts`
- Modify: `apps/api/src/schema/platform-audit-logs.ts`

- [ ] **Step 1: 写失败测试**

覆盖：

```ts
await service.updatePartnerRegions(auth, partner.id, {
  region_codes: ["411502"],
  change_reason: "调整运营区县",
  expected_version: 1,
});
```

并断言乐观锁冲突、审计快照、启用前校验、申请审核校验和邀请码越权区域被拒绝。

- [ ] **Step 2: 验证测试按预期失败**

Run:

```bash
cd apps/api
bun test src/services/platform-partners.test.ts src/services/platform-partner-applications.test.ts src/controllers/platform-partners/routes.test.ts
```

Expected: FAIL，原因是新接口和规则调用尚未实现。

- [ ] **Step 3: 实现 API**

新增严格 schema：

```ts
{
  region_codes: z.array(DistrictAdcodeSchema).min(1).max(100),
  change_reason: z.string().trim().min(1).max(300),
  expected_version: z.number().int().positive(),
}
```

新增 `PATCH /platform/partners/:id/regions`，repository 通过
`id + region_version` 条件更新并递增版本。区域更新成功后调用现有
`platformAuditLogService.recordBestEffort` 写入 `platform_partner_regions_update`。

- [ ] **Step 4: 验证 API 测试转绿**

重新运行 Step 2 命令，Expected: PASS。

### Task 4: Admin 区县选择与编辑

**Files:**
- Create: `apps/admin/components/platform-partners/platform-partner-region-picker.tsx`
- Create: `apps/admin/components/platform-partners/platform-partner-regions.test.ts`
- Modify: `apps/admin/components/platform-partners/platform-partner-actions.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-application-actions.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-tables.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-types.ts`
- Modify: `apps/admin/app/(console)/platform/partners/page.tsx`

- [ ] **Step 1: 写失败的源代码契约测试**

断言新建和审核表单使用 `PlatformPartnerRegionPicker`，不再出现“多个区域用逗号分隔”；
列表包含区域编辑入口、名称展示、`expected_version` 和变更原因。

- [ ] **Step 2: 验证测试按预期失败**

Run: `cd apps/admin && bun test components/platform-partners/platform-partner-regions.test.ts`

Expected: FAIL，原因是选择器和编辑入口尚不存在。

- [ ] **Step 3: 实现共用选择器和三个入口**

选择器复用现有行政区 API、`SearchableLocationSelect`、`Command`、`Popover`、
`Checkbox` 和 `Badge`。省市负责缩小区县候选，区县选择累积到受控 `string[]`；
存量非区县值显示待迁移状态。

- [ ] **Step 4: 验证 Admin 测试转绿**

Run: `cd apps/admin && bun test components/platform-partners/platform-partner-regions.test.ts components/platform-partners/platform-partner-page-layout.test.ts`

Expected: PASS。

### Task 5: 全量验证与完成审计

**Files:**
- Verify only

- [ ] **Step 1: API 静态检查与相关测试**

```bash
bun test apps/api/src/services/platform-partner-regions.test.ts \
  apps/api/src/services/platform-partners.test.ts \
  apps/api/src/services/platform-partner-applications.test.ts \
  apps/api/src/controllers/platform-partners/routes.test.ts
bun run api:check
```

- [ ] **Step 2: Admin 测试、类型检查和构建**

```bash
bun test apps/admin/components/platform-partners/platform-partner-regions.test.ts \
  apps/admin/components/platform-partners/platform-partner-page-layout.test.ts
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

- [ ] **Step 3: migration 与变更边界核查**

```bash
supabase migration list
git diff --check
git status --short
```

确认 migration 未包含存量区域 UPDATE，API 区域更新未操作
`tenant_partner_bindings`，且所有显式验收项均有测试或代码证据。
