# 客服能力分阶段执行计划

日期：2026-05-24

## 目标

按阶段落地租户客服能力：

- 客户可以提交问题和上传图片。
- 客户可以直接拨打租户客服电话。
- Admin 可以查看和处理客户问题。
- 微信小程序按接口对接客户侧体验。

## 总体原则

- 客服问题独立建模，不混入客户销售状态和项目交付状态。
- 图片上传复用现有 `POST /uploads/images`。
- 所有接口必须按 `tenant_id` 隔离。
- 客户端只能访问自己的客服问题。
- Admin 操作必须经过权限校验和状态动作校验。
- 每个阶段同步更新 Admin 和微信小程序对接文档。

## 阶段 0：方案和对接文档

状态：已完成。

交付物：

- 总方案：`docs/customer_service/2026-05-24-customer-service-plan.md`
- 执行计划：本文档
- Admin 对接文档：`docs/customer_service/admin/2026-05-24-customer-service-admin-integration.md`
- 微信小程序对接文档：`docs/customer_service/wechat/2026-05-24-customer-service-wechat-integration.md`

验收标准：

- 明确第一版范围。
- 明确数据模型、接口、状态动作、上传场景和权限。
- Admin 和微信小程序都能按文档启动对接评审。

## 阶段 1：domain、数据库和后端最小闭环

状态：已完成第一版。

交付物：

- `@gooes/domain` 增加客服问题分类、状态、动作常量。
- Supabase migration 新增：
  - `customer_service_tickets`
  - `customer_service_ticket_actions`
- API 新增：
  - 客户端创建客服问题
  - 客户端查看自己的客服问题列表/详情
  - Admin 查看客服问题列表/详情
  - Admin 执行动作：分配、开始处理、解决、关闭、取消、重开
- 上传接口新增 `customer_service` 场景。
- 系统设置新增：
  - `CUSTOMER_SERVICE_ENABLED`
  - `CUSTOMER_SERVICE_PHONE`
  - `CUSTOMER_SERVICE_WORKING_HOURS`
  - `CUSTOMER_SERVICE_NOTICE`

已落地文件：

- `packages/domain/src/customer-service.ts`
- `supabase/migrations/20260524162000_create_customer_service_tickets.sql`
- `apps/api/src/schema/customer-service.ts`
- `apps/api/src/repositories/customer-service-tickets.ts`
- `apps/api/src/services/customer-service-tickets.ts`
- `apps/api/src/controllers/customer-service/index.ts`
- `apps/api/src/controllers/customer-self-service/index.ts`
- `apps/api/src/controllers/uploads/index.ts`
- `apps/api/src/services/files/platform-file-storage.ts`
- `apps/api/src/services/files/file-url-resolver.ts`
- `apps/api/src/services/system-settings.ts`

验收标准：

- 租户未启用客服时，客户不能创建客服问题。
- 客户创建问题必须绑定当前客户身份。
- `project_id` 如果传入，必须属于当前客户和租户。
- Admin 只能处理同租户客服问题。
- 每次状态动作写入 `customer_service_ticket_actions`。
- API 类型检查通过；构建在阶段提交前验证。

## 阶段 2：微信小程序客户侧对接

状态：待执行。

交付物：

- 客服入口卡片。
- 电话拨打按钮。
- 提交问题页面。
- 图片上传。
- 我的问题列表。
- 问题详情。

验收标准：

- bootstrap 能拿到客服配置。
- `enabled=false` 时不展示入口。
- 有电话时调用 `wx.makePhoneCall`。
- 图片最多 9 张，上传后提交 object key。
- 提交成功后进入问题详情或历史列表。
- 后端中文错误直接展示。

## 阶段 3：Admin 对接

状态：待执行。

交付物：

- 客服问题列表页。
- 筛选：状态、分类、负责人、关键词。
- 详情抽屉。
- 图片预览。
- 分配客服。
- 状态动作：开始处理、解决、关闭、取消、重开。
- 客服配置入口复用系统设置页。

验收标准：

- 列表首屏可用，默认按创建时间倒序。
- 详情展示客户、项目、描述、图片、动作历史。
- 动作按钮只展示当前可执行动作。
- 处理结果必填。
- 操作后刷新列表和详情。

## 阶段 4：任务中心和通知增强

状态：待执行。

交付物：

- 任务中心展示待处理客服问题数量。
- 可选：客服问题分配通知。
- 可选：处理完成后通知客户。
- 可选：统计处理时长。

验收标准：

- 客服主管能看到待处理数量。
- 被分配客服能看到自己的待处理问题。
- 不影响现有客户、项目、验收状态机。

## 阶段 5：回归和发布

状态：待执行。

验收清单：

- 多租户隔离。
- 客户身份隔离。
- 图片上传和预览。
- 电话配置为空/禁用场景。
- Admin 权限。
- 状态动作合法性。
- 历史动作日志。
- API build/typecheck。
- Admin build/typecheck。

## 第一批建议执行顺序

1. 阶段 1 后端最小闭环。
2. 阶段 3 Admin 列表和处理闭环。
3. 阶段 2 微信小程序客户提交闭环。
4. 阶段 4 任务中心和通知。

原因：

- 先有后端契约，Admin 和小程序都能并行对接。
- Admin 先完成可处理闭环，避免客户提交后无人承接。
- 小程序由独立团队负责时，可直接按文档并行开发。
