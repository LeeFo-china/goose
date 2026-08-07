# Platform Service Product Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为平台技术服务套餐增加发布与归档确认，并通过可审计 migration 准备三档正式服务条款草稿。

**Architecture:** 复用现有 `PlatformServiceProductDetail`、shadcn `AlertDialog` 和套餐发布/归档接口；将纯展示计算放入独立规则函数并测试。数据库内容变更只更新草稿，不绕过现有发布版本和发布人审计。

**Tech Stack:** Next.js 15、React 19、TypeScript、shadcn/Radix、Tailwind CSS、Bun Test、Supabase migration。

---

### Task 1: 发布和归档确认规则

**Files:**
- Create: `apps/admin/components/platform-service-products/platform-service-product-action-rules.ts`
- Create: `apps/admin/components/platform-service-products/platform-service-product-action-rules.test.ts`

- [ ] **Step 1: 写入失败测试**

测试 `getPlatformServiceProductChangedFields()` 在没有已发布版本时返回全部关键字段，在已有版本时只返回发生变化的名称、价格、服务范围和条款，并测试 `getNextPublishedVersion()`。

- [ ] **Step 2: 验证测试按预期失败**

Run: `cd apps/admin && bun test components/platform-service-products/platform-service-product-action-rules.test.ts`

Expected: FAIL，原因是规则模块尚不存在。

- [ ] **Step 3: 实现最小纯函数**

导出 `getPlatformServiceProductChangedFields(product)` 和 `getNextPublishedVersion(product)`，使用现有 `PlatformServiceProductListItem` 类型，不引入依赖。

- [ ] **Step 4: 验证测试通过**

Run: `cd apps/admin && bun test components/platform-service-products/platform-service-product-action-rules.test.ts`

Expected: PASS，0 failures。

### Task 2: 套餐操作确认交互

**Files:**
- Modify: `apps/admin/components/platform-service-products/platform-service-product-detail.tsx`
- Modify: `apps/admin/components/platform-service-products/platform-service-products-page.test.ts`

- [ ] **Step 1: 扩展源码行为测试并验证失败**

断言详情组件使用 `AlertDialog`，包含“确认发布套餐”“确认归档套餐”“只影响新订单”“小程序将不再展示和销售”以及 destructive 归档动作。

Run: `cd apps/admin && bun test components/platform-service-products/platform-service-products-page.test.ts`

Expected: FAIL，原因是确认交互和文案尚不存在。

- [ ] **Step 2: 实现发布确认**

在详情弹窗内加入受控 `AlertDialog`。展示草稿版本、下一发布版本、价格/折扣/条款版本和变更字段，确认后才复用现有 `runAction("publish")`。

- [ ] **Step 3: 实现归档确认**

加入危险操作确认层，说明销售和历史订单影响；`AlertDialogAction` 使用 destructive 样式，提交中禁用取消与关闭。

- [ ] **Step 4: 验证 Admin 定向测试通过**

Run: `cd apps/admin && bun test components/platform-service-products/platform-service-products-page.test.ts components/platform-service-products/platform-service-product-action-rules.test.ts`

Expected: PASS，0 failures。

### Task 3: 三档正式条款草稿 migration

**Files:**
- Create: `supabase/migrations/20260807160000_prepare_platform_service_product_formal_terms.sql`

- [ ] **Step 1: 写 migration 内容检查**

在现有套餐 migration 测试或新建 SQL 源码测试中断言 migration 只匹配 `platform_service_1y`、`platform_service_2y`、`platform_service_3y`，更新草稿版本与条款版本，不修改 `published_version_id`，不包含 `platform_service_smoke_1fen`。

- [ ] **Step 2: 验证测试按预期失败**

Run: `cd apps/api && bun test src/services/platform-service-products.test.ts`

Expected: FAIL，原因是正式条款 migration 尚不存在或内容不完整。

- [ ] **Step 3: 编写幂等 migration**

用 CTE 保存三档套餐对应的正式条款。仅当 `terms_content IS DISTINCT FROM` 目标文本时更新 `terms_content`、`terms_version + 1`、`version + 1` 和 `updated_at`；不发布草稿。

- [ ] **Step 4: 验证套餐服务测试通过**

Run: `cd apps/api && bun test src/schema/platform-service-products.test.ts src/controllers/platform-service-products/routes.test.ts src/services/platform-service-products.test.ts src/services/tenant-platform-service-orders.test.ts`

Expected: PASS，0 failures。

### Task 4: 开发数据库与静态门禁验证

**Files:**
- Verify only: `supabase/migrations/20260807160000_prepare_platform_service_product_formal_terms.sql`

- [ ] **Step 1: 对开发数据库执行 migration dry-run**

Run: `set -a && source /Users/leefo/Public/work/gooes/.env && set +a && supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"`

Expected: 待执行列表仅包含本分支新增且尚未应用的 migration，不出现破坏性 SQL。

- [ ] **Step 2: 应用 migration 到开发数据库**

Run: `set -a && source /Users/leefo/Public/work/gooes/.env && set +a && supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"`

Expected: migration 成功应用到开发数据库。

- [ ] **Step 3: 核对 migration 对齐和商品草稿**

Run: `supabase migration list` 使用同一开发数据库连接参数。

Expected: Local/Remote 对齐；三档正式商品草稿条款已更新且发布指针保持原值。

- [ ] **Step 4: 运行最终代码门禁**

Run: `pnpm --dir apps/admin check`

Run: `cd apps/admin && bun test components/platform-service-products/platform-service-products-page.test.ts components/platform-service-products/platform-service-product-action-rules.test.ts`

Run: `cd apps/api && bun test src/schema/platform-service-products.test.ts src/controllers/platform-service-products/routes.test.ts src/services/platform-service-products.test.ts src/services/tenant-platform-service-orders.test.ts`

Expected: 所有命令退出码为 0，测试 0 failures。

### Task 5: 提交与 Pull Request

**Files:**
- Verify: all changed files

- [ ] **Step 1: 检查变更边界**

Run: `git status --short && git diff --check && git diff --stat`

Expected: 只有套餐上线加固、正式条款 migration 和文档文件。

- [ ] **Step 2: 创建 Conventional Commit**

Run: `git add apps/admin/components/platform-service-products supabase/migrations docs/superpowers && git commit -m "feat(billing): 加固技术服务套餐上线交互"`

Expected: 提交成功，工作区干净。

- [ ] **Step 3: 推送并创建 Pull Request**

Run: `git push -u origin feature/platform-service-product-launch-hardening`

Expected: 远端分支存在；创建 PR 后等待 CI，不自动进行生产发布。
