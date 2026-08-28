# Supplier Procurement Route Capability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将采购批次及同链路可采购商品路由稳定分类为非试用能力，并让默认测试门禁持续覆盖所有租户员工读写路由。

**Architecture:** 保持现有 fail-closed 路由能力解析不变，仅扩充供应商独立增值模块的顶层排除清单。复用 Fastify 注册路由库存测试验证每个员工态读写路由恰好命中一个规则，并将该测试作为默认稳定测试套件中的独立 API 门禁。

**Tech Stack:** Bun、TypeScript、Fastify、bun:test。

---

### Task 1: 固化采购路由能力契约

**Files:**
- Modify: `apps/api/src/services/tenant-service-capability-map.test.ts`
- Modify: `apps/api/src/services/tenant-service-capability-map.ts`
- Test: `apps/api/src/services/tenant-service-capability-map.test.ts`

- [x] **Step 1: Write the failing test**

增加表驱动断言，覆盖 `supplier-purchase-batch-project-options`、`supplier-purchase-batch-cost-categories`、`supplier-purchase-batch-catalog`、`supplier-purchase-batches` 和 `supplier-purchasable-products`，要求解析结果严格等于：

```ts
{ kind: "excluded", reason: "not_trial_capability" }
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/services/tenant-service-capability-map.test.ts`

Expected: 新增契约断言及现有全量路由唯一分类断言因未命中规则而失败。

- [x] **Step 3: Write minimal implementation**

在 `apps/api/src/services/tenant-service-capability-map.ts` 的 `EXCLUDED_TOP_LEVEL` 中加入五个顶层前缀，不修改能力枚举、控制器或接口契约。

- [x] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/services/tenant-service-capability-map.test.ts src/controllers/supplier-purchase-batches/routes.test.ts src/controllers/supplier-purchasable-products/routes.test.ts`

Expected: 三个测试文件全部通过，12 个采购批次路由的 method/path 保持不变。

### Task 2: 将全量分类检查纳入默认稳定门禁

**Files:**
- Modify: `scripts/run-workspace-tests.test.ts`
- Modify: `scripts/run-workspace-tests.ts`
- Test: `scripts/run-workspace-tests.test.ts`

- [x] **Step 1: Write the failing test**

修改稳定套件和执行顺序断言，要求包含工作目录为 `apps/api`、目标为 `./src/services/tenant-service-capability-map.test.ts` 的 `api-route-capabilities` 套件。

- [x] **Step 2: Run test to verify it fails**

Run: `bun test scripts/run-workspace-tests.test.ts`

Expected: 稳定套件缺少 `api-route-capabilities` 而失败。

- [x] **Step 3: Write minimal implementation**

在 `buildTestSuites("stable")` 中加入专用 API 路由能力测试套件；`all` 模式继续由完整 API 测试覆盖，避免重复执行。

- [x] **Step 4: Run test to verify it passes**

Run: `bun test scripts/run-workspace-tests.test.ts`

Expected: 测试执行器契约全部通过。

### Task 3: 验证、提交并发布开发环境

**Files:**
- Verify: all modified files

- [x] **Step 1: Run focused and default verification**

Run:

```bash
cd apps/api && bun test src/services/tenant-service-capability-map.test.ts src/controllers/supplier-purchase-batches/routes.test.ts src/controllers/supplier-purchasable-products/routes.test.ts
bun run api:typecheck
bun run api:build
bun run test
```

Expected: 命令全部以退出码 0 完成。

- [x] **Step 2: Review the diff and commit**

确认只包含路由排除映射、测试门禁和本计划，提交信息：

```text
fix(api): 补齐采购路由能力映射
```

- [ ] **Step 3: Push main and monitor dev deployment**

推送 `main`，等待构建和 Auto Deploy Dev 全部成功，确认部署 revision 等于远端 `main`。

- [ ] **Step 4: Run dev smoke**

使用不含凭证的请求先确认鉴权层仍返回 `401 TOKEN_MISSING`；如当前环境有可用的脱敏员工联调凭证，再执行登录态列表 smoke。不得输出 token 或业务数据。
