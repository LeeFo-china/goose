# 多租户阶段 3A 执行记录：费用审批与任务中心

日期：2026-05-09

## 范围

本阶段只处理费用审批和任务中心的租户隔离，不处理施工日志、工序验收、摄像头、自媒体脚本和系统配置。

## 已完成

### 数据库

- 新增 migration：`20260509153000_tenant_scope_expense_task_center.sql`。
- 给以下表增加并回填 `tenant_id`：
  - `expense_requests`
  - `expense_request_items`
  - `expense_request_approvals`
  - `expense_request_approval_chains`
  - `expense_request_settlements`
  - `expense_request_categories`
- `expense_requests.tenant_id` 优先从申请员工继承，缺失时从项目继承，最后回退默认租户。
- 费用明细、审批记录、审批链、打款记录从费用申请继承租户。
- 费用分类从默认租户回填。
- 费用分类全局唯一索引调整为租户内唯一：
  - `expense_request_categories(tenant_id, code)`
  - `expense_request_categories(tenant_id, name)`
- 增加费用列表、状态、员工、项目、待处理人、审批链、打款、分类查询的租户复合索引。

### 后端

- 费用分类：
  - 列表、详情、创建、更新、启停全部按当前 `AuthContext.tenantId` 过滤。
  - 分类编码和名称改为租户内唯一。
  - 创建分类时写入当前租户。
  - 费用明细按 `category_code` 解析分类时只查当前租户。
- 费用申请：
  - 创建时写入当前租户。
  - 申请员工、关联项目、审批候选人全部限制在当前租户。
  - 列表、详情、更新、提交、审批、驳回、撤回、打款全部按当前租户读取和更新。
  - 费用明细、审批记录、审批链、打款记录写入当前租户。
  - 审批链替换、审批节点更新、打款重复检测均带租户边界。
- 任务中心：
  - 客户跟进待办先按当前租户筛选客户，再聚合跟进。
  - 项目日志待办先按当前租户筛选在建项目，再聚合今日日志。
  - 费用审批待办直接按当前租户筛选费用申请。

## 验证

- `bun run api:build` 通过。
- `bun run api:typecheck` 通过。

## 暂未处理

- 费用统计按租户统计仍在阶段 3 后续任务中处理。
- 工序验收、摄像头、自媒体脚本待办仍未纳入阶段 3A。
- 本阶段没有修改 admin 或微信小程序页面，只改变后端数据边界和返回范围。
