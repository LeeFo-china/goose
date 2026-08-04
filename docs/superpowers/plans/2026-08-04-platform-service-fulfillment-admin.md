# 平台技术服务履约与 Admin 二期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use `admin-design` before Admin UI work, `test-driven-development` before code changes, and `verification-before-completion` before any commit or PR.

**Goal:** 在一期“平台年度技术服务商品、订单、普通微信支付、支付成功自动建工单”的基础上，补齐平台超管侧服务订单、实施工单、履约记录、交付附件、验收准备和退款审核能力，让平台服务费交易具备真实履约依据，并为小程序后续客户确认验收留出稳定契约。

**Architecture:** 继续使用独立的平台技术服务业务域，不复用积分充值、虚拟商品、项目验收或供应商履约表。数据库通过 migration 扩展现有 `tenant_service_orders`、`tenant_service_work_orders`、`tenant_service_refund_requests` 周边能力；服务状态流转通过 service + repository/RPC 原子处理，Admin 只消费后端返回的 `available_actions`，避免前端硬编码业务状态。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration/RPC、Next.js 15、React 19、shadcn/Radix、Tailwind CSS、`@gooes/domain`

---

## 实施范围

本计划实现第二期后端与 Admin：

- 平台超管查看服务订单列表和详情；
- 平台超管查看实施工单列表和详情；
- 工单分配、状态流转、版本冲突保护和操作留痕；
- 记录部署、服务器配置、培训、年度运维等履约记录；
- 绑定交付附件 `file_id`，不新增上传引擎；
- 准备客户验收资料，后续小程序端读取并确认；
- 平台超管审核租户提交的服务退款申请；
- Admin 页面、骨架屏、空态、错误态、按钮 loading 和操作反馈；
- 后端 dev 发布后给 Orange 输出小程序三期对接文档。

以下内容不在本计划中：

- 微信发货信息管理接口上报；
- 小程序端客户确认验收、驳回和附件上传实现；
- 微信退款 API 实际出款；
- 支付配置、虚拟商品、品牌权益商品调整；
- 旧积分充值入口改造；
- RLS advisory 修复。

上述事项需分别进入后续独立计划，避免一次 PR 同时改变支付、履约、退款和客户端行为。

## 关键业务规则

1. 平台技术服务费不是虚拟商品，不走微信虚拟支付；继续走普通微信支付商户号。
2. 履约依据必须能证明“客户专属系统环境已部署，服务器配置及首次操作培训已完成”等真实服务成果。
3. 只有 `payment_status = paid` 且自动生成工单后，才允许进入实施履约。
4. `tenant_service_orders.service_status` 与 `tenant_service_work_orders.status` 必须由后端统一流转，禁止前端直接提交任意状态覆盖。
5. 所有工单写操作必须携带 `expected_version`，避免多人操作覆盖。
6. 退款审核只处理平台审核结论，不在本期调用微信退款出款接口。
7. 附件只保存和绑定已有 `file_id`，文件上传、存储、预览沿用现有文件能力。
8. 所有列表接口必须分页，默认 `page=1&pageSize=20`，最大 `pageSize=100`。

## 状态设计

### 支付状态

沿用一期 `tenant_service_orders.payment_status`：

```text
pending
paid
refund_reviewing
refunding
partially_refunded
refunded
closed
```

本期仅会在退款审核驳回时将订单从 `refund_reviewing` 恢复到 `paid`；审核通过只记录退款申请为 `approved`，不伪造微信退款完成状态。

### 服务/工单状态

沿用一期 `tenant_service_orders.service_status` 和 `tenant_service_work_orders.status`：

```text
waiting_assignment
configuring
deploying
training
awaiting_acceptance
rectifying
accepted
active
canceled
```

允许流转：

```text
waiting_assignment -> configuring
configuring -> deploying
deploying -> training
training -> awaiting_acceptance
awaiting_acceptance -> accepted
accepted -> active
awaiting_acceptance -> rectifying
rectifying -> awaiting_acceptance
waiting_assignment/configuring/deploying/training/awaiting_acceptance/rectifying -> canceled
```

## 目标文件结构

### Domain

- Modify: `packages/domain/src/platform-service.ts` — 增加平台履约记录类型、工单动作、验收准备状态、退款审核动作常量。
- Modify: `packages/domain/src/platform-service.test.ts` — 状态流转、动作常量和“不包含支付价格常量”契约测试。
- Modify: `packages/domain/src/permission.ts` — 新增 `platform.service_refund.review`。
- Modify: `packages/domain/src/permission.test.ts` — 权限码和权限分组测试。

### Database

- Create: `supabase/migrations/20260804160000_create_platform_service_fulfillment_admin.sql`
- Create: `apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts`
- Modify after dev migration: `apps/api/src/types/database.ts` — 由 Supabase CLI 生成，禁止手工改写。

Migration 建议新增：

- `tenant_service_work_order_events`
  - 工单状态和关键操作事件；
  - 字段：`id`、`tenant_id`、`service_order_id`、`work_order_id`、`action`、`from_status`、`to_status`、`remark`、`operator_employee_id`、`metadata`、`created_at`。
- `tenant_service_fulfillment_records`
  - 履约记录；
  - 字段：`id`、`tenant_id`、`service_order_id`、`work_order_id`、`record_type`、`title`、`content`、`occurred_at`、`created_by_employee_id`、`created_at`、`updated_at`。
- `tenant_service_fulfillment_attachments`
  - 履约附件绑定；
  - 字段：`id`、`tenant_id`、`service_order_id`、`work_order_id`、`fulfillment_record_id`、`file_id`、`file_name`、`mime_type`、`size_bytes`、`created_by_employee_id`、`created_at`。
- `tenant_service_acceptance_preparations`
  - 验收准备资料；
  - 字段：`id`、`tenant_id`、`service_order_id`、`work_order_id`、`status`、`summary`、`prepared_by_employee_id`、`prepared_at`、`submitted_at`、`created_at`、`updated_at`。

Migration 必须包含：

- 外键与 `(id, tenant_id)` 复合关联，避免跨租户绑定；
- RLS enable 和平台 service role/员工读策略；
- 状态和文本长度 check；
- `tenant_id + created_at`、`status + updated_at`、`work_order_id + created_at` 索引；
- 状态流转 RPC 或原子更新函数；
- rollback 注释。

### API schema

- Create: `apps/api/src/schema/platform-service-fulfillment.ts`
- Create: `apps/api/src/schema/platform-service-fulfillment.test.ts`

Schema 覆盖：

- 订单列表查询；
- 工单列表查询；
- 工单分配；
- 工单状态流转；
- 履约记录创建；
- 验收准备保存/提交；
- 退款审核；
- 所有列表分页和 `pageSize <= 100`；
- `expected_version` 必填；
- 文本长度、附件数量、附件 `file_id` 格式校验。

### Repository

- Modify: `apps/api/src/repositories/platform-service-order-records.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.ts`
- Create: `apps/api/src/repositories/platform-service-fulfillment.test.ts`

Repository 需新增方法：

- `listPlatformServiceOrders(input)`；
- `getPlatformServiceOrderDetail(id)`；
- `listPlatformServiceWorkOrders(input)`；
- `getPlatformServiceWorkOrderDetail(id)`；
- `assignServiceWorkOrder(input)`；
- `transitionServiceWorkOrder(input)`；
- `createFulfillmentRecord(input)`；
- `upsertAcceptancePreparation(input)`；
- `listRefundRequests(input)`；
- `reviewRefundRequest(input)`。

性能要求：

- 列表必须 `.select(必要字段, { count: "exact" })` + `.range(from, to)`；
- 详情可以查询关联记录，但禁止 N+1；
- 搜索字段必须限定 `order_no`、租户名称、商品标题等有限字段；
- 新增排序/过滤必须有 migration 索引支撑。

### Service

- Create: `apps/api/src/services/platform-service-admin-orders.ts`
- Create: `apps/api/src/services/platform-service-admin-orders.test.ts`
- Create: `apps/api/src/services/platform-service-work-orders.ts`
- Create: `apps/api/src/services/platform-service-work-orders.test.ts`
- Create: `apps/api/src/services/platform-service-fulfillment-records.ts`
- Create: `apps/api/src/services/platform-service-fulfillment-records.test.ts`
- Create: `apps/api/src/services/platform-service-refund-reviews.ts`
- Create: `apps/api/src/services/platform-service-refund-reviews.test.ts`
- Modify: `apps/api/src/services/platform-service-order-views.ts`
- Modify: `apps/api/src/services/platform-service-order-views.test.ts`

Service 规则：

- 平台订单读取权限：`platform.service_order.read`；
- 工单管理权限：`platform.service_work_order.manage`；
- 退款审核权限：`platform.service_refund.review`；
- 平台超管身份必须通过现有 session/permission 工具判断，不在 controller 写散落判断；
- 状态机由 service 明确定义，不接受任意目标状态；
- 失败通过 `Errors.*` 和稳定错误码返回；
- 视图层返回 `available_actions`，Admin 只按此渲染按钮。

### Controller and routes

- Create: `apps/api/src/controllers/platform-service-orders/index.ts`
- Create: `apps/api/src/controllers/platform-service-orders/routes.test.ts`
- Create: `apps/api/src/controllers/platform-service-work-orders/index.ts`
- Create: `apps/api/src/controllers/platform-service-work-orders/routes.test.ts`
- Create: `apps/api/src/controllers/platform-service-refund-requests/index.ts`
- Create: `apps/api/src/controllers/platform-service-refund-requests/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/errors/error-codes.test.ts`

Routes：

```text
GET  /platform/billing/service-orders
GET  /platform/billing/service-orders/:id
GET  /platform/billing/service-work-orders
GET  /platform/billing/service-work-orders/:id
POST /platform/billing/service-work-orders/:id/assign
POST /platform/billing/service-work-orders/:id/status-transitions
POST /platform/billing/service-work-orders/:id/fulfillment-records
POST /platform/billing/service-work-orders/:id/acceptance-preparation
GET  /platform/billing/service-refund-requests
POST /platform/billing/service-refund-requests/:id/review
```

错误码建议：

```text
SERVICE_WORK_ORDER_NOT_FOUND
SERVICE_WORK_ORDER_VERSION_CONFLICT
SERVICE_WORK_ORDER_INVALID_STATE
SERVICE_WORK_ORDER_ASSIGNEE_INVALID
SERVICE_FULFILLMENT_RECORD_INVALID
SERVICE_ACCEPTANCE_PREPARATION_INVALID
SERVICE_REFUND_REQUEST_NOT_FOUND
SERVICE_REFUND_REVIEW_INVALID_STATE
SERVICE_REFUND_REVIEW_FORBIDDEN
```

### Admin UI

- Create: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Create: `apps/admin/app/(console)/platform/service-orders/loading.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-order-types.ts`
- Create: `apps/admin/components/platform-service-orders/platform-service-order-data.ts`
- Create: `apps/admin/components/platform-service-orders/platform-service-order-table.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-order-detail.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-work-order-table.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-work-order-detail.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-work-order-actions.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-fulfillment-record-form.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-refund-review-dialog.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/roles/role-permission-display.ts`

UI 信息架构：

- 新增菜单：`平台运营 -> 平台技术服务`；
- 页面顶部使用现有 `PlatformListPageShell`；
- Tabs：
  - `服务订单`
  - `实施工单`
  - `退款审核`
- 详情使用右侧详情 Dialog/Sheet 模式，避免跳页造成操作割裂；
- 每个写操作按钮必须有稳定 loading、不改变 card 高度的 inline pending 状态和成功/失败提示；
- 骨架屏必须与最终页面结构一致，不多出无意义标题行。

Admin 行为：

- 服务订单列表：按订单号、租户、支付状态、服务状态、时间筛选；
- 服务订单详情：展示商品快照、金额、支付状态、服务状态、微信交易号、关联工单；
- 工单列表：按状态、负责人、租户、订单号筛选；
- 工单详情：展示状态流、履约记录、附件、验收准备；
- 工单操作：分配负责人、推进状态、退回整改、取消；
- 履约记录：新增部署、服务器配置、培训、年度运维等记录；
- 退款审核：查看租户申请原因，审核通过/驳回并填写备注。

## Task 0: 隔离环境与基线

**Files:** none

- [ ] **Step 1: 确认 worktree**

Run:

```bash
git status --short --branch
git rev-parse --short HEAD
```

Expected：在 `feature/platform-service-fulfillment-admin`，工作区干净，基线为已合并的一期主分支。

- [ ] **Step 2: 运行一期最小基线**

Run:

```bash
bun test packages/domain/src/platform-service.test.ts packages/domain/src/permission.test.ts
```

Expected：PASS。

## Task 1: 写 migration 契约测试

**Files:**

- Create: `apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts`

- [ ] **Step 1: 写失败测试**

断言 migration 包含：

- 四张新增表；
- 所有新增表 `ENABLE ROW LEVEL SECURITY`；
- 工单事件、履约记录、验收准备索引；
- `expected_version` 或等价版本冲突保护；
- `tenant_service_orders.service_status` 和 `tenant_service_work_orders.status` 同步更新；
- 不包含 `DROP TABLE tenant_service_orders`；
- 不改动积分充值、虚拟商品、项目验收相关表。

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
bun test apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts
```

Expected：FAIL，原因是 migration 尚不存在。

## Task 2: 实现 migration

**Files:**

- Create: `supabase/migrations/20260804160000_create_platform_service_fulfillment_admin.sql`

- [ ] **Step 1: 新增履约表**

创建：

- `tenant_service_work_order_events`
- `tenant_service_fulfillment_records`
- `tenant_service_fulfillment_attachments`
- `tenant_service_acceptance_preparations`

Expected：所有表具备 tenant 复合外键、RLS、updated_at trigger、文本长度 check 和必要索引。

- [ ] **Step 2: 新增原子函数**

实现：

- `platform_service_assign_work_order`
- `platform_service_transition_work_order`
- `platform_service_review_refund_request`

Expected：

- 使用 `FOR UPDATE` 锁定目标记录；
- 校验 `expected_version`；
- 记录事件；
- 同步订单 `service_status`；
- 审核驳回退款时恢复订单 `payment_status = paid`；
- 审核通过退款申请时不伪造微信退款成功。

- [ ] **Step 3: 运行 migration 契约测试**

Run:

```bash
bun test apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts
```

Expected：PASS。

## Task 3: 扩展 Domain 权限与共享常量

**Files:**

- Modify: `packages/domain/src/platform-service.ts`
- Modify: `packages/domain/src/platform-service.test.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: 先写失败测试**

断言：

- 工单状态允许流转表存在；
- 履约记录类型包含 `environment_setup`、`server_configuration`、`onsite_training`、`remote_training`、`annual_operation`；
- 验收准备状态包含 `draft`、`submitted`、`accepted`、`rejected`、`cancelled`；
- 权限包含 `platform.service_refund.review`；
- 不导出固定套餐价格常量。

- [ ] **Step 2: 实现常量和权限**

Expected：Domain 只放共享枚举/类型，不写死 9800 或折扣。

- [ ] **Step 3: 运行测试**

Run:

```bash
bun test packages/domain/src/platform-service.test.ts packages/domain/src/permission.test.ts
```

Expected：PASS。

## Task 4: 后端 schema、repository 和 service

**Files:**

- Create: `apps/api/src/schema/platform-service-fulfillment.ts`
- Create: `apps/api/src/schema/platform-service-fulfillment.test.ts`
- Modify: `apps/api/src/repositories/platform-service-order-records.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.ts`
- Create: `apps/api/src/repositories/platform-service-fulfillment.test.ts`
- Create: `apps/api/src/services/platform-service-admin-orders.ts`
- Create: `apps/api/src/services/platform-service-admin-orders.test.ts`
- Create: `apps/api/src/services/platform-service-work-orders.ts`
- Create: `apps/api/src/services/platform-service-work-orders.test.ts`
- Create: `apps/api/src/services/platform-service-fulfillment-records.ts`
- Create: `apps/api/src/services/platform-service-fulfillment-records.test.ts`
- Create: `apps/api/src/services/platform-service-refund-reviews.ts`
- Create: `apps/api/src/services/platform-service-refund-reviews.test.ts`
- Modify: `apps/api/src/services/platform-service-order-views.ts`
- Modify: `apps/api/src/services/platform-service-order-views.test.ts`

- [ ] **Step 1: 写 schema 测试**

覆盖分页、过滤、`expected_version`、附件数量、备注长度、非法状态流转 payload。

- [ ] **Step 2: 实现 schema**

Expected：严格 Zod schema，列表最大 `pageSize=100`。

- [ ] **Step 3: 写 repository 测试**

使用 mock Supabase client 断言：

- 列表使用 `.range()`；
- 查询限定必要字段；
- 搜索不会触发 N+1；
- RPC 参数包含 `expected_version`、operator、remark；
- 错误码正确映射。

- [ ] **Step 4: 实现 repository**

Expected：复用现有 `platform-service-orders` repository 风格，不新增基础架构。

- [ ] **Step 5: 写 service 测试**

覆盖：

- 权限缺失；
- 非平台账号拒绝；
- 工单分配；
- 合法/非法状态流转；
- 履约记录创建；
- 验收准备保存；
- 退款审核通过/驳回；
- 版本冲突；
- `available_actions` 派生。

- [ ] **Step 6: 实现 service**

Expected：controller 之外完成业务校验，错误通过 `Errors.*` 包装。

- [ ] **Step 7: 运行后端单元测试**

Run:

```bash
bun test apps/api/src/schema/platform-service-fulfillment.test.ts \
  apps/api/src/repositories/platform-service-fulfillment.test.ts \
  apps/api/src/services/platform-service-admin-orders.test.ts \
  apps/api/src/services/platform-service-work-orders.test.ts \
  apps/api/src/services/platform-service-fulfillment-records.test.ts \
  apps/api/src/services/platform-service-refund-reviews.test.ts \
  apps/api/src/services/platform-service-order-views.test.ts
```

Expected：PASS。

## Task 5: 后端 controller 和 route 注册

**Files:**

- Create: `apps/api/src/controllers/platform-service-orders/index.ts`
- Create: `apps/api/src/controllers/platform-service-orders/routes.test.ts`
- Create: `apps/api/src/controllers/platform-service-work-orders/index.ts`
- Create: `apps/api/src/controllers/platform-service-work-orders/routes.test.ts`
- Create: `apps/api/src/controllers/platform-service-refund-requests/index.ts`
- Create: `apps/api/src/controllers/platform-service-refund-requests/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/errors/error-codes.test.ts`

- [ ] **Step 1: 写 route 契约测试**

断言所有二期路由存在，且 controller 只调用 schema + service + `ResponseHandler.success`。

- [ ] **Step 2: 实现 controller**

Expected：

- controller 不直接访问 Supabase；
- controller 不写业务状态机；
- 错误由统一 error handler 处理；
- 参数校验全部走 schema。

- [ ] **Step 3: 运行 route 与错误码测试**

Run:

```bash
bun test apps/api/src/controllers/platform-service-orders/routes.test.ts \
  apps/api/src/controllers/platform-service-work-orders/routes.test.ts \
  apps/api/src/controllers/platform-service-refund-requests/routes.test.ts \
  apps/api/src/errors/error-codes.test.ts
```

Expected：PASS。

## Task 6: Admin 数据契约和页面框架

**Files:**

- Create: `apps/admin/components/platform-service-orders/platform-service-order-types.ts`
- Create: `apps/admin/components/platform-service-orders/platform-service-order-data.ts`
- Create: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`
- Create: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Create: `apps/admin/app/(console)/platform/service-orders/loading.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/roles/role-permission-display.ts`

- [ ] **Step 1: 写 Admin 源码契约测试**

断言：

- 菜单包含 `/platform/service-orders` 和 `平台技术服务`；
- 页面使用 `PlatformListPageShell`；
- 页面使用 `platform.service_order.read`；
- 页面请求 `/platform/billing/service-orders?page=...`；
- 骨架屏包含三组 tab 和表格骨架；
- 不把服务页放进支付配置。

- [ ] **Step 2: 实现页面框架**

Expected：

- 顶部标题：`平台技术服务`；
- 描述：管理年度技术服务订单、实施进度、履约记录和售后审核；
- Tabs：服务订单、实施工单、退款审核；
- 首屏数据服务端获取；
- 错误态可见；
- 空态不出现多余标题文案。

- [ ] **Step 3: 运行 Admin 契约测试**

Run:

```bash
bun test apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
```

Expected：PASS。

## Task 7: Admin 服务订单列表和详情

**Files:**

- Create: `apps/admin/components/platform-service-orders/platform-service-order-table.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-order-detail.tsx`
- Modify: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Modify: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`

- [ ] **Step 1: 写测试**

断言服务订单列表包含：

- 订单号；
- 租户；
- 商品；
- 金额；
- 支付状态；
- 服务状态；
- 支付时间；
- 查看详情。

详情包含：

- 商品快照；
- 微信交易号；
- 支付金额；
- 关联实施工单；
- 状态时间线。

- [ ] **Step 2: 实现列表和详情**

Expected：复用 shadcn Table、Badge、Dialog/Sheet；金额以元展示，后端字段仍用分。

- [ ] **Step 3: 运行测试**

Run:

```bash
bun test apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
```

Expected：PASS。

## Task 8: Admin 实施工单操作

**Files:**

- Create: `apps/admin/components/platform-service-orders/platform-service-work-order-table.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-work-order-detail.tsx`
- Create: `apps/admin/components/platform-service-orders/platform-service-work-order-actions.tsx`
- Modify: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Modify: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`

- [ ] **Step 1: 写测试**

断言：

- 工单 tab 请求 `/platform/billing/service-work-orders?page=...`；
- 操作请求经过 `/api/backend/platform/billing/service-work-orders/${id}/assign`；
- 状态流转请求经过 `/api/backend/platform/billing/service-work-orders/${id}/status-transitions`；
- payload 包含 `expected_version`；
- 按钮 loading 不插入改变 card 高度的大块 spinner。

- [ ] **Step 2: 实现工单列表、详情和操作**

Expected：

- 分配负责人；
- 推进下一状态；
- 退回整改；
- 取消工单；
- 操作成功后刷新；
- 失败展示后端错误 message 和 request id。

- [ ] **Step 3: 运行测试**

Run:

```bash
bun test apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
```

Expected：PASS。

## Task 9: Admin 履约记录、附件和验收准备

**Files:**

- Create: `apps/admin/components/platform-service-orders/platform-service-fulfillment-record-form.tsx`
- Modify: `apps/admin/components/platform-service-orders/platform-service-work-order-detail.tsx`
- Modify: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`

- [ ] **Step 1: 写测试**

断言：

- 履约类型包含部署、服务器配置、上门培训、远程培训、年度运维；
- 创建履约记录请求包含 `record_type`、`title`、`content`、`occurred_at`、`file_ids`；
- 验收准备请求经过 `/acceptance-preparation`；
- 不在本期出现小程序客户确认按钮。

- [ ] **Step 2: 实现履约记录表单**

Expected：

- 简洁表单，不超过三段；
- 文件使用已有上传组件或已有 `file_id` 选择/绑定能力；
- 上传能力不足时先允许填写已上传文件 ID，并在文档记录后续体验改造，不自行新增上传基础设施。

- [ ] **Step 3: 实现验收准备**

Expected：

- 可保存验收摘要；
- 可绑定附件；
- 可提交为 `submitted`；
- 给小程序三期读取留出契约。

- [ ] **Step 4: 运行测试**

Run:

```bash
bun test apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
```

Expected：PASS。

## Task 10: Admin 退款审核

**Files:**

- Create: `apps/admin/components/platform-service-orders/platform-service-refund-review-dialog.tsx`
- Modify: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Modify: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`

- [ ] **Step 1: 写测试**

断言：

- 退款 tab 请求 `/platform/billing/service-refund-requests?page=...`；
- 审核请求经过 `/api/backend/platform/billing/service-refund-requests/${id}/review`；
- payload 包含 `decision`、`review_remark`、`expected_version`；
- 审核通过文案明确“仅记录审核通过，微信退款出款后续处理”；
- 审核驳回后订单可恢复已支付状态。

- [ ] **Step 2: 实现退款审核 UI**

Expected：审核弹窗显示申请原因、订单号、租户、金额、当前状态和备注输入。

- [ ] **Step 3: 运行测试**

Run:

```bash
bun test apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
```

Expected：PASS。

## Task 11: 小程序对接文档

**Files:**

- Create: `docs/miniprogram/2026-08-04-platform-service-fulfillment-admin-handoff.md`

- [ ] **Step 1: 编写三期前端 handoff**

内容必须包含：

- 本期后端/Admin 已完成能力；
- 小程序暂不需要修改的边界；
- 后续 Orange 需要的接口方向；
- 客户验收读取、确认、驳回；
- 附件预览；
- 错误码和脱敏回传格式；
- 真机 smoke 验收清单。

- [ ] **Step 2: 核对不修改 orange**

Run:

```bash
git status --short
```

Expected：没有 `/Users/leefo/Public/work/orange` 变更。

## Task 12: 验证与提交

- [ ] **Step 1: 运行最小后端验证**

Run:

```bash
bun test packages/domain/src/platform-service.test.ts packages/domain/src/permission.test.ts \
  apps/api/src/services/platform-service-fulfillment-migration-contract.test.ts \
  apps/api/src/schema/platform-service-fulfillment.test.ts \
  apps/api/src/repositories/platform-service-fulfillment.test.ts \
  apps/api/src/services/platform-service-admin-orders.test.ts \
  apps/api/src/services/platform-service-work-orders.test.ts \
  apps/api/src/services/platform-service-fulfillment-records.test.ts \
  apps/api/src/services/platform-service-refund-reviews.test.ts \
  apps/api/src/controllers/platform-service-orders/routes.test.ts \
  apps/api/src/controllers/platform-service-work-orders/routes.test.ts \
  apps/api/src/controllers/platform-service-refund-requests/routes.test.ts
```

Expected：PASS。

- [ ] **Step 2: 运行 Admin 验证**

Run:

```bash
bun test apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts
pnpm --dir apps/admin check
```

Expected：PASS。

- [ ] **Step 3: 类型检查**

Run:

```bash
bun run api:typecheck
```

Expected：PASS。

- [ ] **Step 4: migration 验证**

在用户确认使用开发数据库后执行：

```bash
supabase migration list
supabase db push
supabase migration list
```

Expected：Local/Remote migration 对齐。

如需从空库验证 migration 顺序，只使用本机 Colima/Supabase local stack，不对远端 dev 执行 reset。

- [ ] **Step 5: API smoke**

dev 发布后使用平台超管 token 测：

```bash
GET  /platform/billing/service-orders?page=1&pageSize=20
GET  /platform/billing/service-work-orders?page=1&pageSize=20
GET  /platform/billing/service-refund-requests?page=1&pageSize=20
```

对已支付测试订单继续测：

```bash
GET  /platform/billing/service-orders/:id
GET  /platform/billing/service-work-orders/:id
POST /platform/billing/service-work-orders/:id/assign
POST /platform/billing/service-work-orders/:id/status-transitions
POST /platform/billing/service-work-orders/:id/fulfillment-records
POST /platform/billing/service-work-orders/:id/acceptance-preparation
```

Expected：全部返回 2xx 或符合状态机的稳定业务错误码。

- [ ] **Step 6: 提交**

Commit message:

```bash
git commit -m "feat(platform): add service fulfillment admin workflow"
```

## 风险与回滚

- 数据表新增为 additive migration，回滚时先禁用 Admin 菜单和路由，再撤销新增表/RPC；
- 微信退款实际出款不在本期，审核通过不能在文案上暗示“已退款到账”；
- 客户验收确认不在本期，小程序未接入前 `submitted` 仅代表平台已准备验收资料；
- 文件上传体验若现有组件不足，不在本期新增上传系统，避免扩大范围；
- RLS advisory 单独修复，不混入本 PR。

