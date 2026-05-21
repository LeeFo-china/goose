# 状态机整改执行台账

创建日期：2026-05-21

## 目标

把客户业务状态和工程项目施工状态从“枚举字段可更新”升级为“动作驱动、规则校验、日志可审计、可渐进收口”的领域状态机。

本次整改不先引入通用工作流引擎，不改掉现有 `customers.status` / `projects.status` 字段。第一阶段以 service 层规则和日志表收口写入口，确保现有列表、详情、筛选、小程序和 Admin 查询链路稳定。

## 文档索引

- [阶段 0：状态盘点与规则冻结](./2026-05-21-phase-0-status-rule-freeze.md)
- [验收测试方案](./2026-05-21-acceptance-test-plan.md)
- [执行记录](./2026-05-21-execution-record.md)
- [小程序对接文档](./wechat/2026-05-21-project-status-machine-integration.md)
- [Admin 对接文档](./admin/2026-05-21-project-status-machine-integration.md)

## 分阶段计划

### 阶段 0：状态盘点和规则冻结

状态：已完成

交付物：

- 当前客户 / 项目状态清单。
- 目标状态机动作表。
- 允许流转矩阵。
- 终态、恢复、作废、暂停策略。
- 副作用和验收口径。

### 阶段 1：项目状态机最小闭环

状态：已完成

交付物：

- `packages/domain` 项目状态动作和流转规则。
- API `projectStatusService.transitionProjectStatus()`。
- `project_status_transition_logs` migration。
- 专用接口 `POST /projects/:id/status-transition`。
- 旧 `PATCH /projects/:id` 中的 `status` 更新收口到状态机。

实现入口：

- `POST /projects/:id/status-transition`
- `PATCH /projects/:id`，当 payload 包含 `status` 时自动推断状态动作并走状态机校验。

### 阶段 2：项目状态副作用收口

状态：已完成

交付物：

- 项目状态对施工日志、摄像头、验收、公开展示、首页统计的显式规则。
- 非法状态下写操作拦截。
- 状态变更后的缓存失效和通知边界。

首批已收口规则：

- `invalid / on_hold / completed` 项目禁止新增施工日志。
- `invalid / completed` 项目禁止新增摄像头。
- 只有 `constructing / acceptance` 项目允许发起验收。
- 状态变更后的公开项目和首页项目缓存已在阶段 1 收口。

### 阶段 3：客户状态机最小闭环

状态：待执行

交付物：

- `packages/domain` 客户状态动作和流转规则。
- API `customerStatusService.transitionCustomerStatus()`。
- `customer_status_transition_logs` migration。
- 专用接口 `POST /customers/:id/status-transition`。
- 旧 `PATCH /customers/:id` 中的 `status` 更新收口到状态机。

### 阶段 4：客户和项目状态联动

状态：待执行

交付物：

- 项目签约同步客户签约状态。
- 客户签约动作和项目创建 / 关联规则。
- 多项目客户的状态聚合策略。

### 阶段 5：前端和小程序动作式对接

状态：待执行

交付物：

- Admin / 小程序不再直接传 `status`。
- 后端返回当前状态可执行动作列表。
- 状态流转日志可在客户 / 项目详情查看。

## 执行原则

- 优先项目状态机，再客户状态机。
- 状态变更必须通过 `action`，不能只传 `to_status`。
- 成功状态变更必须写日志。
- 旧接口短期兼容，但不得绕过状态机。
- repository 只负责数据读写，状态规则落在 domain/service。
- 错误响应必须经过 `Errors.*` 包装。
