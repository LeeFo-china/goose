# 多租户阶段 5E 执行记录：平台线索 Admin 页面

日期：2026-05-10

## 目标

给平台超管补齐平台线索管理页面，使运营人员能查看平台访客装修需求，并把线索手动分配给目标租户。

## 已完成

- 新增 admin 路由：`/platform/leads`。
- 新增侧边栏入口：平台线索，仅 `platform_admin` 可见。
- 新增平台线索列表：
  - 展示客户姓名、手机号、城市、小区、面积、预算、来源、状态和提交时间。
  - 支持按 `new`、`assigned`、`invalid` 筛选。
  - 支持关键词搜索。
  - 支持分页。
- 新增线索详情弹窗：
  - 展示装修需求详情。
  - 展示已分配租户、关联客户、分配人、分配时间和备注。
  - 展示分配日志。
  - 展示去重结果：新客户、老客户新线索、已分配。
- 新增手动分配交互：
  - 支持搜索正常状态租户。
  - 分配时填写目标租户和分配备注。
  - 调用 `POST /platform/leads/:id/assign`。

## 文件变更

- `apps/admin/app/(console)/platform/leads/page.tsx`
- `apps/admin/app/(console)/platform/leads/loading.tsx`
- `apps/admin/components/platform-leads/platform-lead-types.ts`
- `apps/admin/components/platform-leads/platform-lead-list-actions.tsx`
- `apps/admin/components/platform-leads/platform-leads-table.tsx`
- `apps/admin/components/platform-leads/platform-lead-mutations.tsx`
- `apps/admin/components/layout/admin-nav.tsx`
- `docs/2026-05-09-multi-tenant-phase-5-platform-admin-todolist.md`
- `docs/application_integration_documentation/2026-05-10-phase-5e-admin-platform-leads-page.md`
- `docs/application_integration_documentation/2026-05-10-phase-5e-miniprogram-impact-note.md`

## 设计说明

平台线索分配仍以后端为准。前端只负责选择目标租户并提交请求，客户去重、客户创建、客户来源时间线、审计日志、通知均由后端接口统一处理。

分配后的“是否命中已有客户”不依赖前端推断，主要读取详情接口中的 `assign_logs[].dedupe_result`。

## 验收项

- 平台超管能在侧边栏看到“平台线索”。
- 非平台超管不能看到侧边栏入口，直接访问页面会提示无权限。
- `/platform/leads` 能按状态和关键词拉取数据。
- 待分配线索能打开详情并选择目标租户。
- 分配成功后页面刷新，详情显示已分配信息和分配日志。

## 不包含

- 不新增平台访客提交页面。
- 不新增平台线索作废操作。
- 不做复杂线索转化报表。
- 不改变小程序端逻辑。
