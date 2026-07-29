# Supplier Catalog Deterministic E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不写共享数据库的前提下，确定性验证类目、品牌和单位的新建、编辑、停用、启用及乐观锁重试。

**Architecture:** 使用独立 Node HTTP Mock Backend 保存内存目录状态，Next.js 服务端组件和浏览器同源代理都通过 `GOOES_API_BASE_URL` 访问它。专用 Playwright 配置同时管理 Mock 与 Admin Dev Server，E2E 从真实页面操作并通过测试控制接口核对 mutation journal。

**Tech Stack:** Bun、TypeScript、Next.js、Playwright、Node `http`

---

### Task 1: 建立专用 Mock Backend 骨架

**Files:**
- Create: `apps/admin/e2e/supplier-catalog-mock-fixture.mjs`
- Create: `apps/admin/e2e/supplier-catalog-mock-backend.mjs`

- [ ] **Step 1: 定义固定会话和目录记录**

在 fixture 中导出拥有目录权限的平台会话和每类一条固定记录：

```js
export const mockCatalogSession = {
  user_id: "catalog-admin-user",
  login_channel: "admin_web",
  employee: {
    id: "10000000-0000-4000-8000-000000000001",
    name: "目录测试管理员",
    phone: "18637605353",
    status: "active",
    tenant_department_id: null,
    department_name: "平台运营",
    post_id: null,
    post_name: "平台管理员",
    avatar: null,
  },
  tenant: null,
  roles: ["platform_admin"],
  permissions: [{ code: "platform.catalog.manage", scope: "all" }],
  token: "supplier-catalog-mock-token",
  expires_at: "2026-12-31T23:59:59+08:00",
};
```

记录必须包含页面类型要求的 `id`、`code`、`name`、`status`、
`sort_order`、`version`、`created_at`、`updated_at` 以及各类型专属字段。

- [ ] **Step 2: 实现只读骨架和测试控制接口**

Mock Backend 必须先支持：

```text
GET  /health
POST /__test/reset
GET  /__test/mutations
POST /__test/conflict-next
POST /admin/auth/login
GET  /admin/auth/me
GET  /platform/catalog/categories
GET  /platform/catalog/brands
GET  /platform/catalog/units
GET  /notifications/summary
GET  /notifications
```

列表使用：

```js
function paginate(records, url) {
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const pageSize = Math.min(
    positiveInteger(url.searchParams.get("pageSize"), 20),
    100,
  );
  const start = (page - 1) * pageSize;
  const list = records.slice(start, start + pageSize);
  return {
    list,
    pagination: {
      page,
      pageSize,
      total: records.length,
      totalPages: records.length ? Math.ceil(records.length / pageSize) : 0,
    },
  };
}
```

- [ ] **Step 3: 启动 Mock 并验证只读接口**

Run:

```bash
node apps/admin/e2e/supplier-catalog-mock-backend.mjs
```

Expected: 输出监听地址，`/health` 返回 HTTP 200；终止后进程干净退出。

- [ ] **Step 4: Commit**

```bash
git add apps/admin/e2e/supplier-catalog-mock-fixture.mjs \
  apps/admin/e2e/supplier-catalog-mock-backend.mjs
git commit -m "test(admin): 搭建供应目录内存测试后端"
```

### Task 2: 写入第一个失败的目录工作流测试

**Files:**
- Create: `apps/admin/playwright.supplier-catalog.config.ts`
- Create: `apps/admin/e2e/supplier-catalog-workflow.spec.ts`
- Modify: `apps/admin/package.json`

- [ ] **Step 1: 增加专用 Playwright 配置**

配置使用固定端口并同时启动两个服务：

```ts
webServer: [
  {
    name: "supplier-catalog-mock",
    command: "node e2e/supplier-catalog-mock-backend.mjs",
    url: "http://127.0.0.1:3997/health",
    reuseExistingServer: false,
  },
  {
    name: "supplier-catalog-admin",
    command: "node scripts/playwright-dev-server.mjs",
    url: "http://127.0.0.1:3022",
    env: {
      GOOES_API_BASE_URL: "http://127.0.0.1:3997",
      PLAYWRIGHT_DEV_SERVER_PORT: "3022",
      PLAYWRIGHT_NEXT_DIST_DIR: ".next-e2e/supplier-catalog",
    },
    reuseExistingServer: false,
  },
]
```

在 `apps/admin/package.json` 增加：

```json
"test:e2e:supplier-catalog": "env -u NO_COLOR playwright test --config=playwright.supplier-catalog.config.ts"
```

- [ ] **Step 2: 先写类目完整工作流测试**

测试必须：

```ts
await loginAsPlatformAdmin(page);
await page.goto("/platform/catalog", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "新建类目" }).click();
await page.getByLabel("编码").fill("E2E-CATEGORY");
await page.getByLabel("名称").fill("E2E 新类目");
await page.getByRole("button", { name: "保存类目" }).click();
await expect(page.getByText("E2E 新类目", { exact: true })).toBeVisible();
```

随后打开该行“编辑”，修改名称，再依次执行“停用”和“启用”。

- [ ] **Step 3: 运行并确认 RED**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-catalog
```

Expected: 类目 POST 返回未实现错误，测试停在“E2E 新类目”未出现；登录和列表读取必须已成功。

### Task 3: 实现 Mock 写接口并让类目工作流变绿

**Files:**
- Modify: `apps/admin/e2e/supplier-catalog-mock-backend.mjs`

- [ ] **Step 1: 实现创建接口**

三类 POST 共享以下约束：

```js
const idempotencyKey = request.headers["idempotency-key"];
if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
  sendJson(response, 400, {
    success: false,
    code: "IDEMPOTENCY_KEY_REQUIRED",
    message: "缺少 Idempotency-Key",
  });
  return;
}
```

创建记录版本为 `1`，写入 mutation journal，并返回
`{ success: true, data: record }`。

- [ ] **Step 2: 实现更新和状态切换**

PATCH 根据路径定位记录并校验：

```js
if (payload.expected_version !== record.version) {
  sendJson(response, 409, {
    success: false,
    code: "SUPPLIER_VERSION_CONFLICT",
    message: "目录数据版本已变化",
  });
  return;
}
```

成功时只更新请求提供的可写字段，版本加一并写入 journal。

- [ ] **Step 3: 运行类目测试确认 GREEN**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-catalog \
  --grep "类目"
```

Expected: 1 passed，journal 中依次出现 POST、编辑 PATCH、停用 PATCH、
启用 PATCH。

- [ ] **Step 4: Commit**

```bash
git add apps/admin/e2e/supplier-catalog-mock-backend.mjs \
  apps/admin/e2e/supplier-catalog-workflow.spec.ts \
  apps/admin/playwright.supplier-catalog.config.ts apps/admin/package.json
git commit -m "test(admin): 覆盖标准类目完整操作"
```

### Task 4: 扩展品牌、单位与冲突重试

**Files:**
- Modify: `apps/admin/e2e/supplier-catalog-workflow.spec.ts`
- Modify: `apps/admin/e2e/supplier-catalog-mock-backend.mjs`

- [ ] **Step 1: 先增加品牌与单位测试**

品牌测试填写 `编码`、`品牌`、`法定名称`；单位测试填写 `编码`、
`名称`、`符号` 并保持“基准单位”。两者都执行新建、编辑、停用和启用。

- [ ] **Step 2: 运行并确认 RED**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-catalog
```

Expected: 品牌或单位在 Mock 字段映射、过滤或状态变更处失败，且失败点与
新增场景一致。

- [ ] **Step 3: 补齐 Mock 字段映射**

品牌创建补齐：

```js
{ legal_name: payload.legal_name ?? null, logo_file_id: null }
```

单位创建补齐：

```js
{
  symbol: payload.symbol,
  base_unit_id: payload.base_unit_id ?? null,
  base_unit: null,
  conversion_factor: String(payload.conversion_factor),
}
```

- [ ] **Step 4: 增加品牌停用冲突重试**

测试先调用：

```ts
await request.post("http://127.0.0.1:3997/__test/conflict-next", {
  data: { kind: "brand", id: brandId },
});
```

第一次停用返回 409，Mock 同时将服务端版本加一。页面必须显示
“数据版本已变化”，点击“重试本次操作”后按最新版本再次 PATCH 并成功停用。

- [ ] **Step 5: 运行并确认 GREEN**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-catalog
```

Expected: 类目、品牌、单位全部通过。

- [ ] **Step 6: Commit**

```bash
git add apps/admin/e2e/supplier-catalog-workflow.spec.ts \
  apps/admin/e2e/supplier-catalog-mock-backend.mjs
git commit -m "test(admin): 覆盖品牌单位及版本冲突"
```

### Task 5: 回归验证与交付

**Files:**
- Modify only if verification reveals a scoped defect.

- [ ] **Step 1: 运行供应商 Admin 单测**

Run:

```bash
cd apps/admin
bun test components/platform-suppliers components/suppliers \
  components/supplier-catalog
```

Expected: 46 tests passed，0 failed。

- [ ] **Step 2: 运行 Catalog API 单测**

Run:

```bash
cd apps/api
bun test src/schema/supplier-foundation.test.ts \
  src/services/supplier-catalog.test.ts \
  src/repositories/supplier-catalog.test.ts \
  src/services/supplier-catalog-migration-contract.test.ts \
  src/controllers/supplier-catalog/routes.test.ts \
  src/controllers/platform-supplier-catalog/routes.test.ts
```

Expected: 46 tests passed，0 failed。

- [ ] **Step 3: 运行静态检查和构建**

Run:

```bash
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
```

Expected: 全部退出码 0。

- [ ] **Step 4: 最终审计**

确认：

```bash
git status --short
git log --oneline --decorate -5
```

工作区仅包含有意修改；每一项设计要求均有 Playwright、journal 或静态检查
证据。
