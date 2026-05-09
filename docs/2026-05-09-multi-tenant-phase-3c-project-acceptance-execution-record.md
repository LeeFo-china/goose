# 多租户阶段 3C 执行记录：工序验收

日期：2026-05-09

## 范围

本阶段处理项目工序验收的租户隔离，覆盖员工端验收单、验收项、操作记录、客户确认、短信 open ticket 和今日工作筛选中的验收数据。

## 已完成

### 数据库

- 新增 migration：`20260509163000_tenant_scope_project_acceptances.sql`。
- 给以下表增加并回填 `tenant_id`：
  - `project_acceptances`
  - `project_acceptance_items`
  - `project_acceptance_actions`
  - `project_acceptance_open_tickets`
- `project_acceptances.tenant_id` 从所属项目 `projects.tenant_id` 继承，缺失时回退默认租户。
- 验收项、操作记录、短信 ticket 从验收单继承租户。
- 增加验收单、验收项、操作记录、短信 ticket 的租户复合索引。

### 后端

- 发起验收时按当前租户读取项目，并写入项目租户。
- 验收项创建时写入验收单租户。
- 操作记录创建时写入验收单租户。
- 验收列表按当前租户和可见项目过滤。
- 员工端详情、更新、提交、领导通过、领导驳回、删除草稿、作废都按当前租户读取和更新。
- 复核人必须属于当前租户。
- 客户侧项目验收列表按客户租户和项目租户过滤。
- 客户确认 / 提出疑问必须满足客户和验收单同租户。
- 短信 open ticket 创建、复用、更新、最近通知读取都带 `tenant_id`。
- open ticket 校验时，验收单按 ticket 租户读取。
- 今日工作筛选中的验收相关查询补充 `tenant_id` 过滤。

## 模板说明

- `project_acceptance_templates` 和 `project_acceptance_template_items` 仍保持平台级标准模板。
- 租户业务数据只落在 `project_acceptances`、`project_acceptance_items`、`project_acceptance_actions`、`project_acceptance_open_tickets`。

## 验证

- `bun run api:build` 通过。
- `bun run api:typecheck` 通过。

## 暂未处理

- 任务中心新增“工序验收待办”聚合未在本阶段新增；后续可基于本阶段 `tenant_id` 字段接入。
- 验收模板编辑仍为平台级能力，未做租户自定义模板。
