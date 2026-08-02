# 微信虚拟商品生命周期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在系统配置的支付配置中补齐微信品牌权益商品的显式上传、发布、状态查询和精确校验闭环。

**Architecture:** 通过 migration 为现有虚拟商品映射增加稳定图片 URL，并保持原管理 RPC 为唯一数据库写边界；扩展现有微信网关的两个官方写接口，再用独立生命周期 service 做权限、版本、前置状态、恢复和审计编排。Admin 使用同一映射卡内的三步流程、人工确认和有界轮询，现有校验接口继续只查询微信并保存本地校验结论。

**Tech Stack:** PostgreSQL/Supabase migrations、Bun、TypeScript、Fastify decorators、Zod、Next.js 15、React 19、Tailwind、shadcn/Radix AlertDialog。

---

## 文件边界

- `supabase/migrations/20260802*_add_branding_virtual_goods_lifecycle.sql`：新增 `item_url` 并替换受影响的数据库函数。
- `apps/api/src/services/branding-virtual-goods-lifecycle-migration.test.ts`：只验证 migration 的列、约束、RPC 和权限边界。
- `apps/api/src/services/wechat-virtual-payment-gateway-contracts.ts`：定义上传/发布命令的输入输出，不包含业务编排。
- `apps/api/src/services/wechat-virtual-payment-gateway.ts`：构造官方请求、签名和调用公共安全 HTTP 边界。
- `apps/api/src/services/wechat-virtual-payment-gateway-response.ts`：严格归一化微信响应。
- `apps/api/src/services/wechat-virtual-payment-goods-command.test.ts`：网关写接口契约测试。
- `apps/api/src/services/branding-virtual-product-goods-lifecycle.ts`：本地配置、微信最新任务、动作门禁、恢复和审计的唯一编排服务。
- `apps/api/src/services/branding-virtual-product-goods-lifecycle.test.ts`：生命周期状态机测试。
- `apps/api/src/services/branding-virtual-product-wechat-validation.ts`：只读校验的完整载荷匹配与精确阶段错误码。
- `apps/api/src/services/branding-virtual-product-management.ts`、`platform-branding-virtual-payment-settings.ts`：接入图片字段及 lifecycle facade。
- `apps/api/src/schema/platform-payment-configs.ts`、`apps/api/src/controllers/platform-payment-configs/index.ts`：严格 HTTP 契约。
- `apps/admin/components/settings/platform-virtual-payment-goods-flow.tsx`：三步流程、确认框和按钮门禁。
- `apps/admin/components/settings/platform-virtual-payment-goods-flow-data.ts`：纯状态映射和轮询决策。
- `apps/admin/components/settings/platform-virtual-payment-mapping-card.tsx`：映射表单中的图片 URL 与流程插槽。
- `apps/admin/components/settings/platform-virtual-payment-settings.tsx`：加载状态、动作调用、有界轮询和快照刷新。
- `apps/admin/components/settings/platform-virtual-payment-settings-types.ts`、`platform-virtual-payment-settings-data.ts`、`platform-virtual-payment-errors.ts`：前端严格类型、payload 和安全错误白名单。

### Task 1: 数据库保存微信商品图片 URL

**Files:**
- Create: `supabase/migrations/20260802150000_add_branding_virtual_goods_lifecycle.sql`
- Create: `apps/api/src/services/branding-virtual-goods-lifecycle-migration.test.ts`
- Modify: `apps/api/src/repositories/branding-virtual-products.ts`
- Modify: `apps/api/src/services/branding-virtual-products.ts`

- [ ] **Step 1: 写失败的 migration 契约测试**

测试读取 migration 文本并断言：

```ts
expect(sql).toContain("ADD COLUMN item_url text NULL");
expect(sql).toContain("platform_virtual_payment_products_item_url_check");
expect(sql).toContain("OLD.item_url IS DISTINCT FROM NEW.item_url");
expect(sql).toContain("'item_url', mapping.item_url");
expect(sql).toContain("'provider_product_id', 'item_url', 'expected_amount_fen'");
expect(sql).toContain("REVOKE INSERT, UPDATE");
```

同时断言 migration 不包含固定业务图片 URL、token、AppKey 或 service-role 直接表写授权。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/branding-virtual-goods-lifecycle-migration.test.ts`

Expected: FAIL，因为 migration 尚不存在。

- [ ] **Step 3: 编写 migration**

新增可空 `item_url` 和约束：

```sql
ALTER TABLE public.platform_virtual_payment_products
ADD COLUMN item_url text NULL;

ALTER TABLE public.platform_virtual_payment_products
ADD CONSTRAINT platform_virtual_payment_products_item_url_check CHECK (
  item_url IS NULL OR (
    item_url = btrim(item_url)
    AND char_length(item_url) <= 2048
    AND item_url ~* '^https://[^[:space:]]+\.(png|jpe?g)(\?[^[:space:]]*)?$'
  )
);
```

在同一 migration 中完整替换 `guard_branding_virtual_product_validation_lifecycle`、`branding_get_virtual_product_management_snapshot` 和 `branding_manage_virtual_product_configuration`：把 `item_url` 加入敏感字段、快照、允许字段、必填字段、类型/格式校验以及 INSERT/UPDATE。保留 advisory lock、乐观版本、购买模式门禁、函数权限和 service-role 表写撤销。

- [ ] **Step 4: 更新 repository/service 数据类型和序列化**

在 `BrandingVirtualProductRecord`、管理 patch、序列化响应和敏感变化比较中加入：

```ts
item_url: string | null;
```

新保存请求使用非空字符串，历史快照仍允许 `null`。

- [ ] **Step 5: 运行 migration 契约和现有管理测试**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/branding-virtual-goods-lifecycle-migration.test.ts src/services/branding-virtual-product-management-migration.test.ts src/repositories/branding-virtual-product-commands.test.ts src/services/branding-virtual-products.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations apps/api/src/repositories/branding-virtual-products.ts apps/api/src/services/branding-virtual-products.ts apps/api/src/services/branding-virtual-goods-lifecycle-migration.test.ts
git commit -m "feat(payments): 保存微信虚拟商品图片"
```

### Task 2: 微信网关上传与发布命令

**Files:**
- Create: `apps/api/src/services/wechat-virtual-payment-goods-command.test.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-gateway-contracts.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-gateway-response.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-gateway.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-goods-query.test.ts`

- [ ] **Step 1: 写失败的官方请求契约测试**

覆盖生产/沙箱环境，并精确断言请求：

```ts
await gateway.startUploadGoods({
  accessToken: ACCESS_TOKEN,
  environment: "production",
  signingSecret: { environment: "production", appKey: APP_KEY },
  item: {
    id: "branding-annual",
    name: "年度品牌权益",
    price: 9900,
    remark: "年度数字权益",
    itemUrl: "https://cdn.example.test/branding.png",
  },
});
```

body 必须是 `{ upload_item: [{ id, name, price, remark, item_url }], env: 0 }`，路径为 `/xpay/start_upload_goods`；发布 body 必须是 `{ publish_item: [{ id }], env: 0 }`，路径为 `/xpay/start_publish_goods`。两者都用完整 JSON body 计算 `pay_sig`。

- [ ] **Step 2: 运行测试确认方法不存在**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/wechat-virtual-payment-goods-command.test.ts`

Expected: FAIL，`startUploadGoods`/`startPublishGoods` 尚不存在。

- [ ] **Step 3: 扩展严格网关类型**

新增：

```ts
export type StartVirtualGoodsUploadInput = QueryVirtualGoodsTaskInput & {
  item: { id: string; name: string; price: number; remark: string; itemUrl: string };
};
export type StartVirtualGoodsPublishInput = QueryVirtualGoodsTaskInput & {
  providerProductId: string;
};
export type StartVirtualGoodsTaskResult = {
  accepted: true;
  requestId: string | null;
  environment: BrandingVirtualPaymentEnvironment;
};
```

并把 `remark`、`itemUrl` 加入 `QueryVirtualGoodsUploadResult.items`，供完整载荷比较。

- [ ] **Step 4: 实现最小网关方法和输入校验**

复用 `requestJson`、`assertSuccessfulWechatResponse`、`calculateVirtualPaymentPaySig` 和现有长度常量。上传输入严格执行商品 ID 规则、名称 20 字符、备注 1024 字符、正整数价格和 HTTPS JPG/PNG URL；发布严格执行同一商品 ID 规则。响应只返回 `accepted/environment/requestId`。

- [ ] **Step 5: 运行网关测试**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/wechat-virtual-payment-goods-command.test.ts src/services/wechat-virtual-payment-goods-query.test.ts src/services/wechat-virtual-payment-gateway-hardening.test.ts`

Expected: PASS，且 JSON 序列化结果不包含 access token 或 AppKey。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/services/wechat-virtual-payment-gateway*
git add apps/api/src/services/wechat-virtual-payment-goods-*.test.ts
git commit -m "feat(payments): 接入微信虚拟商品上传发布"
```

### Task 3: 精确区分校验阶段和完整载荷

**Files:**
- Modify: `apps/api/src/services/branding-virtual-product-wechat-validation.ts`
- Modify: `apps/api/src/services/branding-virtual-product-wechat-validation.test.ts`
- Modify: `apps/api/src/services/branding-virtual-product-management.ts`
- Modify: `apps/api/src/services/branding-virtual-product-management.test.ts`

- [ ] **Step 1: 写四个失败的阶段错误测试**

分别断言：

```ts
expect(error.code).toBe("BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_TASK_MISSING");
expect(error.code).toBe("BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_TASK_PENDING");
expect(error.code).toBe("BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_TASK_MISSING");
expect(error.code).toBe("BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_TASK_PENDING");
```

再增加名称、备注和图片 URL 任一不一致时返回上传不一致的测试。

- [ ] **Step 2: 运行测试确认旧统一错误码失败**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/branding-virtual-product-wechat-validation.test.ts`

Expected: FAIL，当前返回统一 `BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING`。

- [ ] **Step 3: 实现完整校验输入和阶段错误**

把 validator 输入扩展为当前商品的 `name`、`remark`、`itemUrl`，并用单独 helper 生成四个稳定错误。`classifyWechatGoodsFailure` 将四个码都归为未确认；完整上传载荷或发布失败仍归为已确认无效。

- [ ] **Step 4: 让 management service 传入服务端拥有的字段**

`validateConfiguration` 只从数据库 product/mapping 构造期望值，不接受客户端商品字段。`item_url` 为空或本地字段不满足微信规则时，先持久化 `invalid` 并返回明确本地错误，绝不请求微信。

- [ ] **Step 5: 运行校验和管理测试**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/branding-virtual-product-wechat-validation.test.ts src/services/branding-virtual-product-management.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/services/branding-virtual-product-wechat-validation* apps/api/src/services/branding-virtual-product-management*
git commit -m "fix(payments): 精确反馈微信商品校验阶段"
```

### Task 4: 商品生命周期 service 与 HTTP 契约

**Files:**
- Create: `apps/api/src/services/branding-virtual-product-goods-lifecycle.ts`
- Create: `apps/api/src/services/branding-virtual-product-goods-lifecycle.test.ts`
- Modify: `apps/api/src/services/platform-branding-virtual-payment-settings.ts`
- Modify: `apps/api/src/services/platform-branding-virtual-payment-settings.test.ts`
- Modify: `apps/api/src/schema/platform-payment-configs.ts`
- Modify: `apps/api/src/schema/platform-payment-configs.test.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/index.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/routes.test.ts`

- [ ] **Step 1: 写失败的生命周期状态机测试**

使用 fake repository/token/gateway/audit 覆盖：

- `status=0` 映射为 `not_started` 和 `next_action=upload`。
- 上传 `status=1` 映射为 `processing`、`poll_after_ms=2000`。
- 当前完整上传成功且发布无任务映射为 `next_action=publish`。
- 当前发布成功映射为 `next_action=validate`。
- 最新商品不一致映射为 `mismatch` 和 `next_action=upload`。
- 上传已处理中/已成功不再次调用 start。
- 发布前没有完整上传成功返回 409，且不调用 start。
- 版本冲突、本地配置错误在读取 token/调用微信前失败。
- 上游 `wechatErrcode=268490012` 后重新查询并返回 `already_processing`。
- 审计元数据不包含 AppKey、access token、完整原始响应。

- [ ] **Step 2: 运行测试确认 service 不存在**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/branding-virtual-product-goods-lifecycle.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现生命周期 service**

定义稳定响应：

```ts
type GoodsPhaseState = "not_started" | "processing" | "succeeded" | "failed" | "mismatch";
type GoodsLifecycleSnapshot = {
  environment: BrandingVirtualPaymentEnvironment;
  mapping_version: number;
  upload: GoodsPhaseSummary;
  publish: GoodsPhaseSummary;
  next_action: "upload" | "wait_upload" | "publish" | "wait_publish" | "validate";
  poll_after_ms: 2000 | null;
};
```

所有公开方法首先执行平台管理权限、读取同一管理快照、映射版本和本地配置校验，然后才读取 AppKey/access token。写方法在预查询后调用 start；未知网络结果不盲目自动重试。

- [ ] **Step 4: 在 settings facade 暴露三个方法**

新增 `getGoodsStatus`、`startGoodsUpload`、`startGoodsPublish`，只负责调用 lifecycle service；保留 `validate` 的原路径和语义。

- [ ] **Step 5: 写 schema/controller 失败测试并实现路由**

新增严格版本 schema（复用校验 body 形状）和三个路由。测试断言 controller 顺序为：获取平台上下文、空 query/严格 body 校验、service、`ResponseHandler.success`；非法 environment、额外 body 字段和额外 query 在调用 service 前被拒绝。

- [ ] **Step 6: 运行 service/schema/controller 测试**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/branding-virtual-product-goods-lifecycle.test.ts src/services/platform-branding-virtual-payment-settings.test.ts src/schema/platform-payment-configs.test.ts src/controllers/platform-payment-configs/routes.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/services/branding-virtual-product-goods-lifecycle* apps/api/src/services/platform-branding-virtual-payment-settings* apps/api/src/schema/platform-payment-configs* apps/api/src/controllers/platform-payment-configs*
git commit -m "feat(payments): 提供微信商品生命周期接口"
```

### Task 5: Admin 映射图片字段与三步流程

**Files:**
- Create: `apps/admin/components/settings/platform-virtual-payment-goods-flow.tsx`
- Create: `apps/admin/components/settings/platform-virtual-payment-goods-flow-data.ts`
- Create: `apps/admin/components/settings/platform-virtual-payment-goods-flow-data.test.ts`
- Modify: `apps/admin/components/settings/platform-virtual-payment-settings-types.ts`
- Modify: `apps/admin/components/settings/platform-virtual-payment-settings-data.ts`
- Modify: `apps/admin/components/settings/platform-virtual-payment-settings-data.test.ts`
- Modify: `apps/admin/components/settings/platform-virtual-payment-errors.ts`
- Modify: `apps/admin/components/settings/platform-virtual-payment-mapping-card.tsx`
- Modify: `apps/admin/components/settings/platform-virtual-payment-settings.tsx`
- Modify: `apps/admin/components/settings/platform-virtual-payment-settings.test.ts`

- [ ] **Step 1: 写失败的纯函数和 Admin 契约测试**

纯函数测试覆盖 URL 规范化、阶段标签/色调、按钮门禁和轮询：

```ts
expect(nextPollDelay({ processing: true, attempts: 0 })).toBe(2000);
expect(nextPollDelay({ processing: true, attempts: 15 })).toBeNull();
expect(actionAvailability(snapshot)).toEqual({ upload: false, publish: true, validate: false });
```

源码契约测试断言存在两个 `AlertDialog`、`goods-status`/`goods/upload`/`goods/publish` 路径、图片 URL field、Spinner、刷新状态按钮、安全错误码和流程骨架；并断言 validate handler 不包含 upload/publish 调用。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/admin && bun test components/settings/platform-virtual-payment-goods-flow-data.test.ts components/settings/platform-virtual-payment-settings-data.test.ts components/settings/platform-virtual-payment-settings.test.ts`

Expected: FAIL，因为流程组件和字段尚不存在。

- [ ] **Step 3: 扩展严格前端类型和 payload 构造**

在 mapping/draft/patch 增加 `item_url`/`itemUrl`，保存前用 `URL` 解析并要求 HTTPS 与图片路径扩展名。新增 lifecycle snapshot/action result 类型，与 API snake_case 响应完全一致。

- [ ] **Step 4: 实现三步流程组件**

使用现有 `Badge`、`Button`、`Spinner`、`StatusAlert` 和 shadcn `AlertDialog`。三个步骤在桌面横向、窄屏纵向；只展示一个主下一步动作，并保留“刷新微信状态”次操作。生产确认文案明确生产环境且不使用危险色填满整个区域。

- [ ] **Step 5: 接入状态加载、动作和有界轮询**

进入环境或 mapping version 变化时读取状态。上传/发布确认后调用对应接口，随后立即读取状态；只有服务端返回 processing 时每 2 秒轮询，最多 15 次。组件卸载、切换环境或版本变化时取消旧 timer，并沿用 latest refresh coordinator 防止陈旧响应覆盖新环境。

- [ ] **Step 6: 更新安全错误映射和骨架**

把四个阶段校验码、本地商品字段错误、上传前置/发布前置错误加入固定中文白名单；只允许现有格式的 Request-ID。骨架增加与三步流程相同的三格/单列响应式结构。

- [ ] **Step 7: 运行 Admin 测试**

Run: `cd apps/admin && bun test components/settings/platform-virtual-payment-goods-flow-data.test.ts components/settings/platform-virtual-payment-settings-data.test.ts components/settings/platform-virtual-payment-settings.test.ts`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add apps/admin/components/settings apps/admin/app/\(console\)/settings/payment/loading.tsx
git commit -m "feat(admin): 编排微信虚拟商品发布流程"
```

### Task 6: 全量验证与开发环境 migration

**Files:**
- Modify: `docs/superpowers/plans/2026-08-02-virtual-payment-goods-lifecycle.md`（勾选步骤）
- Create: `docs/verification/branding-virtual-payment/goods-lifecycle/<timestamp>/`（仅在现有 verification 规则允许纳入版本控制时）

- [ ] **Step 1: 运行相关 API 测试**

Run: `cd apps/api && bun --env-file=/Users/leefo/Public/work/gooes/.env test src/services/branding-virtual-goods-lifecycle-migration.test.ts src/services/wechat-virtual-payment-goods-command.test.ts src/services/wechat-virtual-payment-goods-query.test.ts src/services/branding-virtual-product-wechat-validation.test.ts src/services/branding-virtual-product-goods-lifecycle.test.ts src/services/branding-virtual-product-management.test.ts src/services/platform-branding-virtual-payment-settings.test.ts src/schema/platform-payment-configs.test.ts src/controllers/platform-payment-configs/routes.test.ts`

Expected: PASS。

- [ ] **Step 2: 运行相关 Admin 测试**

Run: `cd apps/admin && bun test components/settings/platform-virtual-payment-goods-flow-data.test.ts components/settings/platform-virtual-payment-settings-data.test.ts components/settings/platform-virtual-payment-settings.test.ts`

Expected: PASS。

- [ ] **Step 3: 运行静态和构建检查**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
bun run admin:check
bun run admin:build
git diff --check origin/main...HEAD
```

Expected: 全部退出码为 0。

- [ ] **Step 4: 核对并应用唯一待执行 migration**

先运行 `supabase migration list`，确认仅本功能 migration 待应用；再按仓库现有 dev project linkage 执行 `supabase db push`。若出现额外待执行 migration，停止并先核对来源。应用后再次运行 `supabase migration list`，要求 Local/Remote 对齐。

- [ ] **Step 5: 执行开发环境只读 smoke**

使用开发环境超管会话或安全脚本验证：配置快照包含 `item_url`，两个环境的 `goods-status` 可返回 `not_started`/当前真实状态，现有 validate 的无任务错误精确区分上传或发布。不得调用 `goods/upload` 或 `goods/publish`。

- [ ] **Step 6: 检查日志和安全边界**

确认 API 日志、审计 metadata 和响应中无 AppKey/access token/原始微信 errmsg；确认普通微信支付配置和品牌权益只读商品页无回归。记录既有 RLS advisory 为独立安全事项，不在本功能中修改策略。

- [ ] **Step 7: 最终提交**

```bash
git add docs/superpowers/plans/2026-08-02-virtual-payment-goods-lifecycle.md docs/verification/branding-virtual-payment/goods-lifecycle
git commit -m "test(payments): 验证微信虚拟商品闭环"
```

只添加实际存在且允许纳入版本控制的证据文件。

### Task 7: 分支交付

**Files:**
- Inspect only: all files changed by Tasks 1-6.

- [ ] **Step 1: 检查分支差异和提交边界**

Run:

```bash
git status --short
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: 工作树干净；只包含规格、计划、migration、API/Admin 实现和验证证据。

- [ ] **Step 2: 推送功能分支**

Run: `git push -u origin feat/virtual-payment-goods-lifecycle`

Expected: 推送成功。

- [ ] **Step 3: 创建 PR 并等待 CI**

PR 标题：`feat(payments): 补齐微信虚拟商品上传发布闭环`

PR 说明必须列出：根因、三步人工确认、`item_url` migration、普通校验保持只读、没有执行真实微信写操作、验证命令、dev migration 状态和 RLS advisory 独立跟进项。

- [ ] **Step 4: 交付 Squash merge 建议**

CI 全部通过后建议使用 Squash and merge；最终 squash commit 使用：

```text
feat(payments): 补齐微信虚拟商品上传发布闭环
```
