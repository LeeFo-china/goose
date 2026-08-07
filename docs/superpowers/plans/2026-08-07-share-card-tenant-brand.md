# Share Card Tenant Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return the project-owning tenant display name as both `tenant_name` and `company_name` from the customer project-log share-card endpoint.

**Architecture:** Extend the existing owned project-log context query with the `projects → tenants` relation so the tenant name is obtained in the same database request. Carry the normalized name through `CustomerProjectLogShareContext`, then map it to two compatible response fields in `getShareCard()` without changing the controller, authentication, database schema, or other share-card fields.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase/PostgREST relation selects, Bun test.

---

### Task 1: Add the project tenant brand contract to the share card

**Files:**
- Create: `apps/api/src/services/customer-project-log-shares/share-card-tenant-brand.test.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/shared-types.ts:86-151`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/owned-context.ts:245-329`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts:148-185`

- [ ] **Step 1: Write the failing contract and behavior tests**

Create `apps/api/src/services/customer-project-log-shares/share-card-tenant-brand.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { getShareCard } from "./legacy/public-actions";
import { normalizeRelation } from "./legacy/shared";
import type { CustomerProjectLogShareContext } from "./legacy/shared";

const context: CustomerProjectLogShareContext = {
  tenant_id: "tenant-1",
  tenant_name: "杭州某某装饰工程有限公司",
  customer_id: "customer-1",
  customer_name: "张先生",
  project_id: "project-1",
  project_name: "中海云麓 12-2-1801",
  project_status: "in_progress",
  project_status_label: "施工中",
  project_address: "杭州市",
  project_style_tags: [],
  property_community: "中海云麓",
  property_building_info: "12-2-1801",
  designer_name: "李设计",
  log_id: "log-1",
  stage_code: null,
  stage_label: null,
  node_name: "水电施工",
  log_content: "施工日志",
  log_images: ["https://example.com/log.jpg"],
  created_at: "2026-08-07T00:00:00.000Z",
};

describe("客户项目日志分享卡租户品牌", () => {
  test("项目上下文从项目所属租户关系取得展示名称", () => {
    const source = readFileSync(
      new URL("./legacy/owned-context.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("tenant:tenants!projects_tenant_id_fkey(");
    expect(source).toContain("name");
    expect(source).toContain("normalizeRelation(project.tenant");
    expect(source).toContain("tenant_name:");

    expect(normalizeRelation({ name: "对象租户" }, { name: null }))
      .toEqual({ name: "对象租户" });
    expect(normalizeRelation([{ name: "数组租户" }], { name: null }))
      .toEqual({ name: "数组租户" });
  });

  test("分享卡同时返回同值的 tenant_name 和 company_name", async () => {
    const result = await getShareCard.call({
      resolveOptionalShareCampaignForOwnedLog: async () => ({
        context,
        campaign: null,
      }),
    }, "auth-user-1", "project-1", "log-1");

    expect(result).toMatchObject({
      tenant_name: "杭州某某装饰工程有限公司",
      company_name: "杭州某某装饰工程有限公司",
      project_name: "中海云麓 12-2-1801",
      images: ["https://example.com/log.jpg"],
    });
  });

  test("租户名称缺失时仍返回稳定的 null 双字段", async () => {
    const result = await getShareCard.call({
      resolveOptionalShareCampaignForOwnedLog: async () => ({
        context: { ...context, tenant_name: null },
        campaign: null,
      }),
    }, "auth-user-1", "project-1", "log-1");

    expect(result.tenant_name).toBeNull();
    expect(result.company_name).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/api
bun test src/services/customer-project-log-shares/share-card-tenant-brand.test.ts
```

Expected: FAIL because the project query does not select the tenant relation and
`getShareCard()` does not return `tenant_name` or `company_name`.

- [ ] **Step 3: Extend the project and context types**

In `legacy/shared-types.ts`, extend `CustomerProjectRow` with the Supabase relation shape:

```typescript
  tenant?: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
```

Add the normalized field to `CustomerProjectLogShareContext` immediately after
`tenant_id`:

```typescript
  tenant_name: string | null;
```

- [ ] **Step 4: Select and normalize the project-owned tenant name**

In the existing `projects` select inside `getOwnedProjectLogContext()`, add only the
required tenant field before the property relation:

```typescript
      tenant:tenants!projects_tenant_id_fkey(
        name
      ),
```

After normalizing `property`, normalize the tenant relation with the existing helper:

```typescript
  const tenant = normalizeRelation(project.tenant, {
    name: null,
  });
```

Add the field to the returned context:

```typescript
    tenant_name: typeof tenant.name === "string" ? tenant.name : null,
```

This keeps the project ownership check and log query unchanged and avoids a second
Supabase request.

- [ ] **Step 5: Map the normalized name to both response fields**

In `getShareCard()` add the two fields directly after `project_name`:

```typescript
    tenant_name: context.tenant_name,
    company_name: context.tenant_name,
```

Do not read a tenant name from authentication state and do not conditionally omit the
fields when the value is `null`.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
cd apps/api
bun test src/services/customer-project-log-shares/share-card-tenant-brand.test.ts
```

Expected: 3 tests pass and 0 fail.

- [ ] **Step 7: Run adjacent share-card regression tests**

Run:

```bash
cd apps/api
bun test \
  src/services/customer-project-log-shares/share-card-tenant-brand.test.ts \
  src/services/customer-project-log-shares/share-reward-code.test.ts \
  src/services/customer-project-log-shares/campaign-summary-contract.test.ts \
  src/services/customer-project-log-shares/mini-program-qrcode-request.test.ts
```

Expected: all tests pass; existing reward, campaign summary, and QR-code behavior stays
unchanged.

- [ ] **Step 8: Commit the contract change**

```bash
git add \
  apps/api/src/services/customer-project-log-shares/share-card-tenant-brand.test.ts \
  apps/api/src/services/customer-project-log-shares/legacy/shared-types.ts \
  apps/api/src/services/customer-project-log-shares/legacy/owned-context.ts \
  apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts
git commit -m "feat(share): 返回分享卡项目租户品牌"
```

### Task 2: Verify the API change and record completion

**Files:**
- Modify: `docs/superpowers/plans/2026-08-07-share-card-tenant-brand.md`

- [ ] **Step 1: Run API static verification**

Run from the repository root:

```bash
bun run --cwd apps/api typecheck
bun run --cwd apps/api build
bun run --cwd apps/api check:file-size
git diff --check
```

Expected: TypeScript, the Bun API build, the API file-size gate, and whitespace checks
all exit with status 0.

- [ ] **Step 2: Review contract, performance, and repository boundaries**

Confirm all of the following from the final diff:

```text
- The response includes tenant_name and company_name with one shared source value.
- The source is projects.tenant_id → tenants.name, not the login session tenant.
- The tenant relation is part of the existing project query; there is no extra query or N+1 path.
- Only tenants.name is selected from the relation.
- Existing controller, authentication, errors, images, rewards, QR code, and campaign fields are unchanged.
- There is no migration, new dependency, cache, or Orange repository modification.
```

- [ ] **Step 3: Mark the implementation plan complete**

Replace every unchecked plan checkbox with `[x]`, then run:

```bash
git diff --check
git add docs/superpowers/plans/2026-08-07-share-card-tenant-brand.md
git commit -m "docs(share): 记录分享卡租户品牌验证"
```

- [ ] **Step 4: Prepare the dev handoff message**

After the code is merged and dev is deployed, send Orange this exact contract summary.
Append the output of `git rev-parse --short HEAD` as the dev commit only after deployment
confirms that revision:

```text
Gooes 已完成客户项目日志分享卡租户品牌字段对接并发布 dev。

接口保持不变：
GET /customer/projects/:projectId/logs/:logId/share-card

响应现同时返回 tenant_name 和 company_name，两者都取项目所属租户
projects.tenant_id 对应的 tenants.name；名称缺失时均为 null，不使用当前登录态
租户名回填。现有鉴权、请求参数、图片、二维码、助力和奖励字段均未调整。

Orange 可以复用现有客户名下的项目日志完成真机验收；如需要隔离 fixture，
Gooes 再从 dev 数据中筛选后单独同步，不伪造项目或日志 ID。
```
